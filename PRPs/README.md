# PRPs (Product Requirements Prompts)

Este diretório contém os PRPs gerados para implementação de features seguindo a metodologia Context Engineering do coleam00.

## Estrutura

- `templates/` - Templates base para geração de PRPs
- `ai_docs/` - Documentação específica para IA sobre APIs, bibliotecas e patterns
- `*.md` - PRPs gerados para features específicas

## Como usar

1. Criar feature request em `INITIAL.md`
2. Executar `/generate-prp INITIAL.md` 
3. PRP será gerado automaticamente em `PRPs/feature-name.md`
4. Executar `/execute-prp PRPs/feature-name.md` para implementar

## Princípios dos PRPs

1. **Context is King**: Contexto completo incluído
2. **Validation Loops**: Testes executáveis para validação
3. **Information Dense**: Keywords e patterns da codebase
4. **Progressive Success**: Implementação incremental com validação