// src/contracts/conversation.ts
import { z } from "zod";

export const ConversationRow = z.object({
  tenant_id: z.string().uuid(),
  user_id: z.string().uuid().optional(),           // pode ser preenchido após criação
  content: z.string(),
  is_from_user: z.boolean(),
  message_type: z.string().default("text"),
  intent_detected: z.string().nullable().optional(), // pode ser null quando Flow Lock decide
  confidence_score: z.number().min(0).max(1).nullable().optional(),
  conversation_context: z.record(z.any()).default({}),
  model_used: z.string().nullable().optional(),
  tokens_used: z.number().int().nullable().optional(),
  api_cost_usd: z.number().nullable().optional(),
  processing_cost_usd: z.number().nullable().optional(), // Custo de infraestrutura
  conversation_outcome: z.string().nullable().optional(),
  message_source: z.enum(['whatsapp', 'whatsapp_demo']).default('whatsapp'), // ESSENCIAL para diferenciar origem
  // session_id_uuid: generated column from conversation_context.session_id
});

export type ConversationRowT = z.infer<typeof ConversationRow>;