/**
 * MAX message monitoring and routing to OpenClaw Gateway
 */
import type { OpenClawConfig } from "openclaw/plugin-sdk/core";
import { getMaxRuntime } from "./runtime.js";
import type { MaxInboundMessage } from "./bot.js";

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
  const runtime = getMaxRuntime();
  
  // Check allowlist
  const allowFrom = params.cfg.channels?.max?.allowFrom ?? [];
  if (allowFrom.length > 0) {
    const allowed = allowFrom.some(
      (pattern) => 
        params.msg.userId === pattern || 
        params.msg.chatId === pattern
    );
    if (!allowed) {
      console.warn(`[MAX] Rejected message from ${params.msg.userId} (not in allowlist)`);
      return;
    }
  }

  // Build session key
  const sessionKey = `max:${params.msg.chatId}`;

  // Dispatch to Gateway
  if (runtime.gateway?.inbound) {
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
  }
}
