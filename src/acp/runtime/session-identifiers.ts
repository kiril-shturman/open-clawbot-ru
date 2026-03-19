import type { SessionAcpIdentity, SessionAcpMeta } from "../../config/sessions/types.js";
import { isSessionIdentityPending, resolveSessionIdentityFromMeta } from "./session-identity.js";

export const ACP_SESSION_IDENTITY_RENDERER_VERSION = "v1";
export type AcpSessionIdentifierRenderMode = "status" | "thread";

type SessionResumeHintResolver = (params: { agentSessionId: string }) => string;

const ACP_AGENT_RESUME_HINT_BY_KEY = new Map<string, SessionResumeHintResolver>([
  [
    "codex",
    ({ agentSessionId }) =>
      `продолжить в Codex CLI: \`codex resume ${agentSessionId}\` (продолжит этот диалог).`,
  ],
  [
    "openai-codex",
    ({ agentSessionId }) =>
      `продолжить в Codex CLI: \`codex resume ${agentSessionId}\` (продолжит этот диалог).`,
  ],
  [
    "codex-cli",
    ({ agentSessionId }) =>
      `продолжить в Codex CLI: \`codex resume ${agentSessionId}\` (продолжит этот диалог).`,
  ],
  [
    "kimi",
    ({ agentSessionId }) =>
      `продолжить в Kimi CLI: \`kimi resume ${agentSessionId}\` (продолжит этот диалог).`,
  ],
  [
    "moonshot-kimi",
    ({ agentSessionId }) =>
      `продолжить в Kimi CLI: \`kimi resume ${agentSessionId}\` (продолжит этот диалог).`,
  ],
]);

function normalizeText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

function normalizeAgentHintKey(value: unknown): string | undefined {
  const normalized = normalizeText(value);
  if (!normalized) {
    return undefined;
  }
  return normalized.toLowerCase().replace(/[\s_]+/g, "-");
}

function resolveAcpAgentResumeHintLine(params: {
  agentId?: string;
  agentSessionId?: string;
}): string | undefined {
  const agentSessionId = normalizeText(params.agentSessionId);
  const agentKey = normalizeAgentHintKey(params.agentId);
  if (!agentSessionId || !agentKey) {
    return undefined;
  }
  const resolver = ACP_AGENT_RESUME_HINT_BY_KEY.get(agentKey);
  return resolver ? resolver({ agentSessionId }) : undefined;
}

export function resolveAcpSessionIdentifierLines(params: {
  sessionKey: string;
  meta?: SessionAcpMeta;
}): string[] {
  const backend = normalizeText(params.meta?.backend) ?? "backend";
  const identity = resolveSessionIdentityFromMeta(params.meta);
  return resolveAcpSessionIdentifierLinesFromIdentity({
    backend,
    identity,
    mode: "status",
  });
}

export function resolveAcpSessionIdentifierLinesFromIdentity(params: {
  backend: string;
  identity?: SessionAcpIdentity;
  mode?: AcpSessionIdentifierRenderMode;
}): string[] {
  const backend = normalizeText(params.backend) ?? "backend";
  const mode = params.mode ?? "status";
  const identity = params.identity;
  const agentSessionId = normalizeText(identity?.agentSessionId);
  const acpxSessionId = normalizeText(identity?.acpxSessionId);
  const acpxRecordId = normalizeText(identity?.acpxRecordId);
  const hasIdentifier = Boolean(agentSessionId || acpxSessionId || acpxRecordId);
  if (isSessionIdentityPending(identity) && hasIdentifier) {
    if (mode === "status") {
      return ["идентификаторы session: ожидание (появятся после первого ответа)"];
    }
    return [];
  }
  const lines: string[] = [];
  if (agentSessionId) {
    lines.push(`id сессии агента: ${agentSessionId}`);
  }
  if (acpxSessionId) {
    lines.push(`id session ${backend}: ${acpxSessionId}`);
  }
  if (acpxRecordId) {
    lines.push(`id записи ${backend}: ${acpxRecordId}`);
  }
  return lines;
}

export function resolveAcpSessionCwd(meta?: SessionAcpMeta): string | undefined {
  const runtimeCwd = normalizeText(meta?.runtimeOptions?.cwd);
  if (runtimeCwd) {
    return runtimeCwd;
  }
  return normalizeText(meta?.cwd);
}

export function resolveAcpThreadSessionDetailLines(params: {
  sessionKey: string;
  meta?: SessionAcpMeta;
}): string[] {
  const meta = params.meta;
  const identity = resolveSessionIdentityFromMeta(meta);
  const backend = normalizeText(meta?.backend) ?? "backend";
  const lines = resolveAcpSessionIdentifierLinesFromIdentity({
    backend,
    identity,
    mode: "thread",
  });
  if (lines.length === 0) {
    return lines;
  }
  const hint = resolveAcpAgentResumeHintLine({
    agentId: meta?.agent,
    agentSessionId: identity?.agentSessionId,
  });
  if (hint) {
    lines.push(hint);
  }
  return lines;
}
