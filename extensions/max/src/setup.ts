/**
 * MAX channel setup wizard
 */
import type { OpenClawConfig } from "openclaw/plugin-sdk/core";
import { logger } from "./logger.js";
import { validateMaxToken } from "./accounts.js";

export interface MaxSetupParams {
  token?: string;
  allowFrom?: string[];
  port?: number;
}

export async function setupMaxChannel(params: MaxSetupParams = {}): Promise<Partial<OpenClawConfig>> {
  logger.info("Setting up MAX channel...");

  const token = params.token || process.env.MAX_BOT_TOKEN;
  
  if (!token) {
    logger.error("MAX_BOT_TOKEN is required but not provided");
    throw new Error(
      "MAX_BOT_TOKEN is required. Set it in environment or provide via setup params."
    );
  }

  if (!validateMaxToken(token)) {
    logger.warn("MAX token validation failed - token might be invalid");
  }

  const config: Partial<OpenClawConfig> = {
    channels: {
      max: {
        token,
        allowFrom: params.allowFrom || [],
        port: params.port || 3033,
      },
    },
  };

  logger.success("MAX channel configured successfully");
  logger.info("Configuration:", {
    hasToken: !!token,
    allowFrom: config.channels?.max?.allowFrom,
    port: config.channels?.max?.port,
  });

  return config;
}

export function getMaxSetupInstructions(): string {
  return `
📱 MAX Channel Setup Instructions

1. Get a MAX Bot Token:
   - Contact MAX Bot Admin or platform to create a bot
   - You'll receive a bot token (keep it secret!)

2. Configure OpenClaw:
   
   Option A: Environment Variable
   \`\`\`bash
   export MAX_BOT_TOKEN=your-token-here
   openclaw gateway start
   \`\`\`

   Option B: Config File (openclaw.json)
   \`\`\`json
   {
     "channels": {
       "max": {
         "token": "your-token-here",
         "allowFrom": ["user123", "user456"],
         "port": 3033
       }
     }
   }
   \`\`\`

3. Start Gateway:
   \`\`\`bash
   openclaw gateway start
   \`\`\`

4. Test:
   - Open MAX app
   - Find your bot
   - Send a message!

For more help: https://docs.openclaw.ai/channels/max
`.trim();
}
