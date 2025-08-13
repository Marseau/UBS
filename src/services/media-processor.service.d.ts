import OpenAI from "openai";
import { MediaProcessor } from "../types/ai.types";
export declare class MediaProcessorService implements MediaProcessor {
  private openai;
  constructor(openai: OpenAI);
  processImage(content: Buffer, mimeType: string): Promise<string>;
  processAudio(content: Buffer, mimeType: string): Promise<string>;
  extractText(content: Buffer, mimeType: string): Promise<string>;
  analyzeForBusinessContext(
    analysis: string,
    businessDomain?: string,
  ): Promise<string>;
  detectSensitiveContent(analysis: string): Promise<{
    hasSensitive: boolean;
    concerns: string[];
  }>;
  private fallbackImageAnalysis;
  private fallbackAudioAnalysis;
  private fallbackDocumentAnalysis;
  private extractPdfText;
  private extractWordText;
  validateMedia(
    content: Buffer,
    mimeType: string,
  ): {
    isValid: boolean;
    error?: string;
  };
  getCapabilities(): Record<string, string[]>;
  processVideo(videoUrl: string): Promise<string>;
  processDocument(docUrl: string): Promise<string>;
}
export default MediaProcessorService;
//# sourceMappingURL=media-processor.service.d.ts.map
