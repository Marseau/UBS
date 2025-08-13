import { MultiModalIntentResult } from "../types/multimodal.types";
import { ConversationContext, Intent } from "../types/ai.types";
export declare class WhatsAppMultiModalService {
  private helpers;
  private intentService;
  constructor();
  processMultiModalMessage(
    textMessage: string,
    mediaFiles: Array<{
      buffer: Buffer;
      filename?: string;
      mimetype: string;
    }>,
    context: ConversationContext,
  ): Promise<MultiModalIntentResult>;
  processTextOnlyMessage(
    textMessage: string,
    context: ConversationContext,
  ): Promise<Intent>;
  validateMediaFile(
    buffer: Buffer,
    mimetype: string,
  ): {
    isValid: boolean;
    error?: string;
  };
  getCapabilities(): {
    supportedFormats: {
      audio: string[];
      image: string[];
      video: string[];
      document: string[];
    };
    maxFileSize: {
      audio: number;
      image: number;
      video: number;
      document: number;
    };
  };
  generateContextualResponse(result: MultiModalIntentResult): string;
  private processAudio;
  private processImage;
  private processDocument;
  private processVideo;
  private processGeneric;
  private combineAnalyses;
  private determineContentType;
  private formatFileSize;
}
export default WhatsAppMultiModalService;
//# sourceMappingURL=whatsapp-multimodal.service.d.ts.map
