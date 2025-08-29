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
  private recognizeIntent(message: string, context: ConversationContext): Promise<any>;
  private buildConversationMessages;
  private getAIResponse;
  private processFunctionCalls;
  private buildSystemPrompt;
  private buildIntentRecognitionPrompt;
  private parseIntentResult(result: any): any;
  private convertToOpenAIFunction;
  private calculateConfidence(intent: any): number | Promise<number>;
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