import { listChannelPlugins } from "../channels/plugins/index.js";
import type { ChannelId } from "../channels/plugins/types.js";
import { formatCliCommand } from "../cli/command-format.js";
import type { OpenClawConfig, GatewayBindMode } from "../config/config.js";
import type { AgentConfig } from "../config/types.agents.js";
import { hasConfiguredSecretInput } from "../config/types.secrets.js";
import { resolveGatewayAuth } from "../gateway/auth.js";
import { isLoopbackHost, resolveGatewayBindHost } from "../gateway/net.js";
import { resolveDmAllowState } from "../security/dm-policy-shared.js";
import { note } from "../terminal/note.js";
import { resolveDefaultChannelAccountContext } from "./channel-account-context.js";

function collectImplicitHeartbeatDirectPolicyWarnings(cfg: OpenClawConfig): string[] {
  const warnings: string[] = [];

  const maybeWarn = (params: {
    label: string;
    heartbeat: AgentConfig["heartbeat"] | undefined;
    pathHint: string;
  }) => {
    const heartbeat = params.heartbeat;
    if (!heartbeat || heartbeat.target === undefined || heartbeat.target === "none") {
      return;
    }
    if (heartbeat.directPolicy !== undefined) {
      return;
    }
    warnings.push(
      `- ${params.label}: доставка heartbeat настроена, но ${params.pathHint} не задан.`,
      '  Теперь heartbeat по умолчанию допускает direct/DM-цели. Явно задайте "allow" или "block", чтобы зафиксировать поведение после обновлений.',
    );
  };

  maybeWarn({
    label: "Heartbeat defaults",
    heartbeat: cfg.agents?.defaults?.heartbeat,
    pathHint: "agents.defaults.heartbeat.directPolicy",
  });

  for (const agent of cfg.agents?.list ?? []) {
    maybeWarn({
      label: `Heartbeat agent "${agent.id}"`,
      heartbeat: agent.heartbeat,
      pathHint: `heartbeat.directPolicy for agent "${agent.id}"`,
    });
  }

  return warnings;
}

