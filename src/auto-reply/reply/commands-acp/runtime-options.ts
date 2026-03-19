import { getAcpSessionManager } from "../../../acp/control-plane/manager.js";
import {
  parseRuntimeTimeoutSecondsInput,
  validateRuntimeConfigOptionInput,
  validateRuntimeCwdInput,
  validateRuntimeModeInput,
  validateRuntimeModelInput,
  validateRuntimePermissionProfileInput,
} from "../../../acp/control-plane/runtime-options.js";
import { resolveAcpSessionIdentifierLinesFromIdentity } from "../../../acp/runtime/session-identifiers.js";
import type { CommandHandlerResult, HandleCommandsParams } from "../commands-types.js";
import {
  ACP_CWD_USAGE,
  ACP_MODEL_USAGE,
  ACP_PERMISSIONS_USAGE,
  ACP_RESET_OPTIONS_USAGE,
  ACP_SET_MODE_USAGE,
  ACP_STATUS_USAGE,
  ACP_TIMEOUT_USAGE,
  formatAcpCapabilitiesText,
  formatRuntimeOptionsText,
  parseOptionalSingleTarget,
  parseSetCommandInput,
  parseSingleValueCommandInput,
  stopWithText,
  withAcpCommandErrorBoundary,
} from "./shared.js";
import { resolveAcpTargetSessionKey } from "./targets.js";

async function resolveTargetSessionKeyOrStop(params: {
  commandParams: HandleCommandsParams;
  token: string | undefined;
}): Promise<string | CommandHandlerResult> {
  const target = await resolveAcpTargetSessionKey({
    commandParams: params.commandParams,
    token: params.token,
  });
  if (!target.ok) {
    return stopWithText(`⚠️ ${target.error}`);
  }
  return target.sessionKey;
}

async function resolveOptionalSingleTargetOrStop(params: {
  commandParams: HandleCommandsParams;
  restTokens: string[];
  usage: string;
}): Promise<string | CommandHandlerResult> {
  const parsed = parseOptionalSingleTarget(params.restTokens, params.usage);
  if (!parsed.ok) {
    return stopWithText(`⚠️ ${parsed.error}`);
  }
  return await resolveTargetSessionKeyOrStop({
    commandParams: params.commandParams,
    token: parsed.sessionToken,
  });
}

type SingleTargetValue = {
  targetSessionKey: string;
  value: string;
};

async function resolveSingleTargetValueOrStop(params: {
  commandParams: HandleCommandsParams;
  restTokens: string[];
  usage: string;
}): Promise<SingleTargetValue | CommandHandlerResult> {
  const parsed = parseSingleValueCommandInput(params.restTokens, params.usage);
  if (!parsed.ok) {
    return stopWithText(`⚠️ ${parsed.error}`);
  }
  const targetSessionKey = await resolveTargetSessionKeyOrStop({
    commandParams: params.commandParams,
    token: parsed.value.sessionToken,
  });
  if (typeof targetSessionKey !== "string") {
    return targetSessionKey;
  }
  return {
    targetSessionKey,
    value: parsed.value.value,
  };
}

async function withSingleTargetValue<T>(params: {
  commandParams: HandleCommandsParams;
  restTokens: string[];
  usage: string;
  run: (resolved: SingleTargetValue) => Promise<T | CommandHandlerResult>;
}): Promise<T | CommandHandlerResult> {
  const resolved = await resolveSingleTargetValueOrStop({
    commandParams: params.commandParams,
    restTokens: params.restTokens,
    usage: params.usage,
  });
  if (!("targetSessionKey" in resolved)) {
    return resolved;
  }
  return await params.run(resolved);
}

export async function handleAcpStatusAction(
  params: HandleCommandsParams,
  restTokens: string[],
): Promise<CommandHandlerResult> {
  const targetSessionKey = await resolveOptionalSingleTargetOrStop({
    commandParams: params,
    restTokens,
    usage: ACP_STATUS_USAGE,
  });
  if (typeof targetSessionKey !== "string") {
    return targetSessionKey;
  }

  return await withAcpCommandErrorBoundary({
    run: async () =>
      await getAcpSessionManager().getSessionStatus({
        cfg: params.cfg,
        sessionKey: targetSessionKey,
      }),
    fallbackCode: "ACP_TURN_FAILED",
    fallbackMessage: "Не удалось прочитать статус ACP session.",
    onSuccess: (status) => {
      const sessionIdentifierLines = resolveAcpSessionIdentifierLinesFromIdentity({
        backend: status.backend,
        identity: status.identity,
      });
      const lines = [
        "Статус ACP:",
        "-----",
        `session: ${status.sessionKey}`,
        `backend: ${status.backend}`,
        `agent: ${status.agent}`,
        ...sessionIdentifierLines,
        `sessionMode: ${status.mode}`,
        `state: ${status.state}`,
        `runtimeOptions: ${formatRuntimeOptionsText(status.runtimeOptions)}`,
        `capabilities: ${formatAcpCapabilitiesText(status.capabilities.controls)}`,
        `lastActivityAt: ${new Date(status.lastActivityAt).toISOString()}`,
        ...(status.lastError ? [`lastError: ${status.lastError}`] : []),
        ...(status.runtimeStatus?.summary ? [`runtime: ${status.runtimeStatus.summary}`] : []),
        ...(status.runtimeStatus?.details
          ? [`runtimeDetails: ${JSON.stringify(status.runtimeStatus.details)}`]
          : []),
      ];
      return stopWithText(lines.join("\n"));
    },
  });
}

