import {
  MultiModalContent,
  MultiModalAnalysis,
  BusinessContextAnalysis,
  EmotionalAnalysis,
  ExtractedEntity,
  MultiModalProcessor,
  MultiModalIntentResult,
  MultiModalCapabilities,
  ProcessingMetrics,
} from "../types/multimodal.types";
import { Intent, ConversationContext } from "../types/ai.types";
export declare class AdvancedMultiModalService implements MultiModalProcessor {
  private openai;
  private intentService;
  private metrics;
  private cache;
  private cacheTTL;
  constructor();
  processContent(content: MultiModalContent): Promise<MultiModalAnalysis>;
  private processText;
  private processAudio;
  private processImage;
  private processVideo;
  private processDocument;
  enhanceIntentWithMultiModal(
    textIntent: Intent,
    multiModalContent: MultiModalContent[],
    context: ConversationContext,
  ): Promise<MultiModalIntentResult>;
  extractEntities(analysis: MultiModalAnalysis): Promise<ExtractedEntity[]>;
  analyzeBusinessContext(
    analysis: MultiModalAnalysis,
    domain?: string,
  ): Promise<BusinessContextAnalysis>;
  analyzeEmotion(content: MultiModalContent): Promise<EmotionalAnalysis>;
  detectLanguage(text: string): Promise<string>;
  translateContent(text: string, targetLanguage: string): Promise<string>;
  getCapabilities(): MultiModalCapabilities;
  getMetrics(): ProcessingMetrics;
  reset(): void;
  private transcribeAudio;
  private analyzeImageVisually;
  private extractTextFromImage;
  private extractTextFromDocument;
  private extractEntitiesFromText;
  private extractEntitiesFromImage;
  private analyzeTextForBusiness;
  private analyzeDocumentForBusiness;
  private analyzeTextEmotion;
  private analyzeAudioEmotion;
  private analyzeImageEmotion;
  private combineEntities;
  private combineBusinessContext;
  private determineRecommendedAction;
  private generateCacheKey;
  private simpleHash;
  private getCachedResult;
  private setCachedResult;
  private detectLanguageFallback;
  private createDummyContext;
  private initializeMetrics;
  private updateMetrics;
}
export default AdvancedMultiModalService;
//# sourceMappingURL=advanced-multimodal.service.d.ts.map
