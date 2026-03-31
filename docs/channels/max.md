# MAX Channel

OpenClaw integration for [MAX](https://max.ru) messenger (iOS Shortcuts compatible).

## Status

🚧 **Beta** — Core functionality implemented, testing in progress.

## Features

- ✅ Send and receive messages
- ✅ Message threading (reply-to support)
- ✅ Allowlist security
- ✅ Session management  
- ✅ Full OpenClaw Gateway integration
- ⏳ Media attachments (partial)
- ❌ Group chat admin features (planned)
- ❌ Typing indicators (MAX API limitation)

## Quick Start

### 1. Get a MAX Bot Token

Contact MAX platform support or bot admin to create a bot and obtain a token.

### 2. Configure OpenClaw

**Option A: Environment Variable**

```bash
export MAX_BOT_TOKEN=your-token-here
openclaw gateway start
```

**Option B: Config File**

Edit `~/.openclaw/openclaw.json`:

```json
{
  "channels": {
    "max": {
      "token": "your-token-here",
      "allowFrom": ["user123", "user456"]
    }
  }
}
```

### 3. Start Gateway

```bash
openclaw gateway start
```

The MAX channel will automatically start if configured.

### 4. Test

1. Open MAX app
2. Find your bot
3. Send: `Hello!`
4. Bot should respond using your configured AI provider

## Configuration

### Full Config Schema

```json
{
  "channels": {
    "max": {
      "token": "string (required)",
      "allowFrom": ["array", "of", "user", "or", "chat", "ids"],
      "port": 3033
    }
  }
}
```

### Environment Variables

- `MAX_BOT_TOKEN` — Bot authentication token (required)
- `MAX_DEBUG` — Enable debug logging (optional)

### Security

#### Allowlist

Restrict which users/chats can interact with your bot:

```json
{
  "channels": {
    "max": {
      "allowFrom": [
        "user_abc123",
        "chat_xyz789"
      ]
    }
  }
}
```

If `allowFrom` is empty, all messages are accepted (not recommended for production).

## Architecture

```
MAX App (iOS/Android)
  ↓ Bot API
MAX Bot (@max-messenger/max-bot-api)
  ↓
extensions/max/ (OpenClaw Channel Plugin)
  ↓
OpenClaw Gateway
  ↓
AI Providers (Claude, GPT, Gemini, etc.)
```

### File Structure

```
extensions/max/
├── index.ts              # Plugin entry
├── openclaw.plugin.json  # Metadata
├── package.json
└── src/
    ├── bot.ts           # MAX Bot API wrapper
    ├── channel.ts       # Channel lifecycle
    ├── monitor.ts       # Inbound handling
    ├── send.ts          # Outbound sending
    ├── media.ts         # Media support
    ├── accounts.ts      # Account management
    ├── setup.ts         # Setup wizard
    ├── logger.ts        # Logging
    └── runtime.ts       # Runtime store
```

## Usage

### Sending Messages

```typescript
import { sendMaxMessage } from "./extensions/max/src/send.js";

await sendMaxMessage({
  to: "chat_12345",
  text: "Hello from OpenClaw!",
  cfg: config,
});
```

### Handling Inbound

The channel automatically routes incoming messages to the Gateway. Configure routing via OpenClaw's session and routing system.

## Troubleshooting

### Bot not responding

1. **Check token:**
   ```bash
   echo $MAX_BOT_TOKEN
   ```

2. **Check logs:**
   ```bash
   export MAX_DEBUG=1
   openclaw gateway start
   ```

3. **Verify allowlist:**
   - If using `allowFrom`, ensure your user ID is listed
   - Check logs for "Rejected message" warnings

### Connection errors

- Ensure bot token is valid and not expired
- Check network connectivity
- Verify MAX Bot API is accessible

### Media not working

Media support is partial in current version. Text messages work fully.

## Development

### Running Tests

```bash
pnpm test extensions/max
```

### Debug Mode

```bash
MAX_DEBUG=1 openclaw gateway start
```

### Contributing

See [extensions/max/TODO.md](../../extensions/max/TODO.md) for current tasks and roadmap.

## Comparison: MVP vs Full Integration

| Feature | MVP (services/max-bridge) | Full (extensions/max) |
|---------|--------------------------|----------------------|
| Integration | Standalone process | Part of Gateway |
| AI Providers | OpenAI only | All OpenClaw providers |
| Config | .env only | Config + CLI |
| Memory | Simple JSON | Full OpenClaw memory |
| Sessions | None | Full session management |
| Tools | None | All OpenClaw tools |
| Security | Basic | Allowlists, pairing, audit |

## Known Limitations

- **Media:** Download/upload partially implemented
- **Groups:** Basic support, no admin commands yet
- **Typing:** MAX API may not support typing indicators
- **Multi-account:** Only one bot per Gateway (for now)

## References

- [MAX Bot API](https://github.com/max-messenger/max-bot-api-client-ts)
- [OpenClaw Channels](./index.md)
- [Extension Development](../developers/channels.md)

## Support

- GitHub Issues: [openclaw/openclaw](https://github.com/openclaw/openclaw/issues)
- Discord: [OpenClaw Community](https://discord.gg/openclaw)
