/**
 * Dual Persona Content Validator
 *
 * Valida conteúdo gerado pela LLM para garantir conformidade com requisitos:
 * - Contagem de palavras (não caracteres)
 * - Tempo estimado de fala (WPM 160-180 pt-BR)
 * - Limites de caracteres para Twitter/Instagram
 * - Governança crítica (youtube_segment vazio em dias 1-6)
 *
 * Uso no n8n:
 * 1. Adicione um "Code" node após o GPT-4 response
 * 2. Cole este código
 * 3. Configure para retornar errors se validação falhar
 */

/**
 * Valida script baseado em contagem de palavras e tempo estimado de fala
 */
function validateScript(script, config) {
  const {
    expectedMinWords,
    expectedMaxWords,
    expectedMinSeconds,
    expectedMaxSeconds,
    personaName
  } = config;

  // Contagem de palavras (split por espaços/quebras)
  const words = script.trim().split(/\s+/).filter(w => w.length > 0).length;

  // WPM (Words Per Minute) para pt-BR: 160-180
  // Com margem de erro de ±10%
  const WPM_MIN = 144; // 160 - 10%
  const WPM_MAX = 198; // 180 + 10%

  // Cálculo de duração estimada
  const minDuration = (words / WPM_MAX) * 60; // em segundos
  const maxDuration = (words / WPM_MIN) * 60; // em segundos

  // Validação
  const wordCountValid = words >= expectedMinWords && words <= expectedMaxWords;
  const durationValid =
    minDuration >= (expectedMinSeconds - 2) &&
    maxDuration <= (expectedMaxSeconds + 2);

  return {
    valid: wordCountValid && durationValid,
    words: words,
    estimatedDuration: `${minDuration.toFixed(1)}-${maxDuration.toFixed(1)}s`,
    expectedDuration: `${expectedMinSeconds}-${expectedMaxSeconds}s`,
    expectedWords: `${expectedMinWords}-${expectedMaxWords}`,
    warnings: [
      !wordCountValid ? `⚠️ ${personaName}: ${words} palavras (esperado ${expectedMinWords}-${expectedMaxWords})` : null,
      !durationValid ? `⚠️ ${personaName}: Duração estimada ${minDuration.toFixed(1)}-${maxDuration.toFixed(1)}s (esperado ${expectedMinSeconds}-${expectedMaxSeconds}s)` : null
    ].filter(Boolean)
  };
}

/**
 * Valida tweet (limite 280 caracteres)
 */
function validateTweet(tweet, dayNumber, tweetNumber) {
  const length = tweet.length;
  const valid = length <= 280;

  return {
    valid,
    length,
    warnings: valid ? [] : [`⚠️ Dia ${dayNumber} Tweet ${tweetNumber}: ${length} chars (máximo 280)`]
  };
}

/**
 * Valida legenda Instagram (limite 150 caracteres)
 */
function validateInstagramCaption(caption, dayNumber) {
  const length = caption.length;
  const valid = length <= 150;
  const hasCTA = caption.toLowerCase().includes('link na bio') ||
                 caption.toLowerCase().includes('dm') ||
                 caption.toLowerCase().includes('salva') ||
                 caption.toLowerCase().includes('comenta');

  return {
    valid: valid && hasCTA,
    length,
    hasCTA,
    warnings: [
      !valid ? `⚠️ Dia ${dayNumber} Caption: ${length} chars (máximo 150)` : null,
      !hasCTA ? `⚠️ Dia ${dayNumber} Caption: Falta CTA (Link na bio/DM/Salva/Comenta)` : null
    ].filter(Boolean)
  };
}

/**
 * Valida hashtags (array sem #, 7-10 itens)
 */
function validateHashtags(hashtags, dayNumber) {
  const count = hashtags.length;
  const validCount = count >= 7 && count <= 10;
  const invalidTags = hashtags.filter(tag =>
    tag.startsWith('#') ||
    tag.includes(' ') ||
    tag.length > 50
  );

  return {
    valid: validCount && invalidTags.length === 0,
    count,
    warnings: [
      !validCount ? `⚠️ Dia ${dayNumber} Hashtags: ${count} tags (esperado 7-10)` : null,
      invalidTags.length > 0 ? `⚠️ Dia ${dayNumber} Hashtags inválidas: ${invalidTags.join(', ')}` : null
    ].filter(Boolean)
  };
}

/**
 * Valida youtube_segment (CRÍTICO: vazio em dias 1-6, preenchido no dia 7)
 */
function validateYouTubeSegment(segment, dayNumber) {
  const shouldBeEmpty = dayNumber >= 1 && dayNumber <= 6;
  const shouldBeFilled = dayNumber === 7;

  if (shouldBeEmpty) {
    const valid = segment === "";
    return {
      valid,
      warnings: valid ? [] : [`❌ CRÍTICO Dia ${dayNumber}: youtube_segment deve estar VAZIO (governança)`]
    };
  }

  if (shouldBeFilled) {
    const length = segment.length;
    const valid = length >= 1000;
    return {
      valid,
      length,
      warnings: valid ? [] : [`⚠️ Dia 7 YouTube: ${length} chars (mínimo 1000 para roteiro 5-6min)`]
    };
  }

  return { valid: true, warnings: [] };
}

