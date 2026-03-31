/**
 * MAX channel logger
 */

export const logger = {
  info: (msg: string, ...args: any[]) => {
    console.log(`[MAX] ${msg}`, ...args);
  },
  warn: (msg: string, ...args: any[]) => {
    console.warn(`[MAX] ⚠️  ${msg}`, ...args);
  },
  error: (msg: string, ...args: any[]) => {
    console.error(`[MAX] ❌ ${msg}`, ...args);
  },
  debug: (msg: string, ...args: any[]) => {
    if (process.env.MAX_DEBUG || process.env.DEBUG) {
      console.log(`[MAX] 🔍 ${msg}`, ...args);
    }
  },
  success: (msg: string, ...args: any[]) => {
    console.log(`[MAX] ✅ ${msg}`, ...args);
  },
};
