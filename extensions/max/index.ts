import type { ChannelPlugin } from "openclaw/plugin-sdk/core";
import { defineChannelPluginEntry } from "openclaw/plugin-sdk/core";
import { maxPlugin } from "./src/channel.js";
import { setMaxRuntime } from "./src/runtime.js";

export { maxPlugin } from "./src/channel.js";
export { setMaxRuntime } from "./src/runtime.js";

export default defineChannelPluginEntry({
  id: "max",
  name: "Max (iOS Shortcuts)",
  description: "iOS Shortcuts HTTP API channel for OpenClaw",
  plugin: maxPlugin as ChannelPlugin,
  setRuntime: setMaxRuntime,
});
