import { franc } from 'franc-min';

export interface LanguageDetection {
  language: string;  // ISO 639-1 code (pt, en, es, etc)
  confidence: 'low' | 'medium' | 'high';
  method: 'franc' | 'default';  // franc library ou default fallback
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
  'hin': 'hi',  // Hindi
  'und': 'pt'   // Indefinido → default pt
};

/**
 * Detecta idioma de um perfil Instagram usando franc-min
 * ESTRATÉGIA ROBUSTA:
 * 1. Normaliza o texto (remove URLs, emojis, hashtags)
 * 2. Usa biblioteca franc (baseada em n-grams) para detecção
 * 3. Valida comprimento mínimo de texto (10 caracteres)
 * 4. Default para 'pt' (português) se não detectar
 */
export async function detectLanguage(
  bio: string | null,
  username?: string
): Promise<LanguageDetection> {

  // Se não tem bio, retorna default pt
  if (!bio || bio.trim().length === 0) {
    console.log(`🇧🇷 Default: pt (bio vazia)`);
    return {
      language: 'pt',
      confidence: 'low',
      method: 'default'
    };
  }

  // Normaliza o texto
  const normalizedBio = normalizeText(bio);

  // Valida comprimento mínimo (10 caracteres após normalização)
  if (normalizedBio.length < 10) {
    console.log(`🇧🇷 Default: pt (texto muito curto após normalização: ${normalizedBio.length} chars)`);
    return {
      language: 'pt',
      confidence: 'low',
      method: 'default'
    };
  }

  // Detecta idioma usando franc
  const detectedISO3 = franc(normalizedBio, { minLength: 5 });

  // Mapeia ISO 639-3 para ISO 639-1
  const detectedLang = ISO_639_3_TO_639_1[detectedISO3] || 'pt';

  // Define confiança baseada no comprimento do texto
  let confidence: 'low' | 'medium' | 'high';
  if (normalizedBio.length >= 50) {
    confidence = 'high';
  } else if (normalizedBio.length >= 20) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }

  // Se franc retornou 'und' (indefinido), usa default
  if (detectedISO3 === 'und') {
    console.log(`🇧🇷 Default: pt (franc não conseguiu detectar - ISO3: ${detectedISO3})`);
    return {
      language: 'pt',
      confidence: 'low',
      method: 'default'
    };
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
