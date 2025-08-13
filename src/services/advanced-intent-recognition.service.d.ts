import { Intent, IntentType, ConversationContext } from "../types/ai.types";
import { BusinessDomain } from "../types/database.types";
export declare class AdvancedIntentRecognitionService {
  private intentRouter;
  private openai?;
  private cache;
  private learningData;
  private metrics;
  private engines;
  constructor();
  private createEmptyMetrics;
  recognizeIntent(
    message: string,
    context: ConversationContext,
    options?: RecognitionOptions,
  ): Promise<EnhancedIntent>;
  routeWithAdvancedLogic(
    intent: EnhancedIntent,
    context: ConversationContext,
  ): Promise<RoutingDecision>;
  private initializeEngines;
  private runMultipleEngines;
  private applyEnsembleMethod;
  private recognizeWithOpenAI;
  private recognizeWithStatisticalModel;
  private applyAdvancedRoutingRules;
  private evaluateEscalationNeeds;
  private generateActionRecommendations;
  private initializeOpenAI;
  private initializeMetrics;
  private generateMessageId;
  private getCachedResult;
  private cacheResult;
  private updateMetrics;
  private updateRoutingMetrics;
  private buildAdvancedIntentPrompt;
  private parseOpenAIResponse;
  private enhanceBasicIntent;
  private getDefaultIntent;
  private deduplicateEntities;
  private getAlternativeIntents;
  private calculateTextSimilarity;
  private extractEntitiesStatistical;
  private calculatePriority;
  private getConfidenceFactors;
  private getCurrentSystemLoad;
  private checkDomainEscalation;
  private storeLearningData;
  private postProcessResult;
  getMetrics(): IntentMetrics;
  resetMetrics(): void;
  clearCache(): void;
}
interface EnhancedIntent extends Intent {
  metadata?: {
    engines?: Array<{
      name: string;
      success: boolean;
      processingTime: number;
    }>;
    ensembleMethod?: string;
    totalProcessingTime?: number;
    engine?: string;
    model?: string;
    enhanced?: boolean;
    learningSamples?: number;
  };
}
interface RecognitionOptions {
  engines?: IntentEngine[];
  forceRefresh?: boolean;
  cacheTtl?: number;
  confidenceThreshold?: number;
}
interface IntentEngine {
  name: string;
  weight: number;
  execute: (
    message: string,
    context: ConversationContext,
  ) => Promise<EnhancedIntent>;
}
interface IntentMetrics {
  totalRecognitions: number;
  successfulRecognitions: number;
  cacheHits: number;
  averageProcessingTime: number;
  intentAccuracy: Map<IntentType, number>;
  enginePerformance: Map<string, number>;
  lastReset: number;
}
interface RoutingDecision {
  primaryDomain: BusinessDomain | "other";
  alternativeDomains: BusinessDomain[];
  escalationRequired: boolean;
  escalationType:
    | "none"
    | "human_agent"
    | "supervisor"
    | "immediate"
    | "human_review"
    | "medical_review";
  confidence: number;
  priority: "low" | "medium" | "high" | "critical";
  suggestedActions: ActionRecommendation[];
  metadata: {
    processingTime: number;
    rulesApplied: string[];
    confidenceFactors: Record<string, number>;
  };
}
interface ActionRecommendation {
  action: string;
  priority: "low" | "medium" | "high" | "critical";
  description: string;
}
export default AdvancedIntentRecognitionService;
//# sourceMappingURL=advanced-intent-recognition.service.d.ts.map
