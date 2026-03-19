import {
  hasConfiguredUnavailableCredentialStatus,
  hasResolvedCredentialValue,
} from "../../channels/account-snapshot-fields.js";
import { listChannelPlugins } from "../../channels/plugins/index.js";
import {
  buildChannelAccountSnapshot,
  buildReadOnlySourceChannelAccountSnapshot,
} from "../../channels/plugins/status.js";
import type { ChannelAccountSnapshot } from "../../channels/plugins/types.js";
import { formatCliCommand } from "../../cli/command-format.js";
import { resolveCommandSecretRefsViaGateway } from "../../cli/command-secret-gateway.js";
import { getChannelsCommandSecretTargetIds } from "../../cli/command-secret-targets.js";
import { withProgress } from "../../cli/progress.js";
import { type OpenClawConfig, readConfigFileSnapshot } from "../../config/config.js";
import { callGateway } from "../../gateway/call.js";
import { collectChannelStatusIssues } from "../../infra/channels-status-issues.js";
import { formatTimeAgo } from "../../infra/format-time/format-relative.ts";
import { defaultRuntime, type RuntimeEnv } from "../../runtime.js";
import { formatDocsLink } from "../../terminal/links.js";
import { theme } from "../../terminal/theme.js";
import {
  type ChatChannel,
  formatChannelAccountLabel,
  requireValidConfigSnapshot,
} from "./shared.js";

export type ChannelsStatusOptions = {
  json?: boolean;
  probe?: boolean;
  timeout?: string;
};

function appendEnabledConfiguredLinkedBits(bits: string[], account: Record<string, unknown>) {
  if (typeof account.enabled === "boolean") {
    bits.push(account.enabled ? "включено" : "отключено");
  }
  if (typeof account.configured === "boolean") {
    if (account.configured) {
      bits.push("настроено");
      if (hasConfiguredUnavailableCredentialStatus(account)) {
        bits.push("секрет недоступен в этом режиме команды");
      }
    } else {
      bits.push("не настроено");
    }
  }
  if (typeof account.linked === "boolean") {
    bits.push(account.linked ? "связано" : "не связано");
  }
}

function appendModeBit(bits: string[], account: Record<string, unknown>) {
  if (typeof account.mode === "string" && account.mode.length > 0) {
    bits.push(`mode:${account.mode}`);
  }
}

function appendTokenSourceBits(bits: string[], account: Record<string, unknown>) {
  const appendSourceBit = (label: string, sourceKey: string, statusKey: string) => {
    const source = account[sourceKey];
    if (typeof source !== "string" || !source || source === "none") {
      return;
    }
    const status = account[statusKey];
    const unavailable = status === "configured_unavailable" ? " (недоступно)" : "";
    bits.push(`${label}:${source}${unavailable}`);
  };

  appendSourceBit("token", "tokenSource", "tokenStatus");
  appendSourceBit("bot", "botTokenSource", "botTokenStatus");
  appendSourceBit("app", "appTokenSource", "appTokenStatus");
  appendSourceBit("signing", "signingSecretSource", "signingSecretStatus");
}

function appendBaseUrlBit(bits: string[], account: Record<string, unknown>) {
  if (typeof account.baseUrl === "string" && account.baseUrl) {
    bits.push(`url:${account.baseUrl}`);
  }
}

function buildChannelAccountLine(
  provider: ChatChannel,
  account: Record<string, unknown>,
  bits: string[],
): string {
  const accountId = typeof account.accountId === "string" ? account.accountId : "default";
  const name = typeof account.name === "string" ? account.name.trim() : "";
  const labelText = formatChannelAccountLabel({
    channel: provider,
    accountId,
    name: name || undefined,
  });
  return `- ${labelText}: ${bits.join(", ")}`;
}

