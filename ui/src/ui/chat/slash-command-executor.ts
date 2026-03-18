/**
 * Client-side execution engine for slash commands.
 * Calls gateway RPC methods and returns formatted results.
 */

import type { ModelCatalogEntry } from "../../../../src/agents/model-catalog.js";
import {
  formatThinkingLevels,
  normalizeThinkLevel,
  normalizeVerboseLevel,
  resolveThinkingDefaultForModel,
} from "../../../../src/auto-reply/thinking.shared.js";
import {
  DEFAULT_AGENT_ID,
  DEFAULT_MAIN_KEY,
  isSubagentSessionKey,
  parseAgentSessionKey,
} from "../../../../src/routing/session-key.js";
import { t } from "../../i18n/lib/translate.ts";
import { createChatModelOverride, resolveServerChatModelValue } from "../chat-model-ref.ts";
import type { GatewayBrowserClient } from "../gateway.ts";
import type {
  AgentsListResult,
  ChatModelOverride,
  GatewaySessionRow,
  SessionsListResult,
  SessionsPatchResult,
} from "../types.ts";
import { SLASH_COMMANDS } from "./slash-commands.ts";

export type SlashCommandResult = {
  /** Markdown-formatted result to display in chat. */
  content: string;
  /** Side-effect action the caller should perform after displaying the result. */
  action?:
    | "refresh"
    | "export"
    | "new-session"
    | "reset"
    | "stop"
    | "clear"
    | "toggle-focus"
    | "navigate-usage";
  /** Optional session-level directive changes that the caller should mirror locally. */
  sessionPatch?: {
    modelOverride?: ChatModelOverride | null;
  };
};

export async function executeSlashCommand(
  client: GatewayBrowserClient,
  sessionKey: string,
  commandName: string,
  args: string,
): Promise<SlashCommandResult> {
  switch (commandName) {
    case "help":
      return executeHelp();
    case "new":
      return { content: t("slashCommands.results.new"), action: "new-session" };
    case "reset":
      return { content: t("slashCommands.results.reset"), action: "reset" };
    case "stop":
      return { content: t("slashCommands.results.stop"), action: "stop" };
    case "clear":
      return { content: t("slashCommands.results.clear"), action: "clear" };
    case "focus":
      return { content: t("slashCommands.results.focus"), action: "toggle-focus" };
    case "compact":
      return await executeCompact(client, sessionKey);
    case "model":
      return await executeModel(client, sessionKey, args);
    case "think":
      return await executeThink(client, sessionKey, args);
    case "fast":
      return await executeFast(client, sessionKey, args);
    case "verbose":
      return await executeVerbose(client, sessionKey, args);
    case "export":
      return { content: "Exporting session...", action: "export" };
    case "usage":
      return await executeUsage(client, sessionKey);
    case "agents":
      return await executeAgents(client);
    case "kill":
      return await executeKill(client, sessionKey, args);
    default:
      return { content: t("slashCommands.results.unknownCommand", { command: commandName }) };
  }
}

// ── Command Implementations ──

function executeHelp(): SlashCommandResult {
  const lines = [`**${t("slashCommands.results.helpTitle")}**\n`];
  let currentCategory = "";

  for (const cmd of SLASH_COMMANDS) {
    const cat = cmd.category ?? "session";
    if (cat !== currentCategory) {
      currentCategory = cat;
      lines.push(`**${t(`slashCommands.categories.${cat}`)}**`);
    }
    const argStr = cmd.args ? ` ${cmd.args}` : "";
    const local = cmd.executeLocal ? "" : ` ${t("slashCommands.results.agentTag")}`;
    lines.push(`\`/${cmd.name}${argStr}\` — ${cmd.description}${local}`);
  }

  lines.push(`\n${t("slashCommands.results.helpHint")}`);
  return { content: lines.join("\n") };
}

async function executeCompact(
  client: GatewayBrowserClient,
  sessionKey: string,
): Promise<SlashCommandResult> {
  try {
    await client.request("sessions.compact", { key: sessionKey });
    return { content: t("slashCommands.results.compactSuccess"), action: "refresh" };
  } catch (err) {
    return { content: `${t("slashCommands.results.compactFailed")}: ${String(err)}` };
  }
}

