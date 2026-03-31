# MAX Channel Integration TODO

## Current Status
- ✅ MVP standalone bot working (`services/max-bridge/`)
- ✅ Core channel integration created (`extensions/max/`)
- ⏳ Testing and refinement needed

## Completed

### 1. Plugin Structure
- ✅ Create `extensions/max/openclaw.plugin.json`
- ✅ Create `extensions/max/index.ts` (plugin entry point)
- ✅ Create `extensions/max/package.json`
- ✅ Create `extensions/max/api.ts` (channel API)
- ✅ Create `extensions/max/runtime-api.ts`

### 2. Core Implementation
- ✅ `src/bot.ts` - MAX Bot wrapper using @max-messenger/max-bot-api
- ✅ `src/monitor.ts` - Message monitoring and routing
- ✅ `src/send.ts` - Message sending
- ✅ `src/channel.ts` - Channel lifecycle management
- ⏳ `src/config-schema.ts` - Configuration schema (using openclaw.plugin.json)

### 3. Integration Points
- ✅ Register channel in plugin registry (via index.ts)
- ✅ Implement OpenClaw channel interface
- ⏳ Support session management (basic done, needs testing)
- ⏳ Support allowlists/pairing (implemented, needs testing)
- ⏳ Support media attachments (basic structure, needs implementation)
- ❌ Support reactions (MAX API may not support)

## To Do

### 4. Configuration
- ⏳ Add `channels.max.token` config support (basic done)
- ✅ Support `MAX_BOT_TOKEN` env var
- ❌ Add to `openclaw setup` wizard
- ❌ Add to CLI commands

### 5. Documentation
- ❌ Create `docs/channels/max.md`
- ❌ Update `docs/channels/index.md`
- ❌ Add setup instructions
- ❌ Add troubleshooting guide

### 6. Testing
- ❌ Unit tests for bot logic
- ❌ Integration tests
- ❌ E2E tests with real MAX API

### 7. Additional Features
- ❌ Support typing indicators (if MAX API supports)
- ❌ Support message editing (if MAX API supports)
- ❌ Support message deletion (if MAX API supports)
- ❌ Support group chats properly
- ❌ Support media download/upload
- ❌ Add account management (multiple bots)

## Next Steps
1. Test basic message flow (send/receive)
2. Add comprehensive error handling
3. Add logging/debugging utilities
4. Create documentation
5. Write tests
6. Submit PR to main OpenClaw repo

## References
Look at existing implementations:
- `extensions/telegram/` - Simple bot API channel ✅
- `extensions/discord/` - Complex channel with gateway
- `extensions/whatsapp/` - QR pairing example

## Notes
- MAX Bot API GitHub: https://github.com/max-messenger/max-bot-api-client-ts
- Using official @max-messenger/max-bot-api SDK
- Current implementation is minimal but functional
- Needs real-world testing with actual MAX accounts
