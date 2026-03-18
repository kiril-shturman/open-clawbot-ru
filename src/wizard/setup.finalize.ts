import fs from "node:fs/promises";
import path from "node:path";
import { DEFAULT_BOOTSTRAP_FILENAME } from "../agents/workspace.js";
import { formatCliCommand } from "../cli/command-format.js";
import {
  buildGatewayInstallPlan,
  gatewayInstallErrorHint,
} from "../commands/daemon-install-helpers.js";
import {
  DEFAULT_GATEWAY_DAEMON_RUNTIME,
  GATEWAY_DAEMON_RUNTIME_OPTIONS,
} from "../commands/daemon-runtime.js";
import { resolveGatewayInstallToken } from "../commands/gateway-install-token.js";
import { formatHealthCheckFailure } from "../commands/health-format.js";
import { healthCommand } from "../commands/health.js";
import {
  detectBrowserOpenSupport,
  formatControlUiSshHint,
  openUrl,
  probeGatewayReachable,
  waitForGatewayReachable,
  resolveControlUiLinks,
} from "../commands/onboard-helpers.js";
import type { OnboardOptions } from "../commands/onboard-types.js";
import type { OpenClawConfig } from "../config/config.js";
import { describeGatewayServiceRestart, resolveGatewayService } from "../daemon/service.js";
import { isSystemdUserServiceAvailable } from "../daemon/systemd.js";
import { ensureControlUiAssetsBuilt } from "../infra/control-ui-assets.js";
import type { RuntimeEnv } from "../runtime.js";
import { restoreTerminalState } from "../terminal/restore.js";
import { runTui } from "../tui/tui.js";
import { resolveUserPath } from "../utils.js";
import type { WizardPrompter } from "./prompts.js";
import { setupWizardShellCompletion } from "./setup.completion.js";
import { resolveSetupSecretInputString } from "./setup.secret-input.js";
import type { GatewayWizardSettings, WizardFlow } from "./setup.types.js";

type FinalizeOnboardingOptions = {
  flow: WizardFlow;
  opts: OnboardOptions;
  baseConfig: OpenClawConfig;
  nextConfig: OpenClawConfig;
  workspaceDir: string;
  settings: GatewayWizardSettings;
  prompter: WizardPrompter;
  runtime: RuntimeEnv;
};

