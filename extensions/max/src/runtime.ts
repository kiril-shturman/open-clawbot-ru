import type { PluginRuntime } from "openclaw/plugin-sdk/core";
import { createPluginRuntimeStore } from "openclaw/plugin-sdk/runtime-store";

const { setRuntime: setMaxRuntime, getRuntime: getMaxRuntime } =
  createPluginRuntimeStore<PluginRuntime>("Max runtime not initialized");

export { getMaxRuntime, setMaxRuntime };
