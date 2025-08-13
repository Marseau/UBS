export interface WhatsAppWebhookBody {
  object: string;
  entry: WhatsAppWebhookEntry[];
}
export interface WhatsAppWebhookEntry {
  id: string;
  changes: WhatsAppWebhookChange[];
}
export interface WhatsAppWebhookChange {
  value: WhatsAppWebhookValue;
  field: string;
}
export interface WhatsAppWebhookValue {
  messaging_product: string;
  metadata: WhatsAppMetadata;
  contacts?: WhatsAppContact[];
  messages?: WhatsAppMessage[];
  statuses?: WhatsAppStatus[];
}
export interface WhatsAppMetadata {
  display_phone_number: string;
  phone_number_id: string;
}
export interface WhatsAppContact {
  profile: {
    name: string;
  };
  wa_id: string;
}
export interface WhatsAppMessage {
  id: string;
  from: string;
  timestamp: string;
  type: WhatsAppMessageType;
  context?: WhatsAppContext;
  text?: WhatsAppTextMessage;
  image?: WhatsAppMediaMessage;
  audio?: WhatsAppMediaMessage;
  video?: WhatsAppMediaMessage;
  document?: WhatsAppMediaMessage;
  voice?: WhatsAppMediaMessage;
  button?: WhatsAppButtonMessage;
  interactive?: WhatsAppInteractiveMessage;
}
export type WhatsAppMessageType =
  | "text"
  | "image"
  | "audio"
  | "video"
  | "document"
  | "voice"
  | "button"
  | "interactive"
  | "location"
  | "contacts";
export interface WhatsAppContext {
  from: string;
  id: string;
}
export interface WhatsAppTextMessage {
  body: string;
}
export interface WhatsAppMediaMessage {
  id: string;
  mime_type: string;
  caption?: string;
  filename?: string;
}
export interface WhatsAppButtonMessage {
  text: string;
  payload: string;
}
export interface WhatsAppInteractiveMessage {
  type: string;
  button_reply?: {
    id: string;
    title: string;
  };
  list_reply?: {
    id: string;
    title: string;
    description?: string;
  };
}
export interface WhatsAppStatus {
  id: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: string;
  recipient_id: string;
  conversation?: {
    id: string;
    expiration_timestamp?: string;
    origin: {
      type: string;
    };
  };
  pricing?: {
    billable: boolean;
    pricing_model: string;
    category: string;
  };
}
export interface WhatsAppOutboundMessage {
  messaging_product: "whatsapp";
  to: string;
  type: WhatsAppOutboundMessageType;
  text?: {
    body: string;
    preview_url?: boolean;
  };
  image?: {
    id?: string;
    link?: string;
    caption?: string;
  };
  interactive?: WhatsAppInteractiveOutbound;
  template?: WhatsAppTemplate;
}
export type WhatsAppOutboundMessageType =
  | "text"
  | "image"
  | "interactive"
  | "template";
export interface WhatsAppInteractiveOutbound {
  type: "button" | "list";
  header?: {
    type: "text" | "image";
    text?: string;
    image?: {
      id?: string;
      link?: string;
    };
  };
  body: {
    text: string;
  };
  footer?: {
    text: string;
  };
  action: WhatsAppInteractiveAction;
}
export interface WhatsAppInteractiveAction {
  buttons?: WhatsAppInteractiveButton[];
  button?: string;
  sections?: WhatsAppInteractiveSection[];
}
export interface WhatsAppInteractiveButton {
  type: "reply";
  reply: {
    id: string;
    title: string;
  };
}
export interface WhatsAppInteractiveSection {
  title: string;
  rows: WhatsAppInteractiveRow[];
}
export interface WhatsAppInteractiveRow {
  id: string;
  title: string;
  description?: string;
}
export interface WhatsAppTemplate {
  name: string;
  language: {
    code: string;
  };
  components?: WhatsAppTemplateComponent[];
}
export interface WhatsAppTemplateComponent {
  type: "header" | "body" | "button";
  parameters?: WhatsAppTemplateParameter[];
}
export interface WhatsAppTemplateParameter {
  type: "text" | "currency" | "date_time" | "image" | "document";
  text?: string;
  currency?: {
    fallback_value: string;
    code: string;
    amount_1000: number;
  };
  date_time?: {
    fallback_value: string;
  };
  image?: {
    id?: string;
    link?: string;
  };
  document?: {
    id?: string;
    link?: string;
    filename?: string;
  };
}
export interface ConversationState {
  user_id: string;
  tenant_id: string;
  phone_number: string;
  current_step: string;
  context: Record<string, any>;
  last_message_at: string;
  created_at: string;
  updated_at: string;
}
export interface AIAgentContext {
  tenant: {
    id: string;
    slug: string;
    domain: string;
    business_name: string;
    ai_settings: Record<string, any>;
    business_rules: Record<string, any>;
  };
  user: {
    phone: string;
    name?: string;
    context: Record<string, any>;
  };
  conversation: {
    history: ConversationMessage[];
    current_step: string;
    state: Record<string, any>;
  };
  message: WhatsAppMessage;
}
export interface ConversationMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  message_type: WhatsAppMessageType;
  metadata?: Record<string, any>;
}
export interface AIFunction {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, any>;
    required: string[];
  };
}
export interface AIFunctionCall {
  name: string;
  arguments: Record<string, any>;
}
export interface AIFunctionResult {
  success: boolean;
  data?: any;
  error?: string;
  message?: string;
}
//# sourceMappingURL=whatsapp.types.d.ts.map
