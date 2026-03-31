/**
 * MAX message monitoring and routing to OpenClaw Gateway
 */
import type { OpenClawConfig } from "openclaw/plugin-sdk/core";
import { getMaxRuntime } from "./runtime.js";
import type { MaxInboundMessage } from "./bot.js";
import { logger } from "./logger.js";

export async function monitorMaxProvider(params: {
  cfg: OpenClawConfig;
  onMessage: (msg: MaxInboundMessage) => Promise<void>;
}) {
  const runtime = getMaxRuntime();
  
  // Monitor function is called by bot.ts when messages arrive
  // This is just a registry function
  if (runtime.channel?.max) {
    runtime.channel.max.messageHandler = params.onMessage;
  }
}

export async function handleMaxInbound(params: {
  msg: MaxInboundMessage;
  cfg: OpenClawConfig;
}) {
  try {
    const runtime = getMaxRuntime();
    
    logger.debug(`Processing inbound from user ${params.msg.userId}, chat ${params.msg.chatId}`);
    
    // Check allowlist
    const allowFrom = params.cfg.channels?.max?.allowFrom ?? [];
    if (allowFrom.length > 0) {
      const allowed = allowFrom.some(
        (pattern) => 
          params.msg.userId === pattern || 
          params.msg.chatId === pattern
      );
      
      if (!allowed) {
        logger.warn(
          `Rejected message from user ${params.msg.userId} in chat ${params.msg.chatId} (not in allowlist: ${allowFrom.join(", ")})`
        );
        return;
      }
      logger.debug(`Allowlist check passed for ${params.msg.userId}`);
    }

    // Build session key
    const sessionKey = `max:${params.msg.chatId}`;

    // Dispatch to Gateway
    if (!runtime.gateway?.inbound) {
      logger.error("Gateway inbound handler not available - message will be dropped");
      return;
    }

    logger.debug(`Dispatching to Gateway with session key: ${sessionKey}`);
    
    await runtime.gateway.inbound({
      channelId: "max",
      conversationId: params.msg.chatId,
      senderId: params.msg.userId,
      senderLabel: `User ${params.msg.userId}`,
      text: params.msg.text,
      timestamp: params.msg.timestamp,
      sessionKey,
      replyToId: params.msg.mid,
      attachments: params.msg.attachments?.map((a) => ({
        type: a.type,
        url: a.url,
      })),
    });
    
    logger.success(`Message dispatched to Gateway successfully`);
  } catch (err) {
    logger.error("Failed to handle inbound message:", err);
    logger.error("Message details:", {
      userId: params.msg.userId,
      chatId: params.msg.chatId,
      text: params.msg.text.slice(0, 100),
    });
    // Don't throw - we want to continue processing other messages
  }
}