async function executeModel(
  client: GatewayBrowserClient,
  sessionKey: string,
  args: string,
): Promise<SlashCommandResult> {
  if (!args) {
    try {
      const [sessions, models] = await Promise.all([
        client.request<SessionsListResult>("sessions.list", {}),
        client.request<{ models: ModelCatalogEntry[] }>("models.list", {}),
      ]);
      const session = resolveCurrentSession(sessions, sessionKey);
      const model = session?.model || sessions?.defaults?.model || "default";
      const available = models?.models?.map((m: ModelCatalogEntry) => m.id) ?? [];
      const lines = [`**${t("slashCommands.results.currentModel")}** \`${model}\``];
      if (available.length > 0) {
        lines.push(
          `**${t("slashCommands.results.availableModels")}** ${available
            .slice(0, 10)
            .map((m: string) => `\`${m}\``)
            .join(
              ", ",
            )}${available.length > 10 ? ` +${available.length - 10} ${t("slashCommands.results.more")}` : ""}`,
        );
      }
      return { content: lines.join("\n") };
    } catch (err) {
      return { content: `${t("slashCommands.results.getModelInfoFailed")}: ${String(err)}` };
    }
  }

  try {
    const patched = await client.request<SessionsPatchResult>("sessions.patch", {
      key: sessionKey,
      model: args.trim(),
    });
    const resolvedValue = resolveServerChatModelValue(
      patched.resolved?.model ?? args.trim(),
      patched.resolved?.modelProvider,
    );
    return {
      content: t("slashCommands.results.modelSet", { model: args.trim() }),
      action: "refresh",
      sessionPatch: { modelOverride: createChatModelOverride(resolvedValue) },
    };
  } catch (err) {
    return { content: `${t("slashCommands.results.setModelFailed")}: ${String(err)}` };
  }
}

async function executeThink(
  client: GatewayBrowserClient,
  sessionKey: string,
  args: string,
): Promise<SlashCommandResult> {
  const rawLevel = args.trim();

  if (!rawLevel) {
    try {
      const { session, models } = await loadThinkingCommandState(client, sessionKey);
      return {
        content: formatDirectiveOptions(
          t("slashCommands.results.currentThinkingLevel", {
            level: resolveCurrentThinkingLevel(session, models),
          }),
          formatThinkingLevels(session?.modelProvider, session?.model),
        ),
      };
    } catch (err) {
      return { content: `${t("slashCommands.results.getThinkingLevelFailed")}: ${String(err)}` };
    }
  }

  const level = normalizeThinkLevel(rawLevel);
  if (!level) {
    try {
      const session = await loadCurrentSession(client, sessionKey);
      return {
        content: t("slashCommands.results.unrecognizedThinkingLevel", {
          level: rawLevel,
          options: formatThinkingLevels(session?.modelProvider, session?.model),
        }),
      };
    } catch (err) {
      return {
        content: `${t("slashCommands.results.validateThinkingLevelFailed")}: ${String(err)}`,
      };
    }
  }

  try {
    await client.request("sessions.patch", { key: sessionKey, thinkingLevel: level });
    return {
      content: t("slashCommands.results.thinkingLevelSet", { level }),
      action: "refresh",
    };
  } catch (err) {
    return { content: `${t("slashCommands.results.setThinkingLevelFailed")}: ${String(err)}` };
  }
}

async function executeVerbose(
  client: GatewayBrowserClient,
  sessionKey: string,
  args: string,
): Promise<SlashCommandResult> {
  const rawLevel = args.trim();

  if (!rawLevel) {
    try {
      const session = await loadCurrentSession(client, sessionKey);
      return {
        content: formatDirectiveOptions(
          t("slashCommands.results.currentVerboseLevel", {
            level: normalizeVerboseLevel(session?.verboseLevel) ?? "off",
          }),
          "on, full, off",
        ),
      };
    } catch (err) {
      return { content: `${t("slashCommands.results.getVerboseLevelFailed")}: ${String(err)}` };
    }
  }

  const level = normalizeVerboseLevel(rawLevel);
  if (!level) {
    return {
      content: t("slashCommands.results.unrecognizedVerboseLevel", { level: rawLevel }),
    };
  }

  try {
    await client.request("sessions.patch", { key: sessionKey, verboseLevel: level });
    return {
      content: t("slashCommands.results.verboseModeSet", { level }),
      action: "refresh",
    };
  } catch (err) {
    return { content: `${t("slashCommands.results.setVerboseModeFailed")}: ${String(err)}` };
  }
}

async function executeFast(
  client: GatewayBrowserClient,
  sessionKey: string,
  args: string,
): Promise<SlashCommandResult> {
  const rawMode = args.trim().toLowerCase();

  if (!rawMode || rawMode === "status") {
    try {
      const session = await loadCurrentSession(client, sessionKey);
      return {
        content: formatDirectiveOptions(
          t("slashCommands.results.currentFastMode", {
            mode: resolveCurrentFastMode(session),
          }),
          "status, on, off",
        ),
      };
    } catch (err) {
      return { content: `${t("slashCommands.results.getFastModeFailed")}: ${String(err)}` };
    }
  }

  if (rawMode !== "on" && rawMode !== "off") {
    return {
      content: t("slashCommands.results.unrecognizedFastMode", { mode: args.trim() }),
    };
  }

  try {
    await client.request("sessions.patch", { key: sessionKey, fastMode: rawMode === "on" });
    return {
      content: t(
        rawMode === "on"
          ? "slashCommands.results.fastModeEnabled"
          : "slashCommands.results.fastModeDisabled",
      ),
      action: "refresh",
    };
  } catch (err) {
    return { content: `${t("slashCommands.results.setFastModeFailed")}: ${String(err)}` };
  }
}

async function executeUsage(
  client: GatewayBrowserClient,
  sessionKey: string,
): Promise<SlashCommandResult> {
  try {
    const sessions = await client.request<SessionsListResult>("sessions.list", {});
    const session = resolveCurrentSession(sessions, sessionKey);
    if (!session) {
      return { content: t("slashCommands.results.noActiveSession") };
    }
    const input = session.inputTokens ?? 0;
    const output = session.outputTokens ?? 0;
    const total = session.totalTokens ?? input + output;
    const ctx = session.contextTokens ?? 0;
    const pct = ctx > 0 ? Math.round((input / ctx) * 100) : null;

    const lines = [
      `**${t("slashCommands.results.sessionUsageTitle")}**`,
      t("slashCommands.results.sessionUsageInput", { tokens: fmtTokens(input) }),
      t("slashCommands.results.sessionUsageOutput", { tokens: fmtTokens(output) }),
      t("slashCommands.results.sessionUsageTotal", { tokens: fmtTokens(total) }),
    ];
    if (pct !== null) {
      lines.push(
        t("slashCommands.results.sessionUsageContext", {
          pct: String(pct),
          tokens: fmtTokens(ctx),
        }),
      );
    }
    if (session.model) {
      lines.push(t("slashCommands.results.sessionUsageModel", { model: session.model }));
    }
    return { content: lines.join("\n") };
  } catch (err) {
    return { content: `${t("slashCommands.results.getUsageFailed")}: ${String(err)}` };
  }
}

async function executeAgents(client: GatewayBrowserClient): Promise<SlashCommandResult> {
  try {
    const result = await client.request<AgentsListResult>("agents.list", {});
    const agents = result?.agents ?? [];
    if (agents.length === 0) {
      return { content: t("slashCommands.results.noAgentsConfigured") };
    }
    const lines = [`**${t("slashCommands.results.agentsTitle")}** (${agents.length})\n`];
    for (const agent of agents) {
      const isDefault = agent.id === result?.defaultId;
      const name = agent.identity?.name || agent.name || agent.id;
      const marker = isDefault ? ` ${t("slashCommands.results.defaultMarker")}` : "";
      lines.push(`- \`${agent.id}\` — ${name}${marker}`);
    }
    return { content: lines.join("\n") };
  } catch (err) {
    return { content: `${t("slashCommands.results.listAgentsFailed")}: ${String(err)}` };
  }
}

