# MAX Channel for OpenClaw

Full OpenClaw channel integration for MAX messenger (iOS Shortcuts).

## Status

✅ **Beta (70% complete)** — Core implementation done, needs real-world testing.

## Features

- ✅ Send/receive messages
- ✅ Message threading (replies)
- ✅ Allowlist security
- ✅ Session management
- ✅ Comprehensive error handling
- ✅ Debug logging
- ⏳ Media attachments (download ready, upload pending)
- ⏳ Group chat support (basic)

## Configuration

Add to your `openclaw.json`:

```json
{
  "channels": {
    "max": {
      "token": "your-max-bot-token",
      "allowFrom": ["user123", "user456"]
    }
  }
}
```

Or use environment variables:

```bash
MAX_BOT_TOKEN=your-token-here
```

## Setup

1. Get a MAX bot token from MAX Bot Admin
2. Add token to `openclaw.json` or `.env`
3. Start OpenClaw Gateway
4. MAX channel will auto-start if configured

## Architecture

```
extensions/max/
├── index.ts              # Plugin entry point
├── openclaw.plugin.json  # Plugin metadata
├── package.json          # Dependencies
├── api.ts                # Config API
├── runtime-api.ts        # Runtime types
└── src/
    ├── bot.ts           # MAX Bot API wrapper
    ├── channel.ts       # Channel lifecycle
    ├── monitor.ts       # Inbound message handling
    ├── send.ts          # Outbound message sending
    └── runtime.ts       # Runtime store
```

## Differences from MVP

| Aspect | MVP (services/max-bridge) | Full Integration (extensions/max) |
|--------|---------------------------|-----------------------------------|
| Integration | ❌ Standalone process | ✅ Part of OpenClaw Gateway |
| AI Providers | ❌ OpenAI only | ✅ All OpenClaw providers |
| Configuration | ❌ .env only | ✅ openclaw config + CLI |
| Memory | ❌ Simple JSON | ✅ Full OpenClaw memory |
| Sessions | ❌ None | ✅ Session management |
| Tools | ❌ None | ✅ Tool calling support |
| Security | ❌ Basic | ✅ Allowlists, pairing, audit |

## Testing

```bash
# Run tests (when available)
pnpm test extensions/max

# Test with real MAX account
export MAX_BOT_TOKEN=your-token
openclaw gateway start
```

## Documentation

- [MAX Bot API Docs](https://github.com/max-messenger/max-bot-api-client-ts)
- [OpenClaw Channel Development](https://docs.openclaw.ai/developers/channels)

## TODOs

See [TODO.md](./TODO.md) for full task list.

## References

This implementation is based on:
- `extensions/telegram/` - Bot API pattern
- `extensions/discord/` - Event handling pattern
- MVP at `services/max-bridge/` - Original bot logic
