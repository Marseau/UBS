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
 * APENAS palavras completas e inequívocas para evitar falsos positivos
 */
const BRAZILIAN_LOCATIONS = [
  // Cidades principais (nomes completos)
  'brasília', 'são paulo', 'rio de janeiro', 'belo horizonte', 'salvador',
  'fortaleza', 'recife', 'curitiba', 'porto alegre', 'manaus',
  'belém', 'goiânia', 'campinas', 'vitória', 'florianópolis',

  // Palavras inequívocas de Brasil
  'brasil', 'brazil', 'brazilian', 'brasileira', 'brasileiro', 'brasileiros'
];

/**
 * Palavras-chave distintivas do português brasileiro
 * Estas palavras NÃO aparecem em espanhol (ou são muito diferentes)
 * IMPORTANTE: Removidas palavras que existem em ambos idiomas (para, com, sem, etc.)
 */
const PORTUGUESE_KEYWORDS = [
  // Pronomes e artigos PT-BR (peso alto - MUITO DISTINTOS)
  'meus', 'minhas', 'você', 'vocês', 'conosco', 'nosso', 'nossa', 'nossos', 'nossas',

  // Verbos conjugados PT-BR (diferentes de ES) (peso alto)
  'tenho', 'temos', 'têm', 'está', 'estão', 'estamos',
  'faço', 'faz', 'fazem', 'fazemos', 'vou', 'vai', 'vão', 'vamos',
  'posso', 'pode', 'podem', 'podemos', 'quer', 'quero', 'querem',

  // Palavras EXCLUSIVAS PT-BR (não existem ou são bem diferentes em ES)
  'não', 'tudo', 'mãe', 'pai', 'irmão', 'irmã', 'filho', 'filha',
  'também', 'agora', 'sempre', 'nunca', 'ainda', 'então', 'porque',
  'obrigado', 'obrigada', 'muito', 'muita', 'muitos', 'muitas',
  'bom', 'boa', 'bons', 'boas', 'melhor', 'pior',
  'saúde', 'trabalho', 'negócio', 'negócios',
  'coração', 'paixão', 'atenção',

  // Preposições/conjunções EXCLUSIVAS PT-BR (não existem em ES)
  'pela', 'pelo', 'pelas', 'pelos', 'dessa', 'desse', 'nessa', 'nesse',

  // Expressões PT-BR (peso alto)
  'que deus', 'deus abençoe', 'graças a deus', 'se deus quiser',
  'tá bom', 'tudo bem', 'de boa', 'e aí', 'beleza'
];

/**
 * Palavras-chave distintivas do espanhol
 * Estas palavras NÃO aparecem em português (ou são muito diferentes)
 */