async function executeKill(
  client: GatewayBrowserClient,
  sessionKey: string,
  args: string,
): Promise<SlashCommandResult> {
  const target = args.trim();
  if (!target) {
    return { content: t("slashCommands.results.killUsage") };
  }
  try {
    const sessions = await client.request<SessionsListResult>("sessions.list", {});
    const matched = resolveKillTargets(sessions?.sessions ?? [], sessionKey, target);
    if (matched.length === 0) {
      return {
        content:
          target.toLowerCase() === "all"
            ? t("slashCommands.results.noActiveSubagentSessions")
            : t("slashCommands.results.noMatchingSubagentSessions", { target }),
      };
    }

    const results = await Promise.allSettled(
      matched.map((key) =>
        client.request<{ aborted?: boolean }>("chat.abort", { sessionKey: key }),
      ),
    );
    const rejected = results.filter((entry) => entry.status === "rejected");
    const successCount = results.filter(
      (entry) =>
        entry.status === "fulfilled" && (entry.value as { aborted?: boolean })?.aborted !== false,
    ).length;
    if (successCount === 0) {
      if (rejected.length === 0) {
        return {
          content:
            target.toLowerCase() === "all"
              ? t("slashCommands.results.noActiveSubagentRunsToAbort")
              : t("slashCommands.results.noActiveRunsMatched", { target }),
        };
      }
      throw rejected[0]?.reason ?? new Error(t("slashCommands.results.abortFailedShort"));
    }

    if (target.toLowerCase() === "all") {
      return {
        content:
          successCount === matched.length
            ? t("slashCommands.results.abortedSubagentSessions", { count: String(successCount) })
            : t("slashCommands.results.abortedSomeSubagentSessions", {
                count: String(successCount),
                total: String(matched.length),
              }),
      };
    }

    return {
      content:
        successCount === matched.length
          ? t("slashCommands.results.abortedMatchingSubagentSessions", {
              count: String(successCount),
              target,
            })
          : t("slashCommands.results.abortedSomeMatchingSubagentSessions", {
              count: String(successCount),
              total: String(matched.length),
              target,
            }),
    };
  } catch (err) {
    return { content: `${t("slashCommands.results.abortFailed")}: ${String(err)}` };
  }
}

