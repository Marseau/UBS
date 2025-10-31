import OpenAI from 'openai';
import axios from 'axios';
import * as cheerio from 'cheerio';

// ============================================
// TIPOS E INTERFACES
// ============================================

interface InstagramLead {
  id: string;
  username: string;
  full_name?: string | null;
  profession?: string | null;
  bio?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;  // Link da bio do Instagram (Linktree, WhatsApp, site, etc)
  hashtags_bio?: any[];
  hashtags_posts?: any[];
  segment?: string | null;
}

interface EnrichedData {
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  profession?: string | null;  // Qualificação profissional específica (Cardiologista, Nutricionista, etc)
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  state?: string | null;
  address?: string | null;
  zip_code?: string | null;
  business_category?: string | null;
  hashtags_bio?: string[];
}

interface EnrichmentResponse {
  id: string;
  username: string;
  enriched: EnrichedData;
  sources: string[];
  should_mark_enriched: boolean;
}

// ============================================
// CONFIGURAÇÃO OPENAI
// ============================================

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ============================================
// DDDs VÁLIDOS DO BRASIL
// ============================================

const VALID_BRAZILIAN_DDDS = [
  11, 12, 13, 14, 15, 16, 17, 18, 19, // São Paulo
  21, 22, 24, // Rio de Janeiro
  27, 28, // Espírito Santo
  31, 32, 33, 34, 35, 37, 38, // Minas Gerais
  41, 42, 43, 44, 45, 46, // Paraná
  47, 48, 49, // Santa Catarina
  51, 53, 54, 55, // Rio Grande do Sul
  61, // Distrito Federal
  62, 64, // Goiás
  63, // Tocantins
  65, 66, // Mato Grosso
  67, // Mato Grosso do Sul
  68, // Acre
  69, // Rondônia
  71, 73, 74, 75, 77, // Bahia
  79, // Sergipe
  81, 87, // Pernambuco
  82, // Alagoas
  83, // Paraíba
  84, // Rio Grande do Norte
  85, 88, // Ceará
  86, 89, // Piauí
  91, 93, 94, // Pará
  92, 97, // Amazonas
  95, // Roraima
  96, // Amapá
  98, 99 // Maranhão
];

// ============================================
// VALIDAÇÃO E NORMALIZAÇÃO
// ============================================

function isValidEmail(email: string): boolean {
  if (!email) return false;
  const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z]{2,}$/;
  const invalidPatterns = ['example.com', 'test.com', 'yoursite.com', 'yourdomain.com'];
  return emailRegex.test(email) && !invalidPatterns.some(pattern => email.includes(pattern));
}

function isValidPhone(phone: string): boolean {
  if (!phone) return false;
  const cleanPhone = phone.replace(/\D/g, '');

  // Aceitar: 10-13 dígitos (com ou sem código do país)
  if (cleanPhone.length < 10 || cleanPhone.length > 13) return false;

  // Validar DDD para números brasileiros (10-11 dígitos ou 12-13 com código 55)
  let ddd: number;
  if (cleanPhone.length === 12 || cleanPhone.length === 13) {
    if (!cleanPhone.startsWith('55')) return false;
    ddd = parseInt(cleanPhone.substring(2, 4));
  } else {
    ddd = parseInt(cleanPhone.substring(0, 2));
  }

  return VALID_BRAZILIAN_DDDS.includes(ddd);
}

/**
 * Normaliza telefone brasileiro adicionando código de país se necessário
 */
function normalizePhone(phone: string): string {
  if (!phone) return phone;

  // Remove caracteres não numéricos
  const cleanPhone = phone.replace(/\D/g, '');

  // Já tem código de país (começa com 55 e tem 12-13 dígitos)
  if (cleanPhone.startsWith('55') && cleanPhone.length >= 12 && cleanPhone.length <= 13) {
    return cleanPhone;
  }

  // Telefone brasileiro sem código de país (10-11 dígitos)
  if (cleanPhone.length >= 10 && cleanPhone.length <= 11) {
    const ddd = parseInt(cleanPhone.substring(0, 2));

    if (VALID_BRAZILIAN_DDDS.includes(ddd)) {
      return '55' + cleanPhone;
    }
  }

  // Retorna sem modificação para outros casos
  return cleanPhone;
}

