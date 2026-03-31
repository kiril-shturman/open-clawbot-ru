/**
 * MAX media handling (images, files, etc.)
 */
import fs from "node:fs/promises";
import path from "node:path";
import { logger } from "./logger.js";
import { getMaxBot } from "./bot.js";

export interface MediaAttachment {
  type: "image" | "file" | "video" | "audio";
  url?: string;
  localPath?: string;
  filename?: string;
  buffer?: Buffer;
}

export async function downloadMedia(url: string): Promise<Buffer> {
  logger.debug(`Downloading media from ${url}`);
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const buffer = Buffer.from(await response.arrayBuffer());
    logger.debug(`Downloaded ${buffer.length} bytes from ${url}`);
    return buffer;
  } catch (err) {
    logger.error(`Failed to download media from ${url}:`, err);
    throw new Error(`Media download failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function sendMediaToMax(params: {
  chatId: string;
  mediaUrl?: string;
  mediaBuffer?: Buffer;
  caption?: string;
  filename?: string;
  replyToMid?: string;
}): Promise<{ success: boolean; messageId?: string }> {
  const bot = getMaxBot();
  if (!bot) {
    throw new Error("MAX bot not initialized");
  }

  logger.info(`Attempting to send media to chat ${params.chatId}`);

  try {
    // Strategy 1: Try sending via URL if provided
    if (params.mediaUrl) {
      logger.debug(`Trying to send media via URL: ${params.mediaUrl}`);
      
      try {
        // Check if MAX Bot API supports sendPhoto/sendDocument with URL
        // Most bot APIs support this pattern:
        const result = await (bot.bot as any).sendPhoto?.({
          chat_id: params.chatId,
          photo: params.mediaUrl,
          caption: params.caption,
          link: params.replyToMid ? { type: "reply", mid: params.replyToMid } : undefined,
        });

        if (result?.mid) {
          logger.success(`Media sent via URL, mid: ${result.mid}`);
          return { success: true, messageId: result.mid };
        }
      } catch (urlErr) {
        logger.debug("URL send failed, trying buffer approach:", urlErr);
      }
    }

    // Strategy 2: Try downloading and sending as buffer
    if (params.mediaUrl && !params.mediaBuffer) {
      logger.debug("Downloading media for buffer send");
      try {
        const buffer = await downloadMedia(params.mediaUrl);
        params = { ...params, mediaBuffer: buffer };
      } catch (downloadErr) {
        logger.warn("Media download failed:", downloadErr);
      }
    }

    // Strategy 3: Try sending buffer if available
    if (params.mediaBuffer) {
      logger.debug(`Trying to send media as buffer (${params.mediaBuffer.length} bytes)`);
      
      try {
        // Try sendPhoto with buffer
        const result = await (bot.bot as any).sendPhoto?.({
          chat_id: params.chatId,
          photo: params.mediaBuffer,
          caption: params.caption,
          link: params.replyToMid ? { type: "reply", mid: params.replyToMid } : undefined,
        });

        if (result?.mid) {
          logger.success(`Media sent via buffer, mid: ${result.mid}`);
          return { success: true, messageId: result.mid };
        }
      } catch (bufferErr) {
        logger.debug("Buffer send failed:", bufferErr);
      }

      // Try sendDocument as fallback
      try {
        const result = await (bot.bot as any).sendDocument?.({
          chat_id: params.chatId,
          document: params.mediaBuffer,
          caption: params.caption,
          filename: params.filename || "file",
          link: params.replyToMid ? { type: "reply", mid: params.replyToMid } : undefined,
        });

        if (result?.mid) {
          logger.success(`Media sent as document, mid: ${result.mid}`);
          return { success: true, messageId: result.mid };
        }
      } catch (docErr) {
        logger.debug("Document send failed:", docErr);
      }
    }

    // Strategy 4: Fallback - send text message with media URL
    if (params.mediaUrl) {
      logger.warn("All media send strategies failed, sending URL as text");
      
      const fallbackText = params.caption 
        ? `${params.caption}\n\n📎 Media: ${params.mediaUrl}`
        : `📎 ${params.mediaUrl}`;

      const result = await bot.sendMessage({
        chatId: params.chatId,
        text: fallbackText,
        replyToMid: params.replyToMid,
      });

      logger.info("Sent media URL as text message");
      return { success: true, messageId: result?.mid };
    }

    throw new Error("No media URL or buffer provided");

  } catch (err) {
    logger.error("All media send strategies failed:", err);
    throw new Error(`Failed to send media: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function readLocalMedia(localPath: string, roots?: readonly string[]): Promise<Buffer> {
  logger.debug(`Reading local media from ${localPath}`);

  // Security: validate path is within allowed roots
  if (roots && roots.length > 0) {
    const resolved = path.resolve(localPath);
    const allowed = roots.some(root => {
      const resolvedRoot = path.resolve(root);
      return resolved.startsWith(resolvedRoot + path.sep) || resolved === resolvedRoot;
    });

    if (!allowed) {
      throw new Error(`Path ${localPath} is not within allowed roots`);
    }
  }

  try {
    const buffer = await fs.readFile(localPath);
    logger.debug(`Read ${buffer.length} bytes from ${localPath}`);
    return buffer;
  } catch (err) {
    logger.error(`Failed to read local file ${localPath}:`, err);
    throw new Error(`Local media read failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export function getMediaType(url: string | undefined): MediaAttachment["type"] | null {
  if (!url) return null;
  
  const lower = url.toLowerCase();
  if (lower.match(/\.(jpg|jpeg|png|gif|webp|bmp)$/i)) return "image";
  if (lower.match(/\.(mp4|mov|avi|webm|mkv)$/i)) return "video";
  if (lower.match(/\.(mp3|wav|ogg|m4a|flac)$/i)) return "audio";
  return "file";
}

export function validateMediaUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function getMediaFilename(url: string): string {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname;
    const filename = path.basename(pathname);
    return filename || "file";
  } catch {
    return "file";
  }
}