function resolveKillTargets(
  sessions: GatewaySessionRow[],
  currentSessionKey: string,
  target: string,
): string[] {
  const normalizedTarget = target.trim().toLowerCase();
  if (!normalizedTarget) {
    return [];
  }

  const keys = new Set<string>();
  const normalizedCurrentSessionKey = currentSessionKey.trim().toLowerCase();
  const currentParsed = parseAgentSessionKey(normalizedCurrentSessionKey);
  const currentAgentId =
    currentParsed?.agentId ??
    (normalizedCurrentSessionKey === DEFAULT_MAIN_KEY ? DEFAULT_AGENT_ID : undefined);
  const sessionIndex = buildSessionIndex(sessions);
  for (const session of sessions) {
    const key = session?.key?.trim();
    if (!key || !isSubagentSessionKey(key)) {
      continue;
    }
    const normalizedKey = key.toLowerCase();
    const parsed = parseAgentSessionKey(normalizedKey);
    const belongsToCurrentSession = isWithinCurrentSessionSubtree(
      normalizedKey,
      normalizedCurrentSessionKey,
      sessionIndex,
      currentAgentId,
      parsed?.agentId,
    );
    const isMatch =
      (normalizedTarget === "all" && belongsToCurrentSession) ||
      (belongsToCurrentSession && normalizedKey === normalizedTarget) ||
      (belongsToCurrentSession &&
        ((parsed?.agentId ?? "") === normalizedTarget ||
          normalizedKey.endsWith(`:subagent:${normalizedTarget}`) ||
          normalizedKey === `subagent:${normalizedTarget}`));
    if (isMatch) {
      keys.add(key);
    }
  }
  return [...keys];
}