/**
 * Valida thread do Dia 4 (8 tweets obrigatórios)
 */
function validateDay4Thread(day) {
  const requiredFields = [
    'twitter_insertion_1',
    'twitter_insertion_2',
    'twitter_insertion_3',
    'twitter_insertion_4',
    'twitter_insertion_5',
    'twitter_insertion_6',
    'twitter_insertion_7',
    'twitter_insertion_8'
  ];

  const missingFields = requiredFields.filter(field => !day[field]);
  const valid = missingFields.length === 0;

  // Valida que é realmente uma thread (tweet 1 menciona "thread")
  const isThreadFormat = day.twitter_insertion_1?.toLowerCase().includes('thread');

  return {
    valid: valid && isThreadFormat,
    warnings: [
      !valid ? `❌ Dia 4 Thread: Faltam tweets (${missingFields.join(', ')})` : null,
      !isThreadFormat ? `⚠️ Dia 4: Tweet 1 deve indicar que é uma thread (ex: '🧵 Thread:...')` : null
    ].filter(Boolean)
  };
}

/**
 * Valida um dia completo
 */
function validateDay(day, dayNumber) {
  const errors = [];
  const warnings = [];

  // Valida scripts Carla e Bruno
  const carlaValidation = validateScript(day.carla_script, {
    expectedMinWords: 55,
    expectedMaxWords: 75,
    expectedMinSeconds: 20,
    expectedMaxSeconds: 25,
    personaName: 'Carla'
  });

  const brunoValidation = validateScript(day.bruno_script, {
    expectedMinWords: 95,
    expectedMaxWords: 120,
    expectedMinSeconds: 35,
    expectedMaxSeconds: 40,
    personaName: 'Bruno'
  });

  if (!carlaValidation.valid) {
    errors.push(...carlaValidation.warnings);
  }

  if (!brunoValidation.valid) {
    errors.push(...brunoValidation.warnings);
  }

  // Valida tweets (3 obrigatórios, 8 se dia 4)
  const tweet1Validation = validateTweet(day.twitter_insertion_1, dayNumber, 1);
  const tweet2Validation = validateTweet(day.twitter_insertion_2, dayNumber, 2);
  const tweet3Validation = validateTweet(day.twitter_insertion_3, dayNumber, 3);

  warnings.push(...tweet1Validation.warnings);
  warnings.push(...tweet2Validation.warnings);
  warnings.push(...tweet3Validation.warnings);

  // Valida thread do dia 4
  if (dayNumber === 4) {
    const threadValidation = validateDay4Thread(day);
    if (!threadValidation.valid) {
      errors.push(...threadValidation.warnings);
    }
  }

  // Valida Instagram caption
  const captionValidation = validateInstagramCaption(day.instagram_caption, dayNumber);
  if (!captionValidation.valid) {
    warnings.push(...captionValidation.warnings);
  }

  // Valida hashtags
  const hashtagsValidation = validateHashtags(day.instagram_hashtags, dayNumber);
  if (!hashtagsValidation.valid) {
    warnings.push(...hashtagsValidation.warnings);
  }

  // Valida youtube_segment (CRÍTICO)
  const youtubeValidation = validateYouTubeSegment(day.youtube_segment, dayNumber);
  if (!youtubeValidation.valid) {
    errors.push(...youtubeValidation.warnings);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    metrics: {
      carla: carlaValidation,
      bruno: brunoValidation,
      caption: captionValidation,
      hashtags: hashtagsValidation,
      youtube: youtubeValidation
    }
  };
}

/**
 * Valida semana completa (7 dias)
 */
function validateWeekContent(content) {
  const results = {
    valid: true,
    days: {},
    summary: {
      totalErrors: 0,
      totalWarnings: 0,
      criticalIssues: []
    }
  };

  // Valida cada dia
  for (let i = 1; i <= 7; i++) {
    const dayKey = `day_${i}`;
    const day = content[dayKey];

    if (!day) {
      results.valid = false;
      results.summary.criticalIssues.push(`❌ CRÍTICO: ${dayKey} não encontrado no JSON`);
      continue;
    }

    const dayValidation = validateDay(day, i);
    results.days[dayKey] = dayValidation;

    if (!dayValidation.valid) {
      results.valid = false;
    }

    results.summary.totalErrors += dayValidation.errors.length;
    results.summary.totalWarnings += dayValidation.warnings.length;

    if (dayValidation.errors.length > 0) {
      results.summary.criticalIssues.push(...dayValidation.errors);
    }
  }

  return results;
}

/**
 * Formata relatório de validação
 */
