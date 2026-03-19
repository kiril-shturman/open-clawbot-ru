import type { OpenClawConfig } from "../config/config.js";
import { resolveGatewayPort } from "../config/config.js";
import { isValidEnvSecretRefId, type SecretInput } from "../config/types.secrets.js";
import {
  maybeAddTailnetOriginToControlUiAllowedOrigins,
  TAILSCALE_DOCS_LINES,
  TAILSCALE_EXPOSURE_OPTIONS,
  TAILSCALE_MISSING_BIN_NOTE_LINES,
} from "../gateway/gateway-config-prompts.shared.js";
import { findTailscaleBinary } from "../infra/tailscale.js";
import type { RuntimeEnv } from "../runtime.js";
import { resolveDefaultSecretProviderAlias } from "../secrets/ref-contract.js";
import { validateIPv4AddressInput } from "../shared/net/ipv4.js";
import { note } from "../terminal/note.js";
import { buildGatewayAuthConfig } from "./configure.gateway-auth.js";
import { confirm, select, text } from "./configure.shared.js";
import {
  guardCancel,
  normalizeGatewayTokenInput,
  randomToken,
  validateGatewayPasswordInput,
} from "./onboard-helpers.js";

type GatewayAuthChoice = "token" | "password" | "trusted-proxy";
type GatewayTokenInputMode = "plaintext" | "ref";

