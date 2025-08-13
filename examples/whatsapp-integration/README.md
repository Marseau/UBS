# WhatsApp Integration Examples

Patterns para integração com WhatsApp Business API.

## Arquivos de Exemplo

### `webhook-processing-pattern.ts`
- Incoming message handling
- Verification token validation
- Multi-tenant message routing
- Error handling and retries

### `media-handling-pattern.ts`
- Image processing with GPT-4 Vision
- Audio transcription with Whisper
- Document text extraction
- File storage and retrieval

### `template-messaging-pattern.ts`
- WhatsApp Business template management
- Dynamic template parameter injection
- Template approval status handling
- Bulk messaging patterns

### `message-routing-pattern.ts`
- Phone number to tenant mapping
- Intent-based routing to agents
- Context preservation across messages
- Conversation state management

## Critical Gotchas

1. **Webhook Verification**: Always verify webhook tokens
2. **Rate Limits**: WhatsApp has strict rate limiting
3. **Media Size Limits**: Different limits for different media types
4. **Template Approval**: Templates need Facebook approval
5. **Phone Number Format**: Consistent international formatting required