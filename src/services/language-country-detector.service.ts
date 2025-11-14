import { franc } from 'franc-min';

export interface LanguageDetection {
  language: string | null;  // ISO 639-1 code (pt, en, es, etc) ou null se não detectado
  confidence: 'low' | 'medium' | 'high';
  method: 'franc' | 'unknown';  // franc library ou unknown (não detectado)
}

/**
 * Normaliza texto para detecção de idioma
 * Remove URLs, hashtags, menções e emojis
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/https?:\/\/[^\s]+/g, '')  // Remove URLs
    .replace(/#\w+/g, '')                // Remove hashtags
    .replace(/@\w+/g, '')                // Remove menções
    .replace(/[\u{1F600}-\u{1F64F}]/gu, '')  // Remove emojis
    .replace(/[\u{1F300}-\u{1F5FF}]/gu, '')
    .replace(/[\u{1F680}-\u{1F6FF}]/gu, '')
    .replace(/[\u{2600}-\u{26FF}]/gu, '')
    .replace(/[\u{2700}-\u{27BF}]/gu, '')
    .trim();
}

/**
 * Mapeia códigos ISO 639-3 (franc) para ISO 639-1
 */
const ISO_639_3_TO_639_1: Record<string, string> = {
  'por': 'pt',  // Português
  'spa': 'es',  // Espanhol
  'eng': 'en',  // Inglês
  'fra': 'fr',  // Francês
  'deu': 'de',  // Alemão
  'ita': 'it',  // Italiano
  'nld': 'nl',  // Holandês
  'jpn': 'ja',  // Japonês
  'kor': 'ko',  // Coreano
  'zho': 'zh',  // Chinês
  'ara': 'ar',  // Árabe
  'rus': 'ru',  // Russo
  'hin': 'hi'   // Hindi
  // 'und' removido - será tratado como null
};

/**
 * Detecta caracteres CJK (Chinese, Japanese, Korean)
 * Estes idiomas NÃO podem ser confundidos com português
 */
function hasCJKCharacters(text: string): boolean {
  // Unicode ranges para CJK:
  // \u3040-\u309F: Hiragana (japonês)
  // \u30A0-\u30FF: Katakana (japonês)
  // \u4E00-\u9FAF: Kanji/Hanzi (japonês/chinês)
  // \uAC00-\uD7AF: Hangul (coreano)
  const cjkPattern = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\uAC00-\uD7AF]/;
  return cjkPattern.test(text);
}

/**
 * Cidades e estados brasileiros (indicadores FORTES de PT-BR)
 */
const BRAZILIAN_LOCATIONS = [
  // Capitais principais
  'brasília', 'são paulo', 'rio de janeiro', 'belo horizonte', 'salvador',
  'fortaleza', 'recife', 'curitiba', 'porto alegre', 'manaus',
  'belém', 'goiânia', 'campinas', 'vitória', 'florianópolis',

  // Estados (siglas e nomes)
  'sp', 'rj', 'mg', 'rs', 'pr', 'sc', 'ba', 'pe', 'ce', 'pa', 'am', 'df', 'go',
  'brasil', 'brazilian', 'brasileira', 'brasileiro'
];

/**
 * Palavras-chave distintivas do português brasileiro
 * Estas palavras NÃO aparecem em espanhol
 */
const PORTUGUESE_KEYWORDS = [
  // Pronomes e artigos PT-BR (peso alto)
  'meus', 'minhas', 'você', 'vocês', 'comigo', 'contigo', 'conosco',

  // Verbos conjugados PT-BR (diferentes de ES) (peso alto)
  'tenho', 'tem', 'temos', 'têm', 'são', 'está', 'estão', 'estamos',
  'faço', 'faz', 'fazem', 'vou', 'vai', 'vão', 'vamos',

  // Palavras comuns PT-BR (peso médio)
  'não', 'sim', 'muito', 'mais', 'tudo', 'todo', 'toda', 'todos', 'todas',
  'deus', 'livre', 'vida', 'mãe', 'pai', 'família',
  'também', 'aqui', 'agora', 'sempre', 'nunca', 'nada',
  'obrigado', 'obrigada', 'bem', 'bom', 'boa', 'melhor',

  // Expressões PT-BR (peso alto)
  'que deus', 'deus abençoe', 'graças a deus', 'se deus quiser'
];

