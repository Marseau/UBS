# Examples - Code Patterns for Context Engineering

Este diretório contém exemplos de código que demonstram patterns específicos do nosso sistema. Estes exemplos são CRÍTICOS para o sucesso do Context Engineering.

## Por que Examples são Importantes?

> AI coding assistants perform much better when they can see patterns to follow.

## Estrutura de Diretórios

### `ai-agents/`
Patterns para criação e implementação de agentes especializados:
- Agentes por domínio (healthcare, beauty, legal, etc.)
- Factory patterns para criação de agentes
- Integração com OpenAI APIs

### `whatsapp-integration/`
Patterns para integração WhatsApp Business API:
- Webhook processing
- Media handling (images, audio, documents)
- Template messaging
- Multi-tenant message routing

### `multi-tenant/`
Patterns para arquitetura multi-tenant:
- RLS policies e implementação
- Tenant-scoped queries
- Cross-tenant user handling
- Data isolation patterns

### `testing-patterns/`
Patterns de teste específicos do sistema:
- AI conversation testing
- Webhook mocking
- Tenant isolation tests
- Integration test patterns

### `database/`
Patterns para banco de dados:
- Migration patterns
- RLS policy examples
- Complex queries with joins
- Performance optimization

### `api-patterns/`
Patterns para APIs REST:
- Endpoint structure
- Authentication middleware
- Error handling
- Response formatting

## Como Usar

1. Sempre referencie exemplos específicos nos INITIAL.md
2. Explique quais aspectos devem ser seguidos
3. Indique gotchas e patterns críticos
4. Mantenha exemplos atualizados com o código real