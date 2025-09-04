// src/routes/demo-apis.ts
import { Router, Request, Response } from "express";
import fetch from "node-fetch"; // Node >=18? pode usar globalThis.fetch
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

// ===== tokens da demo (bypass)
import { generateDemoToken, demoTokenValidator } from "../utils/demo-token-validator";

const router = Router();

/* =========================
   SUPABASE ADMIN
========================= */
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/* =========================
   HELPERS
========================= */
const cleanPhone = (s: string) => String(s || "").replace(/\D/g, "");
const normalizeE164 = (phone: string) => {
  const cleaned = cleanPhone(phone);
  return cleaned.startsWith("55") ? cleaned : `55${cleaned}`;
};

/* =========================
   HEALTHCHECK
========================= */
router.get("/_demo/health", (_req, res) => {
  res.json({
    ok: true,
    route: "demo-apis.ts",
    build: process.env.BUILD_ID || "dev",
  });
});

/* =========================
   CHECK BUSINESS
========================= */
router.get("/check-business", async (req: Request, res: Response) => {
  try {
    const raw = (req.query.whatsapp as string) || "";
    const digits = cleanPhone(raw);

    const { data: tenant } = await supabase
      .from("tenants")
      .select("id, business_name, domain, email, phone")
      .eq("phone", digits)
      .maybeSingle();

    if (tenant) {
      return res.json({ success: true, exists: true, business: tenant });
    }
    return res.json({ success: true, exists: false });
  } catch (e) {
    console.error("check-business error:", e);
    return res.json({ success: true, exists: false });
  }
});

/* =========================
   CREATE DEMO TENANT
========================= */
router.post("/create", async (req: Request, res: Response) => {
  try {
    const phoneRaw = req.body.whatsapp ?? req.body.whatsappNumber;
    if (!phoneRaw) return res.status(400).json({ success: false, error: "Phone required" });

    const phoneE164 = normalizeE164(phoneRaw);

    // tenta reusar
    const { data: existing } = await supabase
      .from("tenants")
      .select("id")
      .eq("phone", phoneE164)
      .maybeSingle();

    if (existing) {
      return res.json({
        success: true,
        tenant_id: existing.id,
        isReused: true,
        demo_token: await generateDemoToken("demo_ui", existing.id),
        whatsappNumber: phoneE164,
      });
    }

    // cria novo tenant mínimo
    const tenantId = crypto.randomUUID();
    const businessName = req.body.businessName || "Demo Business";
    const businessEmail = req.body.businessEmail || "demo@example.com";
    const domain = req.body.domain || "healthcare";
    const nowIso = new Date().toISOString();

    await supabase.from("tenants").insert({
      id: tenantId,
      business_name: businessName,
      email: businessEmail,
      domain,
      phone: phoneE164,
      account_type: "test",
      status: "active",
      created_at: nowIso,
      updated_at: nowIso,
    });

    return res.json({
      success: true,
      tenant_id: tenantId,
      isReused: false,
      demo_token: await generateDemoToken("demo_ui", tenantId),
      whatsappNumber: phoneE164,
    });
  } catch (err) {
    console.error("create error:", err);
    return res.status(500).json({ success: false, error: "Internal error" });
  }
});

/* =========================
   CHECK USER
========================= */
router.get("/check-user", async (req: Request, res: Response) => {
  try {
    const userPhone = req.query.userPhone as string;
    const tenantId = req.query.tenantId as string;
    
    if (!userPhone || !tenantId) {
      return res.status(400).json({ success: false, error: "userPhone and tenantId required" });
    }

    const cleanedPhone = cleanPhone(userPhone);
    
    // Verificar se usuário existe na tabela users
    const { data: user } = await supabase
      .from("users")
      .select("id")
      .eq("phone_number", cleanedPhone)
      .eq("tenant_id", tenantId)
      .maybeSingle();
      
    return res.json({ 
      success: true, 
      exists: !!user 
    });
  } catch (e) {
    console.error("check-user error:", e);
    return res.json({ success: true, exists: false });
  }
});

/* =========================
   CHAT — só mensagem + userPhone + whatsappNumber
========================= */
router.post("/chat", async (req: Request, res: Response) => {
  try {
    // valida token
    const auth = req.headers.authorization || "";
    const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    const xDemo = (req.headers["x-demo-token"] as string) || "";
    const inboundToken = bearer || xDemo;

    if (!demoTokenValidator.validateToken(inboundToken)) {
      return res.status(401).json({ error: "Invalid demo token" });
    }

    const { message, text, userPhone, whatsappNumber } = req.body || {};
    const msg = message ?? text;
    if (!msg || !userPhone || !whatsappNumber) {
      return res.status(400).json({
        error: "Missing fields: precisa de message/text, userPhone e whatsappNumber",
      });
    }

    const userDigits = cleanPhone(userPhone);
    const tenantDigits = cleanPhone(whatsappNumber);

    const { WebhookFlowOrchestratorService } = await import(
      "../services/webhook-flow-orchestrator.service"
    );
    const orchestrator = new WebhookFlowOrchestratorService();

    const out = await orchestrator.orchestrateWebhookFlow(
      String(msg),
      userDigits,       // número do usuário (from)
      tenantDigits,     // número do negócio (to)
      { domain: "demo" },
      {
        session_id: `demo_${userDigits}_${tenantDigits}`,
        demoMode: { source: "demo_ui", tenantPhone: tenantDigits },
      }
    );

    return res.json({
      success: true,
      aiResponse: out.aiResponse,
      telemetry: out.telemetryData ?? {},
    });
  } catch (err) {
    console.error("demo/chat error:", err);
    return res.status(500).json({ success: false, error: "Internal error" });
  }
});

export default router;