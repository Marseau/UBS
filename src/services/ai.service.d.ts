export declare class AIService {
  private openai;
  private whatsappService;
  constructor();
  processIncomingMessage(message: any, contacts: any[]): Promise<void>;
  healthCheck(): Promise<{
    status: string;
    details: Record<string, any>;
  }>;
}
//# sourceMappingURL=ai.service.d.ts.map
