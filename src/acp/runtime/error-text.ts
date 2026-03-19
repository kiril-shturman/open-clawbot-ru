import { type AcpRuntimeErrorCode, AcpRuntimeError, toAcpRuntimeError } from "./errors.js";

function resolveAcpRuntimeErrorNextStep(error: AcpRuntimeError): string | undefined {
  if (error.code === "ACP_BACKEND_MISSING" || error.code === "ACP_BACKEND_UNAVAILABLE") {
    return "Запустите `/acp doctor`, установите или включите backend-плагин и повторите попытку.";
  }
  if (error.code === "ACP_DISPATCH_DISABLED") {
    return "Включите `acp.dispatch.enabled=true`, чтобы разрешить ACP-turn для сообщений из thread.";
  }
  if (error.code === "ACP_SESSION_INIT_FAILED") {
    return "Если эта session устарела, пересоздайте её через `/acp spawn` и заново привяжите thread.";
  }
  if (error.code === "ACP_INVALID_RUNTIME_OPTION") {
    return "Используйте `/acp status`, чтобы проверить параметры и передать допустимые значения.";
  }
  if (error.code === "ACP_BACKEND_UNSUPPORTED_CONTROL") {
    return "Этот backend не поддерживает такое действие; используйте поддерживаемую команду.";
  }
  if (error.code === "ACP_TURN_FAILED") {
    return "Повторите попытку или используйте `/acp cancel` и отправьте сообщение заново.";
  }
  return undefined;
}

export function formatAcpRuntimeErrorText(error: AcpRuntimeError): string {
  const next = resolveAcpRuntimeErrorNextStep(error);
  if (!next) {
    return `Ошибка ACP (${error.code}): ${error.message}`;
  }
  return `Ошибка ACP (${error.code}): ${error.message}\nдальше: ${next}`;
}

export function toAcpRuntimeErrorText(params: {
  error: unknown;
  fallbackCode: AcpRuntimeErrorCode;
  fallbackMessage: string;
}): string {
  return formatAcpRuntimeErrorText(
    toAcpRuntimeError({
      error: params.error,
      fallbackCode: params.fallbackCode,
      fallbackMessage: params.fallbackMessage,
    }),
  );
}