export async function handleAcpSetModeAction(
  params: HandleCommandsParams,
  restTokens: string[],
): Promise<CommandHandlerResult> {
  return await withSingleTargetValue({
    commandParams: params,
    restTokens,
    usage: ACP_SET_MODE_USAGE,
    run: async ({ targetSessionKey, value }) =>
      await withAcpCommandErrorBoundary({
        run: async () => {
          const runtimeMode = validateRuntimeModeInput(value);
          const options = await getAcpSessionManager().setSessionRuntimeMode({
            cfg: params.cfg,
            sessionKey: targetSessionKey,
            runtimeMode,
          });
          return {
            runtimeMode,
            options,
          };
        },
        fallbackCode: "ACP_TURN_FAILED",
        fallbackMessage: "Не удалось обновить режим runtime для ACP.",
        onSuccess: ({ runtimeMode, options }) =>
          stopWithText(
            `✅ Обновлён режим runtime для ACP у ${targetSessionKey}: ${runtimeMode}. Итоговые опции: ${formatRuntimeOptionsText(options)}`,
          ),
      }),
  });
}

export async function handleAcpSetAction(
  params: HandleCommandsParams,
  restTokens: string[],
): Promise<CommandHandlerResult> {
  const parsed = parseSetCommandInput(restTokens);
  if (!parsed.ok) {
    return stopWithText(`⚠️ ${parsed.error}`);
  }
  const target = await resolveAcpTargetSessionKey({
    commandParams: params,
    token: parsed.value.sessionToken,
  });
  if (!target.ok) {
    return stopWithText(`⚠️ ${target.error}`);
  }
  const key = parsed.value.key.trim();
  const value = parsed.value.value.trim();

  return await withAcpCommandErrorBoundary({
    run: async () => {
      const lowerKey = key.toLowerCase();
      if (lowerKey === "cwd") {
        const cwd = validateRuntimeCwdInput(value);
        const options = await getAcpSessionManager().updateSessionRuntimeOptions({
          cfg: params.cfg,
          sessionKey: target.sessionKey,
          patch: { cwd },
        });
        return {
          text: `✅ Обновлён cwd для ACP у ${target.sessionKey}: ${cwd}. Итоговые опции: ${formatRuntimeOptionsText(options)}`,
        };
      }
      const validated = validateRuntimeConfigOptionInput(key, value);
      const options = await getAcpSessionManager().setSessionConfigOption({
        cfg: params.cfg,
        sessionKey: target.sessionKey,
        key: validated.key,
        value: validated.value,
      });
      return {
        text: `✅ Обновлена опция конфигурации ACP у ${target.sessionKey}: ${validated.key}=${validated.value}. Итоговые опции: ${formatRuntimeOptionsText(options)}`,
      };
    },
    fallbackCode: "ACP_TURN_FAILED",
    fallbackMessage: "Не удалось обновить опцию конфигурации ACP.",
    onSuccess: ({ text }) => stopWithText(text),
  });
}

export async function handleAcpCwdAction(
  params: HandleCommandsParams,
  restTokens: string[],
): Promise<CommandHandlerResult> {
  return await withSingleTargetValue({
    commandParams: params,
    restTokens,
    usage: ACP_CWD_USAGE,
    run: async ({ targetSessionKey, value }) =>
      await withAcpCommandErrorBoundary({
        run: async () => {
          const cwd = validateRuntimeCwdInput(value);
          const options = await getAcpSessionManager().updateSessionRuntimeOptions({
            cfg: params.cfg,
            sessionKey: targetSessionKey,
            patch: { cwd },
          });
          return {
            cwd,
            options,
          };
        },
        fallbackCode: "ACP_TURN_FAILED",
        fallbackMessage: "Не удалось обновить cwd для ACP.",
        onSuccess: ({ cwd, options }) =>
          stopWithText(
            `✅ Обновлён cwd для ACP у ${targetSessionKey}: ${cwd}. Итоговые опции: ${formatRuntimeOptionsText(options)}`,
          ),
      }),
  });
}

