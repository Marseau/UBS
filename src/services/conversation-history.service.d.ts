import { WhatsAppMessage } from "@/types/whatsapp.types";
export interface ConversationMessage {
  id: string;
  tenant_id: string;
  user_id?: string;
  phone_number: string;
  user_name: string;
  is_from_user: boolean;
  message_type: string;
  message_content: string;
  content: string;
  raw_message: any;
  intent_detected?: string;
  confidence_score?: number;
  conversation_context?: any;
  message_id?: string;
  created_at: string;
}
export interface ConversationSearchParams {
  phone_number?: string;
  tenant_id?: string;
  user_id?: string;
  start_date?: string;
  end_date?: string;
  message_type?: string;
  intent_detected?: string;
  is_from_user?: boolean;
  limit?: number;
  offset?: number;
}
export interface ConversationStats {
  total_messages: number;
  total_conversations: number;
  messages_by_type: Record<string, number>;
  intents_detected: Record<string, number>;
  average_messages_per_conversation: number;
  most_active_hours: Record<string, number>;
  retention_summary: {
    total_stored: number;
    messages_last_30_days: number;
    messages_last_60_days: number;
    eligible_for_cleanup: number;
  };
}
export declare class ConversationHistoryService {
  storeMessage(
    message: WhatsAppMessage,
    tenantId: string,
    userName: string,
    userId?: string,
    intentDetected?: string,
    confidenceScore?: number,
    conversationContext?: any,
  ): Promise<void>;
  storeSystemMessage(
    tenantId: string,
    phoneNumber: string,
    messageContent: string,
    messageType?: string,
    conversationContext?: any,
    relatedMessageId?: string,
  ): Promise<void>;
  getConversationByPhone(
    phoneNumber: string,
    tenantId: string,
    limit?: number,
    beforeDate?: string,
  ): Promise<ConversationMessage[]>;
  searchConversations(params: ConversationSearchParams): Promise<{
    messages: ConversationMessage[];
    total: number;
    hasMore: boolean;
  }>;
  getConversationSummary(
    phoneNumber: string,
    tenantId: string,
  ): Promise<{
    total_messages: number;
    first_interaction: string;
    last_interaction: string;
    message_types: Record<string, number>;
    intents: Record<string, number>;
    user_messages: number;
    system_messages: number;
  }>;
  getConversationsForCleanup(retentionDays?: number): Promise<{
    phone_numbers: string[];
    message_count: number;
    oldest_date: string;
    newest_date: string;
  }>;
  cleanupOldConversations(retentionDays?: number): Promise<{
    deleted_count: number;
    deleted_conversations: number;
    cleanup_date: string;
  }>;
  getConversationStats(
    tenantId?: string,
    startDate?: string,
    endDate?: string,
  ): Promise<ConversationStats>;
  exportConversationHistory(
    params: ConversationSearchParams & {
      format?: "json" | "csv";
    },
  ): Promise<{
    data: any[];
    format: string;
    total: number;
  }>;
  getRecentContext(
    phoneNumber: string,
    tenantId: string,
    messageLimit?: number,
  ): Promise<
    Array<{
      role: "user" | "assistant";
      content: string;
      timestamp: string;
    }>
  >;
  private extractMessageContent;
  private formatDisplayContent;
  startAutomaticCleanup(retentionDays?: number, intervalHours?: number): void;
}
export declare const conversationHistoryService: ConversationHistoryService;
//# sourceMappingURL=conversation-history.service.d.ts.map