export async function noteSecurityWarnings(cfg: OpenClawConfig) {
  const warnings: string[] = [];
  const auditHint = `- Run: ${formatCliCommand("openclaw security audit --deep")}`;

  if (cfg.approvals?.exec?.enabled === false) {
    warnings.push(
      "- Примечание: approvals.exec.enabled=false отключает только forwarding approval-запросов.",
      "  Локальная проверка host exec по-прежнему берётся из ~/.openclaw/exec-approvals.json.",
      `  Проверить локальную политику: ${formatCliCommand("openclaw approvals get --gateway")}`,
    );
  }

  warnings.push(...collectImplicitHeartbeatDirectPolicyWarnings(cfg));

  // ===========================================
  // GATEWAY NETWORK EXPOSURE CHECK
  // ===========================================
  // Check for dangerous gateway binding configurations
  // that expose the gateway to network without proper auth

  const gatewayBind = (cfg.gateway?.bind ?? "loopback") as string;
  const customBindHost = cfg.gateway?.customBindHost?.trim();
  const bindModes: GatewayBindMode[] = ["auto", "lan", "loopback", "custom", "tailnet"];
  const bindMode = bindModes.includes(gatewayBind as GatewayBindMode)
    ? (gatewayBind as GatewayBindMode)
    : undefined;
  const resolvedBindHost = bindMode
    ? await resolveGatewayBindHost(bindMode, customBindHost)
    : "0.0.0.0";
  const isExposed = !isLoopbackHost(resolvedBindHost);

  const resolvedAuth = resolveGatewayAuth({
    authConfig: cfg.gateway?.auth,
    env: process.env,
    tailscaleMode: cfg.gateway?.tailscale?.mode ?? "off",
  });
  const authToken = resolvedAuth.token?.trim() ?? "";
  const authPassword = resolvedAuth.password?.trim() ?? "";
  const hasToken =
    authToken.length > 0 ||
    hasConfiguredSecretInput(cfg.gateway?.auth?.token, cfg.secrets?.defaults);
  const hasPassword =
    authPassword.length > 0 ||
    hasConfiguredSecretInput(cfg.gateway?.auth?.password, cfg.secrets?.defaults);
  const hasSharedSecret =
    (resolvedAuth.mode === "token" && hasToken) ||
    (resolvedAuth.mode === "password" && hasPassword);
  const bindDescriptor = `"${gatewayBind}" (${resolvedBindHost})`;
  const saferRemoteAccessLines = [
    "  Более безопасный удалённый доступ: оставьте bind=loopback и используйте Tailscale Serve/Funnel или SSH tunnel.",
    "  Пример tunnel: ssh -N -L 18789:127.0.0.1:18789 user@gateway-host",
    "  Docs: https://docs.openclaw.ai/gateway/remote",
  ];

  if (isExposed) {
    if (!hasSharedSecret) {
      const authFixLines =
        resolvedAuth.mode === "password"
          ? [
              `  Исправление: ${formatCliCommand("openclaw configure")}, чтобы задать пароль`,
              `  Или переключитесь на token: ${formatCliCommand("openclaw config set gateway.auth.mode token")}`,
            ]
          : [
              `  Исправление: ${formatCliCommand("openclaw doctor --fix")}, чтобы сгенерировать token`,
              `  Или задайте token напрямую: ${formatCliCommand(
                "openclaw config set gateway.auth.mode token",
              )}`,
            ];
      warnings.push(
        `- CRITICAL: Gateway привязан к ${bindDescriptor} без аутентификации.`,
        `  Любой в вашей сети (или в интернете, если проброшен порт) может полностью управлять вашим агентом.`,
        `  Исправление: ${formatCliCommand("openclaw config set gateway.bind loopback")}`,
        ...saferRemoteAccessLines,
        ...authFixLines,
      );
    } else {
      // Auth is configured, but still warn about network exposure
      warnings.push(
        `- WARNING: Gateway привязан к ${bindDescriptor} (доступен по сети).`,
        `  Убедитесь, что учётные данные для аутентификации достаточно надёжны и не раскрыты.`,
        ...saferRemoteAccessLines,
      );
    }
  }

  const warnDmPolicy = async (params: {
    label: string;
    provider: ChannelId;
    accountId: string;
    dmPolicy: string;
    allowFrom?: Array<string | number> | null;
    policyPath?: string;
    allowFromPath: string;
    approveHint: string;
    normalizeEntry?: (raw: string) => string;
  }) => {
    const dmPolicy = params.dmPolicy;
    const policyPath = params.policyPath ?? `${params.allowFromPath}policy`;
    const { hasWildcard, allowCount, isMultiUserDm } = await resolveDmAllowState({
      provider: params.provider,
      accountId: params.accountId,
      allowFrom: params.allowFrom,
      normalizeEntry: params.normalizeEntry,
    });
    const dmScope = cfg.session?.dmScope ?? "main";

    if (dmPolicy === "open") {
      const allowFromPath = `${params.allowFromPath}allowFrom`;
      warnings.push(`- ${params.label} DMs: OPEN (${policyPath}="open"). Anyone can DM it.`);
      if (!hasWildcard) {
        warnings.push(
          `- ${params.label} DMs: config invalid — "open" requires ${allowFromPath} to include "*".`,
        );
      }
    }

    if (dmPolicy === "disabled") {
      warnings.push(`- ${params.label} DMs: disabled (${policyPath}="disabled").`);
      return;
    }

    if (dmPolicy !== "open" && allowCount === 0) {
      warnings.push(
        `- ${params.label} DMs: доступ закрыт (${policyPath}="${dmPolicy}") и allowlist пуст; неизвестные отправители будут блокироваться или получат pairing code.`,
      );
      warnings.push(`  ${params.approveHint}`);
    }

    if (dmScope === "main" && isMultiUserDm) {
      warnings.push(
        `- ${params.label} DMs: несколько отправителей делят main session; запустите ` +
          formatCliCommand('openclaw config set session.dmScope "per-channel-peer"') +
          ' (или "per-account-channel-peer" для multi-account каналов), чтобы изолировать сессии.',
      );
    }
  };

  for (const plugin of listChannelPlugins()) {
    if (!plugin.security) {
      continue;
    }
    const { defaultAccountId, account, enabled, configured, diagnostics } =
      await resolveDefaultChannelAccountContext(plugin, cfg, {
        mode: "read_only",
        commandName: "doctor",
      });
    for (const diagnostic of diagnostics) {
      warnings.push(`- [secrets] ${diagnostic}`);
    }
    if (!enabled) {
      continue;
    }
    if (!configured) {
      continue;
    }
    const dmPolicy = plugin.security.resolveDmPolicy?.({
      cfg,
      accountId: defaultAccountId,
      account,
    });
    if (dmPolicy) {
      await warnDmPolicy({
        label: plugin.meta.label ?? plugin.id,
        provider: plugin.id,
        accountId: defaultAccountId,
        dmPolicy: dmPolicy.policy,
        allowFrom: dmPolicy.allowFrom,
        policyPath: dmPolicy.policyPath,
        allowFromPath: dmPolicy.allowFromPath,
        approveHint: dmPolicy.approveHint,
        normalizeEntry: dmPolicy.normalizeEntry,
      });
    }
    if (plugin.security.collectWarnings) {
      const extra = await plugin.security.collectWarnings({
        cfg,
        accountId: defaultAccountId,
        account,
      });
      if (extra?.length) {
        warnings.push(...extra);
      }
    }
  }

  const lines =
    warnings.length > 0 ? warnings : ["- Предупреждений по безопасности каналов не найдено."];
  lines.push(auditHint);
  note(lines.join("\n"), "Security");
}
