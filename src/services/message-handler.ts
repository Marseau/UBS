// src/services/message-handler.ts
import { WebhookFlowOrchestratorService } from "./webhook-flow-orchestrator.service";

const orchestrator = new WebhookFlowOrchestratorService();

interface MessageInput {
  tenantId: string;
  userPhone: string;
  text: string;
  source: "whatsapp" | "demo";
}

export async function handleIncomingMessage({ tenantId, userPhone, text, source }: MessageInput) {
  // 🔄 Usa o mesmo orchestrator que já roda no webhook v3
  const result = await orchestrator.orchestrateWebhookFlow(
    text,
    userPhone,
    tenantId,
    { domain: source, services: [], policies: {} },
    { session_id: `${tenantId}:${userPhone}`, demoMode: source === "demo" ? { tenantId } : undefined }
  );

  return {
    response: result.aiResponse,
    intent: result.telemetryData?.intent,
    outcome: result.conversationOutcome || null,
    telemetry: result.telemetryData,
  };
}