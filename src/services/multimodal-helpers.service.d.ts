import {
  BusinessContextAnalysis,
  EmotionalAnalysis,
  ExtractedEntity,
  ProcessingMetrics,
} from "../types/multimodal.types";
import { Intent } from "../types/ai.types";
export declare class MultiModalHelpers {
  private intentService;
  private openai;
  constructor();
  transcribeAudio(buffer: Buffer, mimeType: string): Promise<string>;
  analyzeImageVisually(buffer: Buffer, mimeType: string): Promise<string>;
  extractTextFromImage(buffer: Buffer, mimeType: string): Promise<string>;
  extractTextFromDocument(buffer: Buffer, mimeType: string): Promise<string>;
  extractEntitiesFromText(text: string): Promise<ExtractedEntity[]>;
  analyzeTextForBusiness(
    text: string,
    domain?: string,
  ): Promise<BusinessContextAnalysis>;
  analyzeDocumentForBusiness(
    text: string,
    mimeType: string,
  ): Promise<BusinessContextAnalysis>;
  analyzeTextEmotion(text: string): Promise<EmotionalAnalysis>;
  combineEntities(entities: ExtractedEntity[]): ExtractedEntity[];
  combineBusinessContext(
    contexts: BusinessContextAnalysis[],
  ): BusinessContextAnalysis;
  determineRecommendedAction(
    intent: Intent,
    businessContext: BusinessContextAnalysis,
    entities: ExtractedEntity[],
  ): string;
  generateCacheKey(content: any): string;
  private simpleHash;
  detectLanguageFallback(text: string): string;
  private createDummyContext;
  initializeMetrics(): ProcessingMetrics;
  updateMetrics(
    metrics: ProcessingMetrics,
    contentType: string,
    processingTime: number,
    success: boolean,
  ): void;
}
//# sourceMappingURL=multimodal-helpers.service.d.ts.map
