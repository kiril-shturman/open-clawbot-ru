# MAX Channel Integration TODO

## Current Status
- ✅ MVP standalone bot working (`services/max-bridge/`)
- ❌ Not integrated into OpenClaw Gateway

## To create full integration:

### 1. Plugin Structure
- [ ] Create `extensions/max/openclaw.plugin.json`
- [ ] Create `extensions/max/index.ts` (plugin entry point)
- [ ] Create `extensions/max/package.json`
- [ ] Create `extensions/max/api.ts` (channel API)
- [ ] Create `extensions/max/runtime-api.ts`

### 2. Core Implementation
- [ ] `src/bot.ts` - MAX Bot wrapper using @max-messenger/max-bot-api
- [ ] `src/monitor.ts` - Message monitoring and routing
- [ ] `src/send.ts` - Message sending
- [ ] `src/channel.ts` - Channel lifecycle management
- [ ] `src/config-schema.ts` - Configuration schema

### 3. Integration Points
- [ ] Register channel in plugin registry
- [ ] Implement OpenClaw channel interface
- [ ] Support session management
- [ ] Support allowlists/pairing
- [ ] Support media attachments
- [ ] Support reactions (if MAX supports)

### 4. Configuration
- [ ] Add `channels.max` config schema
- [ ] Support `MAX_BOT_TOKEN` env var
- [ ] Add to `openclaw setup` wizard
- [ ] Add to CLI commands

### 5. Documentation
- [ ] Create `docs/channels/max.md`
- [ ] Update `docs/channels/index.md`
- [ ] Add setup instructions
- [ ] Add troubleshooting guide

### 6. Testing
- [ ] Unit tests for bot logic
- [ ] Integration tests
- [ ] E2E tests with real MAX API

## References
Look at existing implementations:
- `extensions/telegram/` - Simple bot API channel
- `extensions/discord/` - Complex channel with gateway
- `extensions/whatsapp/` - QR pairing example
