# MAX Channel Integration TODO

## Current Status
- ✅ MVP standalone bot working (`services/max-bridge/`)
- ✅ Core channel integration created (`extensions/max/`)
- ✅ Error handling and logging implemented
- ✅ Media handling structure created
- ✅ Account management added
- ✅ Setup wizard created
- ✅ Documentation written
- ⏳ Testing with real MAX bot needed

## Completed ✅

### 1. Plugin Structure
- ✅ `extensions/max/openclaw.plugin.json`
- ✅ `extensions/max/index.ts`
- ✅ `extensions/max/package.json`
- ✅ `extensions/max/api.ts`
- ✅ `extensions/max/runtime-api.ts`
- ✅ `extensions/max/setup-entry.ts`
- ✅ `extensions/max/README.md`
- ✅ `extensions/max/CHANGELOG.md`

### 2. Core Implementation
- ✅ `src/bot.ts` - MAX Bot wrapper
- ✅ `src/monitor.ts` - Message monitoring
- ✅ `src/send.ts` - Message sending
- ✅ `src/channel.ts` - Channel lifecycle
- ✅ `src/logger.ts` - Logging system
- ✅ `src/media.ts` - Media handling
- ✅ `src/accounts.ts` - Account management
- ✅ `src/setup.ts` - Setup wizard

### 3. Integration Points
- ✅ Register channel in plugin registry
- ✅ Implement OpenClaw channel interface
- ✅ Support session management
- ✅ Support allowlists/pairing
- ⏳ Support media attachments (structure done, upload pending)
- ❌ Support reactions (MAX API limitation)

### 4. Documentation
- ✅ Create `docs/channels/max.md`
- ⏳ Update `docs/channels/index.md` (file created, needs linking)
- ✅ Add setup instructions
- ✅ Add troubleshooting guide

## To Do ⏳

### 5. Testing
- ❌ Test with real MAX bot (PRIORITY)
- ❌ Unit tests for bot logic
- ❌ Integration tests
- ❌ E2E tests with real MAX API

### 6. OpenClaw Integration
- ❌ Register in main plugin loader
- ❌ Add to `openclaw setup` wizard
- ❌ Add to CLI commands
- ❌ Add to plugin registry

### 7. Additional Features
- ❌ Complete media upload implementation
- ❌ Support message editing (if MAX API supports)
- ❌ Support message deletion (if MAX API supports)
- ❌ Enhanced group chat support
- ❌ Multi-account support

### 8. Production Readiness
- ❌ Performance testing
- ❌ Load testing
- ❌ Security audit
- ❌ Error recovery testing
- ❌ Connection resilience

## Next Steps (Priority Order)

1. **TEST WITH REAL BOT** ⚠️
   - Get actual MAX bot token
   - Test basic send/receive
   - Verify allowlist works
   - Check session management

2. **Fix any bugs found** 🐛
   - Address test failures
   - Improve error handling as needed

3. **Complete media implementation** 📎
   - Implement media upload
   - Test image sending
   - Test file attachments

4. **Write tests** 🧪
   - Unit tests for core logic
   - Integration tests
   - E2E with mock bot

5. **Register plugin** 📦
   - Add to main OpenClaw plugin registry
   - Update CLI
   - Update setup wizard

6. **Submit PR** 🚀
   - Clean up code
   - Write PR description
   - Request review

## Known Issues

- Media upload returns "not implemented" error
- No typing indicators (MAX API limitation)
- Single bot per Gateway (multi-account planned)
- Group admin features not implemented

## References

- MAX Bot API: https://github.com/max-messenger/max-bot-api-client-ts
- Telegram channel: `extensions/telegram/` ✅
- Discord channel: `extensions/discord/`
- OpenClaw docs: https://docs.openclaw.ai

## Notes

- Current implementation: ~800 lines of TypeScript
- Dependencies: @max-messenger/max-bot-api
- Branch: `ilich/max-channel`
- Last updated: 2026-03-31

---

**Progress:** ~70% complete (core done, needs testing & integration)