export async function promptGatewayConfig(
  cfg: OpenClawConfig,
  runtime: RuntimeEnv,
): Promise<{
  config: OpenClawConfig;
  port: number;
  token?: string;
}> {
  const portRaw = guardCancel(
    await text({
      message: "Порт gateway",
      initialValue: String(resolveGatewayPort(cfg)),
      validate: (value) => (Number.isFinite(Number(value)) ? undefined : "Некорректный порт"),
    }),
    runtime,
  );
  const port = Number.parseInt(String(portRaw), 10);

  let bind = guardCancel(
    await select({
      message: "Режим bind для gateway",
      options: [
        {
          value: "loopback",
          label: "Loopback (только локально)",
          hint: "Bind к 127.0.0.1 — безопасный доступ только с этого устройства",
        },
        {
          value: "tailnet",
          label: "Tailnet (IP Tailscale)",
          hint: "Bind только к вашему IP Tailscale (100.x.x.x)",
        },
        {
          value: "auto",
          label: "Авто (Loopback → LAN)",
          hint: "Сначала loopback, если нельзя — переход на все интерфейсы",
        },
        {
          value: "lan",
          label: "LAN (все интерфейсы)",
          hint: "Bind к 0.0.0.0 — доступен из вашей сети",
        },
        {
          value: "custom",
          label: "Свой IP",
          hint: "Указать конкретный IP-адрес; при недоступности — fallback на 0.0.0.0",
        },
      ],
    }),
    runtime,
  );

  let customBindHost: string | undefined;
  if (bind === "custom") {
    const input = guardCancel(
      await text({
        message: "Пользовательский IP-адрес",
        placeholder: "192.168.1.100",
        validate: validateIPv4AddressInput,
      }),
      runtime,
    );
    customBindHost = typeof input === "string" ? input : undefined;
  }

  let authMode = guardCancel(
    await select({
      message: "Режим auth для gateway",
      options: [
        { value: "token", label: "Token", hint: "Рекомендуемый вариант по умолчанию" },
        { value: "password", label: "Пароль" },
        {
          value: "trusted-proxy",
          label: "Trusted Proxy",
          hint: "За reverse proxy (Pomerium, Caddy, Traefik и т. д.)",
        },
      ],
      initialValue: "token",
    }),
    runtime,
  ) as GatewayAuthChoice;

  let tailscaleMode = guardCancel(
    await select({
      message: "Публикация через Tailscale",
      options: [...TAILSCALE_EXPOSURE_OPTIONS],
    }),
    runtime,
  );

  // Detect Tailscale binary before proceeding with serve/funnel setup.
  // Persist the path so getTailnetHostname can reuse it for origin injection.
  let tailscaleBin: string | null = null;
  if (tailscaleMode !== "off") {
    tailscaleBin = await findTailscaleBinary();
    if (!tailscaleBin) {
      note(TAILSCALE_MISSING_BIN_NOTE_LINES.join("\n"), "Предупреждение Tailscale");
    }
  }

  let tailscaleResetOnExit = false;
  if (tailscaleMode !== "off") {
    note(TAILSCALE_DOCS_LINES.join("\n"), "Tailscale");
    tailscaleResetOnExit = Boolean(
      guardCancel(
        await confirm({
          message: "Сбросить Tailscale serve/funnel при выходе?",
          initialValue: false,
        }),
        runtime,
      ),
    );
  }

  if (tailscaleMode !== "off" && bind !== "loopback") {
    note("Для Tailscale нужен bind=loopback. Переключаю bind на loopback.", "Заметка");
    bind = "loopback";
  }

  if (tailscaleMode === "funnel" && authMode !== "password") {
    note("Для Tailscale funnel нужен auth по паролю.", "Заметка");
    authMode = "password";
  }

  // trusted-proxy + loopback is valid when the reverse proxy runs on the same
  // host (e.g. cloudflared, nginx, Caddy). trustedProxies must include 127.0.0.1.
  if (authMode === "trusted-proxy" && tailscaleMode !== "off") {
    note(
      "Auth через trusted proxy несовместим с Tailscale serve/funnel. Отключаю Tailscale.",
      "Заметка",
    );
    tailscaleMode = "off";
    tailscaleResetOnExit = false;
  }

  let gatewayToken: SecretInput | undefined;
  let gatewayTokenForCalls: string | undefined;
  let gatewayPassword: string | undefined;
  let trustedProxyConfig:
    | { userHeader: string; requiredHeaders?: string[]; allowUsers?: string[] }
    | undefined;
  let trustedProxies: string[] | undefined;
  let next = cfg;

  if (authMode === "token") {
    const tokenInputMode = guardCancel(
      await select<GatewayTokenInputMode>({
        message: "Источник token для gateway",
        options: [
          {
            value: "plaintext",
            label: "Сгенерировать и сохранить token в открытом виде",
            hint: "По умолчанию",
          },
          {
            value: "ref",
            label: "Использовать SecretRef",
            hint: "Сохранить ссылку на env-переменную вместо открытого token",
          },
        ],
        initialValue: "plaintext",
      }),
      runtime,
    );
    if (tokenInputMode === "ref") {
      const envVar = guardCancel(
        await text({
          message: "Env-переменная для token gateway",
          initialValue: "OPENCLAW_GATEWAY_TOKEN",
          placeholder: "OPENCLAW_GATEWAY_TOKEN",
          validate: (value) => {
            const candidate = String(value ?? "").trim();
            if (!isValidEnvSecretRefId(candidate)) {
              return "Используйте имя env-переменной вроде OPENCLAW_GATEWAY_TOKEN.";
            }
            const resolved = process.env[candidate]?.trim();
            if (!resolved) {
              return `Env-переменная "${candidate}" отсутствует или пуста в этой сессии.`;
            }
            return undefined;
          },
        }),
        runtime,
      );
      const envVarName = String(envVar ?? "").trim();
      gatewayToken = {
        source: "env",
        provider: resolveDefaultSecretProviderAlias(cfg, "env", {
          preferFirstProviderForSource: true,
        }),
        id: envVarName,
      };
      note(
        `Проверка ${envVarName} пройдена. OpenClaw сохранит token как SecretRef.`,
        "Token gateway",
      );
    } else {
      const tokenInput = guardCancel(
        await text({
          message: "Token gateway (оставьте пустым для генерации)",
          initialValue: randomToken(),
        }),
        runtime,
      );
      gatewayTokenForCalls = normalizeGatewayTokenInput(tokenInput) || randomToken();
      gatewayToken = gatewayTokenForCalls;
    }
  }

  if (authMode === "password") {
    const password = guardCancel(
      await text({
        message: "Пароль gateway",
        validate: validateGatewayPasswordInput,
      }),
      runtime,
    );
    gatewayPassword = String(password ?? "").trim();
  }

  if (authMode === "trusted-proxy") {
    note(
      [
        "Режим trusted proxy: OpenClaw доверяет identity пользователя от reverse proxy.",
        "Proxy должен аутентифицировать пользователей и передавать identity в заголовках.",
        "Доверие будет только к запросам с указанных IP-адресов proxy.",
        "",
        "Типовые сценарии: Pomerium, Caddy + OAuth, Traefik + forward auth",
        "Документация: https://docs.openclaw.ai/gateway/trusted-proxy-auth",
      ].join("\n"),
      "Auth trusted proxy",
    );

    const userHeader = guardCancel(
      await text({
        message: "Заголовок с identity пользователя",
        placeholder: "x-forwarded-user",
        initialValue: "x-forwarded-user",
        validate: (value) => (value?.trim() ? undefined : "Нужно указать заголовок пользователя"),
      }),
      runtime,
    );

    const requiredHeadersRaw = guardCancel(
      await text({
        message: "Обязательные заголовки (через запятую, необязательно)",
        placeholder: "x-forwarded-proto,x-forwarded-host",
      }),
      runtime,
    );
    const requiredHeaders = requiredHeadersRaw
      ? String(requiredHeadersRaw)
          .split(",")
          .map((h) => h.trim())
          .filter(Boolean)
      : [];

    const allowUsersRaw = guardCancel(
      await text({
        message: "Разрешённые пользователи (через запятую, пусто = все аутентифицированные)",
        placeholder: "nick@example.com,admin@company.com",
      }),
      runtime,
    );
    const allowUsers = allowUsersRaw
      ? String(allowUsersRaw)
          .split(",")
          .map((u) => u.trim())
          .filter(Boolean)
      : [];

    const trustedProxiesRaw = guardCancel(
      await text({
        message: "Доверенные IP-адреса proxy (через запятую)",
        placeholder: "10.0.1.10,192.168.1.5",
        validate: (value) => {
          if (!value || String(value).trim() === "") {
            return "Нужен хотя бы один доверенный IP-адрес proxy";
          }
          return undefined;
        },
      }),
      runtime,
    );
    trustedProxies = String(trustedProxiesRaw)
      .split(",")
      .map((ip) => ip.trim())
      .filter(Boolean);

    trustedProxyConfig = {
      userHeader: String(userHeader).trim(),
      requiredHeaders: requiredHeaders.length > 0 ? requiredHeaders : undefined,
      allowUsers: allowUsers.length > 0 ? allowUsers : undefined,
    };
  }

  const authConfig = buildGatewayAuthConfig({
    existing: next.gateway?.auth,
    mode: authMode,
    token: gatewayToken,
    password: gatewayPassword,
    trustedProxy: trustedProxyConfig,
  });

  next = {
    ...next,
    gateway: {
      ...next.gateway,
      mode: "local",
      port,
      bind,
      auth: authConfig,
      ...(customBindHost && { customBindHost }),
      ...(trustedProxies && { trustedProxies }),
      tailscale: {
        ...next.gateway?.tailscale,
        mode: tailscaleMode,
        resetOnExit: tailscaleResetOnExit,
      },
    },
  };

  next = await maybeAddTailnetOriginToControlUiAllowedOrigins({
    config: next,
    tailscaleMode,
    tailscaleBin,
  });

  return { config: next, port, token: gatewayTokenForCalls };
}
