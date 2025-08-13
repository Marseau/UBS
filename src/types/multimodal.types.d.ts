export interface MultiModalContent {
  id: string;
  type: "text" | "audio" | "image" | "video" | "document";
  content: Buffer | string;
  mimeType: string;
  filename?: string;
  metadata?: ContentMetadata;
  originalUrl?: string;
  timestamp: Date;
}
export interface ContentMetadata {
  size: number;
  duration?: number;
  dimensions?: {
    width: number;
    height: number;
  };
  language?: string;
  encoding?: string;
  pages?: number;
  format?: string;
}
export interface MultiModalAnalysis {
  contentId: string;
  contentType: "text" | "audio" | "image" | "video" | "document";
  primaryAnalysis: string;
  transcription?: string;
  ocrText?: string;
  visualDescription?: string;
  businessContext?: BusinessContextAnalysis;
  emotionalAnalysis?: EmotionalAnalysis;
  entities: ExtractedEntity[];
  confidence: number;
  processingTime: number;
  warnings?: string[];
}
export interface BusinessContextAnalysis {
  relevantServices: string[];
  suggestedActions: string[];
  businessDomain?: string;
  customerIntent?: string;
  urgencyLevel: "low" | "medium" | "high";
  requiresHumanReview: boolean;
  contextualInsights: string[];
}
export interface EmotionalAnalysis {
  tone:
    | "positive"
    | "negative"
    | "neutral"
    | "frustrated"
    | "excited"
    | "concerned";
  confidence: number;
  emotionalKeywords: string[];
  sentimentScore: number;
  suggestedResponse?: string;
}
export interface ExtractedEntity {
  type: EntityType;
  value: string;
  confidence: number;
  source: "text" | "audio" | "image" | "ocr";
  position?: ContentPosition;
}
export interface ContentPosition {
  start?: number;
  end?: number;
  coordinates?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  timestamp?: number;
}
export type EntityType =
  | "service_name"
  | "date"
  | "time"
  | "duration"
  | "person_name"
  | "phone_number"
  | "email"
  | "location"
  | "price"
  | "appointment_id"
  | "urgency_level"
  | "product_name"
  | "brand"
  | "color"
  | "size"
  | "medical_condition"
  | "legal_case_type"
  | "document_type"
  | "identification_number";
export interface MultiModalProcessor {
  processContent(content: MultiModalContent): Promise<MultiModalAnalysis>;
  extractEntities(analysis: MultiModalAnalysis): Promise<ExtractedEntity[]>;
  analyzeBusinessContext(
    analysis: MultiModalAnalysis,
    domain?: string,
  ): Promise<BusinessContextAnalysis>;
  analyzeEmotion(content: MultiModalContent): Promise<EmotionalAnalysis>;
  detectLanguage(text: string): Promise<string>;
  translateContent(text: string, targetLanguage: string): Promise<string>;
}
export interface MultiModalIntentResult {
  originalIntent: Intent;
  multiModalEnhancement: MultiModalAnalysis;
  enhancedEntities: ExtractedEntity[];
  confidence: number;
  recommendedAction: string;
  requiresHumanReview: boolean;
}
export interface AudioProcessingOptions {
  enhanceQuality: boolean;
  detectSpeaker: boolean;
  analyzeEmotion: boolean;
  extractKeywords: boolean;
  languageHint?: string;
}
export interface ImageProcessingOptions {
  performOCR: boolean;
  detectObjects: boolean;
  analyzeScene: boolean;
  extractText: boolean;
  detectFaces: boolean;
  businessContext?: string;
}
export interface VideoProcessingOptions {
  extractFrames: boolean;
  transcribeAudio: boolean;
  analyzeScenes: boolean;
  detectMotion: boolean;
  extractKeyframes: boolean;
}
export interface DocumentProcessingOptions {
  extractStructure: boolean;
  detectTables: boolean;
  preserveFormatting: boolean;
  extractMetadata: boolean;
  performOCR: boolean;
}
export interface MultiModalCapabilities {
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
  features: {
    transcription: boolean;
    translation: boolean;
    ocr: boolean;
    emotionDetection: boolean;
    objectDetection: boolean;
    faceDetection: boolean;
  };
}
export interface ProcessingMetrics {
  totalProcessed: number;
  processingTime: {
    avg: number;
    min: number;
    max: number;
  };
  successRate: number;
  byContentType: Record<
    string,
    {
      count: number;
      avgTime: number;
      successRate: number;
    }
  >;
  errors: Array<{
    timestamp: Date;
    contentType: string;
    error: string;
    contentId: string;
  }>;
}
import { Intent } from "./ai.types";
//# sourceMappingURL=multimodal.types.d.ts.map
