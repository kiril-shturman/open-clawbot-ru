import type { Bot } from "@max-messenger/max-bot-api";
/**
 * MAX DM access control with pairing support
 */
import type { DmPolicy } from "openclaw/plugin-sdk/config-runtime";
import { issuePairingChallenge } from "openclaw/plugin-sdk/conversation-runtime";
import { upsertChannelPairingRequest } from "openclaw/plugin-sdk/conversation-runtime";
import { logVerbose } from "openclaw/plugin-sdk/runtime-env";
import { logger } from "./logger.js";

type MaxSenderIdentity = {
  userId: string;
  userName: string;
  chatId: string;
};

type MaxDmAccessLogger = {
  info: (obj: Record<string, unknown>, msg: string) => void;
  warn: (msg: string) => void;
};

export async function enforceMaxDmAccess(params: {
  isGroup: boolean;
  dmPolicy: DmPolicy;
  sender: MaxSenderIdentity;
  effectiveDmAllow: string[];
  accountId: string;
  bot: Bot;
  chatId: string;
  logger: MaxDmAccessLogger;
}): Promise<boolean> {
  const { isGroup, dmPolicy, sender, effectiveDmAllow, accountId, bot, chatId } = params;

  // Groups are always allowed
  if (isGroup) {
    return true;
  }

  // Check DM policy
  if (dmPolicy === "disabled") {
    return false;
  }

  if (dmPolicy === "open") {
    return true;
  }

  // Check allowlist
  const hasWildcard = effectiveDmAllow.includes("*");
  const allowed =
    hasWildcard ||
    effectiveDmAllow.includes(sender.userId) ||
    effectiveDmAllow.includes(sender.chatId);

  if (allowed) {
    logger.info(
      {
        userId: sender.userId,
        chatId: sender.chatId,
        userName: sender.userName,
      },
      "MAX DM access granted (allowlist match)",
    );
    return true;
  }

  // Pairing required
  if (dmPolicy === "pairing") {
    try {
      await issuePairingChallenge({
        channel: "max",
        senderId: sender.userId,
        senderIdLine: `Your MAX user ID: ${sender.userId}`,
        meta: {
          userName: sender.userName,
          chatId: sender.chatId,
        },
        upsertPairingRequest: async ({ id, meta }) =>
          await upsertChannelPairingRequest({
            channel: "max",
            id,
            accountId,
            meta,
          }),
        onCreated: () => {
          logger.info(
            {
              userId: sender.userId,
              chatId: sender.chatId,
              userName: sender.userName,
            },
            "MAX pairing request created",
          );
        },
        sendPairingReply: async (text) => {
          try {
            // Send pairing code to user
            await bot.api.sendMessage({
              chat_id: chatId,
              text,
            });
            logger.info({ chatId }, "Pairing code sent to MAX user");
          } catch (err) {
            logger.warn(`Failed to send pairing code to MAX chat ${chatId}: ${String(err)}`);
            throw err;
          }
        },
        onReplyError: (err) => {
          logVerbose(`MAX pairing reply failed for chat ${chatId}: ${String(err)}`);
        },
      });
    } catch (err) {
      logVerbose(`MAX pairing reply failed for chat ${chatId}: ${String(err)}`);
    }
    return false;
  }

  logVerbose(
    `Blocked unauthorized MAX sender ${sender.userId} (dmPolicy=${dmPolicy}, chatId=${sender.chatId})`,
  );
  return false;
}
