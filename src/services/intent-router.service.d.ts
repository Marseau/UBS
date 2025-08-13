import { Intent, ConversationContext } from "../types/ai.types";
import { BusinessDomain } from "../types/database.types";
export declare class IntentRouterService {
  private intentPatterns;
  private entityExtractors;
  private domainKeywords;
  constructor();
  analyzeIntent(
    message: string,
    context: ConversationContext,
    conversationHistory?: string[],
  ): Promise<Intent>;
  routeToDomain(
    intent: Intent,
    context: ConversationContext,
  ): BusinessDomain | "other";
  private initializeIntentPatterns;
  private initializeEntityExtractors;
  private initializeDomainKeywords;
  private normalizeMessage;
  private extractEntities;
  private matchIntentPatterns;
  private applyContextualBoosting;
  private selectBestIntent;
  private inferDomainFromIntent;
  private determineUrgency;
  private analyzeSentiment;
  private getIntentFlow;
  private getDomainBoost;
  private normalizeDate;
  private normalizeTime;
  private normalizePhone;
  private mapUrgencyLevel;
}
export default IntentRouterService;
//# sourceMappingURL=intent-router.service.d.ts.map
