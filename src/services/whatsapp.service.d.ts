import {
  WhatsAppOutboundMessage,
  WhatsAppWebhookBody,
  ConversationState,
} from "../types/whatsapp.types";
export declare class WhatsAppService {
  private accessToken;
  private phoneNumberId;
  private apiVersion;
  private baseUrl;
  constructor();
  sendMessage(message: WhatsAppOutboundMessage): Promise<boolean>;
  sendTextMessage(
    to: string,
    text: string,
    previewUrl?: boolean,
  ): Promise<boolean>;
  sendButtonMessage(
    to: string,
    bodyText: string,
    buttons: Array<{
      id: string;
      title: string;
    }>,
    headerText?: string,
    footerText?: string,
  ): Promise<boolean>;
  sendListMessage(
    to: string,
    bodyText: string,
    buttonText: string,
    sections: Array<{
      title: string;
      rows: Array<{
        id: string;
        title: string;
        description?: string;
      }>;
    }>,
    headerText?: string,
    footerText?: string,
  ): Promise<boolean>;
  verifyWebhook(mode: string, token: string, challenge: string): string | null;
  processWebhook(body: WhatsAppWebhookBody): Promise<void>;
  private handleIncomingMessage;
  private handleMessageStatus;
  private storeConversationMessage;
  getConversationState(phoneNumber: string): Promise<ConversationState | null>;
  updateConversationState(
    phoneNumber: string,
    step: string,
    context: Record<string, any>,
  ): Promise<void>;
  getMediaUrl(mediaId: string): Promise<string | null>;
  downloadMedia(mediaUrl: string): Promise<Buffer | null>;
  sendTemplateMessage(
    to: string,
    templateName: string,
    templateData: Record<string, string>,
  ): Promise<boolean>;
  private buildFallbackBillingMessage;
  private extractMessageText;
  private detectResponseType;
  private storeSystemMessage;
}
export default WhatsAppService;
//# sourceMappingURL=whatsapp.service.d.ts.map
