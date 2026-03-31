/**
 * Logger tests
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logger } from "../logger.js";

describe("logger", () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs info messages with [MAX] prefix", () => {
    logger.info("test message", 123);
    expect(consoleLogSpy).toHaveBeenCalledWith("[MAX] test message", 123);
  });

  it("logs warnings with [MAX] prefix", () => {
    logger.warn("warning message");
    expect(consoleWarnSpy).toHaveBeenCalledWith("[MAX] ⚠️  warning message");
  });

  it("logs errors with [MAX] prefix", () => {
    logger.error("error message");
    expect(consoleErrorSpy).toHaveBeenCalledWith("[MAX] ❌ error message");
  });

  it("logs success messages", () => {
    logger.success("success message");
    expect(consoleLogSpy).toHaveBeenCalledWith("[MAX] ✅ success message");
  });

  it("only logs debug in debug mode", () => {
    const originalDebug = process.env.MAX_DEBUG;
    
    // Without debug mode
    delete process.env.MAX_DEBUG;
    delete process.env.DEBUG;
    logger.debug("debug message");
    expect(consoleLogSpy).not.toHaveBeenCalled();

    // With debug mode
    process.env.MAX_DEBUG = "1";
    logger.debug("debug message");
    expect(consoleLogSpy).toHaveBeenCalledWith("[MAX] 🔍 debug message");

    // Restore
    if (originalDebug) {
      process.env.MAX_DEBUG = originalDebug;
    } else {
      delete process.env.MAX_DEBUG;
    }
  });
});
