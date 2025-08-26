// src/routes/demo-apis.ts
import express from "express";
import crypto from "crypto";
import { handleIncomingMessage } from "../services/message-handler"; // handler centralizado

const router = express.Router();
const DEMO_SECRET = process.env.DEMO_MODE_TOKEN || "fixed-secret-for-load-test-2025";

// 🔒 Validação do token Demo
function verifyDemoToken(token: string | undefined): boolean {
  if (!token) return false;

  try {
    const [dataB64, sig] = token.split(".");
    if (typeof dataB64 !== "string" || typeof sig !== "string") {
      return false;
    }
    const expected = crypto
      .createHmac("sha256", DEMO_SECRET)
      .update(dataB64)
      .digest("base64url");

    return sig === expected;
  } catch {
    return false;
  }
}

// 📌 Endpoint Demo — apenas porta de entrada
router.post("/demo/chat", async (req, res) => {
  try {
    const token = req.headers["x-demo-token"] as string;
    if (!verifyDemoToken(token)) {
      return res.status(401).send("Invalid demo token");
    }

    const { tenantId, userPhone, text } = req.body;
    if (!tenantId || !userPhone || !text) {
      return res.status(400).send("Missing tenantId, userPhone or text");
    }

    // 👉 Encaminha para o mesmo handler da rota WhatsApp
    const result = await handleIncomingMessage({
      tenantId,
      userPhone,
      text,
      source: "demo",
    });

    return res.json(result);
  } catch (err: any) {
    console.error("❌ Erro na rota demo:", err);
    return res.status(500).send("Internal Server Error");
  }
});

export default router;