/**
 * Palavras-chave distintivas do espanhol
 * Estas palavras NÃO aparecem em português
 */
const SPANISH_KEYWORDS = [
  // Pronomes e artigos ES (peso alto)
  'mis', 'tus', 'sus', 'nuestro', 'nuestra', 'nuestros', 'nuestras',
  'tú', 'usted', 'ustedes', 'vosotros', 'conmigo', 'contigo',

  // Verbos conjugados ES (diferentes de PT) (peso alto)
  'tengo', 'tienes', 'tiene', 'tienen', 'somos', 'soy', 'eres', 'son',
  'hago', 'hace', 'hacen', 'haces', 'voy', 'vas', 'van',

  // Palavras comuns ES (peso médio)
  'no', 'sí', 'mucho', 'mucha', 'más', 'todo', 'toda', 'todos', 'todas',
  'dios', 'vida', 'amor', 'madre', 'padre', 'familia',
  'también', 'aquí', 'ahora', 'siempre', 'nunca', 'nada',

  // Expressões ES (peso alto)
  'que dios', 'dios bendiga', 'gracias a dios', 'si dios quiere'
];

/**
 * Calcula score de idioma baseado em palavras-chave
 * Retorna { pt: score_pt, es: score_es, hasBrazilianLocation: boolean }
 */
function calculateLanguageScore(text: string): { pt: number; es: number; hasBrazilianLocation: boolean } {
  const lowerText = text.toLowerCase();
  let ptScore = 0;
  let esScore = 0;
  let hasBrazilianLocation = false;

  // Verifica cidades/estados brasileiros (INDICADOR FORTE)
  // Usa busca por substring para capturar casos como "BrasíliaDirector"
  for (const location of BRAZILIAN_LOCATIONS) {
    if (lowerText.includes(location)) {
      hasBrazilianLocation = true;
      ptScore += 3; // Peso alto para localização brasileira
      break; // Uma localização já é suficiente
    }
  }

  // Conta palavras portuguesas
  for (const keyword of PORTUGUESE_KEYWORDS) {
    const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
    const matches = lowerText.match(regex);
    if (matches) {
      ptScore += matches.length;
    }
  }

  // Conta palavras espanholas
  for (const keyword of SPANISH_KEYWORDS) {
    const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
    const matches = lowerText.match(regex);
    if (matches) {
      esScore += matches.length;
    }
  }

  return { pt: ptScore, es: esScore, hasBrazilianLocation };
}

/**
 * Detecta idioma de um perfil Instagram usando franc-min + score de palavras-chave
 * ESTRATÉGIA ROBUSTA:
 * 1. Detecta caracteres CJK (chinês/japonês/coreano) ANTES de franc
 * 2. Calcula SCORE PT vs ES baseado em palavras-chave distintivas
 * 3. Se score PT/ES for decisivo (>= 2 e diferença clara): força idioma
 * 4. Caso contrário: usa franc para detecção
 * 5. Corrige franc se score contradiz detecção (PT/ES confusion)
 */
