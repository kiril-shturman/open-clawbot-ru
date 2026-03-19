import { withProgress } from "../cli/progress.js";
import { loadConfig } from "../config/config.js";
import { describeGatewayServiceRestart, resolveGatewayService } from "../daemon/service.js";
import { isNonFatalSystemdInstallProbeError } from "../daemon/systemd.js";
import type { RuntimeEnv } from "../runtime.js";
import { note } from "../terminal/note.js";
import { confirm, select } from "./configure.shared.js";
import { buildGatewayInstallPlan, gatewayInstallErrorHint } from "./daemon-install-helpers.js";
import {
  DEFAULT_GATEWAY_DAEMON_RUNTIME,
  GATEWAY_DAEMON_RUNTIME_OPTIONS,
  type GatewayDaemonRuntime,
} from "./daemon-runtime.js";
import { resolveGatewayInstallToken } from "./gateway-install-token.js";
import { guardCancel } from "./onboard-helpers.js";
import { ensureSystemdUserLingerInteractive } from "./systemd-linger.js";

export async function maybeInstallDaemon(params: {
  runtime: RuntimeEnv;
  port: number;
  daemonRuntime?: GatewayDaemonRuntime;
}) {
  const service = resolveGatewayService();
  let loaded = false;
  try {
    loaded = await service.isLoaded({ env: process.env });
  } catch (error) {
    if (!isNonFatalSystemdInstallProbeError(error)) {
      throw error;
    }
    loaded = false;
  }
  let shouldCheckLinger = false;
  let shouldInstall = true;
  let daemonRuntime = params.daemonRuntime ?? DEFAULT_GATEWAY_DAEMON_RUNTIME;
  if (loaded) {
    const action = guardCancel(
      await select({
        message: "Сервис Gateway уже установлен",
        options: [
          { value: "restart", label: "Перезапустить" },
          { value: "reinstall", label: "Переустановить" },
          { value: "skip", label: "Пропустить" },
        ],
      }),
      params.runtime,
    );
    if (action === "restart") {
      await withProgress(
        { label: "Сервис Gateway", indeterminate: true, delayMs: 0 },
        async (progress) => {
          progress.setLabel("Перезапуск сервиса Gateway…");
          const restartResult = await service.restart({
            env: process.env,
            stdout: process.stdout,
          });
          progress.setLabel(
            describeGatewayServiceRestart("Gateway", restartResult).progressMessage,
          );
        },
      );
      shouldCheckLinger = true;
      shouldInstall = false;
    }
    if (action === "skip") {
      return;
    }
    if (action === "reinstall") {
      await withProgress(
        { label: "Сервис Gateway", indeterminate: true, delayMs: 0 },
        async (progress) => {
          progress.setLabel("Удаление сервиса Gateway…");
          await service.uninstall({ env: process.env, stdout: process.stdout });
          progress.setLabel("Сервис Gateway удалён.");
        },
      );
    }
  }

  if (shouldInstall) {
    let installError: string | null = null;
    if (!params.daemonRuntime) {
      if (GATEWAY_DAEMON_RUNTIME_OPTIONS.length === 1) {
        daemonRuntime = GATEWAY_DAEMON_RUNTIME_OPTIONS[0]?.value ?? DEFAULT_GATEWAY_DAEMON_RUNTIME;
      } else {
        daemonRuntime = guardCancel(
          await select({
            message: "Рантайм сервиса Gateway",
            options: GATEWAY_DAEMON_RUNTIME_OPTIONS,
            initialValue: DEFAULT_GATEWAY_DAEMON_RUNTIME,
          }),
          params.runtime,
        ) as GatewayDaemonRuntime;
      }
    }
    await withProgress(
      { label: "Сервис Gateway", indeterminate: true, delayMs: 0 },
      async (progress) => {
        progress.setLabel("Подготовка сервиса Gateway…");

        const cfg = loadConfig();
        const tokenResolution = await resolveGatewayInstallToken({
          config: cfg,
          env: process.env,
        });
        for (const warning of tokenResolution.warnings) {
          note(warning, "Gateway");
        }
        if (tokenResolution.unavailableReason) {
          installError = [
            "Установка Gateway заблокирована:",
            tokenResolution.unavailableReason,
            "Исправьте конфигурацию auth/token gateway и снова запустите configure.",
          ].join(" ");
          progress.setLabel("Установка сервиса Gateway заблокирована.");
          return;
        }
        const { programArguments, workingDirectory, environment } = await buildGatewayInstallPlan({
          env: process.env,
          port: params.port,
          runtime: daemonRuntime,
          warn: (message, title) => note(message, title),
          config: cfg,
        });

        progress.setLabel("Установка сервиса Gateway…");
        try {
          await service.install({
            env: process.env,
            stdout: process.stdout,
            programArguments,
            workingDirectory,
            environment,
          });
          progress.setLabel("Сервис Gateway установлен.");
        } catch (err) {
          installError = err instanceof Error ? err.message : String(err);
          progress.setLabel("Не удалось установить сервис Gateway.");
        }
      },
    );
    if (installError) {
      note("Не удалось установить сервис Gateway: " + installError, "Gateway");
      note(gatewayInstallErrorHint(), "Gateway");
      return;
    }
    shouldCheckLinger = true;
  }

  if (shouldCheckLinger) {
    await ensureSystemdUserLingerInteractive({
      runtime: params.runtime,
      prompter: {
        confirm: async (p) => guardCancel(await confirm(p), params.runtime),
        note,
      },
      reason:
        "Установки на Linux используют пользовательский сервис systemd. Без linger systemd завершает пользовательскую сессию при выходе/простое и останавливает Gateway.",
      requireConfirm: true,
    });
  }
}
