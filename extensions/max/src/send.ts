/**
 * MAX message sending
 */
import type { OpenClawConfig } from "openclaw/plugin-sdk/core";
import { getMaxBot } from "./bot.js";

export interface MaxSendParams {
  to: string; // chatId
  text: string;
  cfg: OpenClawConfig;
  mediaUrl?: string | null;
  replyToId?: string | null;
}

export async function sendMaxMessage(params: MaxSendParams) {
  const bot = getMaxBot();
  if (!bot) {
    throw new Error("[MAX] Bot not initialized");
  }

  // Parse target (format: "max:chatId" or just "chatId")
  const chatId = params.to.replace(/^max:/, "");

  try {
    const result = await bot.sendMessage({
      chatId,
      text: params.text,
      replyToMid: params.replyToId ?? undefined,
    });

    return {
      success: true,
      messageId: result?.mid,
    };
  } catch (err) {
    console.error("[MAX] Send error:", err);
    throw err;
  }
}

export async function sendTypingMax(params: { to: string }) {
  // MAX API might not support typing indicators
  // TODO: check if @max-messenger/max-bot-api supports typing
  return;
}
