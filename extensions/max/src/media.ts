/**
 * MAX media handling (images, files, etc.)
 */
import { logger } from "./logger.js";

export interface MediaAttachment {
  type: "image" | "file" | "video" | "audio";
  url?: string;
  localPath?: string;
  filename?: string;
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

export async function uploadMedia(params: {
  buffer: Buffer;
  filename?: string;
  type: string;
}): Promise<string> {
  // TODO: Implement media upload to MAX servers or CDN
  // For now, this is a placeholder
  logger.warn("Media upload not yet implemented");
  throw new Error("MAX media upload not implemented yet");
}

export function getMediaType(url: string | undefined): MediaAttachment["type"] | null {
  if (!url) return null;
  
  const lower = url.toLowerCase();
  if (lower.match(/\.(jpg|jpeg|png|gif|webp)$/)) return "image";
  if (lower.match(/\.(mp4|mov|avi|webm)$/)) return "video";
  if (lower.match(/\.(mp3|wav|ogg|m4a)$/)) return "audio";
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