/**
 * Separa nome completo em primeiro e último nome
 */
function splitFullName(fullName: string): { first_name: string; last_name: string | null } {
  if (!fullName || fullName.length < 3) {
    return { first_name: fullName || '', last_name: null };
  }

  const parts = fullName.trim().split(/\s+/);

  if (parts.length === 1) {
    return { first_name: parts[0] || '', last_name: null };
  }

  return {
    first_name: parts[0] || '',
    last_name: parts.slice(1).join(' ') || null
  };
}

// ============================================
// EXTRAÇÃO DE TELEFONE DE URLS WHATSAPP
// ============================================

/**
 * Extrai telefone de URLs do WhatsApp (wa.me, api.whatsapp.com)
 */
function extractPhoneFromWhatsAppUrl(url: string): string | null {
  if (!url) return null;

  const patterns = [
    /wa\.me\/(\d+)/i,
    /api\.whatsapp\.com\/send\?phone=(\d+)/i,
    /whatsapp:\/\/send\?phone=(\d+)/i
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      const phone = match[1];
      if (isValidPhone(phone)) {
        return phone;
      }
    }
  }

  return null;
}

// ============================================
// EXTRAÇÃO COM AI (GPT-4o-mini)
// ============================================

async function extractContactsWithAI(
  fullName: string | null,
  bio: string | null,
  website: string | null
): Promise<{
  full_name: string | null;
  profession: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  address: string | null;
  zip_code: string | null;
  business_category: string | null;
  hashtags_bio: string[];
}> {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Você é um analista especialista em extrair informações de perfis do Instagram.

Fontes fornecidas:
1. FULL_NAME (nome completo do perfil)
2. BIO (biografia do perfil)
3. WEBSITE (link da bio: Linktree, WhatsApp, Bio.site, etc.)

TAREFA:
Gerar um JSON com os campos:
{
 "full_name": "...",
 "profession": "...",
 "email": "...",
 "phone": "...",
 "city": "...",
 "state": "...",
 "address": "...",
 "zip_code": "...",
 "business_category": "...",
 "hashtags_bio": [...]
}

### Regras Gerais:
- Use TODAS as fontes, priorizando: FULL_NAME > BIO > WEBSITE
- Retorne null para dados ausentes e [] para hashtags vazias

#### 1. full_name
- Extraia apenas nome e sobrenome de pessoa física
- Remova títulos (Dr., Dra.) e apelidos profissionais (Nutri, Fisio, Psico, Dra, Dr, etc.)
- Remova qualificações completas (Nutricionista, Advogado, Personal Trainer, etc.)
- Nomes corporativos ou genéricos → null
- Exemplos:
  * "Dr. João Silva" → "João Silva"
  * "Nutri Fabi Montanholi" → "Fabi Montanholi"
  * "Dra. Carla Santos Nutricionista" → "Carla Santos"
  * "Fisio Ana Paula" → "Ana Paula"
  * "Nutricionista Silva" → null (só profissão + sobrenome)

#### 2. profession
- Qualificação profissional específica (ex: Cardiologista, Personal Trainer, Nutricionista Esportiva)
- Pode vir de qualquer fonte
- Se múltiplas, escolha a mais específica | Senão, null

#### 3. email
- Formato válido: *@*.*
- Ignore emails genéricos ou falsos

#### 4. phone
- Aceite: (11) 99999-9999 | 11999999999 | +5511999999999
- Retorne apenas dígitos | Valide DDD brasileiro

#### 5. localização (city, state, address, zip_code)
- Extraia de BIO/WEBSITE
- state: sigla 2 letras (SP, RJ, MG, BA...)
- address: endereço completo com rua, número, complemento
- zip_code: apenas números do CEP (8 dígitos)
- Exemplos:
  * "São Paulo - SP" → city: "São Paulo", state: "SP"
  * "Rua Sergipe, 128 Jardim Vitoria, Itabuna 45605460" → address: "Rua Sergipe, 128 Jardim Vitoria", city: "Itabuna", zip_code: "45605460"
  * "Av. Paulista, 1000 - São Paulo/SP CEP: 01310-100" → address: "Av. Paulista, 1000", city: "São Paulo", state: "SP", zip_code: "01310100"

#### 6. business_category
- Classifique por domínio: saude, beleza, fitness, odontologia, veterinaria, educacao, juridico, consultoria, tecnologia, outros
- Baseie-se em profession e bio
- Ex: "Personal Trainer" → fitness | Se não identificar → null

#### 7. hashtags_bio
- Extraia todas #hashtags (sem #, em minúsculas)
- Ex: "#Saúde #Fisio" → ["saude", "fisio"]

EXEMPLOS:
1. FULL_NAME: "Dr. João Silva", BIO: "Acupuntura #saude\\nSão Paulo-SP\\n📧 joao@clinica.com"
→ {"full_name":"João Silva","profession":"Acupunturista","email":"joao@clinica.com","phone":null,"city":"São Paulo","state":"SP","business_category":"saude","hashtags_bio":["saude"]}

2. FULL_NAME: "Maria Santos - Personal Trainer", BIO: "#fitness #treino\\n(11)98765-4321"
→ {"full_name":"Maria Santos","profession":"Personal Trainer","email":null,"phone":"11987654321","city":null,"state":null,"business_category":"fitness","hashtags_bio":["fitness","treino"]}`
        },
        {
          role: 'user',
          content: `FULL_NAME: ${fullName || 'N/A'}\nBIO: ${bio || 'N/A'}\nWEBSITE: ${website || 'N/A'}`
        }
      ],
      temperature: 0.3,
      max_tokens: 200,
      response_format: { type: "json_object" }
    });

    const result = response.choices[0]?.message?.content;
    if (!result) {
      return { full_name: null, profession: null, email: null, phone: null, city: null, state: null, address: null, zip_code: null, business_category: null, hashtags_bio: [] };
    }

    const parsed = JSON.parse(result);

    // Validar e limpar nome
    let full_name = parsed.full_name || parsed.name || null;
    if (full_name && typeof full_name === 'string') {
      full_name = full_name.trim();
      if (full_name.length < 3) full_name = null;
    }

    // Validar email
    let email = parsed.email || null;
    if (email && !isValidEmail(email)) {
      email = null;
    }

    // Validar e normalizar telefone
    let phone = parsed.phone || parsed.telefone || null;
    if (phone) {
      phone = phone.replace(/\D/g, '');
      if (!isValidPhone(phone)) {
        phone = null;
      }
    }

    // Extrair localização
    let city = parsed.city || null;
    let state = parsed.state || null;

    // Limpar e validar city
    if (city && typeof city === 'string') {
      city = city.trim();
      if (city.length < 3) city = null;
    }

    // Limpar e validar state (deve ser sigla de 2 letras)
    if (state && typeof state === 'string') {
      state = state.trim().toUpperCase();
      if (state.length !== 2) state = null;
    }

    // Extrair endereço
    let address = parsed.address || null;
    if (address && typeof address === 'string') {
      address = address.trim();
      if (address.length < 5) address = null;
    }

    // Extrair CEP (apenas números, 8 dígitos)
    let zip_code = parsed.zip_code || null;
    if (zip_code && typeof zip_code === 'string') {
      zip_code = zip_code.replace(/\D/g, ''); // Remover não-dígitos
      if (zip_code.length !== 8) zip_code = null;
    }

    // Extrair profession (qualificação profissional específica)
    let profession = parsed.profession || null;
    if (profession && typeof profession === 'string') {
      profession = profession.trim();
      if (profession.length < 3) profession = null;
    }

    // Extrair business_category
    let business_category = parsed.business_category || null;
    if (business_category && typeof business_category === 'string') {
      business_category = business_category.trim().toLowerCase();
    }

    // Extrair hashtags da bio
    let hashtags_bio: string[] = [];
    if (Array.isArray(parsed.hashtags_bio)) {
      hashtags_bio = parsed.hashtags_bio
        .filter((tag: any) => typeof tag === 'string' && tag.trim().length > 0)
        .map((tag: string) => tag.trim().toLowerCase());
    }

    return { full_name, profession, email, phone, city, state, address, zip_code, business_category, hashtags_bio };

  } catch (error) {
    console.error('   ⚠️  Erro na API OpenAI:', error instanceof Error ? error.message : 'Erro desconhecido');
    return { full_name: null, profession: null, email: null, phone: null, city: null, state: null, address: null, zip_code: null, business_category: null, hashtags_bio: [] };
  }
}

async function extractNameFromUsername(username: string): Promise<string | null> {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Extraia o nome completo LEGÍVEL a partir de um username do Instagram.

REGRAS:
- Remova underscores, pontos e números
- Capitalize corretamente
- Se tiver "dra" ou "dr", remova e capitalize o nome
- Se for nome de empresa/serviço, capitalize as palavras principais
- Retorne JSON: {"full_name": "..."}

EXEMPLOS:
- "dra.manulemos" → {"full_name": "Manu Lemos"}
- "equilibrium_cursos" → {"full_name": "Equilibrium Cursos"}
- "dr.pedro.vilela" → {"full_name": "Pedro Vilela"}
- "abc.da.to" → {"full_name": "ABC da TO"}`
        },
        {
          role: 'user',
          content: username
        }
      ],
      temperature: 0.3,
      max_tokens: 50,
      response_format: { type: "json_object" }
    });

    const result = response.choices[0]?.message?.content;
    if (!result) return null;

    const parsed = JSON.parse(result);
    const name = parsed.full_name || parsed.name || null;

    return name && name.length >= 3 ? name : null;

  } catch (error) {
    return null;
  }
}

