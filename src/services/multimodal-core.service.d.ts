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
export declare class MultiModalCoreService implements MultiModalProcessor {
  private openai;
  private intentService;
  private helpers;
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
  private getCachedResult;
  private setCachedResult;
}
//# sourceMappingURL=multimodal-core.service.d.ts.map