export async function handleAcpPermissionsAction(
  params: HandleCommandsParams,
  restTokens: string[],
): Promise<CommandHandlerResult> {
  return await withSingleTargetValue({
    commandParams: params,
    restTokens,
    usage: ACP_PERMISSIONS_USAGE,
    run: async ({ targetSessionKey, value }) =>
      await withAcpCommandErrorBoundary({
        run: async () => {
          const permissionProfile = validateRuntimePermissionProfileInput(value);
          const options = await getAcpSessionManager().setSessionConfigOption({
            cfg: params.cfg,
            sessionKey: targetSessionKey,
            key: "approval_policy",
            value: permissionProfile,
          });
          return {
            permissionProfile,
            options,
          };
        },
        fallbackCode: "ACP_TURN_FAILED",
        fallbackMessage: "Не удалось обновить профиль permissions для ACP.",
        onSuccess: ({ permissionProfile, options }) =>
          stopWithText(
            `✅ Обновлён профиль permissions для ACP у ${targetSessionKey}: ${permissionProfile}. Итоговые опции: ${formatRuntimeOptionsText(options)}`,
          ),
      }),
  });
}

export async function handleAcpTimeoutAction(
  params: HandleCommandsParams,
  restTokens: string[],
): Promise<CommandHandlerResult> {
  return await withSingleTargetValue({
    commandParams: params,
    restTokens,
    usage: ACP_TIMEOUT_USAGE,
    run: async ({ targetSessionKey, value }) =>
      await withAcpCommandErrorBoundary({
        run: async () => {
          const timeoutSeconds = parseRuntimeTimeoutSecondsInput(value);
          const options = await getAcpSessionManager().setSessionConfigOption({
            cfg: params.cfg,
            sessionKey: targetSessionKey,
            key: "timeout",
            value: String(timeoutSeconds),
          });
          return {
            timeoutSeconds,
            options,
          };
        },
        fallbackCode: "ACP_TURN_FAILED",
        fallbackMessage: "Не удалось обновить timeout для ACP.",
        onSuccess: ({ timeoutSeconds, options }) =>
          stopWithText(
            `✅ Обновлён timeout для ACP у ${targetSessionKey}: ${timeoutSeconds}s. Итоговые опции: ${formatRuntimeOptionsText(options)}`,
          ),
      }),
  });
}

export async function handleAcpModelAction(
  params: HandleCommandsParams,
  restTokens: string[],
): Promise<CommandHandlerResult> {
  return await withSingleTargetValue({
    commandParams: params,
    restTokens,
    usage: ACP_MODEL_USAGE,
    run: async ({ targetSessionKey, value }) =>
      await withAcpCommandErrorBoundary({
        run: async () => {
          const model = validateRuntimeModelInput(value);
          const options = await getAcpSessionManager().setSessionConfigOption({
            cfg: params.cfg,
            sessionKey: targetSessionKey,
            key: "model",
            value: model,
          });
          return {
            model,
            options,
          };
        },
        fallbackCode: "ACP_TURN_FAILED",
        fallbackMessage: "Не удалось обновить модель ACP.",
        onSuccess: ({ model, options }) =>
          stopWithText(
            `✅ Обновлена модель ACP у ${targetSessionKey}: ${model}. Итоговые опции: ${formatRuntimeOptionsText(options)}`,
          ),
      }),
  });
}

export async function handleAcpResetOptionsAction(
  params: HandleCommandsParams,
  restTokens: string[],
): Promise<CommandHandlerResult> {
  const targetSessionKey = await resolveOptionalSingleTargetOrStop({
    commandParams: params,
    restTokens,
    usage: ACP_RESET_OPTIONS_USAGE,
  });
  if (typeof targetSessionKey !== "string") {
    return targetSessionKey;
  }

  return await withAcpCommandErrorBoundary({
    run: async () =>
      await getAcpSessionManager().resetSessionRuntimeOptions({
        cfg: params.cfg,
        sessionKey: targetSessionKey,
      }),
    fallbackCode: "ACP_TURN_FAILED",
    fallbackMessage: "Не удалось сбросить runtime options для ACP.",
    onSuccess: () => stopWithText(`✅ Сброшены runtime options для ACP у ${targetSessionKey}.`),
  });
}