const SPANISH_KEYWORDS = [
  // Pronomes ES (peso alto - MUITO DISTINTOS)
  'yo', 'tú', 'tu', 'mis', 'tus', 'sus', 'nuestro', 'nuestra', 'nuestros', 'nuestras',
  'usted', 'ustedes', 'vosotros', 'conmigo', 'contigo', 'lo', 'la', 'le', 'les',

  // Verbos conjugados ES (diferentes de PT) (peso alto)
  'tengo', 'tienes', 'tiene', 'tienen', 'somos', 'soy', 'eres', 'son',
  'hago', 'hace', 'hacen', 'haces', 'hacemos', 'vas', 'vamos',
  'estoy', 'estás', 'están', 'hemos', 'habéis', 'han', 'hay',
  'puedo', 'puedes', 'pueden', 'quiero', 'quieres', 'quieren',
  'merece', 'mereces', 'merecen', 'brilla', 'brillar', 'brillan',
  'potencio', 'potencia', 'potenciar', 'posible', 'posibles',

  // Palavras EXCLUSIVAS ES (não existem ou são bem diferentes em PT)
  'sí', 'mucho', 'mucha', 'muchos', 'muchas', 'muy', 'año', 'años',
  'español', 'española', 'españoles', 'españolas',
  'cómo', 'qué', 'cuál', 'dónde', 'donde', 'cuándo', 'cuando', 'cuánto',
  'hermano', 'hermana', 'abuelo', 'abuela', 'niño', 'niña',
  'bueno', 'buena', 'buenos', 'buenas', 'mejor', 'peor', 'feliz',
  'centro', 'esencia', 'negocio', 'negocios', 'trabajo', 'trabajos',
  'éxito', 'exito', 'exitoso', 'exitosa',
  'grande', 'grandes', 'pequeño', 'pequeña',

  // Artigos ES (diferentes de PT: "as/os" vs "las/los")
  'las', 'los', 'una', 'unas', 'unos', 'el', 'del',

  // Preposições/advérbios ES exclusivos
  'hacia', 'desde', 'hasta', 'según', 'también', 'además', 'ahora', 'siempre', 'nunca',

  // Expressões ES (peso alto)
  'que dios', 'dios bendiga', 'gracias a dios', 'si dios quiere',
  'qué tal', 'cómo estás', 'muy bien', 'de nada', 'por favor'
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

  // ========================================
  // PASSO 0: Verificar BRAZILIAN_LOCATIONS ANTES de tudo (mais confiável)
  // ========================================
  const lowerBio = bio.toLowerCase();
  let hasBrazilianLocation = false;
  for (const location of BRAZILIAN_LOCATIONS) {
    if (lowerBio.includes(location)) {
      hasBrazilianLocation = true;
      console.log(`   🇧🇷 Localização brasileira detectada: "${location}" - forçando português`);
      return {
        language: 'pt',
        confidence: 'high',
        method: 'franc'
      };
    }
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
  // PASSO 1: Verificar características EXCLUSIVAS de português
  // ========================================
  // Ç, Ã, Õ, LH, NH são exclusivos de português (não existem em espanhol)
  // Também: palavras com acentos típicos PT-BR (é, á, í, ó, ú em contextos específicos)
  const hasPortugueseChars = /[çãõ]|lh|nh/i.test(bio);

  // Palavras com acentos que são EXCLUSIVAS ou muito mais comuns em PT-BR
  // Sem \b porque bios do Instagram frequentemente têm palavras grudadas
  const portugueseAccentedWords = /(você|vocês|será|está|também|até|já|só|aí|país|países|negócio|negócios|saúde|atenção|coração|paixão|opinião|missão|visão|sessão|profissão|conexão|ação|direção|produção|educação|comunicação|gestão|menção|canção|posição|situação|solução|decisão|evolução|inovação|informação|organização|experiência|ciência|consciência|audiência|consultório|território|empresário|empresária|salário|horário|voluntário|aniversário|necessário|secretária|família|história|memória|vitória|glória|trajetória|carreira|maneira)/i.test(bio);

  let detectedLang: string;
  let detectedISO3: string;

  if (hasPortugueseChars) {
    console.log(`   🇧🇷 Características PT detectadas (ç/ã/õ/lh/nh) - forçando português`);
    detectedLang = 'pt';
    detectedISO3 = 'por';
  } else if (portugueseAccentedWords) {
    console.log(`   🇧🇷 Palavras acentuadas PT detectadas - forçando português`);
    detectedLang = 'pt';
    detectedISO3 = 'por';
  } else {
    // ========================================
    // PASSO 2: Usar FRANC (mais preciso, baseado em n-gramas)
    // ========================================
    detectedISO3 = franc(normalizedBio, { minLength: 5 });

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
    detectedLang = ISO_639_3_TO_639_1[detectedISO3]!; // Non-null assertion - já verificado acima
    console.log(`   🤖 Franc detectou: ${detectedLang} (ISO3: ${detectedISO3})`);
  }

  // ========================================
  // PASSO 2: CORREÇÃO apenas para PT/ES (idiomas muito similares)
  // ========================================
  // Só calcula keywords se franc detectou PT ou ES (para corrigir confusões)
  if (detectedLang === 'pt' || detectedLang === 'es') {
    const langScore = calculateLanguageScore(bio);
    console.log(`   📊 Keyword Score: PT=${langScore.pt}, ES=${langScore.es}${langScore.hasBrazilianLocation ? ' 🇧🇷' : ''}`);

    // CORREÇÃO 1: Localização BR + baixo score ES → força PT
    if (langScore.hasBrazilianLocation && langScore.es < 3) {
      console.log(`🎯 Language: pt (CORRECTED: Brazilian location detected, ES score low)`);
      detectedLang = 'pt';
    }
    // CORREÇÃO 2: Score PT MUITO forte (>= 3 e pelo menos 2x ES) → força PT
    else if (langScore.pt >= 3 && langScore.pt >= langScore.es * 2) {
      console.log(`🎯 Language: pt (CORRECTED: Strong PT keywords: ${langScore.pt} >> ${langScore.es})`);
      detectedLang = 'pt';
    }
    // CORREÇÃO 3: Score ES MUITO forte (>= 3 e pelo menos 2x PT) → força ES
    else if (langScore.es >= 3 && langScore.es >= langScore.pt * 2) {
      console.log(`🎯 Language: es (CORRECTED: Strong ES keywords: ${langScore.es} >> ${langScore.pt})`);
      detectedLang = 'es';
    }
    // EMPATE ou diferença pequena: MANTÉM detecção do Franc (mais preciso para n-gramas)
    else {
      console.log(`✅ Language: ${detectedLang} (franc detection - keywords PT=${langScore.pt} ES=${langScore.es})`);
    }
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