export async function finalizeSetupWizard(
  options: FinalizeOnboardingOptions,
): Promise<{ launchedTui: boolean }> {
  const { flow, opts, baseConfig, nextConfig, settings, prompter, runtime } = options;

  const withWizardProgress = async <T>(
    label: string,
    options: { doneMessage?: string | (() => string | undefined) },
    work: (progress: { update: (message: string) => void }) => Promise<T>,
  ): Promise<T> => {
    const progress = prompter.progress(label);
    try {
      return await work(progress);
    } finally {
      progress.stop(
        typeof options.doneMessage === "function" ? options.doneMessage() : options.doneMessage,
      );
    }
  };

  const systemdAvailable =
    process.platform === "linux" ? await isSystemdUserServiceAvailable() : true;
  if (process.platform === "linux" && !systemdAvailable) {
    await prompter.note(
      "Пользовательские systemd-сервисы недоступны. Пропускаю проверку lingering и установку сервиса.",
      "Systemd",
    );
  }

  if (process.platform === "linux" && systemdAvailable) {
    const { ensureSystemdUserLingerInteractive } = await import("../commands/systemd-linger.js");
    await ensureSystemdUserLingerInteractive({
      runtime,
      prompter: {
        confirm: prompter.confirm,
        note: prompter.note,
      },
      reason:
        "Linux installs use a systemd user service by default. Without lingering, systemd stops the user session on logout/idle and kills the Gateway.",
      requireConfirm: false,
    });
  }

  const explicitInstallDaemon =
    typeof opts.installDaemon === "boolean" ? opts.installDaemon : undefined;
  let installDaemon: boolean;
  if (explicitInstallDaemon !== undefined) {
    installDaemon = explicitInstallDaemon;
  } else if (process.platform === "linux" && !systemdAvailable) {
    installDaemon = false;
  } else if (flow === "quickstart") {
    installDaemon = true;
  } else {
    installDaemon = await prompter.confirm({
      message: "Установить сервис Gateway (рекомендуется)",
      initialValue: true,
    });
  }

  if (process.platform === "linux" && !systemdAvailable && installDaemon) {
    await prompter.note(
      "Пользовательские systemd-сервисы недоступны; пропускаю установку сервиса. Используйте свой container supervisor или `docker compose up -d`.",
      "Сервис Gateway",
    );
    installDaemon = false;
  }

  if (installDaemon) {
    const daemonRuntime =
      flow === "quickstart"
        ? DEFAULT_GATEWAY_DAEMON_RUNTIME
        : await prompter.select({
            message: "Рантайм сервиса Gateway",
            options: GATEWAY_DAEMON_RUNTIME_OPTIONS,
            initialValue: opts.daemonRuntime ?? DEFAULT_GATEWAY_DAEMON_RUNTIME,
          });
    if (flow === "quickstart") {
      await prompter.note(
        "Быстрый старт использует Node для сервиса Gateway (стабильно и поддерживается).",
        "Рантайм сервиса Gateway",
      );
    }
    const service = resolveGatewayService();
    const loaded = await service.isLoaded({ env: process.env });
    let restartWasScheduled = false;
    if (loaded) {
      const action = await prompter.select({
        message: "Сервис Gateway уже установлен",
        options: [
          { value: "restart", label: "Перезапустить" },
          { value: "reinstall", label: "Переустановить" },
          { value: "skip", label: "Пропустить" },
        ],
      });
      if (action === "restart") {
        let restartDoneMessage = "Gateway service restarted.";
        await withWizardProgress(
          "Gateway service",
          { doneMessage: () => restartDoneMessage },
          async (progress) => {
            progress.update("Restarting Gateway service…");
            const restartResult = await service.restart({
              env: process.env,
              stdout: process.stdout,
            });
            const restartStatus = describeGatewayServiceRestart("Gateway", restartResult);
            restartDoneMessage = restartStatus.progressMessage;
            restartWasScheduled = restartStatus.scheduled;
          },
        );
      } else if (action === "reinstall") {
        await withWizardProgress(
          "Gateway service",
          { doneMessage: "Gateway service uninstalled." },
          async (progress) => {
            progress.update("Uninstalling Gateway service…");
            await service.uninstall({ env: process.env, stdout: process.stdout });
          },
        );
      }
    }

    if (
      !loaded ||
      (!restartWasScheduled && loaded && !(await service.isLoaded({ env: process.env })))
    ) {
      const progress = prompter.progress("Gateway service");
      let installError: string | null = null;
      try {
        progress.update("Preparing Gateway service…");
        const tokenResolution = await resolveGatewayInstallToken({
          config: nextConfig,
          env: process.env,
        });
        for (const warning of tokenResolution.warnings) {
          await prompter.note(warning, "Gateway service");
        }
        if (tokenResolution.unavailableReason) {
          installError = [
            "Gateway install blocked:",
            tokenResolution.unavailableReason,
            "Fix gateway auth config/token input and rerun setup.",
          ].join(" ");
        } else {
          const { programArguments, workingDirectory, environment } = await buildGatewayInstallPlan(
            {
              env: process.env,
              port: settings.port,
              runtime: daemonRuntime,
              warn: (message, title) => prompter.note(message, title),
              config: nextConfig,
            },
          );

          progress.update("Installing Gateway service…");
          await service.install({
            env: process.env,
            stdout: process.stdout,
            programArguments,
            workingDirectory,
            environment,
          });
        }
      } catch (err) {
        installError = err instanceof Error ? err.message : String(err);
      } finally {
        progress.stop(
          installError ? "Gateway service install failed." : "Gateway service installed.",
        );
      }
      if (installError) {
        await prompter.note(`Gateway service install failed: ${installError}`, "Gateway");
        await prompter.note(gatewayInstallErrorHint(), "Gateway");
      }
    }
  }

  if (!opts.skipHealth) {
    const probeLinks = resolveControlUiLinks({
      bind: nextConfig.gateway?.bind ?? "loopback",
      port: settings.port,
      customBindHost: nextConfig.gateway?.customBindHost,
      basePath: undefined,
    });
    // Daemon install/restart can briefly flap the WS; wait a bit so health check doesn't false-fail.
    await waitForGatewayReachable({
      url: probeLinks.wsUrl,
      token: settings.gatewayToken,
      deadlineMs: 15_000,
    });
    try {
      await healthCommand({ json: false, timeoutMs: 10_000 }, runtime);
    } catch (err) {
      runtime.error(formatHealthCheckFailure(err));
      await prompter.note(
        [
          "Docs:",
          "https://docs.openclaw.ai/gateway/health",
          "https://docs.openclaw.ai/gateway/troubleshooting",
        ].join("\n"),
        "Health check help",
      );
    }
  }

  const controlUiEnabled =
    nextConfig.gateway?.controlUi?.enabled ?? baseConfig.gateway?.controlUi?.enabled ?? true;
  if (!opts.skipUi && controlUiEnabled) {
    const controlUiAssets = await ensureControlUiAssetsBuilt(runtime);
    if (!controlUiAssets.ok && controlUiAssets.message) {
      runtime.error(controlUiAssets.message);
    }
  }

  await prompter.note(
    [
      "Добавьте узлы для дополнительных возможностей:",
      "- приложение macOS (система + уведомления)",
      "- приложение iOS (камера/canvas)",
      "- приложение Android (камера/canvas)",
    ].join("\n"),
    "Дополнительные приложения",
  );

  const controlUiBasePath =
    nextConfig.gateway?.controlUi?.basePath ?? baseConfig.gateway?.controlUi?.basePath;
  const links = resolveControlUiLinks({
    bind: settings.bind,
    port: settings.port,
    customBindHost: settings.customBindHost,
    basePath: controlUiBasePath,
  });
  const authedUrl =
    settings.authMode === "token" && settings.gatewayToken
      ? `${links.httpUrl}#token=${encodeURIComponent(settings.gatewayToken)}`
      : links.httpUrl;
  let resolvedGatewayPassword = "";
  if (settings.authMode === "password") {
    try {
      resolvedGatewayPassword =
        (await resolveSetupSecretInputString({
          config: nextConfig,
          value: nextConfig.gateway?.auth?.password,
          path: "gateway.auth.password",
          env: process.env,
        })) ?? "";
    } catch (error) {
      await prompter.note(
        [
          "Не удалось разрешить SecretRef для gateway.auth.password во время настройки авторизации.",
          error instanceof Error ? error.message : String(error),
        ].join("\n"),
        "Авторизация gateway",
      );
    }
  }

  const gatewayProbe = await probeGatewayReachable({
    url: links.wsUrl,
    token: settings.authMode === "token" ? settings.gatewayToken : undefined,
    password: settings.authMode === "password" ? resolvedGatewayPassword : "",
  });
  const gatewayStatusLine = gatewayProbe.ok
    ? "Gateway: доступен"
    : `Gateway: не обнаружен${gatewayProbe.detail ? ` (${gatewayProbe.detail})` : ""}`;
  const bootstrapPath = path.join(
    resolveUserPath(options.workspaceDir),
    DEFAULT_BOOTSTRAP_FILENAME,
  );
  const hasBootstrap = await fs
    .access(bootstrapPath)
    .then(() => true)
    .catch(() => false);

  await prompter.note(
    [
      `Веб-интерфейс: ${links.httpUrl}`,
      settings.authMode === "token" && settings.gatewayToken
        ? `Веб-интерфейс (с токеном): ${authedUrl}`
        : undefined,
      `Gateway WS: ${links.wsUrl}`,
      gatewayStatusLine,
      "Документация: https://docs.openclaw.ai/web/control-ui",
    ]
      .filter(Boolean)
      .join("\n"),
    "Веб-интерфейс",
  );

  let controlUiOpened = false;
  let controlUiOpenHint: string | undefined;
  let seededInBackground = false;
  let hatchChoice: "tui" | "web" | "later" | null = null;
  let launchedTui = false;

  if (!opts.skipUi && gatewayProbe.ok) {
    if (hasBootstrap) {
      await prompter.note(
        [
          "Это важное действие, с которого агент становится именно вашим.",
          "Не спешите.",
          "Чем больше вы ему расскажете, тем лучше будет опыт дальше.",
          'Мы отправим: "Wake up, my friend!"',
        ].join("\n"),
        "Запуск TUI (лучший вариант!)",
      );
    }

    await prompter.note(
      [
        "Gateway token: общий способ авторизации для Gateway и веб-интерфейса.",
        "Хранится в: ~/.openclaw/openclaw.json (gateway.auth.token) или OPENCLAW_GATEWAY_TOKEN.",
        `Посмотреть токен: ${formatCliCommand("openclaw config get gateway.auth.token")}`,
        `Сгенерировать токен: ${formatCliCommand("openclaw doctor --generate-gateway-token")}`,
        "Веб-интерфейс хранит токены из dashboard URL в памяти текущей вкладки и убирает их из URL после загрузки.",
        `Открыть dashboard в любой момент: ${formatCliCommand("openclaw dashboard --no-open")}`,
        "Если потребуется — вставьте токен в настройках Control UI (или используйте tokenized dashboard URL).",
      ].join("\n"),
      "Токен",
    );

    hatchChoice = await prompter.select({
      message: "Как вы хотите запустить своего бота?",
      options: [
        { value: "tui", label: "Запустить в TUI (рекомендуется)" },
        { value: "web", label: "Открыть веб-интерфейс" },
        { value: "later", label: "Сделать это позже" },
      ],
      initialValue: "tui",
    });

    if (hatchChoice === "tui") {
      restoreTerminalState("pre-setup tui", { resumeStdinIfPaused: true });
      await runTui({
        url: links.wsUrl,
        token: settings.authMode === "token" ? settings.gatewayToken : undefined,
        password: settings.authMode === "password" ? resolvedGatewayPassword : "",
        // Safety: setup TUI should not auto-deliver to lastProvider/lastTo.
        deliver: false,
        message: hasBootstrap ? "Wake up, my friend!" : undefined,
      });
      launchedTui = true;
    } else if (hatchChoice === "web") {
      const browserSupport = await detectBrowserOpenSupport();
      if (browserSupport.ok) {
        controlUiOpened = await openUrl(authedUrl);
        if (!controlUiOpened) {
          controlUiOpenHint = formatControlUiSshHint({
            port: settings.port,
            basePath: controlUiBasePath,
            token: settings.authMode === "token" ? settings.gatewayToken : undefined,
          });
        }
      } else {
        controlUiOpenHint = formatControlUiSshHint({
          port: settings.port,
          basePath: controlUiBasePath,
          token: settings.authMode === "token" ? settings.gatewayToken : undefined,
        });
      }
      await prompter.note(
        [
          `Ссылка на dashboard (с токеном): ${authedUrl}`,
          controlUiOpened
            ? "Открыл в браузере. Держите эту вкладку — через неё можно управлять OpenClaw."
            : "Скопируйте и откройте этот URL в браузере на этой машине, чтобы управлять OpenClaw.",
          controlUiOpenHint,
        ]
          .filter(Boolean)
          .join("\n"),
        "Dashboard готов",
      );
    } else {
      await prompter.note(
        `Когда будете готовы: ${formatCliCommand("openclaw dashboard --no-open")}`,
        "Позже",
      );
    }
  } else if (opts.skipUi) {
    await prompter.note("Пропускаю вопросы про Control UI/TUI.", "Control UI");
  }

  await prompter.note(
    [
      "Сделайте резервную копию workspace вашего агента.",
      "Документация: https://docs.openclaw.ai/concepts/agent-workspace",
    ].join("\n"),
    "Резервная копия workspace",
  );

  await prompter.note(
    "Запуск агентов на вашем компьютере связан с риском — укрепите безопасность вашей установки: https://docs.openclaw.ai/security",
    "Безопасность",
  );

  await setupWizardShellCompletion({ flow, prompter });

  const shouldOpenControlUi =
    !opts.skipUi &&
    settings.authMode === "token" &&
    Boolean(settings.gatewayToken) &&
    hatchChoice === null;
  if (shouldOpenControlUi) {
    const browserSupport = await detectBrowserOpenSupport();
    if (browserSupport.ok) {
      controlUiOpened = await openUrl(authedUrl);
      if (!controlUiOpened) {
        controlUiOpenHint = formatControlUiSshHint({
          port: settings.port,
          basePath: controlUiBasePath,
          token: settings.gatewayToken,
        });
      }
    } else {
      controlUiOpenHint = formatControlUiSshHint({
        port: settings.port,
        basePath: controlUiBasePath,
        token: settings.gatewayToken,
      });
    }

    await prompter.note(
      [
        `Dashboard link (with token): ${authedUrl}`,
        controlUiOpened
          ? "Opened in your browser. Keep that tab to control OpenClaw."
          : "Copy/paste this URL in a browser on this machine to control OpenClaw.",
        controlUiOpenHint,
      ]
        .filter(Boolean)
        .join("\n"),
      "Dashboard ready",
    );
  }

  const webSearchProvider = nextConfig.tools?.web?.search?.provider;
  const webSearchEnabled = nextConfig.tools?.web?.search?.enabled;
  if (webSearchProvider) {
    const { SEARCH_PROVIDER_OPTIONS, resolveExistingKey, hasExistingKey, hasKeyInEnv } =
      await import("../commands/onboard-search.js");
    const entry = SEARCH_PROVIDER_OPTIONS.find((e) => e.value === webSearchProvider);
    const label = entry?.label ?? webSearchProvider;
    const storedKey = resolveExistingKey(nextConfig, webSearchProvider);
    const keyConfigured = hasExistingKey(nextConfig, webSearchProvider);
    const envAvailable = entry ? hasKeyInEnv(entry) : false;
    const hasKey = keyConfigured || envAvailable;
    const keySource = storedKey
      ? "API key: stored in config."
      : keyConfigured
        ? "API key: configured via secret reference."
        : envAvailable
          ? `API key: provided via ${entry?.envKeys.join(" / ")} env var.`
          : undefined;
    if (webSearchEnabled !== false && hasKey) {
      await prompter.note(
        [
          "Веб-поиск включён, поэтому агент сможет искать информацию онлайн при необходимости.",
          "",
          `Провайдер: ${label}`,
          ...(keySource ? [keySource] : []),
          "Документация: https://docs.openclaw.ai/tools/web",
        ].join("\n"),
        "Веб-поиск",
      );
    } else if (!hasKey) {
      await prompter.note(
        [
          `Выбран провайдер ${label}, но API-ключ не найден.`,
          "web_search не будет работать, пока вы не добавите ключ.",
          `  ${formatCliCommand("openclaw configure --section web")}`,
          "",
          `Получить ключ: ${entry?.signupUrl ?? "https://docs.openclaw.ai/tools/web"}`,
          "Документация: https://docs.openclaw.ai/tools/web",
        ].join("\n"),
        "Веб-поиск",
      );
    } else {
      await prompter.note(
        [
          `Веб-поиск (${label}) настроен, но отключён.`,
          `Включить снова: ${formatCliCommand("openclaw configure --section web")}`,
          "",
          "Документация: https://docs.openclaw.ai/tools/web",
        ].join("\n"),
        "Веб-поиск",
      );
    }
  } else {
    // Legacy configs may have a working key (e.g. apiKey or BRAVE_API_KEY) without
    // an explicit provider. Runtime auto-detects these, so avoid saying "skipped".
    const { SEARCH_PROVIDER_OPTIONS, hasExistingKey, hasKeyInEnv } =
      await import("../commands/onboard-search.js");
    const legacyDetected = SEARCH_PROVIDER_OPTIONS.find(
      (e) => hasExistingKey(nextConfig, e.value) || hasKeyInEnv(e),
    );
    if (legacyDetected) {
      await prompter.note(
        [
          `Веб-поиск доступен через ${legacyDetected.label} (обнаружено автоматически).`,
          "Документация: https://docs.openclaw.ai/tools/web",
        ].join("\n"),
        "Веб-поиск",
      );
    } else {
      await prompter.note(
        [
          "Настройка веб-поиска была пропущена. Вы сможете включить его позже:",
          `  ${formatCliCommand("openclaw configure --section web")}`,
          "",
          "Документация: https://docs.openclaw.ai/tools/web",
        ].join("\n"),
        "Веб-поиск",
      );
    }
  }

  await prompter.note(
    'Что дальше: https://openclaw.ai/showcase ("What People Are Building").',
    "Что дальше",
  );

  await prompter.outro(
    controlUiOpened
      ? "Настройка завершена. Dashboard открыт; держите эту вкладку для управления OpenClaw."
      : seededInBackground
        ? "Настройка завершена. Веб-интерфейс подготовлен в фоне; откройте его в любой момент по ссылке выше."
        : "Настройка завершена. Используйте ссылку на dashboard выше, чтобы управлять OpenClaw.",
  );

  return { launchedTui };
}