export async function detectLanguage(
  bio: string | null,
  username?: string
): Promise<LanguageDetection> {

  // Se não tem bio, retorna null
  if (!bio || bio.trim().length === 0) {
    console.log(`❓ Unknown: null (bio vazia)`);
    return {
      language: null,
      confidence: 'low',
      method: 'unknown'
    };
  }

  // DETECÇÃO PRÉVIA: Se tem caracteres CJK, não pode ser português
  if (hasCJKCharacters(bio)) {
    console.log(`❓ Unknown: null (caracteres CJK detectados - japonês/chinês/coreano)`);
    return {
      language: null,
      confidence: 'low',
      method: 'unknown'
    };
  }

  // Normaliza o texto
  const normalizedBio = normalizeText(bio);

  // Valida comprimento mínimo (10 caracteres após normalização)
  if (normalizedBio.length < 10) {
    console.log(`❓ Unknown: null (texto muito curto após normalização: ${normalizedBio.length} chars)`);
    return {
      language: null,
      confidence: 'low',
      method: 'unknown'
    };
  }

  // ========================================
  // SCORE PT vs ES (palavras-chave)
  // ========================================
  const langScore = calculateLanguageScore(bio);
  console.log(`   📊 Language Score: PT=${langScore.pt}, ES=${langScore.es}${langScore.hasBrazilianLocation ? ' 🇧🇷 (localização BR detectada)' : ''}`);

  // REGRA 0: Se detectou localização brasileira → FORÇA 'pt'
  if (langScore.hasBrazilianLocation) {
    console.log(`🎯 Language: pt (FORCED by Brazilian location: PT=${langScore.pt})`);
    return {
      language: 'pt',
      confidence: 'high',
      method: 'franc'
    };
  }

  // REGRA 1: Se PT >= 2 E PT > ES → FORÇA 'pt'
  if (langScore.pt >= 2 && langScore.pt > langScore.es) {
    console.log(`🎯 Language: pt (FORCED by keyword score: PT=${langScore.pt} > ES=${langScore.es})`);
    return {
      language: 'pt',
      confidence: 'high',
      method: 'franc'
    };
  }

  // REGRA 2: Se ES >= 2 E ES > PT → FORÇA 'es'
  if (langScore.es >= 2 && langScore.es > langScore.pt) {
    console.log(`🎯 Language: es (FORCED by keyword score: ES=${langScore.es} > PT=${langScore.pt})`);
    return {
      language: 'es',
      confidence: 'high',
      method: 'franc'
    };
  }

  // ========================================
  // FALLBACK: Usar franc
  // ========================================
  const detectedISO3 = franc(normalizedBio, { minLength: 5 });

  // Se franc retornou 'und' (indefinido) ou idioma não mapeado, retorna null
  if (detectedISO3 === 'und' || !ISO_639_3_TO_639_1[detectedISO3]) {
    console.log(`❓ Unknown: null (franc não conseguiu detectar - ISO3: ${detectedISO3})`);
    return {
      language: null,
      confidence: 'low',
      method: 'unknown'
    };
  }

  // Mapeia ISO 639-3 para ISO 639-1
  let detectedLang = ISO_639_3_TO_639_1[detectedISO3];

  // ========================================
  // CORREÇÃO: Score contradiz franc
  // ========================================
  // Se franc detectou 'es' MAS score PT > ES → corrige para 'pt'
  if (detectedLang === 'es' && langScore.pt > langScore.es) {
    console.log(`🎯 Language: pt (CORRECTED from franc='es' by keyword score: PT=${langScore.pt} > ES=${langScore.es})`);
    detectedLang = 'pt';
  }

  // Se franc detectou 'pt' MAS score ES > PT → corrige para 'es'
  if (detectedLang === 'pt' && langScore.es > langScore.pt) {
    console.log(`🎯 Language: es (CORRECTED from franc='pt' by keyword score: ES=${langScore.es} > PT=${langScore.pt})`);
    detectedLang = 'es';
  }

  // Define confiança baseada no comprimento do texto
  let confidence: 'low' | 'medium' | 'high';
  if (normalizedBio.length >= 50) {
    confidence = 'high';
  } else if (normalizedBio.length >= 20) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }

  console.log(`🎯 Language detected: ${detectedLang} (${confidence}) - franc ISO3: ${detectedISO3}`);
  return {
    language: detectedLang,
    confidence,
    method: 'franc'
  };
}

/**
 * Detecta idioma em batch (múltiplos perfis)
 * Processa em paralelo com rate limiting
 */
export async function detectLanguageBatch(
  profiles: Array<{
    bio: string | null;
    username?: string;
  }>,
  concurrency: number = 5
): Promise<LanguageDetection[]> {

  const results: LanguageDetection[] = [];

  // Processa em batches para respeitar rate limits
  for (let i = 0; i < profiles.length; i += concurrency) {
    const batch = profiles.slice(i, i + concurrency);

    const batchResults = await Promise.all(
      batch.map(profile =>
        detectLanguage(
          profile.bio,
          profile.username
        )
      )
    );

    results.push(...batchResults);

    // Pequeno delay entre batches para evitar rate limiting
    if (i + concurrency < profiles.length) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  return results;
}
