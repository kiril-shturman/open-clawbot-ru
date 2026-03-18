import { formatCliCommand } from "../cli/command-format.js";
import { withProgress } from "../cli/progress.js";
import { resolveGatewayPort } from "../config/config.js";
import { buildGatewayConnectionDetails, callGateway } from "../gateway/call.js";
import { info } from "../globals.js";
import { formatTimeAgo } from "../infra/format-time/format-relative.ts";
import type { HeartbeatEventPayload } from "../infra/heartbeat-events.js";
import { normalizeUpdateChannel, resolveUpdateChannelDisplay } from "../infra/update-channels.js";
import { formatGitInstallLabel } from "../infra/update-check.js";
import {
  resolveMemoryCacheSummary,
  resolveMemoryFtsState,
  resolveMemoryVectorState,
  type Tone,
} from "../memory/status-format.js";
import {
  formatPluginCompatibilityNotice,
  summarizePluginCompatibility,
} from "../plugins/status.js";
import type { RuntimeEnv } from "../runtime.js";
import { getTerminalTableWidth, renderTable } from "../terminal/table.js";
import { theme } from "../terminal/theme.js";
import { formatHealthChannelLines, type HealthSummary } from "./health.js";
import { resolveControlUiLinks } from "./onboard-helpers.js";
import { statusAllCommand } from "./status-all.js";
import { groupChannelIssuesByChannel } from "./status-all/channel-issues.js";
import { formatGatewayAuthUsed } from "./status-all/format.js";
import { getDaemonStatusSummary, getNodeDaemonStatusSummary } from "./status.daemon.js";
import {
  formatDuration,
  formatKTokens,
  formatTokensCompact,
  shortenText,
} from "./status.format.js";
import { scanStatus } from "./status.scan.js";
import {
  formatUpdateAvailableHint,
  formatUpdateOneLiner,
  resolveUpdateAvailability,
} from "./status.update.js";

let providerUsagePromise: Promise<typeof import("../infra/provider-usage.js")> | undefined;
let securityAuditModulePromise: Promise<typeof import("../security/audit.runtime.js")> | undefined;

function loadProviderUsage() {
  providerUsagePromise ??= import("../infra/provider-usage.js");
  return providerUsagePromise;
}

function loadSecurityAuditModule() {
  securityAuditModulePromise ??= import("../security/audit.runtime.js");
  return securityAuditModulePromise;
}

function resolvePairingRecoveryContext(params: {
  error?: string | null;
  closeReason?: string | null;
}): { requestId: string | null } | null {
  const sanitizeRequestId = (value: string): string | null => {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    // Keep CLI guidance injection-safe: allow only compact id characters.
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(trimmed)) {
      return null;
    }
    return trimmed;
  };
  const source = [params.error, params.closeReason]
    .filter((part) => typeof part === "string" && part.trim().length > 0)
    .join(" ");
  if (!source || !/pairing required/i.test(source)) {
    return null;
  }
  const requestIdMatch = source.match(/requestId:\s*([^\s)]+)/i);
  const requestId =
    requestIdMatch && requestIdMatch[1] ? sanitizeRequestId(requestIdMatch[1]) : null;
  return { requestId: requestId || null };
}