export function formatGatewayChannelsStatusLines(payload: Record<string, unknown>): string[] {
  const lines: string[] = [];
  lines.push(theme.success("Gateway доступен."));
  const accountLines = (provider: ChatChannel, accounts: Array<Record<string, unknown>>) =>
    accounts.map((account) => {
      const bits: string[] = [];
      appendEnabledConfiguredLinkedBits(bits, account);
      if (typeof account.running === "boolean") {
        bits.push(account.running ? "запущено" : "остановлено");
      }
      if (typeof account.connected === "boolean") {
        bits.push(account.connected ? "подключено" : "отключено от сети");
      }
      const inboundAt =
        typeof account.lastInboundAt === "number" && Number.isFinite(account.lastInboundAt)
          ? account.lastInboundAt
          : null;
      const outboundAt =
        typeof account.lastOutboundAt === "number" && Number.isFinite(account.lastOutboundAt)
          ? account.lastOutboundAt
          : null;
      if (inboundAt) {
        bits.push(`in:${formatTimeAgo(Date.now() - inboundAt)}`);
      }
      if (outboundAt) {
        bits.push(`out:${formatTimeAgo(Date.now() - outboundAt)}`);
      }
      appendModeBit(bits, account);
      const botUsername = (() => {
        const bot = account.bot as { username?: string | null } | undefined;
        const probeBot = (account.probe as { bot?: { username?: string | null } } | undefined)?.bot;
        const raw = bot?.username ?? probeBot?.username ?? "";
        if (typeof raw !== "string") {
          return "";
        }
        const trimmed = raw.trim();
        if (!trimmed) {
          return "";
        }
        return trimmed.startsWith("@") ? trimmed : `@${trimmed}`;
      })();
      if (botUsername) {
        bits.push(`bot:${botUsername}`);
      }
      if (typeof account.dmPolicy === "string" && account.dmPolicy.length > 0) {
        bits.push(`dm:${account.dmPolicy}`);
      }
      if (Array.isArray(account.allowFrom) && account.allowFrom.length > 0) {
        bits.push(`allow:${account.allowFrom.slice(0, 2).join(",")}`);
      }
      appendTokenSourceBits(bits, account);
      const application = account.application as
        | { intents?: { messageContent?: string } }
        | undefined;
      const messageContent = application?.intents?.messageContent;
      if (
        typeof messageContent === "string" &&
        messageContent.length > 0 &&
        messageContent !== "enabled"
      ) {
        bits.push(`intents:content=${messageContent}`);
      }
      if (account.allowUnmentionedGroups === true) {
        bits.push("groups:unmentioned");
      }
      appendBaseUrlBit(bits, account);
      const probe = account.probe as { ok?: boolean } | undefined;
      if (probe && typeof probe.ok === "boolean") {
        bits.push(probe.ok ? "probe ok" : "probe не прошёл");
      }
      const audit = account.audit as { ok?: boolean } | undefined;
      if (audit && typeof audit.ok === "boolean") {
        bits.push(audit.ok ? "audit ok" : "audit с ошибкой");
      }
      if (typeof account.lastError === "string" && account.lastError) {
        bits.push(`ошибка:${account.lastError}`);
      }
      return buildChannelAccountLine(provider, account, bits);
    });

  const plugins = listChannelPlugins();
  const accountsByChannel = payload.channelAccounts as Record<string, unknown> | undefined;
  const accountPayloads: Partial<Record<string, Array<Record<string, unknown>>>> = {};
  for (const plugin of plugins) {
    const raw = accountsByChannel?.[plugin.id];
    if (Array.isArray(raw)) {
      accountPayloads[plugin.id] = raw as Array<Record<string, unknown>>;
    }
  }

  for (const plugin of plugins) {
    const accounts = accountPayloads[plugin.id];
    if (accounts && accounts.length > 0) {
      lines.push(...accountLines(plugin.id, accounts));
    }
  }

  lines.push("");
  const issues = collectChannelStatusIssues(payload);
  if (issues.length > 0) {
    lines.push(theme.warn("Предупреждения:"));
    for (const issue of issues) {
      lines.push(
        `- ${issue.channel} ${issue.accountId}: ${issue.message}${issue.fix ? ` (${issue.fix})` : ""}`,
      );
    }
    lines.push(`- Запустите: ${formatCliCommand("openclaw doctor")}`);
    lines.push("");
  }
  lines.push(
    `Подсказка: ${formatDocsLink("/cli#status", "status --deep")} добавляет проверки состояния gateway в вывод статуса (нужен доступный gateway).`,
  );
  return lines;
}

