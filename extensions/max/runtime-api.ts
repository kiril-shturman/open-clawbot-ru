/**
 * Max channel runtime API types and utilities
 */

export interface MaxInboundMessage {
  deviceId: string;
  userId?: string;
  text: string;
  timestamp: number;
  conversationId?: string;
  attachments?: Array<{
    type: "image" | "file" | "audio";
    url?: string;
    data?: string; // base64
    filename?: string;
  }>;
}

export interface MaxOutboundMessage {
  text: string;
  conversationId?: string;
  media?: {
    url?: string;
    type?: "image" | "file" | "audio";
  };
}

export interface MaxConfig {
  port?: number;
  apiKey?: string;
  allowFrom?: string[];
}

export function parseMaxRequest(body: unknown): MaxInboundMessage | null {
  if (!body || typeof body !== "object") return null;
  
  const req = body as Record<string, unknown>;
  if (typeof req.deviceId !== "string" || typeof req.text !== "string") {
    return null;
  }

  return {
    deviceId: req.deviceId,
    userId: typeof req.userId === "string" ? req.userId : undefined,
    text: req.text,
    timestamp: typeof req.timestamp === "number" ? req.timestamp : Date.now(),
    conversationId: typeof req.conversationId === "string" ? req.conversationId : undefined,
    attachments: Array.isArray(req.attachments) ? req.attachments : undefined,
  };
}

export function buildMaxResponse(message: MaxOutboundMessage) {
  return {
    success: true,
    message: message.text,
    conversationId: message.conversationId,
    media: message.media,
  };
}
