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
 * Detecta idioma de um perfil Instagram usando franc-min
 * ESTRATÉGIA ROBUSTA:
 * 1. Detecta caracteres CJK (chinês/japonês/coreano) ANTES de franc
 * 2. Normaliza o texto (remove URLs, emojis, hashtags)
 * 3. Usa biblioteca franc (baseada em n-grams) para detecção
 * 4. Valida comprimento mínimo de texto (10 caracteres)
 * 5. Retorna null se não detectar (sem fallback para 'pt')
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

  // Detecta idioma usando franc
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
  const detectedLang = ISO_639_3_TO_639_1[detectedISO3];

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