function isWithinCurrentSessionSubtree(
  candidateSessionKey: string,
  currentSessionKey: string,
  sessionIndex: Map<string, GatewaySessionRow>,
  currentAgentId: string | undefined,
  candidateAgentId: string | undefined,
): boolean {
  if (!currentAgentId || candidateAgentId !== currentAgentId) {
    return false;
  }

  const currentAliases = resolveEquivalentSessionKeys(currentSessionKey, currentAgentId);
  const seen = new Set<string>();
  let parentSessionKey = normalizeSessionKey(sessionIndex.get(candidateSessionKey)?.spawnedBy);
  while (parentSessionKey && !seen.has(parentSessionKey)) {
    if (currentAliases.has(parentSessionKey)) {
      return true;
    }
    seen.add(parentSessionKey);
    parentSessionKey = normalizeSessionKey(sessionIndex.get(parentSessionKey)?.spawnedBy);
  }

  // Older gateways may not include spawnedBy on session rows yet; keep prefix
  // matching for nested subagent sessions as a compatibility fallback.
  return isSubagentSessionKey(currentSessionKey)
    ? candidateSessionKey.startsWith(`${currentSessionKey}:subagent:`)
    : false;
}

function buildSessionIndex(sessions: GatewaySessionRow[]): Map<string, GatewaySessionRow> {
  const index = new Map<string, GatewaySessionRow>();
  for (const session of sessions) {
    const normalizedKey = normalizeSessionKey(session?.key);
    if (!normalizedKey) {
      continue;
    }
    index.set(normalizedKey, session);
  }
  return index;
}

function normalizeSessionKey(key?: string | null): string | undefined {
  const normalized = key?.trim().toLowerCase();
  return normalized || undefined;
}

function resolveEquivalentSessionKeys(
  currentSessionKey: string,
  currentAgentId: string | undefined,
): Set<string> {
  const keys = new Set<string>([currentSessionKey]);
  if (currentAgentId === DEFAULT_AGENT_ID) {
    const canonicalDefaultMain = `agent:${DEFAULT_AGENT_ID}:main`;
    if (currentSessionKey === DEFAULT_MAIN_KEY) {
      keys.add(canonicalDefaultMain);
    } else if (currentSessionKey === canonicalDefaultMain) {
      keys.add(DEFAULT_MAIN_KEY);
    }
  }
  return keys;
}

function formatDirectiveOptions(text: string, options: string): string {
  return t("slashCommands.results.optionsLine", { text, options });
}

async function loadCurrentSession(
  client: GatewayBrowserClient,
  sessionKey: string,
): Promise<GatewaySessionRow | undefined> {
  const sessions = await client.request<SessionsListResult>("sessions.list", {});
  return resolveCurrentSession(sessions, sessionKey);
}

function resolveCurrentSession(
  sessions: SessionsListResult | undefined,
  sessionKey: string,
): GatewaySessionRow | undefined {
  const normalizedSessionKey = normalizeSessionKey(sessionKey);
  const currentAgentId =
    parseAgentSessionKey(normalizedSessionKey ?? "")?.agentId ??
    (normalizedSessionKey === DEFAULT_MAIN_KEY ? DEFAULT_AGENT_ID : undefined);
  const aliases = normalizedSessionKey
    ? resolveEquivalentSessionKeys(normalizedSessionKey, currentAgentId)
    : new Set<string>();
  return sessions?.sessions?.find((session: GatewaySessionRow) => {
    const key = normalizeSessionKey(session.key);
    return key ? aliases.has(key) : false;
  });
}

async function loadThinkingCommandState(client: GatewayBrowserClient, sessionKey: string) {
  const [sessions, models] = await Promise.all([
    client.request<SessionsListResult>("sessions.list", {}),
    client.request<{ models: ModelCatalogEntry[] }>("models.list", {}),
  ]);
  return {
    session: resolveCurrentSession(sessions, sessionKey),
    models: models?.models ?? [],
  };
}

function resolveCurrentThinkingLevel(
  session: GatewaySessionRow | undefined,
  models: ModelCatalogEntry[],
): string {
  const persisted = normalizeThinkLevel(session?.thinkingLevel);
  if (persisted) {
    return persisted;
  }
  if (!session?.modelProvider || !session.model) {
    return "off";
  }
  return resolveThinkingDefaultForModel({
    provider: session.modelProvider,
    model: session.model,
    catalog: models,
  });
}

function resolveCurrentFastMode(session: GatewaySessionRow | undefined): "on" | "off" {
  return session?.fastMode === true ? "on" : "off";
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (n >= 1_000) {
    return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  }
  return String(n);
}
