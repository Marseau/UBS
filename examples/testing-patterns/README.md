# Testing Patterns Examples

Patterns específicos de teste para nosso sistema multi-tenant com IA.

## Arquivos de Exemplo

### `ai-conversation-testing.ts`
- Teste de fluxos de conversa completos
- Mocking de respostas OpenAI
- Validação de intent classification
- Teste de function calling

### `webhook-mocking.ts`
- Mock de webhooks WhatsApp
- Simulação de mensagens incoming
- Teste de media processing
- Validação de responses

### `tenant-isolation-tests.ts`
- Teste de isolamento de dados
- Validação de RLS policies
- Cross-tenant access prevention
- Performance de queries tenant-scoped

### `integration-test-patterns.ts`
- End-to-end testing strategies
- Database seeding for tests
- Cleanup patterns
- Parallel test execution

## Testing Philosophy

1. **AI Testing**: Test conversation flows, not just functions
2. **Isolation Testing**: Critical for multi-tenant security
3. **Integration Focus**: Test complete user journeys
4. **Performance Testing**: Validate under tenant load
5. **Mock External APIs**: Reliable testing without API dependencies