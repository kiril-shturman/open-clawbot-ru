# MAX Channel Integration TODO

## Current Status
- ✅ MVP standalone bot working (`services/max-bridge/`)
- ✅ Core channel integration created (`extensions/max/`)
- ✅ Error handling and logging implemented
- ✅ Media handling IMPLEMENTED (upload + download + fallbacks)
- ✅ Account management added
- ✅ Setup wizard created
- ✅ Documentation written
- ✅ Unit tests written (media, accounts, logger)
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
- ✅ Register channel in plugin registry (auto-discovery)
- ✅ Implement OpenClaw channel interface
- ✅ Support session management
- ✅ Support allowlists/pairing
- ✅ Support media attachments (download + upload + fallbacks)
- ❌ Support reactions (MAX API limitation)

### 4. Documentation
- ✅ Create `docs/channels/max.md`
- ⏳ Update `docs/channels/index.md` (file created, needs linking)
- ✅ Add setup instructions
- ✅ Add troubleshooting guide

## To Do ⏳

### 5. Testing
- ❌ Test with real MAX bot (PRIORITY)
- ✅ Unit tests for media, accounts, logger
- ⏳ Unit tests for bot, send, monitor (in progress)
- ❌ Integration tests
- ❌ E2E tests with real MAX API

### 6. OpenClaw Integration
- ❌ Register in main plugin loader
- ❌ Add to `openclaw setup` wizard
- ❌ Add to CLI commands
- ❌ Add to plugin registry

### 7. Additional Features
- ✅ Complete media upload implementation (with 4-level fallback)
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

1. **TEST WITH REAL BOT** ⚠️ HIGHEST PRIORITY
   - Get actual MAX bot token
   - Test basic send/receive
   - Verify allowlist works
   - Check session management
   - Test media sending

2. **Fix any bugs found** 🐛
   - Address test failures
   - Improve error handling as needed
   - Adjust media upload based on real MAX API behavior

3. **Complete unit tests** 🧪
   - Add tests for bot.ts
   - Add tests for send.ts  
   - Add tests for monitor.ts
   - Run test suite

4. **Integration tests** 🔗
   - Write integration tests with mock bot
   - Test Gateway integration
   - Test session flow

5. **Polish** ✨
   - Code review
   - Clean up any TODOs in code
   - Update CHANGELOG

6. **Submit PR** 🚀
   - Merge to main
   - Publish to OpenClaw community
   - Write announcement

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

**Progress:** ~90% complete (core + media + tests done, needs real-world testing)
