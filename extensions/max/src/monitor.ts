/**
 * MAX message monitoring and routing to OpenClaw Gateway
 */
import type { OpenClawConfig } from "openclaw/plugin-sdk/core";
import type { MaxInboundMessage } from "./bot.js";
import { enforceMaxDmAccess } from "./dm-access.js";
import { logger } from "./logger.js";
import { getMaxRuntime } from "./runtime.js";

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

export async function handleMaxInbound(params: { msg: MaxInboundMessage; cfg: OpenClawConfig }) {
  try {
    const runtime = getMaxRuntime();

    logger.debug(`Processing inbound from user ${params.msg.userId}, chat ${params.msg.chatId}`);

    // Get DM policy and allowlist
    const maxConfig = params.cfg.channels?.max;
    const dmPolicy = maxConfig?.dmPolicy ?? "pairing";
    const allowFrom = maxConfig?.allowFrom ?? [];
    const accountId = maxConfig?.accountId ?? "default";

    // Check if it's a group chat (basic heuristic)
    const isGroup = params.msg.chatType !== "dialog";

    // Enforce DM access control with pairing
    const bot = runtime.channel?.max?.bot;
    if (!bot) {
      logger.error("MAX bot not available for DM access check");
      return;
    }

    const accessGranted = await enforceMaxDmAccess({
      isGroup,
      dmPolicy,
      sender: {
        userId: params.msg.userId,
        userName: params.msg.userName || "Unknown",
        chatId: params.msg.chatId,
      },
      effectiveDmAllow: allowFrom,
      accountId,
      bot,
      chatId: params.msg.chatId,
      logger: {
        info: (obj, msg) => logger.info(msg, obj),
        warn: (msg) => logger.warn(msg),
      },
    });

    if (!accessGranted) {
      logger.warn(
        `Access denied for user ${params.msg.userId} in chat ${params.msg.chatId} (dmPolicy=${dmPolicy})`,
      );
      return;
    }

    logger.debug(`Access granted for ${params.msg.userId}`);

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
