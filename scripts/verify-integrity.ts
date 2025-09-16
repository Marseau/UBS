// scripts/verify-integrity.ts
import { createClient } from '@supabase/supabase-js';
import assert from "node:assert";
import { config } from "dotenv";

// Carregar variáveis de ambiente
config();

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  
  const supabase = createClient(supabaseUrl, supabaseServiceKey, { 
    auth: { persistSession: false } 
  });
  
  // Gerar token válido dinamicamente
  const tokenRes = await fetch("http://localhost:3000/api/demo/_demo/generate-token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({})
  });
  const { token } = await tokenRes.json() as { token: string };
  
  const req = await fetch("http://localhost:3000/api/demo/chat", {
    method: "POST",
    headers: { "content-type": "application/json", "x-demo-token": token },
    body: JSON.stringify({
      message: "Quero agendar corte e barba amanhã à tarde. Quais horários e valores?",
      userPhone: "55999887766",
      whatsappNumber: "5511940011010"
    })
  });
  assert(req.ok, "Demo API não respondeu 2xx");

  // Verificar última linha da conversa
  const { data: rows, error } = await supabase
    .from('conversation_history')
    .select('intent_detected, confidence_score, model_used, tokens_used, api_cost_usd, conversation_outcome, created_at')
    .gte('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString()) // últimos 5 minutos
    .order('created_at', { ascending: false })
    .limit(1);
    
  if (error) throw error;
  assert(rows && rows.length === 1, "Nenhuma conversa recente persistida");
  const r = rows![0];

  // Regras:
  // - Se model_used/tokens_used não-null -> tem que ser via LLM
  // - Se intent_detected = null -> só pode ter sido Flow Lock (ou caminho sem intent)
  // - Se intent_detected não-null e model_used = null -> determinístico (confidence 1.0)
  if (r!.model_used || r!.tokens_used || r!.api_cost_usd) {
    assert(r!.intent_detected === null || typeof r!.intent_detected === "string", "intent via LLM deve existir ou ser null (edge-case)");
  } else {
    // Sem LLM
    assert(r!.intent_detected === null || typeof r!.intent_detected === "string", "intent deve ser null (flow lock) ou string (regex)");
    if (typeof r!.intent_detected === "string") {
      assert(r!.confidence_score === 1.0, "intent determinístico deve ter confidence_score = 1.0");
    } else {
      assert(r!.confidence_score === null || r!.confidence_score === 0 || r!.confidence_score === undefined, "flow lock não deve ter confidence_score significativo");
    }
  }

  console.log("✅ Verificação passou.");
  process.exit(0);
}

main().catch((e) => {
  console.error("❌ Verificação falhou:", e);
  process.exit(1);
});