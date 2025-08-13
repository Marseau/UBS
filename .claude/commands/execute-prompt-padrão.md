# Execute Propmt 

## Descrição

Executa qualquer tarefa com contexto completo do SaaS e MCPs obrigatórios. Seguir metodologia Context Engineering Coleam00 para garantir implementação robusta e confiável.

## Execution Strategy

## Prompt
🎯 **CONTEXTO OBRIGATÓRIO - CONSULTE NESTA ORDEM:**

**1. 📄 src/frontend/LANDING.HTML**: Leia PRIMEIRO para entender o SaaS
   - Proposta de valor
   - Funcionalidades oferecidas  
   - Público-alvo
   - Escopo real do produto

**2. 📌 Você tem acesso aos seguintes recursos de apoio MCP:

- 🧠 `Memory MCP`: acesso ao grafo de decisões, entidades e definições.
- 📂 `Filesystem MCP`: leitura/escrita de arquivos do projeto.
- 🌐 `Crawled Pages`: documentação raspada (ex: Google Calendar, Stripe, WhatsApp,Engenharia de Contexto :Coleamm00).
- 🧪 `Playwright MCP`: testes automatizados web.
- 🤖 `Puppeteer MCP`: automação de browser real.
- 🛠️ `GitHub MCP`: histórico de commits, branches, pull requests.
- 🗃️ `Supabase MCP`: banco de dados do projeto e sua estrutura.
-    `N8N MCP`: acesse diretamente o workflows.


**3.🧭 Metodologia obrigatória: COLEAM00 (em crawled_pages no Supabase)
> Você deve seguir rigorosamente as etapas:

1. **C**onteúdo – Entenda completamente a tarefa descrita
2. **O**bjetivo – Determine a entrega exata e sucesso esperado
3. **L**ocalização – Consulte as fontes (filesystem, memory, crawled_pages)
4. **E**vidência – Fundamente sua resposta em dados verificáveis
5. **A**nálise – Explique sua escolha e caminho técnico
6. **M00** – Documente o raciocínio, mantendo consistência futura

**4.REGRAS RÍGIDAS:
- SEMPRE alinhe respostas com a proposta da landing.html
- Siga método Coleam00 das crawled_pages
- NÃO sugira funcionalidades fora do escopo da landing
- NÃO invente informações não encontradas
- SE não souber, PERGUNTE em vez de assumir, NÃO assuma nada
- CITE fontes (landing.html + MCPs utilizados + crawled_pages)
- PROIBIDO dar soluções rápidas/temporárias
- SOLUÇÃO DEFINITIVA É OBRIGATÓRIA

**5.Formato da resposta obrigatória:

# 📌 Análise Inicial (COLEAM00)
# 🗂️ Consultas Realizadas via MCPs
# 💡 Proposta Técnica com Justificativa
# ✅ Passos para Execução
# 🧪 Testes Recomendados
# 🔁 Memória Atualizada (se necessário)

**TAREFA:** {{user_input}}

Execute este PROMPT com confiança para implementar sistema robusto no desenvolvimento do WhatsAppSalon-N8N.
