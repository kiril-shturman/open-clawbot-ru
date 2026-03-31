/**
 * MAX account management
 * 
 * Unlike Telegram/Discord which support multiple bot tokens,
 * MAX integration currently supports single bot per Gateway instance.
 * 
 * This file provides account management structure for future multi-bot support.
 */
import type { OpenClawConfig } from "openclaw/plugin-sdk/core";
import { logger } from "./logger.js";

export interface MaxAccount {
  accountId: string;
  token: string;
  label?: string;
  enabled: boolean;
}

export function getMaxAccounts(cfg: OpenClawConfig): MaxAccount[] {
  const maxConfig = cfg.channels?.max;
  if (!maxConfig) return [];

  const token = maxConfig.token || process.env.MAX_BOT_TOKEN;
  if (!token) return [];

  return [
    {
      accountId: "default",
      token,
      label: maxConfig.label || "MAX Bot",
      enabled: true,
    },
  ];
}

export function getDefaultMaxAccount(cfg: OpenClawConfig): MaxAccount | null {
  const accounts = getMaxAccounts(cfg);
  return accounts[0] || null;
}

export function validateMaxToken(token: string): boolean {
  // MAX tokens should be non-empty strings
  // TODO: Add proper token format validation when known
  if (!token || typeof token !== "string") {
    return false;
  }
  
  if (token.trim().length < 10) {
    logger.warn("MAX token seems too short - might be invalid");
    return false;
  }

  return true;
}
