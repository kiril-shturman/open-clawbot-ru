/**
 * Max channel API for configuration
 */
export interface MaxChannelConfig {
  port?: number;
  apiKey?: string;
  allowFrom?: string[];
}

export function getMaxConfig(): MaxChannelConfig {
  return {
    port: 3033,
    apiKey: process.env.MAX_API_KEY,
    allowFrom: [],
  };
}
