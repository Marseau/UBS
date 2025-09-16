# /src/types/ - Sistema de Tipos TypeScript

Este diretório contém todas as definições de tipos consolidadas do sistema WhatsAppSalon-N8N / Universal Booking System.

## 📁 Estrutura dos Arquivos

### `index.ts` - **Tipos Centrais Consolidados**
- **LogContext**: Interface unificada para logging estruturado com tracing
  - Suporte para conversationId/traceId (rastreamento ponta a ponta)
  - Contexto de tenant, usuário e operação
  - Métricas de performance e telemetria
- **TelemetryData**: Métricas de IA (tokens, custos, confidence scores)
- **MessageSource**: Enums para origem das mensagens (webhook, demo, teste)
- **ConversationFlow**: Estados de fluxo conversacional
- **NotificationData**: Estrutura para notificações do sistema

### `webhook.types.ts` - **Tipos de Webhook**
- Interfaces para processamento de webhooks WhatsApp
- Estruturas de requisição e resposta da API
- Tipos para validação de dados de entrada

### `conversation.types.ts` - **Tipos de Conversa**
- Definições para gerenciamento de conversas
- Estruturas de contexto conversacional
- Tipos para persistência de histórico

### `tenant.types.ts` - **Tipos Multi-Tenant**
- Estruturas para isolamento de tenant
- Configurações por tenant
- Métricas e billing por tenant

## 🔧 Convenções de Uso

### ✅ **SEMPRE Faça:**
- Importe tipos através de `@/types` usando path aliases
- Use tipos específicos em vez de `any` ou `unknown`
- Documente interfaces complexas com comentários JSDoc
- Mantenha consistência com nomenclatura existente

### ❌ **NUNCA Faça:**
- Duplique definições de tipos em outros arquivos
- Use `import type` desnecessariamente (TypeScript resolve automaticamente)
- Crie tipos inline quando já existem tipos reutilizáveis
- Modifique tipos sem validar impacto em outros módulos

## 🧩 Integração com Logging

O sistema de tipos está integrado com o logging estruturado:

```typescript
import { LogContext, conversationLogger } from '@/utils/logger';

// ✅ Correto - Usar interface LogContext
const context: LogContext = {
  service: 'webhook-processor',
  method: 'processMessage',
  conversationId: 'conv_123',
  tenantId: 'tenant_456',
  operationType: 'process_message'
};

logger.conversation('Processing message', context);
```

## 🔄 Evolução dos Tipos

### Histórico de Consolidação:
1. **v1.0**: Tipos espalhados em múltiplos arquivos
2. **v2.0**: Consolidação em `/src/types/index.ts`
3. **v3.0**: Integração com sistema de logging estruturado
4. **Atual**: Sistema unificado com tracing ponta a ponta

### Adicionando Novos Tipos:
1. Verificar se tipo similar já existe
2. Adicionar ao arquivo apropriado (`index.ts` para tipos centrais)
3. Atualizar esta documentação
4. Validar compatibilidade com logging existente

## 🧪 Validação e Testes

Execute os seguintes comandos para validar tipos:

```bash
# Verificação TypeScript
npx tsc --noEmit

# Linting específico para tipos
npm run lint

# Testes de integração
npm run test:ai
```

## 📚 Referências

- **TypeScript Handbook**: https://www.typescriptlang.org/docs/
- **CLAUDE.md**: Regras de desenvolvimento do projeto
- **src/utils/logger.ts**: Implementação do sistema de logging