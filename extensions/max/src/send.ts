/**
 * MAX message sending
 */
import type { OpenClawConfig } from "openclaw/plugin-sdk/core";
import { getMaxBot } from "./bot.js";
import { logger } from "./logger.js";
import {
  validateMediaUrl,
  sendMediaToMax,
  readLocalMedia,
  getMediaFilename,
} from "./media.js";

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
  if (params.mediaUrl || params.mediaLocalRoots?.length) {
    const mediaUrl = params.mediaUrl;
    
    if (mediaUrl) {
      logger.debug(`Media URL provided: ${mediaUrl}`);
      
      if (!validateMediaUrl(mediaUrl)) {
        logger.warn(`Invalid media URL: ${mediaUrl}, sending text only`);
      } else {
        try {
          // Send media with caption
          const result = await sendMediaToMax({
            chatId,
            mediaUrl,
            caption: params.text,
            filename: getMediaFilename(mediaUrl),
            replyToMid: params.replyToId ?? undefined,
          });

          logger.success(`Message with media sent to ${chatId}, mid: ${result.messageId}`);
          
          return {
            success: true,
            messageId: result.messageId,
            chatId,
          };
        } catch (err) {
          logger.error("Failed to send media, falling back to text only:", err);
          // Continue to send text-only message below
        }
      }
    }
    
    // Try local media if roots provided
    if (params.mediaLocalRoots?.length) {
      logger.debug("Local media roots provided, attempting local file send");
      // This would require knowing which file to send
      // For now, we'll just log and continue with text
      logger.warn("Local media sending not yet implemented");
    }
  }

  // Send text message (either standalone or as fallback)
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
