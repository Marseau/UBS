import {
  ConversationContext,
  ProcessingResult,
  MediaContent,
} from "../types/ai.types";
export declare class AIService {
  private openai;
  private agentFactory;
  private memoryService;
  private mediaProcessor;
  private config;
  constructor();
  processMessage(
    message: string,
    context: ConversationContext,
    media?: MediaContent[],
  ): Promise<ProcessingResult>;
  private processMediaContent;
  private recognizeIntent;
  private buildConversationMessages;
  private getAIResponse;
  private processFunctionCalls;
  private buildSystemPrompt;
  private buildIntentRecognitionPrompt;
  private parseIntentResult;
  private convertToOpenAIFunction;
  private calculateConfidence;
  private shouldEscalate;
  private generateSuggestedActions;
  private extractResponseContext;
  private updateConversationHistory;
  private generateActions;
  healthCheck(): Promise<{
    status: string;
    details: Record<string, any>;
  }>;
}
export default AIService;
//# sourceMappingURL=ai-complex.service.d.ts.map
