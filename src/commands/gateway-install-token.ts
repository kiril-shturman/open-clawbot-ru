import { formatCliCommand } from "../cli/command-format.js";
import { readConfigFileSnapshot, writeConfigFile, type OpenClawConfig } from "../config/config.js";
import { resolveSecretInputRef } from "../config/types.secrets.js";
import { shouldRequireGatewayTokenForInstall } from "../gateway/auth-install-policy.js";
import { hasAmbiguousGatewayAuthModeConfig } from "../gateway/auth-mode-policy.js";
import { resolveGatewayAuth } from "../gateway/auth.js";
import { readGatewayTokenEnv } from "../gateway/credentials.js";
import { secretRefKey } from "../secrets/ref-contract.js";
import { resolveSecretRefValues } from "../secrets/resolve.js";
import { randomToken } from "./onboard-helpers.js";

type GatewayInstallTokenOptions = {
  config: OpenClawConfig;
  env: NodeJS.ProcessEnv;
  explicitToken?: string;
  autoGenerateWhenMissing?: boolean;
  persistGeneratedToken?: boolean;
};

export type GatewayInstallTokenResolution = {
  token?: string;
  tokenRefConfigured: boolean;
  unavailableReason?: string;
  warnings: string[];
};

function formatAmbiguousGatewayAuthModeReason(): string {
  return [
    "В gateway.auth.token и gateway.auth.password заданы значения, но gateway.auth.mode не установлен.",
    `Укажите ${formatCliCommand("openclaw config set gateway.auth.mode token")} или ${formatCliCommand("openclaw config set gateway.auth.mode password")}.`,
  ].join(" ");
}

export async function resolveGatewayInstallToken(
  options: GatewayInstallTokenOptions,
): Promise<GatewayInstallTokenResolution> {
  const cfg = options.config;
  const warnings: string[] = [];
  const tokenRef = resolveSecretInputRef({
    value: cfg.gateway?.auth?.token,
    defaults: cfg.secrets?.defaults,
  }).ref;
  const tokenRefConfigured = Boolean(tokenRef);
  const configToken =
    tokenRef || typeof cfg.gateway?.auth?.token !== "string"
      ? undefined
      : cfg.gateway.auth.token.trim() || undefined;
  const explicitToken = options.explicitToken?.trim() || undefined;
  const envToken = readGatewayTokenEnv(options.env);

  if (hasAmbiguousGatewayAuthModeConfig(cfg)) {
    return {
      token: undefined,
      tokenRefConfigured,
      unavailableReason: formatAmbiguousGatewayAuthModeReason(),
      warnings,
    };
  }

  const resolvedAuth = resolveGatewayAuth({
    authConfig: cfg.gateway?.auth,
    tailscaleMode: cfg.gateway?.tailscale?.mode ?? "off",
  });
  const needsToken =
    shouldRequireGatewayTokenForInstall(cfg, options.env) && !resolvedAuth.allowTailscale;

  let token: string | undefined = explicitToken || configToken || (tokenRef ? undefined : envToken);
  let unavailableReason: string | undefined;

  if (tokenRef && !token && needsToken) {
    try {
      const resolved = await resolveSecretRefValues([tokenRef], {
        config: cfg,
        env: options.env,
      });
      const value = resolved.get(secretRefKey(tokenRef));
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error("gateway.auth.token разрешился в пустое или нестроковое значение.");
      }
      warnings.push(
        "gateway.auth.token управляется через SecretRef; установка не будет сохранять разрешённый token в окружении сервиса. Убедитесь, что SecretRef доступен в контексте запуска демона.",
      );
    } catch (err) {
      unavailableReason = `gateway.auth.token настроен через SecretRef, но не разрешился (${String(err)}).`;
    }
  }

  const allowAutoGenerate = options.autoGenerateWhenMissing ?? false;
  const persistGeneratedToken = options.persistGeneratedToken ?? false;
  if (!token && needsToken && !tokenRef && allowAutoGenerate) {
    token = randomToken();
    warnings.push(
      persistGeneratedToken
        ? "Token gateway не найден. Сгенерировал новый и сохраняю его в конфиг."
        : "Token gateway не найден. Сгенерировал новый только для этого запуска, без сохранения в конфиг.",
    );

    if (persistGeneratedToken) {
      // Persist token in config so daemon and CLI share a stable credential source.
      try {
        const snapshot = await readConfigFileSnapshot();
        if (snapshot.exists && !snapshot.valid) {
          warnings.push(
            "Предупреждение: файл конфига существует, но он некорректен; сохранение token пропущено.",
          );
        } else {
          const baseConfig = snapshot.exists ? snapshot.config : {};
          const existingTokenRef = resolveSecretInputRef({
            value: baseConfig.gateway?.auth?.token,
            defaults: baseConfig.secrets?.defaults,
          }).ref;
          const baseConfigToken =
            existingTokenRef || typeof baseConfig.gateway?.auth?.token !== "string"
              ? undefined
              : baseConfig.gateway.auth.token.trim() || undefined;
          if (!existingTokenRef && !baseConfigToken) {
            await writeConfigFile({
              ...baseConfig,
              gateway: {
                ...baseConfig.gateway,
                auth: {
                  ...baseConfig.gateway?.auth,
                  mode: baseConfig.gateway?.auth?.mode ?? "token",
                  token,
                },
              },
            });
          } else if (baseConfigToken) {
            token = baseConfigToken;
          } else {
            token = undefined;
            warnings.push(
              "Предупреждение: gateway.auth.token управляется через SecretRef; сохранение plaintext token пропущено.",
            );
          }
        }
      } catch (err) {
        warnings.push(`Предупреждение: не удалось сохранить token в конфиг: ${String(err)}`);
      }
    }
  }

  return {
    token,
    tokenRefConfigured,
    unavailableReason,
    warnings,
  };
}