function formatValidationReport(results) {
  let report = '📊 RELATÓRIO DE VALIDAÇÃO - DUAL PERSONA CONTENT\n';
  report += '═'.repeat(60) + '\n\n';

  // Status geral
  if (results.valid) {
    report += '✅ APROVADO - Todos os critérios atendidos\n\n';
  } else {
    report += '❌ REPROVADO - Correções necessárias\n\n';
  }

  // Sumário
  report += `📈 SUMÁRIO:\n`;
  report += `   Total de Erros: ${results.summary.totalErrors}\n`;
  report += `   Total de Avisos: ${results.summary.totalWarnings}\n\n`;

  // Issues críticos
  if (results.summary.criticalIssues.length > 0) {
    report += `🚨 ISSUES CRÍTICOS:\n`;
    results.summary.criticalIssues.forEach(issue => {
      report += `   ${issue}\n`;
    });
    report += '\n';
  }

  // Detalhes por dia
  report += `📅 DETALHES POR DIA:\n\n`;
  Object.entries(results.days).forEach(([dayKey, dayResult]) => {
    const dayNumber = dayKey.split('_')[1];
    const status = dayResult.valid ? '✅' : '❌';

    report += `${status} DIA ${dayNumber}:\n`;

    if (dayResult.errors.length > 0) {
      report += `   Erros:\n`;
      dayResult.errors.forEach(err => report += `      ${err}\n`);
    }

    if (dayResult.warnings.length > 0) {
      report += `   Avisos:\n`;
      dayResult.warnings.forEach(warn => report += `      ${warn}\n`);
    }

    // Métricas
    report += `   Métricas:\n`;
    report += `      Carla: ${dayResult.metrics.carla.words} palavras (${dayResult.metrics.carla.estimatedDuration})\n`;
    report += `      Bruno: ${dayResult.metrics.bruno.words} palavras (${dayResult.metrics.bruno.estimatedDuration})\n`;
    report += `      Caption: ${dayResult.metrics.caption.length} chars, CTA: ${dayResult.metrics.caption.hasCTA ? '✓' : '✗'}\n`;
    report += `      Hashtags: ${dayResult.metrics.hashtags.count} tags\n`;

    report += '\n';
  });

  return report;
}

// ===== USO NO N8N =====

// Exemplo de como usar no n8n Code node:
/*
const content = $input.item.json; // JSON do GPT-4

const validation = validateWeekContent(content);
const report = formatValidationReport(validation);

console.log(report);

if (!validation.valid) {
  throw new Error(`Validação falhou:\n${report}`);
}

return { json: { validated: true, content, validation, report } };
*/

// ===== USO STANDALONE (Node.js) =====

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    validateWeekContent,
    formatValidationReport,
    validateScript,
    validateDay
  };
}

// ===== EXEMPLO DE USO =====

// Exemplo de conteúdo válido mínimo:
const exampleContent = {
  day_1: {
    sub_theme: "Perda de leads por demora no atendimento",
    twitter_insertion_1: "Carla: Você sabe quantos leads perde por não responder a tempo? Eu perdia 40%.",
    twitter_insertion_2: "Bruno: IA responde em 3s, 24/7. Resultado: +67% conversão em 30 dias.",
    twitter_insertion_3: "Bruno: Teste grátis 7 dias. Link na bio → proposta em 24h.",
    carla_script: "Eu perdia quinze leads por semana. Fiz as contas: sessenta leads por mês desperdiçados, dezoito mil reais em receita perdida. O problema? Eu demorava quatro horas para responder. Quando respondia, o lead já tinha fechado com concorrente. Testei chatbot, mas as respostas eram robotizadas e afastavam clientes. Precisava de algo inteligente.", // 72 palavras
    bruno_script: "Implementamos IA conversacional no WhatsApp que funciona assim: ela responde em três segundos, analisa o padrão da conversa para qualificar o lead fazendo perguntas inteligentes, e agenda direto no Google Calendar sincronizado. O diferencial? Ela aprende com cada interação. Se o lead pergunta preço cedo, ela identifica que é curiosidade e educa antes de vender. Resultado em trinta dias com doze contas piloto: taxa de resposta de noventa e oito por cento, conversão subiu sessenta e sete por cento comparado com atendimento manual, zero leads perdidos por demora de resposta. O sistema fica mais inteligente a cada conversa. Teste grátis sete dias, link na bio, proposta personalizada em vinte e quatro horas.", // 118 palavras
    instagram_caption: "Quer automatizar também? Link na bio para proposta personalizada",
    instagram_hashtags: ["automatizacaowhatsapp", "captacaodeleads", "agenciasdigitais", "saasbrasil", "marketingdigital", "perdadeleads", "conversao"],
    youtube_segment: ""
  }
  // ... outros dias
};

// Descomente para testar:
// const validation = validateWeekContent(exampleContent);
// console.log(formatValidationReport(validation));
