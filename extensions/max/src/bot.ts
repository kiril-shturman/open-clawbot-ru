/**
 * MAX Bot wrapper using @max-messenger/max-bot-api
 */
import { Bot } from "@max-messenger/max-bot-api";
import type { OpenClawConfig } from "openclaw/plugin-sdk/core";
import { getMaxRuntime } from "./runtime.js";

export interface MaxBotOptions {
  token: string;
  cfg: OpenClawConfig;
  onMessage: (msg: MaxInboundMessage) => Promise<void>;
}

export interface MaxInboundMessage {
  chatId: string;
  userId: string;
  text: string;
  mid?: string; // message ID for threading
  timestamp: number;
  attachments?: Array<{
    type: string;
    url?: string;
  }>;
}

export async function createMaxBot(options: MaxBotOptions) {
  const bot = new Bot(options.token);

  bot.on("message_created", async (ctx) => {
    try {
      const msg = ctx.message?.body;
      if (!msg) return;

      const text = msg.text || msg.caption || "";
      if (!text.trim()) return;

      const inboundMsg: MaxInboundMessage = {
        chatId: msg.chat_id,
        userId: msg.user_id,
        text,
        mid: msg.mid,
        timestamp: msg.timestamp || Date.now(),
        attachments: extractAttachments(msg),
      };

      await options.onMessage(inboundMsg);
    } catch (err) {
      console.error("[MAX] Message handler error:", err);
    }
  });

  bot.on("error", (err) => {
    console.error("[MAX] Bot error:", err);
  });

  await bot.start();
  console.log("[MAX] Bot started and listening");

  return {
    bot,
    async stop() {
      await bot.stop();
    },
    async sendMessage(params: {
      chatId: string;
      text: string;
      replyToMid?: string;
    }) {
      return await bot.sendMessage({
        chat_id: params.chatId,
        text: params.text,
        link: params.replyToMid ? { type: "reply", mid: params.replyToMid } : undefined,
      });
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
