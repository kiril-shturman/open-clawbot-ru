/**
 * Account management tests
 */
import { describe, it, expect } from "vitest";
import { validateMaxToken, getMaxAccounts } from "../accounts.js";
import type { OpenClawConfig } from "openclaw/plugin-sdk/core";

describe("validateMaxToken", () => {
  it("accepts valid-looking tokens", () => {
    expect(validateMaxToken("valid_token_1234567890")).toBe(true);
    expect(validateMaxToken("a".repeat(20))).toBe(true);
  });

  it("rejects empty tokens", () => {
    expect(validateMaxToken("")).toBe(false);
    expect(validateMaxToken("   ")).toBe(false);
  });

  it("rejects too-short tokens", () => {
    expect(validateMaxToken("short")).toBe(false);
  });

  it("rejects non-string tokens", () => {
    expect(validateMaxToken(null as any)).toBe(false);
    expect(validateMaxToken(undefined as any)).toBe(false);
    expect(validateMaxToken(123 as any)).toBe(false);
  });
});

describe("getMaxAccounts", () => {
  it("returns empty array when no config", () => {
    const cfg: OpenClawConfig = {} as any;
    expect(getMaxAccounts(cfg)).toEqual([]);
  });

  it("returns account from config", () => {
    const cfg: OpenClawConfig = {
      channels: {
        max: {
          token: "test_token_123",
          label: "Test Bot",
        },
      },
    } as any;

    const accounts = getMaxAccounts(cfg);
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({
      accountId: "default",
      token: "test_token_123",
      label: "Test Bot",
      enabled: true,
    });
  });

  it("falls back to env var if no config token", () => {
    process.env.MAX_BOT_TOKEN = "env_token_456";
    
    const cfg: OpenClawConfig = {
      channels: {
        max: {},
      },
    } as any;

    const accounts = getMaxAccounts(cfg);
    expect(accounts).toHaveLength(1);
    expect(accounts[0].token).toBe("env_token_456");

    delete process.env.MAX_BOT_TOKEN;
  });
});
