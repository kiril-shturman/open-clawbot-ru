/**
 * MAX Bot wrapper using @max-messenger/max-bot-api
 */
import { Bot } from "@max-messenger/max-bot-api";
import type { OpenClawConfig } from "openclaw/plugin-sdk/core";
import { logger } from "./logger.js";
import { getMaxRuntime } from "./runtime.js";

export interface MaxBotOptions {
  token: string;
  cfg: OpenClawConfig;
  onMessage: (msg: MaxInboundMessage) => Promise<void>;
}

export interface MaxInboundMessage {
  chatId: string;
  userId: string;
  userName?: string;
  text: string;
  mid?: string; // message ID for threading
  timestamp: number;
  chatType?: string; // "dialog" | "group" etc.
  attachments?: Array<{
    type: string;
    url?: string;
  }>;
}

export async function createMaxBot(options: MaxBotOptions) {
  logger.info("Creating MAX bot...");

  let bot: Bot;
  try {
    bot = new Bot(options.token);
  } catch (err) {
    logger.error("Failed to create bot instance:", err);
    throw new Error(`MAX bot initialization failed: ${err}`);
  }

  bot.on("message_created", async (ctx) => {
    try {
      logger.debug("Message event received:", ctx.message);

      const msg = ctx.message?.body;
      if (!msg) {
        logger.debug("Empty message body, skipping");
        return;
      }

      const text = msg.text || msg.caption || "";
      if (!text.trim()) {
        logger.debug("Empty text content, skipping");
        return;
      }

      // Extract data from MAX message structure
      const recipient = ctx.message?.recipient;
      const sender = ctx.message?.sender;

      const inboundMsg: MaxInboundMessage = {
        chatId: String(recipient?.chat_id || msg.chat_id),
        userId: String(sender?.user_id || msg.user_id),
        userName: sender?.name || sender?.first_name || undefined,
        chatType: recipient?.chat_type || "dialog",
        text,
        mid: msg.mid,
        timestamp: ctx.message?.timestamp || Date.now(),
        attachments: extractAttachments(msg),
      };

      logger.info(`Incoming message from user ${inboundMsg.userId} in chat ${inboundMsg.chatId}`);
      await options.onMessage(inboundMsg);
    } catch (err) {
      logger.error("Message handler error:", err);
      // Don't throw - we want to continue processing other messages
    }
  });

  bot.on("error", (err) => {
    logger.error("Bot error:", err);
  });

  try {
    await bot.start();
    logger.success("Bot started and listening for messages");
  } catch (err) {
    logger.error("Failed to start bot:", err);
    throw new Error(`MAX bot start failed: ${err}`);
  }

  return {
    bot,
    async stop() {
      try {
        logger.info("Stopping bot...");
        await bot.stop();
        logger.success("Bot stopped");
      } catch (err) {
        logger.error("Error stopping bot:", err);
        throw err;
      }
    },
    async sendMessage(params: { chatId: string; text: string; replyToMid?: string }) {
      try {
        logger.debug(`Sending message to chat ${params.chatId}:`, params.text.slice(0, 50));
        const result = await bot.sendMessage({
          chat_id: params.chatId,
          text: params.text,
          link: params.replyToMid ? { type: "reply", mid: params.replyToMid } : undefined,
        });
        logger.debug("Message sent successfully:", result);
        return result;
      } catch (err) {
        logger.error(`Failed to send message to chat ${params.chatId}:`, err);
        throw err;
      }
    },
  };
}

function extractAttachments(msg: any) {
  const attachments: Array<{ type: string; url?: string }> = [];

  if (msg.photo) {
    attachments.push({ type: "photo", url: msg.photo });
  }
  if (msg.video) {
    attachments.push({ type: "video", url: msg.video });
  }
  if (msg.file) {
    attachments.push({ type: "file", url: msg.file });
  }

  return attachments.length > 0 ? attachments : undefined;
}

export function getMaxBot() {
  const runtime = getMaxRuntime();
  return runtime.channel?.max?.bot;
}
