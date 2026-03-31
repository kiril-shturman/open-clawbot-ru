import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Bot } from "@max-messenger/max-bot-api";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TOKEN = process.env.MAX_BOT_TOKEN;
if (!TOKEN) {
  console.error("MAX_BOT_TOKEN is required");
  process.exit(1);
}

const STATE_DIR = process.env.STATE_DIR || path.join(__dirname, "..", "state");
fs.mkdirSync(STATE_DIR, { recursive: true });

const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT || "You are a helpful assistant.";

async function llmReply({ chatId, _userId, text }) {
  // Minimal OpenAI chat completion via fetch (no extra deps)
  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  if (!apiKey) {
    return "OPENAI_API_KEY is not configured.";
  }

  // Simple per-chat memory (last 20 msgs)
  const statePath = path.join(STATE_DIR, `${chatId}.json`);
  let history = [];
  try {
    history = JSON.parse(fs.readFileSync(statePath, "utf8"));
    if (!Array.isArray(history)) {
      history = [];
    }
  } catch {}

  history.push({ role: "user", content: text });
  history = history.slice(-20);

  const body = {
    model,
    messages: [{ role: "system", content: SYSTEM_PROMPT }, ...history],
  };

  const r = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!r.ok) {
    const t = await r.text().catch(() => "");
    return `LLM error: ${r.status} ${t}`.slice(0, 1500);
  }
  const j = await r.json();
  const reply = j.choices?.[0]?.message?.content?.trim() || "…";

  history.push({ role: "assistant", content: reply });
  fs.writeFileSync(statePath, JSON.stringify(history, null, 2));
  return reply;
}

const bot = new Bot(TOKEN);

bot.on("message_created", async (ctx) => {
  console.log("📨 Message received:", JSON.stringify(ctx.message, null, 2));
  try {
    const msg = ctx.message?.body;
    const text = msg?.text || msg?.caption || "";
    console.log("📝 Text extracted:", text);

    if (!text.trim()) {
      console.log("⚠️  Empty text, skipping");
      return;
    }

    const chatId = msg.chat_id;
    const userId = msg.user_id;
    console.log(`💬 Processing message from user ${userId} in chat ${chatId}`);

    const replyText = await llmReply({ chatId, userId, text });
    console.log("🤖 LLM reply:", replyText.slice(0, 100) + "...");

    await ctx.reply(replyText, {
      // reply threading if supported
      link: msg.mid ? { type: "reply", mid: msg.mid } : undefined,
    });
    console.log("✅ Reply sent");
  } catch (e) {
    console.error("❌ Handler error:", e);
  }
});

// Add error handler
bot.on("error", (err) => {
  console.error("❌ Bot error:", err);
});

console.log("🚀 MAX bridge starting…");
console.log("🔑 Token:", TOKEN.slice(0, 20) + "...");
await bot.start();
console.log("✅ Bot started and listening for messages");
