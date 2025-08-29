// src/services/message-handler.ts
// 🎯 Processamento direto de mensagens para demo mode SEM MOCKS

interface MessageInput {
  tenantId: string;
  userPhone: string;
  text: string;
  source: "whatsapp" | "demo";
}

export async function handleIncomingMessage({ tenantId, userPhone, text, source }: MessageInput) {
  if (source === "whatsapp") {
    throw new Error("handleIncomingMessage deve ser usado apenas para demo. WhatsApp usa webhook direta.");
  }

  // 🎯 Chamar diretamente o orquestrador sem mocks
  const { WebhookFlowOrchestratorService } = require('../services/webhook-flow-orchestrator.service');
  
  const sessionKey = `${tenantId}:${userPhone}`;
  console.log('🚨🚨🚨 DEMO DIRECT PROCESSING - SEM MOCKS 🚨🚨🚨');
  
  try {
    const orchestrator = new WebhookFlowOrchestratorService();
    
    const result = await orchestrator.orchestrateWebhookFlow(
      text,
      userPhone,
      tenantId,
      { domain: 'whatsapp', services: [], policies: {} },
      { session_id: sessionKey, demoMode: { tenantId } }
    );
    
    // 🛡️ BLINDAGEM COMPLETA CONTRA VALORES UNDEFINED/NULL
    const response = {
      status: 'success',
      response: result?.aiResponse || 'Sem resposta gerada.',
      telemetry: { 
        intent_detected: result?.telemetryData?.intent || 'general',
        processingTime: 0,
        tokens_used: result?.llmMetrics?.total_tokens ?? 0,
        api_cost_usd: result?.llmMetrics?.api_cost_usd ?? 0,
        confidence: result?.telemetryData?.confidence ?? null,
        decision_method: result?.telemetryData?.decision_method || 'unknown',
        flow_lock_active: result?.telemetryData?.flow_lock_active ?? false,
        processing_time_ms: result?.telemetryData?.processing_time_ms ?? 0,
        model_used: result?.telemetryData?.model_used || result?.llmMetrics?.model || 'unknown',
        // Preservar campos extras válidos
        ...(result?.telemetryData ? Object.fromEntries(
          Object.entries(result.telemetryData).filter(([key, value]) => 
            value !== undefined && value !== null && key !== 'intent'
          )
        ) : {})
      }
    };
    
    console.log('📤 Demo processing completed:', response);
    return response;
    
  } catch (error) {
    console.error('❌ Erro ao processar mensagem demo:', error);
    return {
      status: 'error',
      response: 'Ocorreu um erro interno. Nossa equipe foi notificada.',
      telemetry: {
        intent_detected: 'general',
        processingTime: 0,
        tokens_used: 0,
        api_cost_usd: 0,
        confidence: null,
        decision_method: 'error',
        flow_lock_active: false,
        processing_time_ms: 0,
        model_used: 'error',
        error_type: (error as any)?.name || 'UnknownError',
        error_message: (error as any)?.message || 'Erro desconhecido'
      }
    };
  }
}