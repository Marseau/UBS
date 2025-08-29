// src/services/message-handler.ts
// 🎯 CONDIÇÃO ÚNICA: Demo faz requisição HTTP interna para webhook WhatsApp

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

  // 🎯 CONDIÇÃO ÚNICA: Chamar diretamente a função da webhook v3
  const { processWebhookMessage } = require('../routes/whatsapp-webhook-v3.routes');
  
  const mockReq = {
    body: JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [{
        id: tenantId,
        changes: [{
          value: {
            messaging_product: 'whatsapp',
            metadata: {
              display_phone_number: tenantId,
              phone_number_id: tenantId
            },
            messages: [{
              from: userPhone,
              id: `demo_${Date.now()}`,
              timestamp: Math.floor(Date.now() / 1000).toString(),
              text: { body: text },
              type: 'text'
            }]
          }
        }]
      }]
    }),
    // 🎯 FLAG DEMO: Identifica que é demo mode
    demoMode: { tenantId }
  };

  const mockRes = {
    status: (code: number) => ({
      json: (data: any) => data
    }),
    json: (data: any) => data
  };

  try {
    return await processWebhookMessage(mockReq, mockRes);
  } catch (error) {
    console.error('❌ Erro ao chamar webhook WhatsApp direta:', error);
    throw error;
  }
}