import type { ChannelPlugin, OpenClawConfig } from "openclaw/plugin-sdk/core";
import { buildOutboundBaseSessionKey } from "openclaw/plugin-sdk/core";
import { createChannelDirectoryAdapter } from "openclaw/plugin-sdk/channel-runtime";
import { getMaxRuntime, setMaxRuntime } from "./runtime.js";
import { createMaxBot, type MaxInboundMessage } from "./bot.js";
import { sendMaxMessage } from "./send.js";
import { handleMaxInbound } from "./monitor.js";
import { getDefaultMaxAccount, validateMaxToken } from "./accounts.js";
import { logger } from "./logger.js";

export const maxPlugin: ChannelPlugin = {
  id: "max",
  channelId: "max",
  
  async start(config: OpenClawConfig) {
    logger.info("Starting MAX channel...");
    
    const account = getDefaultMaxAccount(config);
    if (!account) {
      const error = new Error(
        "MAX_BOT_TOKEN not configured. Set MAX_BOT_TOKEN environment variable or add channels.max.token to config."
      );
      logger.error("Start failed:", error.message);
      throw error;
    }

    const token = account.token;
    
    if (!validateMaxToken(token)) {
      logger.warn("Token validation failed - continuing anyway");
    }

    logger.info(`Starting with account: ${account.label || account.accountId}`);

    const bot = await createMaxBot({
      token,
      cfg: config,
      onMessage: async (msg: MaxInboundMessage) => {
        await handleMaxInbound({ msg, cfg: config });
      },
    });

    // Store bot in runtime
    const runtime = getMaxRuntime();
    if (!runtime.channel) {
      runtime.channel = {};
    }
    runtime.channel.max = {
      bot,
      stopServer: async () => {
        await bot.stop();
      },
    };

    console.log("[MAX] Channel started successfully");
  },

  async stop() {
    logger.info("Stopping MAX channel...");
    try {
      const runtime = getMaxRuntime();
      if (runtime.channel?.max?.stopServer) {
        await runtime.channel.max.stopServer();
      }
      logger.success("MAX channel stopped successfully");
    } catch (err) {
      logger.error("Error during channel stop:", err);
      throw err;
    }
  },

  async send(params) {
    return await sendMaxMessage({
      to: params.to,
      text: params.text,
      cfg: params.cfg,
      mediaUrl: params.mediaUrl,
      replyToId: params.replyToId,
    });
  },

  looksLikeTargetId(targetId: string) {
    // MAX chat IDs (need to check MAX API format)
    // For now accept: "max:chatId" or numeric/alphanumeric IDs
    return /^(max:)?[a-zA-Z0-9_-]+$/i.test(targetId);
  },

  normalizeTargetId(targetId: string) {
    // Remove "max:" prefix if present
    return targetId.replace(/^max:/i, "").toLowerCase();
  },

  buildSessionKey(params) {
    const conversationId = params.conversationId || params.to;
    return buildOutboundBaseSessionKey({
      channelId: "max",
      conversationId: conversationId.replace(/^max:/i, ""),
    });
  },

  getDirectoryAdapter() {
    // MAX doesn't have a directory API (unlike Telegram/Discord)
    return createChannelDirectoryAdapter({
      listPeers: async () => [],
      listGroups: async () => [],
    });
  },

  // Optional: add typing indicator support if MAX API supports it
  async sendTyping(params) {
    // TODO: implement if MAX Bot API supports typing indicators
    return;
  },
};
