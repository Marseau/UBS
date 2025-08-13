# 📦 ARQUIVOS OBSOLETOS - NÃO USAR

Este diretório contém código obsoleto que foi substituído por implementações mais avançadas.

## Arquivos Arquivados

### `ai-simple.service.js.deprecated`
- **Data de arquivamento:** 2025-01-27
- **Razão:** Substituído pelo sistema AI complexo com adapter
- **Funcionalidade:** Sistema AI simples que retornava apenas respostas placeholder
- **Substituto:** `../ai-complex.service.js` + `../adapters/whatsapp-ai-adapter.js`

### `ai-simple.service.d.ts.deprecated`
- **Data de arquivamento:** 2025-01-27
- **Razão:** Definições TypeScript do sistema AI simples obsoleto
- **Substituto:** Definições em `../types/ai.types.ts`

## ⚠️ IMPORTANTE

**NÃO UTILIZAR** estes arquivos em novas implementações. Eles foram mantidos apenas para:
- Referência histórica
- Debugging de problemas legados
- Auditoria de código

Para funcionalidades de AI, sempre usar:
- `../ai-complex.service.js`
- `../adapters/whatsapp-ai-adapter.js`