export async function formatConfigChannelsStatusLines(
  cfg: OpenClawConfig,
  meta: { path?: string; mode?: "local" | "remote" },
  opts?: { sourceConfig?: OpenClawConfig },
): Promise<string[]> {
  const lines: string[] = [];
  lines.push(theme.warn("Gateway недоступен; показываю статус только по конфигу."));
  if (meta.path) {
    lines.push(`Конфиг: ${meta.path}`);
  }
  if (meta.mode) {
    lines.push(`Режим: ${meta.mode}`);
  }
  if (meta.path || meta.mode) {
    lines.push("");
  }

  const accountLines = (provider: ChatChannel, accounts: Array<Record<string, unknown>>) =>
    accounts.map((account) => {
      const bits: string[] = [];
      appendEnabledConfiguredLinkedBits(bits, account);
      appendModeBit(bits, account);
      appendTokenSourceBits(bits, account);
      appendBaseUrlBit(bits, account);
      return buildChannelAccountLine(provider, account, bits);
    });

  const plugins = listChannelPlugins();
  const sourceConfig = opts?.sourceConfig ?? cfg;
  for (const plugin of plugins) {
    const accountIds = plugin.config.listAccountIds(cfg);
    if (!accountIds.length) {
      continue;
    }
    const snapshots: ChannelAccountSnapshot[] = [];
    for (const accountId of accountIds) {
      const sourceSnapshot = await buildReadOnlySourceChannelAccountSnapshot({
        plugin,
        cfg: sourceConfig,
        accountId,
      });
      const resolvedSnapshot = await buildChannelAccountSnapshot({
        plugin,
        cfg,
        accountId,
      });
      snapshots.push(
        sourceSnapshot &&
          hasConfiguredUnavailableCredentialStatus(sourceSnapshot) &&
          (!hasResolvedCredentialValue(resolvedSnapshot) ||
            (sourceSnapshot.configured === true && resolvedSnapshot.configured === false))
          ? sourceSnapshot
          : resolvedSnapshot,
      );
    }
    if (snapshots.length > 0) {
      lines.push(...accountLines(plugin.id, snapshots));
    }
  }

  lines.push("");
  lines.push(
    `Подсказка: ${formatDocsLink("/cli#status", "status --deep")} добавляет проверки состояния gateway в вывод статуса (нужен доступный gateway).`,
  );
  return lines;
}

export async function channelsStatusCommand(
  opts: ChannelsStatusOptions,
  runtime: RuntimeEnv = defaultRuntime,
) {
  const timeoutMs = Number(opts.timeout ?? 10_000);
  const statusLabel = opts.probe ? "Проверяю статус каналов (probe)…" : "Проверяю статус каналов…";
  const shouldLogStatus = opts.json !== true && !process.stderr.isTTY;
  if (shouldLogStatus) {
    runtime.log(statusLabel);
  }
  try {
    const payload = await withProgress(
      {
        label: statusLabel,
        indeterminate: true,
        enabled: opts.json !== true,
      },
      async () =>
        await callGateway({
          method: "channels.status",
          params: { probe: Boolean(opts.probe), timeoutMs },
          timeoutMs,
        }),
    );
    if (opts.json) {
      runtime.log(JSON.stringify(payload, null, 2));
      return;
    }
    runtime.log(formatGatewayChannelsStatusLines(payload).join("\n"));
  } catch (err) {
    runtime.error(`Gateway недоступен: ${String(err)}`);
    const cfg = await requireValidConfigSnapshot(runtime);
    if (!cfg) {
      return;
    }
    const { resolvedConfig, diagnostics } = await resolveCommandSecretRefsViaGateway({
      config: cfg,
      commandName: "channels status",
      targetIds: getChannelsCommandSecretTargetIds(),
      mode: "read_only_status",
    });
    for (const entry of diagnostics) {
      runtime.log(`[secrets] ${entry}`);
    }
    const snapshot = await readConfigFileSnapshot();
    const mode = cfg.gateway?.mode === "remote" ? "remote" : "local";
    runtime.log(
      (
        await formatConfigChannelsStatusLines(
          resolvedConfig,
          {
            path: snapshot.path,
            mode,
          },
          { sourceConfig: cfg },
        )
      ).join("\n"),
    );
  }
}
