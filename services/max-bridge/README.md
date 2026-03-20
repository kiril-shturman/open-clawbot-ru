# max-bridge

Minimal MAX bot that replies using an OpenAI-compatible LLM.

## Setup

```bash
cd services/max-bridge
cp .env.example .env
# fill MAX_BOT_TOKEN and OPENAI_API_KEY
pnpm install
pnpm start
```

## Notes

- This is an MVP bridge, not a full OpenClaw channel plugin.
- Stores lightweight per-chat memory in `STATE_DIR`.
