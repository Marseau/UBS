// N8N Node: Format Prompt
// Purpose: Calculate week/year automatically and create AI prompt for content generation

const mainTheme = $input.item.json.main_theme;

// Auto-calculate ISO week number
const now = new Date();
const startOfYear = new Date(now.getFullYear(), 0, 1);
const daysSinceStart = Math.floor((now - startOfYear) / (1000 * 60 * 60 * 24));
const weekNumber = Math.ceil((daysSinceStart + startOfYear.getDay() + 1) / 7);
const year = now.getFullYear();

// Build comprehensive prompt with UBS Taylor Made context
const prompt = `Você é um estrategista editorial B2B focado em geração de demanda. Use apenas português do Brasil.

## Contexto do UBS Taylor Made

**Produto:**
- Plataforma modular sob medida que integra Captação & Qualificação de Leads, Agendamento Inteligente e Follow-up Automático via WhatsApp + IA, criada para eliminar o gap entre gerar leads e fechar vendas.

**Diferenciais principais (use nos conteúdos):**
- IA responde leads em segundos, 24/7, com qualificação e registro automático
- Sincronização com Google Calendar, confirmações e lembretes que reduzem faltas drasticamente
- Dashboard com métricas em tempo real para acompanhar ROI
- Jornada consultiva: formulário → proposta personalizada em até 24h → teste de 7 dias com dados reais → implantação completa em até 15 dias. Custo zero se não aprovar o teste
- Material de vendas e modelo de parceria white label/comissão para agências

**Públicos prioritários:**
- **Agências digitais** que precisam fechar o gap entre tráfego e conversão, reduzir churn de clientes e oferecer solução completa sob seu branding
- **Negócios locais** (profissionais liberais, micro, pequenas e médias empresas) que perdem leads das redes sociais, vivem WhatsApp desorganizado e não conseguem medir ROI

**Dores a explorar:**
- Leads não respondidos a tempo, atendimento manual frágil e sem histórico
- Agenda com conflitos, esquecimentos e alta taxa de no-show
- Falta de dados para comprovar ROI e justificar investimento em marketing
- Necessidade de automatizar atendimento sem aumentar headcount

**Proposta Taylor Made:**
- Módulos ativados conforme necessidade, implantação guiada e suporte consultivo
- Evite confundir com o SaaS padrão; destaque o caráter sob medida, proposta personalizada e risco zero

## Tema da Semana ${weekNumber}/${year}

"${mainTheme}"

## Tarefa

Produzir plano editorial para 7 dias consecutivos alinhado ao tema principal acima, guiado para geração de leads qualificados e conversão para desenvolvimento sob medida do UBS Taylor Made.

**Para cada dia:**

1. **sub_theme**: Defina subtema específico e coerente com o roteiro da semana, mantendo narrativa que evolui da dor ao fechamento

2. **twitter_insertion_1/2/3**: Gere 3 tweets independentes
   - Máximo 280 caracteres cada
   - Tom direto baseado em dados
   - Utilize apenas estatísticas mencionadas (ex: "IA 24/7", "Menos faltas", "proposta em 24h", "teste de 7 dias", "implantação em 15 dias")
   - Cada tweet deve abordar uma dor concreta e apontar o caminho Taylor Made

3. **instagram_post**: Roteiro para vídeo de 60s gerado por IA
   - Até 150 palavras
   - Estrutura: gancho inicial + dor + solução Taylor Made + CTA
   - Tom casual-profissional, agregando os conceitos dos tweets

4. **instagram_caption**: Legenda com CTA explícita
   - Incluir a frase "Link na bio para proposta grátis"

5. **instagram_hashtags**: Array com 7-10 termos
   - Sem o caractere "#"
   - Misturando dores, soluções e segmentos
   - Exemplos: ["automatizacaowhatsapp","captacaodeleads","agenciasdigitais"]

6. **youtube_segment**:
   - **Dias 1-6**: Roteiro conciso para vídeo de 60 segundos (gancho, dor, demonstração, CTA)
   - **Dia 7**: Roteiro estruturado para vídeo de 5 minutos gerado por IA, recapitulando os insights dos dias anteriores, conectando tweets e posts, adicionando prova social/case e encerrando com CTA para teste gratuito

## Estrutura Semanal Sugerida

Adapte se fizer sentido:
- **Dia 1**: Visão geral do problema central
- **Dia 2**: Solução Taylor Made para resposta e qualificação de leads
- **Dia 3**: Foco em agendamento inteligente e redução de no-shows
- **Dia 4**: Métricas e resultados (usar números disponíveis)
- **Dia 5**: Impacto em ROI e retenção (sem inventar valores)
- **Dia 6**: Implementação prática, jornada do teste de 7 dias e proposta personalizada
- **Dia 7**: Case ou narrativa integrando aprendizados da semana com prova social/CTA forte

## Formato de Saída

Retorne JSON com 7 dias (day_1 a day_7), cada um seguindo exatamente:

{
  "day_1": {
    "sub_theme": "Subtema específico do dia 1",
    "twitter_insertion_1": "Tweet 1 até 280 chars",
    "twitter_insertion_2": "Tweet 2 até 280 chars",
    "twitter_insertion_3": "Tweet 3 até 280 chars",
    "instagram_post": "Roteiro para vídeo 60s até 150 palavras",
    "instagram_caption": "Legenda com CTA incluindo 'Link na bio para proposta grátis'",
    "instagram_hashtags": ["hashtag1", "hashtag2", "hashtag3", "hashtag4", "hashtag5", "hashtag6", "hashtag7"],
    "youtube_segment": "Roteiro para vídeo 60s (dias 1-6) ou 5min (dia 7)"
  },
  "day_2": { ... },
  "day_3": { ... },
  "day_4": { ... },
  "day_5": { ... },
  "day_6": { ... },
  "day_7": { ... }
}

## Regras Finais

- ✅ Use somente informações fornecidas; não invente métricas adicionais
- ✅ Cada tweet deve ser autossuficiente e apontar para o teste gratuito/proposta personalizada
- ✅ Garanta coesão semanal: narrativa evolui da conscientização ao fechamento, culminando no vídeo de 5 minutos do dia 7
- ✅ Mantenha o enquadramento Taylor Made (solução sob medida, proposta consultiva, risco zero), sem misturar com o SaaS padrão

**IMPORTANTE**: Retorne APENAS o JSON válido, sem markdown, sem \`\`\`json, sem explicações adicionais.`;

return {
  json: {
    prompt,
    week_number: weekNumber,
    year,
    main_theme: mainTheme,
    request_start_time: Date.now()
  }
};
