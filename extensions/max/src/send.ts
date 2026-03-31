/**
 * MAX message sending
 */
import type { OpenClawConfig } from "openclaw/plugin-sdk/core";
import { getMaxBot } from "./bot.js";
import { logger } from "./logger.js";
import { validateMediaUrl, downloadMedia } from "./media.js";

export interface MaxSendParams {
  to: string; // chatId
  text: string;
  cfg: OpenClawConfig;
  mediaUrl?: string | null;
  replyToId?: string | null;
  mediaLocalRoots?: readonly string[] | null;
}

export async function sendMaxMessage(params: MaxSendParams) {
  const bot = getMaxBot();
  if (!bot) {
    const err = new Error("MAX bot not initialized - did the channel start properly?");
    logger.error("Send failed:", err.message);
    throw err;
  }

  // Parse target (format: "max:chatId" or just "chatId")
  const chatId = params.to.replace(/^max:/, "");

  if (!chatId) {
    const err = new Error(`Invalid MAX target: "${params.to}"`);
    logger.error("Send failed:", err.message);
    throw err;
  }

  logger.debug(`Sending to ${chatId}: ${params.text.slice(0, 100)}...`);

  // Handle media if present
  if (params.mediaUrl) {
    logger.debug(`Media URL provided: ${params.mediaUrl}`);
    
    if (!validateMediaUrl(params.mediaUrl)) {
      logger.warn(`Invalid media URL: ${params.mediaUrl}`);
      // Continue without media rather than failing
    } else {
      try {
        // Download and attach media
        // Note: MAX Bot API might need specific media handling
        // This is a placeholder for future implementation
        logger.warn("Media sending not fully implemented yet - sending text only");
      } catch (err) {
        logger.error("Failed to process media, sending text only:", err);
        // Continue with text-only message
      }
    }
  }

  try {
    const result = await bot.sendMessage({
      chatId,
      text: params.text,
      replyToMid: params.replyToId ?? undefined,
    });

    logger.success(`Message sent to ${chatId}, mid: ${result?.mid}`);
    
    return {
      success: true,
      messageId: result?.mid,
      chatId,
    };
  } catch (err) {
    logger.error(`Failed to send message to ${chatId}:`, err);
    
    // Add context to error
    const enhancedError = new Error(
      `MAX send failed to ${chatId}: ${err instanceof Error ? err.message : String(err)}`
    );
    (enhancedError as any).originalError = err;
    (enhancedError as any).chatId = chatId;
    
    throw enhancedError;
  }
}

export async function sendTypingMax(params: { to: string }) {
  // MAX API might not support typing indicators
  // TODO: check if @max-messenger/max-bot-api supports typing
  return;
}
