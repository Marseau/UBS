import OpenAI from "openai";

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error("Defina OPENAI_API_KEY no ambiente.");
  process.exit(1);
}
const client = new OpenAI({ apiKey });

const MODELS = [
  "gpt-4o-mini",
  "gpt-4o",
  "gpt-4.1-mini",
  "gpt-4.1",
  "o4-mini",
  "gpt-3.5-turbo" // legado; útil p/ checar acesso
];

async function testModel(model) {
  try {
    const r = await client.responses.create({
      model,
      input: [{ role: "user", content: "ping" }],
      max_output_tokens: 5,
      temperature: 0
    });
    const text = r.output_text ?? "";
    return { model, ok: true, note: text.slice(0, 60).replace(/\s+/g, " ") };
  } catch (err) {
    // normalizar mensagem
    const e = err?.error ?? err;
    const msg = (e?.message || String(e)).slice(0, 200);
    // alguns códigos comuns: 404 (modelo não existe), 403 (sem acesso), 429 (rate limit)
    const code = e?.status || e?.code || e?.statusCode || "ERR";
    return { model, ok: false, code, error: msg };
  }
}

(async () => {
  console.log("Testando modelos com a sua API key…\n");
  const results = [];
  for (const m of MODELS) {
    const r = await testModel(m);
    results.push(r);
    if (r.ok) console.log(`✅ ${m} → OK`);
    else console.log(`❌ ${m} → ${r.code}: ${r.error}`);
  }

  console.log("\nResumo:");
  const ok = results.filter(r => r.ok).map(r => r.model);
  const fail = results.filter(r => !r.ok).map(r => `${r.model} (${r.code})`);
  console.log("Habilitados :", ok.length ? ok.join(", ") : "nenhum");
  console.log("Falharam   :", fail.length ? fail.join(", ") : "—");
})();