// ============================================
// EXTRAÇÃO DE HASHTAGS COM REGEX
// ============================================

/**
 * Extrai hashtags de uma string usando regex (mais rápido e barato que AI)
 */
function extractHashtagsFromText(text: string): string[] {
  if (!text) return [];

  const hashtagRegex = /#[a-záàâãéèêíïóôõöúçñA-ZÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ\w]+/gi;
  const matches = text.match(hashtagRegex);

  if (!matches) return [];

  // Remover # e converter para lowercase
  return matches.map(tag => tag.substring(1).toLowerCase());
}

// ============================================
// EXTRAÇÃO DE LOCALIZAÇÃO POR DDD
// ============================================

const DDD_TO_LOCATION: Record<number, { city: string; state: string }> = {
  // São Paulo
  11: { city: 'São Paulo', state: 'SP' },
  12: { city: 'São José dos Campos', state: 'SP' },
  13: { city: 'Santos', state: 'SP' },
  14: { city: 'Bauru', state: 'SP' },
  15: { city: 'Sorocaba', state: 'SP' },
  16: { city: 'Ribeirão Preto', state: 'SP' },
  17: { city: 'São José do Rio Preto', state: 'SP' },
  18: { city: 'Presidente Prudente', state: 'SP' },
  19: { city: 'Campinas', state: 'SP' },

  // Rio de Janeiro
  21: { city: 'Rio de Janeiro', state: 'RJ' },
  22: { city: 'Campos dos Goytacazes', state: 'RJ' },
  24: { city: 'Volta Redonda', state: 'RJ' },

  // Espírito Santo
  27: { city: 'Vitória', state: 'ES' },
  28: { city: 'Cachoeiro de Itapemirim', state: 'ES' },

  // Minas Gerais
  31: { city: 'Belo Horizonte', state: 'MG' },
  32: { city: 'Juiz de Fora', state: 'MG' },
  33: { city: 'Governador Valadares', state: 'MG' },
  34: { city: 'Uberlândia', state: 'MG' },
  35: { city: 'Poços de Caldas', state: 'MG' },
  37: { city: 'Divinópolis', state: 'MG' },
  38: { city: 'Montes Claros', state: 'MG' },

  // Paraná
  41: { city: 'Curitiba', state: 'PR' },
  42: { city: 'Ponta Grossa', state: 'PR' },
  43: { city: 'Londrina', state: 'PR' },
  44: { city: 'Maringá', state: 'PR' },
  45: { city: 'Foz do Iguaçu', state: 'PR' },
  46: { city: 'Pato Branco', state: 'PR' },

  // Santa Catarina
  47: { city: 'Joinville', state: 'SC' },
  48: { city: 'Florianópolis', state: 'SC' },
  49: { city: 'Chapecó', state: 'SC' },

  // Rio Grande do Sul
  51: { city: 'Porto Alegre', state: 'RS' },
  53: { city: 'Pelotas', state: 'RS' },
  54: { city: 'Caxias do Sul', state: 'RS' },
  55: { city: 'Santa Maria', state: 'RS' },

  // Distrito Federal e Goiás
  61: { city: 'Brasília', state: 'DF' },
  62: { city: 'Goiânia', state: 'GO' },
  64: { city: 'Rio Verde', state: 'GO' },

  // Tocantins
  63: { city: 'Palmas', state: 'TO' },

  // Mato Grosso
  65: { city: 'Cuiabá', state: 'MT' },
  66: { city: 'Rondonópolis', state: 'MT' },

  // Mato Grosso do Sul
  67: { city: 'Campo Grande', state: 'MS' },

  // Acre
  68: { city: 'Rio Branco', state: 'AC' },

  // Rondônia
  69: { city: 'Porto Velho', state: 'RO' },

  // Bahia
  71: { city: 'Salvador', state: 'BA' },
  73: { city: 'Ilhéus', state: 'BA' },
  74: { city: 'Juazeiro', state: 'BA' },
  75: { city: 'Feira de Santana', state: 'BA' },
  77: { city: 'Vitória da Conquista', state: 'BA' },

  // Sergipe
  79: { city: 'Aracaju', state: 'SE' },

  // Pernambuco
  81: { city: 'Recife', state: 'PE' },
  87: { city: 'Petrolina', state: 'PE' },

  // Alagoas
  82: { city: 'Maceió', state: 'AL' },

  // Paraíba
  83: { city: 'João Pessoa', state: 'PB' },

  // Rio Grande do Norte
  84: { city: 'Natal', state: 'RN' },

  // Ceará
  85: { city: 'Fortaleza', state: 'CE' },
  88: { city: 'Sobral', state: 'CE' },

  // Piauí
  86: { city: 'Teresina', state: 'PI' },
  89: { city: 'Picos', state: 'PI' },

  // Pará
  91: { city: 'Belém', state: 'PA' },
  93: { city: 'Santarém', state: 'PA' },
  94: { city: 'Marabá', state: 'PA' },

  // Amazonas
  92: { city: 'Manaus', state: 'AM' },
  97: { city: 'Coari', state: 'AM' },

  // Roraima
  95: { city: 'Boa Vista', state: 'RR' },

  // Amapá
  96: { city: 'Macapá', state: 'AP' },

  // Maranhão
  98: { city: 'São Luís', state: 'MA' },
  99: { city: 'Imperatriz', state: 'MA' }
};

