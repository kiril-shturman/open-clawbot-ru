import "dotenv/config";

async function testLLM() {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  
  if (!apiKey) {
    console.error("❌ OPENAI_API_KEY not set");
    return;
  }
  
  console.log("🧪 Testing LLM connection...");
  console.log(`Model: ${model}`);
  console.log(`Base URL: ${baseUrl}\n`);
  
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Say hello in Russian" }
      ]
    })
  });
  
  if (!response.ok) {
    console.error(`❌ Error: ${response.status}`);
    console.error(await response.text());
    return;
  }
  
  const data = await response.json();
  const reply = data.choices?.[0]?.message?.content;
  
  console.log("✅ LLM Response:", reply);
}

testLLM().catch(console.error);
