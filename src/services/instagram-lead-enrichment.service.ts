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
  bio?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  hashtags_bio?: any[];
  hashtags_posts?: any[];
  segment?: string | null;
}

interface EnrichedData {
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  state?: string | null;
  address?: string | null;
  zip_code?: string | null;
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

async function extractContactsWithAI(bio: string): Promise<{
  full_name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
}> {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Você é um especialista em extrair informações de contato de biografias do Instagram.

TAREFA:
Extraia NOME COMPLETO, EMAIL, TELEFONE e LOCALIZAÇÃO (cidade/estado) da bio, se existirem.

REGRAS DE EXTRAÇÃO:

1. NOME:
   - Extraia apenas se houver nome de PESSOA ou EMPRESA clara
   - Ignore apenas username ou apelidos vagos
   - Exemplo válido: "João Silva", "Dr. Pedro", "Clínica Bem Estar"
   - Exemplo inválido: "Massoterapia", "Receitas"

2. EMAIL:
   - Formato válido: xxx@dominio.com
   - Ignore emails genéricos/falsos

3. TELEFONE:
   - Formatos aceitos: (11) 99999-9999, 11999999999, +5511999999999
   - Retorne apenas números (sem formatação)
   - Valide DDD brasileiro

4. LOCALIZAÇÃO:
   - Procure por menções a cidade/estado na bio
   - Exemplos: "São Paulo - SP", "Rio de Janeiro/RJ", "Salvador, BA", "Curitiba"
   - Extraia city e state separadamente
   - Use sigla de 2 letras para state (SP, RJ, MG, etc)

RESPOSTA:
Retorne JSON com: {"full_name": "...", "email": "...", "phone": "...", "city": "...", "state": "..."}
Use null para campos não encontrados.

EXEMPLOS:
- "Dr. João Silva | Acupuntura\nSão Paulo - SP\n📧 joao@clinica.com" → {"full_name": "João Silva", "email": "joao@clinica.com", "phone": null, "city": "São Paulo", "state": "SP"}
- "Massoterapia • Agende: (11) 98765-4321" → {"full_name": null, "email": null, "phone": "11987654321", "city": null, "state": null}
- "João Santos | Salvador, BA\nWhatsApp: (71) 98765-4321" → {"full_name": "João Santos", "email": null, "phone": "71987654321", "city": "Salvador", "state": "BA"}`
        },
        {
          role: 'user',
          content: bio
        }
      ],
      temperature: 0.3,
      max_tokens: 200,
      response_format: { type: "json_object" }
    });

    const result = response.choices[0]?.message?.content;
    if (!result) {
      return { full_name: null, email: null, phone: null, city: null, state: null };
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

    return { full_name, email, phone, city, state };

  } catch (error) {
    console.error('   ⚠️  Erro na API OpenAI:', error instanceof Error ? error.message : 'Erro desconhecido');
    return { full_name: null, email: null, phone: null, city: null, state: null };
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

  // 1. NOME - Tentar extrair da bio com AI primeiro
  if (lead.bio) {
    console.log('   🤖 Extraindo nome da bio com AI...');
    const aiContacts = await extractContactsWithAI(lead.bio);

    if (aiContacts.full_name) {
      enriched.full_name = aiContacts.full_name;
      const { first_name, last_name } = splitFullName(aiContacts.full_name);
      enriched.first_name = first_name;
      enriched.last_name = last_name;
      sources.push('bio-ai');
      console.log(`   ✅ Nome encontrado: ${aiContacts.full_name}`);
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

  // 5. LOCALIZAÇÃO - Extrair de hashtags (menor prioridade)
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