/**
 * Extrai localização (city/state) a partir do DDD do telefone
 */
function extractLocationFromPhone(phone: string): { city: string | null; state: string | null } {
  if (!phone) return { city: null, state: null };

  const cleanPhone = phone.replace(/\D/g, '');
  let ddd: number;

  // Telefone com código do país (55)
  if (cleanPhone.startsWith('55') && cleanPhone.length >= 12) {
    ddd = parseInt(cleanPhone.substring(2, 4));
  }
  // Telefone sem código do país
  else if (cleanPhone.length >= 10) {
    ddd = parseInt(cleanPhone.substring(0, 2));
  }
  else {
    return { city: null, state: null };
  }

  const location = DDD_TO_LOCATION[ddd];
  return location || { city: null, state: null };
}

// ============================================
// EXTRAÇÃO DE LOCALIZAÇÃO DE HASHTAGS
// ============================================

function extractLocationFromHashtags(hashtags_bio: any[], hashtags_posts: any[]): {
  city: string | null;
  state: string | null;
} {
  const allHashtags = [
    ...(Array.isArray(hashtags_bio) ? hashtags_bio : []),
    ...(Array.isArray(hashtags_posts) ? hashtags_posts : [])
  ].map(h => String(h).toLowerCase());

  // Mapeamento de hashtags para cidades brasileiras
  const cityMap: Record<string, { city: string; state: string }> = {
    'saopaulo': { city: 'São Paulo', state: 'SP' },
    'sp': { city: 'São Paulo', state: 'SP' },
    'riodejaneiro': { city: 'Rio de Janeiro', state: 'RJ' },
    'rio': { city: 'Rio de Janeiro', state: 'RJ' },
    'rj': { city: 'Rio de Janeiro', state: 'RJ' },
    'belohorizonte': { city: 'Belo Horizonte', state: 'MG' },
    'bh': { city: 'Belo Horizonte', state: 'MG' },
    'salvador': { city: 'Salvador', state: 'BA' },
    'brasilia': { city: 'Brasília', state: 'DF' },
    'fortaleza': { city: 'Fortaleza', state: 'CE' },
    'curitiba': { city: 'Curitiba', state: 'PR' },
    'manaus': { city: 'Manaus', state: 'AM' },
    'recife': { city: 'Recife', state: 'PE' },
    'portoalegre': { city: 'Porto Alegre', state: 'RS' },
    'goiania': { city: 'Goiânia', state: 'GO' },
  };

  for (const hashtag of allHashtags) {
    const cleaned = hashtag.replace(/[#\s]/g, '');
    if (cityMap[cleaned]) {
      return cityMap[cleaned];
    }
  }

  return { city: null, state: null };
}

// ============================================
// SCRAPING DE WEBSITE
// ============================================

async function scrapeWebsite(url: string): Promise<{ email: string | null; phone: string | null }> {
  try {
    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      maxRedirects: 3
    });

    const html = response.data;
    const $ = cheerio.load(html);

    // Remover scripts e styles
    $('script, style, noscript').remove();
    const text = $.text();

    // Extrair email com validação (padrões melhorados)
    let email: string | null = null;
    const emailPatterns = [
      /href=["']mailto:([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)["']/gi,
      />([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)</g,
      /\b[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+\b/g
    ];

    for (const pattern of emailPatterns) {
      const matches = Array.from(html.matchAll(pattern)) as RegExpMatchArray[];
      for (const match of matches) {
        const candidate = (match[1] || match[0]).toLowerCase().trim();
        if (isValidEmail(candidate)) {
          email = candidate;
          break;
        }
      }
      if (email) break;
    }

    // Extrair telefone
    let phone: string | null = null;
    const phonePatterns = [
      /\+?55\s*\(?(\d{2})\)?\s*9?\s*\d{4}[-\s]?\d{4}/g,
      /\(?\d{2}\)?\s*9?\s*\d{4}[-\s]?\d{4}/g
    ];

    for (const pattern of phonePatterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        const candidate = match[0].replace(/\D/g, '');
        if (isValidPhone(candidate)) {
          phone = candidate;
          break;
        }
      }
      if (phone) break;
    }

    return { email, phone };

  } catch (error) {
    return { email: null, phone: null };
  }
}

// ============================================
// FUNÇÃO PRINCIPAL DE ENRIQUECIMENTO
// ============================================

/**
 * Enriquece um único lead do Instagram
 * Retorna apenas os dados enriquecidos sem fazer UPDATE no banco
 */
export async function enrichSingleLead(lead: InstagramLead): Promise<EnrichmentResponse> {
  const enriched: EnrichedData = {};
  const sources: string[] = [];

  console.log(`\n🔍 Enriquecendo @${lead.username}`);
  console.log(`   📋 Dados disponíveis: bio=${!!lead.bio}, website=${!!lead.website}, full_name="${lead.full_name || 'N/A'}"`);

  // 1. ANÁLISE COM IA - SEMPRE executar quando houver bio ou website
  // A IA vai limpar full_name, extrair profession, email, phone, etc
  if (lead.bio || lead.website) {
    console.log('   🤖 Analisando full_name, bio e website com AI...');
    const aiContacts = await extractContactsWithAI(lead.full_name || null, lead.bio || null, lead.website || null);
    console.log(`   📊 Resultado da IA:`, JSON.stringify(aiContacts, null, 2));

    if (aiContacts.full_name) {
      // A IA sempre limpa e corrige o full_name (remove títulos, profissões, emojis)
      // Exemplo: "Karine Martins | NUTRICIONISTA 🦋" → "Karine Martins"
      enriched.full_name = aiContacts.full_name;
      const { first_name, last_name } = splitFullName(aiContacts.full_name);
      enriched.first_name = first_name;
      enriched.last_name = last_name;
      sources.push('bio-ai');
      console.log(`   ✅ Nome limpo pela IA: "${aiContacts.full_name}" (original: "${lead.full_name || 'N/A'}")`);
    }

    // Email da bio
    if (aiContacts.email) {
      enriched.email = aiContacts.email;
      sources.push('bio-email');
      console.log(`   ✅ Email encontrado: ${aiContacts.email}`);
    }

    // Telefone da bio
    if (aiContacts.phone) {
      enriched.phone = normalizePhone(aiContacts.phone);
      sources.push('bio-phone');
      console.log(`   ✅ Telefone encontrado: ${enriched.phone}`);
    }

    // Localização da bio (prioridade sobre hashtags)
    if (aiContacts.city) {
      enriched.city = aiContacts.city;
      enriched.state = aiContacts.state;
      sources.push('bio-location');
      console.log(`   ✅ Localização: ${aiContacts.city}${aiContacts.state ? '/' + aiContacts.state : ''}`);
    }

    // Endereço completo
    if (aiContacts.address) {
      enriched.address = aiContacts.address;
      sources.push('bio-address');
      console.log(`   ✅ Endereço: ${aiContacts.address}`);
    }

    // CEP
    if (aiContacts.zip_code) {
      enriched.zip_code = aiContacts.zip_code;
      sources.push('bio-zipcode');
      console.log(`   ✅ CEP: ${aiContacts.zip_code}`);
    }

    // Profession (qualificação profissional específica)
    if (aiContacts.profession) {
      enriched.profession = aiContacts.profession;
      sources.push('bio-profession');
      console.log(`   ✅ Profissão: ${aiContacts.profession}`);
    }

    // Business category da bio
    if (aiContacts.business_category) {
      enriched.business_category = aiContacts.business_category;
      sources.push('bio-category');
      console.log(`   ✅ Categoria: ${aiContacts.business_category}`);
    }

    // Hashtags da bio (guardar as da IA)
    if (aiContacts.hashtags_bio && aiContacts.hashtags_bio.length > 0) {
      enriched.hashtags_bio = aiContacts.hashtags_bio;
      console.log(`   ℹ️  Hashtags da IA: ${aiContacts.hashtags_bio.join(', ')}`);
    }
  }

  // 1.5 HASHTAGS - SEMPRE extrair com REGEX e combinar com IA
  if (lead.bio) {
    const hashtagsFromRegex = extractHashtagsFromText(lead.bio);
    const hashtagsFromAI = enriched.hashtags_bio || [];

    // Combinar hashtags da IA + regex (sem duplicatas)
    const allHashtags = [...new Set([...hashtagsFromAI, ...hashtagsFromRegex])];

    if (allHashtags.length > 0) {
      enriched.hashtags_bio = allHashtags;

      if (hashtagsFromRegex.length > 0 && hashtagsFromAI.length > 0) {
        sources.push('bio-hashtags-combined');
        console.log(`   ✅ Hashtags combinadas (${hashtagsFromAI.length} IA + ${hashtagsFromRegex.length} regex): ${allHashtags.join(', ')}`);
      } else if (hashtagsFromRegex.length > 0) {
        sources.push('bio-hashtags-regex');
        console.log(`   ✅ Hashtags (regex): ${hashtagsFromRegex.join(', ')}`);
      } else {
        sources.push('bio-hashtags-ai');
        console.log(`   ✅ Hashtags (AI): ${hashtagsFromAI.join(', ')}`);
      }
    }
  }

  // 2. NOME - Se não encontrou na bio, tentar extrair do username
  if (!enriched.full_name) {
    console.log('   🤖 Extraindo nome do username...');
    const nameFromUsername = await extractNameFromUsername(lead.username);
    if (nameFromUsername) {
      enriched.full_name = nameFromUsername;
      const { first_name, last_name } = splitFullName(nameFromUsername);
      enriched.first_name = first_name;
      enriched.last_name = last_name;
      sources.push('username-ai');
      console.log(`   ✅ Nome do username: ${nameFromUsername}`);
    }
  }

  // 3. TELEFONE - Tentar extrair de URL WhatsApp
  if (!enriched.phone && lead.website) {
    const phoneFromWhatsApp = extractPhoneFromWhatsAppUrl(lead.website);
    if (phoneFromWhatsApp) {
      enriched.phone = normalizePhone(phoneFromWhatsApp);
      sources.push('whatsapp-url');
      console.log(`   ✅ Telefone do WhatsApp: ${enriched.phone}`);
    }
  }

  // 4. EMAIL/TELEFONE - Scraping de website
  if (lead.website && (!enriched.email || !enriched.phone)) {
    console.log('   🌐 Fazendo scraping do website...');
    const websiteData = await scrapeWebsite(lead.website);

    if (!enriched.email && websiteData.email) {
      enriched.email = websiteData.email;
      sources.push('website-email');
      console.log(`   ✅ Email do site: ${websiteData.email}`);
    }

    if (!enriched.phone && websiteData.phone) {
      enriched.phone = normalizePhone(websiteData.phone);
      sources.push('website-phone');
      console.log(`   ✅ Telefone do site: ${enriched.phone}`);
    }
  }

  // 5. LOCALIZAÇÃO - Extrair do DDD do telefone (prioridade média)
  if (!enriched.city && enriched.phone) {
    const locationFromPhone = extractLocationFromPhone(enriched.phone);
    if (locationFromPhone.city) {
      enriched.city = locationFromPhone.city;
      enriched.state = locationFromPhone.state;
      sources.push('phone-ddd');
      console.log(`   ✅ Localização (DDD): ${locationFromPhone.city}/${locationFromPhone.state}`);
    }
  }

  // 6. LOCALIZAÇÃO - Extrair de hashtags (menor prioridade)
  if (!enriched.city && (lead.hashtags_bio || lead.hashtags_posts)) {
    const locationFromHashtags = extractLocationFromHashtags(
      lead.hashtags_bio || [],
      lead.hashtags_posts || []
    );
    if (locationFromHashtags.city) {
      enriched.city = locationFromHashtags.city;
      enriched.state = locationFromHashtags.state;
      sources.push('hashtags');
      console.log(`   ✅ Localização (hashtags): ${locationFromHashtags.city}/${locationFromHashtags.state}`);
    }
  }

  // Determinar se houve enriquecimento significativo
  const hasChanges = !!(
    enriched.full_name ||
    enriched.email ||
    enriched.phone ||
    enriched.city
  );

  console.log(hasChanges ? '   ✅ Lead enriquecido' : '   ℹ️  Sem novos dados');

  return {
    id: lead.id,
    username: lead.username,
    enriched,
    sources,
    should_mark_enriched: true // Sempre marcar como processado, mesmo que não encontrou dados
  };
}