export async function statusCommand(
  opts: {
    json?: boolean;
    deep?: boolean;
    usage?: boolean;
    timeoutMs?: number;
    verbose?: boolean;
    all?: boolean;
  },
  runtime: RuntimeEnv,
) {
  if (opts.all && !opts.json) {
    await statusAllCommand(runtime, { timeoutMs: opts.timeoutMs });
    return;
  }

  const scan = await scanStatus(
    { json: opts.json, timeoutMs: opts.timeoutMs, all: opts.all },
    runtime,
  );
  const runSecurityAudit = async () =>
    await loadSecurityAuditModule().then(({ runSecurityAudit }) =>
      runSecurityAudit({
        config: scan.cfg,
        sourceConfig: scan.sourceConfig,
        deep: false,
        includeFilesystem: true,
        includeChannelSecurity: true,
      }),
    );
  const securityAudit = opts.json
    ? await runSecurityAudit()
    : await withProgress(
        {
          label: "Running security audit…",
          indeterminate: true,
          enabled: true,
        },
        async () => await runSecurityAudit(),
      );
  const {
    cfg,
    osSummary,
    tailscaleMode,
    tailscaleDns,
    tailscaleHttpsUrl,
    update,
    gatewayConnection,
    remoteUrlMissing,
    gatewayMode,
    gatewayProbeAuth,
    gatewayProbeAuthWarning,
    gatewayProbe,
    gatewayReachable,
    gatewaySelf,
    channelIssues,
    agentStatus,
    channels,
    summary,
    secretDiagnostics,
    memory,
    memoryPlugin,
    pluginCompatibility,
  } = scan;

  const usage = opts.usage
    ? await withProgress(
        {
          label: "Fetching usage snapshot…",
          indeterminate: true,
          enabled: opts.json !== true,
        },
        async () => {
          const { loadProviderUsageSummary } = await loadProviderUsage();
          return await loadProviderUsageSummary({ timeoutMs: opts.timeoutMs });
        },
      )
    : undefined;
  const health: HealthSummary | undefined = opts.deep
    ? await withProgress(
        {
          label: "Checking gateway health…",
          indeterminate: true,
          enabled: opts.json !== true,
        },
        async () =>
          await callGateway<HealthSummary>({
            method: "health",
            params: { probe: true },
            timeoutMs: opts.timeoutMs,
            config: scan.cfg,
          }),
      )
    : undefined;
  const lastHeartbeat =
    opts.deep && gatewayReachable
      ? await callGateway<HeartbeatEventPayload | null>({
          method: "last-heartbeat",
          params: {},
          timeoutMs: opts.timeoutMs,
          config: scan.cfg,
        }).catch(() => null)
      : null;

  const configChannel = normalizeUpdateChannel(cfg.update?.channel);
  const channelInfo = resolveUpdateChannelDisplay({
    configChannel,
    installKind: update.installKind,
    gitTag: update.git?.tag ?? null,
    gitBranch: update.git?.branch ?? null,
  });

  if (opts.json) {
    const [daemon, nodeDaemon] = await Promise.all([
      getDaemonStatusSummary(),
      getNodeDaemonStatusSummary(),
    ]);
    runtime.log(
      JSON.stringify(
        {
          ...summary,
          os: osSummary,
          update,
          updateChannel: channelInfo.channel,
          updateChannelSource: channelInfo.source,
          memory,
          memoryPlugin,
          gateway: {
            mode: gatewayMode,
            url: gatewayConnection.url,
            urlSource: gatewayConnection.urlSource,
            misconfigured: remoteUrlMissing,
            reachable: gatewayReachable,
            connectLatencyMs: gatewayProbe?.connectLatencyMs ?? null,
            self: gatewaySelf,
            error: gatewayProbe?.error ?? null,
            authWarning: gatewayProbeAuthWarning ?? null,
          },
          gatewayService: daemon,
          nodeService: nodeDaemon,
          agents: agentStatus,
          securityAudit,
          secretDiagnostics,
          pluginCompatibility: {
            count: pluginCompatibility.length,
            warnings: pluginCompatibility,
          },
          ...(health || usage || lastHeartbeat ? { health, usage, lastHeartbeat } : {}),
        },
        null,
        2,
      ),
    );
    return;
  }

  const rich = true;
  const muted = (value: string) => (rich ? theme.muted(value) : value);
  const ok = (value: string) => (rich ? theme.success(value) : value);
  const warn = (value: string) => (rich ? theme.warn(value) : value);

  if (opts.verbose) {
    const details = buildGatewayConnectionDetails({ config: scan.cfg });
    runtime.log(info("Подключение к gateway:"));
    for (const line of details.message.split("\n")) {
      runtime.log(`  ${line}`);
    }
    runtime.log("");
  }

  const tableWidth = getTerminalTableWidth();

  if (secretDiagnostics.length > 0) {
    runtime.log(theme.warn("Диагностика секретов:"));
    for (const entry of secretDiagnostics) {
      runtime.log(`- ${entry}`);
    }
    runtime.log("");
  }

  const dashboard = (() => {
    const controlUiEnabled = cfg.gateway?.controlUi?.enabled ?? true;
    if (!controlUiEnabled) {
      return "отключено";
    }
    const links = resolveControlUiLinks({
      port: resolveGatewayPort(cfg),
      bind: cfg.gateway?.bind,
      customBindHost: cfg.gateway?.customBindHost,
      basePath: cfg.gateway?.controlUi?.basePath,
    });
    return links.httpUrl;
  })();

  const gatewayValue = (() => {
    const target = remoteUrlMissing
      ? `резервный адрес ${gatewayConnection.url}`
      : `${gatewayConnection.url}${gatewayConnection.urlSource ? ` (${gatewayConnection.urlSource})` : ""}`;
    const reach = remoteUrlMissing
      ? warn("неверная конфигурация (remote.url отсутствует)")
      : gatewayReachable
        ? ok(`доступен ${formatDuration(gatewayProbe?.connectLatencyMs)}`)
        : warn(gatewayProbe?.error ? `недоступен (${gatewayProbe.error})` : "недоступен");
    const auth =
      gatewayReachable && !remoteUrlMissing
        ? ` · auth ${formatGatewayAuthUsed(gatewayProbeAuth)}`
        : "";
    const self =
      gatewaySelf?.host || gatewaySelf?.version || gatewaySelf?.platform
        ? [
            gatewaySelf?.host ? gatewaySelf.host : null,
            gatewaySelf?.ip ? `(${gatewaySelf.ip})` : null,
            gatewaySelf?.version ? `app ${gatewaySelf.version}` : null,
            gatewaySelf?.platform ? gatewaySelf.platform : null,
          ]
            .filter(Boolean)
            .join(" ")
        : null;
    const suffix = self ? ` · ${self}` : "";
    return `${gatewayMode} · ${target} · ${reach}${auth}${suffix}`;
  })();
  const pairingRecovery = resolvePairingRecoveryContext({
    error: gatewayProbe?.error ?? null,
    closeReason: gatewayProbe?.close?.reason ?? null,
  });

  const agentsValue = (() => {
    const pending =
      agentStatus.bootstrapPendingCount > 0
        ? `${agentStatus.bootstrapPendingCount} bootstrap-файл${agentStatus.bootstrapPendingCount === 1 ? "" : "ов"} найдено`
        : "bootstrap-файлов нет";
    const def = agentStatus.agents.find((a) => a.id === agentStatus.defaultId);
    const defActive =
      def?.lastActiveAgeMs != null ? formatTimeAgo(def.lastActiveAgeMs) : "неизвестно";
    const defSuffix = def ? ` · по умолчанию ${def.id}, активен ${defActive}` : "";
    return `${agentStatus.agents.length} · ${pending} · сессий ${agentStatus.totalSessions}${defSuffix}`;
  })();

  const [daemon, nodeDaemon] = await Promise.all([
    getDaemonStatusSummary(),
    getNodeDaemonStatusSummary(),
  ]);
  const daemonValue = (() => {
    if (daemon.installed === false) {
      return `${daemon.label} не установлен`;
    }
    const installedPrefix = daemon.managedByOpenClaw ? "установлен · " : "";
    return `${daemon.label} ${installedPrefix}${daemon.loadedText}${daemon.runtimeShort ? ` · ${daemon.runtimeShort}` : ""}`;
  })();
  const nodeDaemonValue = (() => {
    if (nodeDaemon.installed === false) {
      return `${nodeDaemon.label} не установлен`;
    }
    const installedPrefix = nodeDaemon.managedByOpenClaw ? "установлен · " : "";
    return `${nodeDaemon.label} ${installedPrefix}${nodeDaemon.loadedText}${nodeDaemon.runtimeShort ? ` · ${nodeDaemon.runtimeShort}` : ""}`;
  })();

  const defaults = summary.sessions.defaults;
  const defaultCtx = defaults.contextTokens
    ? ` (${formatKTokens(defaults.contextTokens)} ctx)`
    : "";
  const eventsValue =
    summary.queuedSystemEvents.length > 0
      ? `${summary.queuedSystemEvents.length} в очереди`
      : "нет";

  const probesValue = health ? ok("включено") : muted("пропущено (используйте --deep)");

  const heartbeatValue = (() => {
    const parts = summary.heartbeat.agents
      .map((agent) => {
        if (!agent.enabled || !agent.everyMs) {
          return `отключено (${agent.agentId})`;
        }
        const everyLabel = agent.every;
        return `${everyLabel} (${agent.agentId})`;
      })
      .filter(Boolean);
    return parts.length > 0 ? parts.join(", ") : "отключено";
  })();
  const lastHeartbeatValue = (() => {
    if (!opts.deep) {
      return null;
    }
    if (!gatewayReachable) {
      return warn("недоступно");
    }
    if (!lastHeartbeat) {
      return muted("нет");
    }
    const age = formatTimeAgo(Date.now() - lastHeartbeat.ts);
    const channel = lastHeartbeat.channel ?? "неизвестно";
    const accountLabel = lastHeartbeat.accountId ? `аккаунт ${lastHeartbeat.accountId}` : null;
    return [lastHeartbeat.status, `${age} назад`, channel, accountLabel]
      .filter(Boolean)
      .join(" · ");
  })();

  const storeLabel =
    summary.sessions.paths.length > 1
      ? `${summary.sessions.paths.length} хранилища`
      : (summary.sessions.paths[0] ?? "неизвестно");

  const memoryValue = (() => {
    if (!memoryPlugin.enabled) {
      const suffix = memoryPlugin.reason ? ` (${memoryPlugin.reason})` : "";
      return muted(`отключено${suffix}`);
    }
    if (!memory) {
      const slot = memoryPlugin.slot ? `plugin ${memoryPlugin.slot}` : "plugin";
      // Custom (non-built-in) memory plugins can't be probed — show enabled, not unavailable
      if (memoryPlugin.slot && memoryPlugin.slot !== "memory-core") {
        return `включено (${slot})`;
      }
      return muted(`включено (${slot}) · недоступно`);
    }
    const parts: string[] = [];
    const dirtySuffix = memory.dirty ? ` · ${warn("есть несохранённые изменения")}` : "";
    parts.push(`${memory.files} файлов · ${memory.chunks} чанков${dirtySuffix}`);
    if (memory.sources?.length) {
      parts.push(`источники ${memory.sources.join(", ")}`);
    }
    if (memoryPlugin.slot) {
      parts.push(`plugin ${memoryPlugin.slot}`);
    }
    const colorByTone = (tone: Tone, text: string) =>
      tone === "ok" ? ok(text) : tone === "warn" ? warn(text) : muted(text);
    const vector = memory.vector;
    if (vector) {
      const state = resolveMemoryVectorState(vector);
      const label = state.state === "disabled" ? "vector выкл" : `vector ${state.state}`;
      parts.push(colorByTone(state.tone, label));
    }
    const fts = memory.fts;
    if (fts) {
      const state = resolveMemoryFtsState(fts);
      const label = state.state === "disabled" ? "fts выкл" : `fts ${state.state}`;
      parts.push(colorByTone(state.tone, label));
    }
    const cache = memory.cache;
    if (cache) {
      const summary = resolveMemoryCacheSummary(cache);
      parts.push(colorByTone(summary.tone, summary.text));
    }
    return parts.join(" · ");
  })();

  const updateAvailability = resolveUpdateAvailability(update);
  const updateLine = formatUpdateOneLiner(update).replace(/^Update:\s*/i, "");
  const channelLabel = channelInfo.label;
  const gitLabel = formatGitInstallLabel(update);
  const pluginCompatibilitySummary = summarizePluginCompatibility(pluginCompatibility);
  const pluginCompatibilityValue =
    pluginCompatibilitySummary.noticeCount === 0
      ? ok("нет")
      : warn(
          `${pluginCompatibilitySummary.noticeCount} уведомлен${pluginCompatibilitySummary.noticeCount === 1 ? "ие" : "ий"} · ${pluginCompatibilitySummary.pluginCount} плагин${pluginCompatibilitySummary.pluginCount === 1 ? "" : "ов"}`,
        );

  const overviewRows = [
    { Item: "Панель управления", Value: dashboard },
    { Item: "ОС", Value: `${osSummary.label} · node ${process.versions.node}` },
    {
      Item: "Tailscale",
      Value:
        tailscaleMode === "off"
          ? muted("выкл")
          : tailscaleDns && tailscaleHttpsUrl
            ? `${tailscaleMode} · ${tailscaleDns} · ${tailscaleHttpsUrl}`
            : warn(`${tailscaleMode} · magicdns неизвестен`),
    },
    { Item: "Канал", Value: channelLabel },
    ...(gitLabel ? [{ Item: "Git", Value: gitLabel }] : []),
    {
      Item: "Обновление",
      Value: updateAvailability.available ? warn(`доступно · ${updateLine}`) : updateLine,
    },
    { Item: "Gateway", Value: gatewayValue },
    ...(gatewayProbeAuthWarning
      ? [{ Item: "Предупреждение auth gateway", Value: warn(gatewayProbeAuthWarning) }]
      : []),
    { Item: "Сервис Gateway", Value: daemonValue },
    { Item: "Сервис Node", Value: nodeDaemonValue },
    { Item: "Агенты", Value: agentsValue },
    { Item: "Память", Value: memoryValue },
    { Item: "Совместимость плагинов", Value: pluginCompatibilityValue },
    { Item: "Проверки", Value: probesValue },
    { Item: "События", Value: eventsValue },
    { Item: "Heartbeat", Value: heartbeatValue },
    ...(lastHeartbeatValue ? [{ Item: "Последний heartbeat", Value: lastHeartbeatValue }] : []),
    {
      Item: "Сессии",
      Value: `${summary.sessions.count} активных · по умолчанию ${defaults.model ?? "неизвестно"}${defaultCtx} · ${storeLabel}`,
    },
  ];

  runtime.log(theme.heading("Статус OpenClaw"));
  runtime.log("");
  runtime.log(theme.heading("Обзор"));
  runtime.log(
    renderTable({
      width: tableWidth,
      columns: [
        { key: "Item", header: "Пункт", minWidth: 12 },
        { key: "Value", header: "Значение", flex: true, minWidth: 32 },
      ],
      rows: overviewRows,
    }).trimEnd(),
  );

  if (pluginCompatibility.length > 0) {
    runtime.log("");
    runtime.log(theme.heading("Совместимость плагинов"));
    for (const notice of pluginCompatibility.slice(0, 8)) {
      const label = notice.severity === "warn" ? theme.warn("WARN") : theme.muted("INFO");
      runtime.log(`  ${label} ${formatPluginCompatibilityNotice(notice)}`);
    }
    if (pluginCompatibility.length > 8) {
      runtime.log(theme.muted(`  … ещё +${pluginCompatibility.length - 8}`));
    }
  }

  if (pairingRecovery) {
    runtime.log("");
    runtime.log(theme.warn("Требуется подтверждение pairing для gateway."));
    if (pairingRecovery.requestId) {
      runtime.log(
        theme.muted(
          `Восстановление: ${formatCliCommand(`openclaw devices approve ${pairingRecovery.requestId}`)}`,
        ),
      );
    }
    runtime.log(
      theme.muted(`Запасной вариант: ${formatCliCommand("openclaw devices approve --latest")}`),
    );
    runtime.log(theme.muted(`Проверить: ${formatCliCommand("openclaw devices list")}`));
  }

  runtime.log("");
  runtime.log(theme.heading("Аудит безопасности"));
  const fmtSummary = (value: { critical: number; warn: number; info: number }) => {
    const parts = [
      theme.error(`${value.critical} critical`),
      theme.warn(`${value.warn} warn`),
      theme.muted(`${value.info} info`),
    ];
    return parts.join(" · ");
  };
  runtime.log(theme.muted(`Сводка: ${fmtSummary(securityAudit.summary)}`));
  const importantFindings = securityAudit.findings.filter(
    (f) => f.severity === "critical" || f.severity === "warn",
  );
  if (importantFindings.length === 0) {
    runtime.log(theme.muted("Критических и предупреждающих находок не обнаружено."));
  } else {
    const severityLabel = (sev: "critical" | "warn" | "info") => {
      if (sev === "critical") {
        return theme.error("CRITICAL");
      }
      if (sev === "warn") {
        return theme.warn("WARN");
      }
      return theme.muted("INFO");
    };
    const sevRank = (sev: "critical" | "warn" | "info") =>
      sev === "critical" ? 0 : sev === "warn" ? 1 : 2;
    const sorted = [...importantFindings].toSorted(
      (a, b) => sevRank(a.severity) - sevRank(b.severity),
    );
    const shown = sorted.slice(0, 6);
    for (const f of shown) {
      runtime.log(`  ${severityLabel(f.severity)} ${f.title}`);
      runtime.log(`    ${shortenText(f.detail.replaceAll("\n", " "), 160)}`);
      if (f.remediation?.trim()) {
        runtime.log(`    ${theme.muted(`Исправление: ${f.remediation.trim()}`)}`);
      }
    }
    if (sorted.length > shown.length) {
      runtime.log(theme.muted(`… ещё +${sorted.length - shown.length}`));
    }
  }
  runtime.log(theme.muted(`Полный отчёт: ${formatCliCommand("openclaw security audit")}`));
  runtime.log(
    theme.muted(`Глубокая проверка: ${formatCliCommand("openclaw security audit --deep")}`),
  );

  runtime.log("");
  runtime.log(theme.heading("Каналы"));
  const channelIssuesByChannel = groupChannelIssuesByChannel(channelIssues);
  runtime.log(
    renderTable({
      width: tableWidth,
      columns: [
        { key: "Channel", header: "Канал", minWidth: 10 },
        { key: "Enabled", header: "Вкл", minWidth: 7 },
        { key: "State", header: "Состояние", minWidth: 8 },
        { key: "Detail", header: "Детали", flex: true, minWidth: 24 },
      ],
      rows: channels.rows.map((row) => {
        const issues = channelIssuesByChannel.get(row.id) ?? [];
        const effectiveState = row.state === "off" ? "off" : issues.length > 0 ? "warn" : row.state;
        const issueSuffix =
          issues.length > 0
            ? ` · ${warn(`gateway: ${shortenText(issues[0]?.message ?? "issue", 84)}`)}`
            : "";
        return {
          Channel: row.label,
          Enabled: row.enabled ? ok("ON") : muted("OFF"),
          State:
            effectiveState === "ok"
              ? ok("OK")
              : effectiveState === "warn"
                ? warn("WARN")
                : effectiveState === "off"
                  ? muted("OFF")
                  : theme.accentDim("SETUP"),
          Detail: `${row.detail}${issueSuffix}`,
        };
      }),
    }).trimEnd(),
  );

  runtime.log("");
  runtime.log(theme.heading("Сессии"));
  runtime.log(
    renderTable({
      width: tableWidth,
      columns: [
        { key: "Key", header: "Ключ", minWidth: 20, flex: true },
        { key: "Kind", header: "Тип", minWidth: 6 },
        { key: "Age", header: "Возраст", minWidth: 9 },
        { key: "Model", header: "Модель", minWidth: 14 },
        { key: "Tokens", header: "Токены", minWidth: 16 },
      ],
      rows:
        summary.sessions.recent.length > 0
          ? summary.sessions.recent.map((sess) => ({
              Key: shortenText(sess.key, 32),
              Kind: sess.kind,
              Age: sess.updatedAt ? formatTimeAgo(sess.age) : "нет активности",
              Model: sess.model ?? "неизвестно",
              Tokens: formatTokensCompact(sess),
            }))
          : [
              {
                Key: muted("сессий пока нет"),
                Kind: "",
                Age: "",
                Model: "",
                Tokens: "",
              },
            ],
    }).trimEnd(),
  );

  if (summary.queuedSystemEvents.length > 0) {
    runtime.log("");
    runtime.log(theme.heading("Системные события"));
    runtime.log(
      renderTable({
        width: tableWidth,
        columns: [{ key: "Event", header: "Событие", flex: true, minWidth: 24 }],
        rows: summary.queuedSystemEvents.slice(0, 5).map((event) => ({
          Event: event,
        })),
      }).trimEnd(),
    );
    if (summary.queuedSystemEvents.length > 5) {
      runtime.log(muted(`… ещё +${summary.queuedSystemEvents.length - 5}`));
    }
  }

  if (health) {
    runtime.log("");
    runtime.log(theme.heading("Состояние"));
    const rows: Array<Record<string, string>> = [];
    rows.push({
      Item: "Gateway",
      Status: ok("доступен"),
      Detail: `${health.durationMs}ms`,
    });

    for (const line of formatHealthChannelLines(health, { accountMode: "all" })) {
      const colon = line.indexOf(":");
      if (colon === -1) {
        continue;
      }
      const item = line.slice(0, colon).trim();
      const detail = line.slice(colon + 1).trim();
      const normalized = detail.toLowerCase();
      const status = (() => {
        if (normalized.startsWith("ok")) {
          return ok("OK");
        }
        if (normalized.startsWith("failed")) {
          return warn("WARN");
        }
        if (normalized.startsWith("not configured")) {
          return muted("ВЫКЛ");
        }
        if (normalized.startsWith("configured")) {
          return ok("OK");
        }
        if (normalized.startsWith("linked")) {
          return ok("СВЯЗАНО");
        }
        if (normalized.startsWith("not linked")) {
          return warn("НЕ СВЯЗАНО");
        }
        return warn("WARN");
      })();
      rows.push({ Item: item, Status: status, Detail: detail });
    }

    runtime.log(
      renderTable({
        width: tableWidth,
        columns: [
          { key: "Item", header: "Пункт", minWidth: 10 },
          { key: "Status", header: "Статус", minWidth: 8 },
          { key: "Detail", header: "Детали", flex: true, minWidth: 28 },
        ],
        rows,
      }).trimEnd(),
    );
  }

  if (usage) {
    const { formatUsageReportLines } = await loadProviderUsage();
    runtime.log("");
    runtime.log(theme.heading("Использование"));
    for (const line of formatUsageReportLines(usage)) {
      runtime.log(line);
    }
  }

  runtime.log("");
  runtime.log("FAQ: https://docs.openclaw.ai/faq");
  runtime.log("Устранение проблем: https://docs.openclaw.ai/troubleshooting");
  runtime.log("");
  const updateHint = formatUpdateAvailableHint(update);
  if (updateHint) {
    runtime.log(theme.warn(updateHint));
    runtime.log("");
  }
  runtime.log("Следующие шаги:");
  runtime.log(`  Нужно поделиться?      ${formatCliCommand("openclaw status --all")}`);
  runtime.log(`  Нужна живая отладка?   ${formatCliCommand("openclaw logs --follow")}`);
  if (gatewayReachable) {
    runtime.log(`  Нужно проверить каналы? ${formatCliCommand("openclaw status --deep")}`);
  } else {
    runtime.log(`  Сначала почините доступность: ${formatCliCommand("openclaw gateway probe")}`);
  }
}
