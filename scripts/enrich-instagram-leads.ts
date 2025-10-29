/**
 * Script para enriquecer leads existentes do Instagram
 * Extrai email/phone da bio e websites
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import OpenAI from 'openai';
import { writeFileSync } from 'fs';
import { join } from 'path';

// Carregar variáveis de ambiente
config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Inicializar OpenAI para extração de nomes
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!
});

// Custos do GPT-4o-mini (Dezembro 2024)
const GPT4O_MINI_INPUT_COST = 0.150 / 1_000_000;   // $0.150 por 1M tokens
const GPT4O_MINI_OUTPUT_COST = 0.600 / 1_000_000;  // $0.600 por 1M tokens

// Rastreamento de custos
interface CostMetrics {
  total_calls: number;
  name_extraction_calls: number;
  contact_extraction_calls: number;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  total_tokens: number;
  total_cost_usd: number;
}

const costMetrics: CostMetrics = {
  total_calls: 0,
  name_extraction_calls: 0,
  contact_extraction_calls: 0,
  total_prompt_tokens: 0,
  total_completion_tokens: 0,
  total_tokens: 0,
  total_cost_usd: 0
};

interface InstagramLead {
  id: number;
  username: string;
  full_name: string | null;
  bio: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  hashtags_bio: string[] | null;
  hashtags_posts: string[] | null;
  segment: string | null;
}

interface EnrichmentResult {
  id: number;
  username: string;
  original: {
    full_name: string | null;
    email: string | null;
    phone: string | null;
  };
  enriched: {
    full_name: string | null;
    email: string | null;
    phone: string | null;
    first_name: string | null;
    last_name: string | null;
    city: string | null;
    state: string | null;
    neighborhood: string | null;
    address: string | null;
    zip_code: string | null;
  };
  sources: string[];
  consent_indicators: string[]; // Indicadores de consentimento para marketing
}

/**
 * Valida se um email é real (não é falso positivo)
 */
function isValidEmail(email: string): boolean {
  // Lista de TLDs válidos (principais)
  const validTLDs = [
    'com', 'br', 'net', 'org', 'edu', 'gov', 'io', 'co', 'app', 'dev',
    'ai', 'tech', 'info', 'biz', 'me', 'tv', 'cc', 'xyz', 'online',
    'site', 'website', 'store', 'shop', 'cloud', 'digital', 'email'
  ];

  // Extensões de arquivo que devem ser rejeitadas
  const fileExtensions = [
    'js', 'ts', 'jsx', 'tsx', 'css', 'scss', 'html', 'xml',
    'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico',
    'mp4', 'avi', 'mov', 'pdf', 'doc', 'docx', 'zip', 'rar'
  ];

  // Padrões que indicam falso positivo
  const invalidPatterns = [
    /@\d+\.\d+/,              // npm packages (ex: @1.16.1)
    /@2x\./,                  // imagens retina (ex: image@2x.png)
    /\.(js|css|png|jpg|webp)@/, // extensões de arquivo antes do @
    /@[^.]+\.(js|css|png)/    // extensões de arquivo depois do @
  ];

  // Verificar padrões inválidos
  for (const pattern of invalidPatterns) {
    if (pattern.test(email)) {
      return false;
    }
  }

  // Extrair TLD
  const parts = email.split('.');
  const tld = parts[parts.length - 1].toLowerCase();

  // Verificar se é extensão de arquivo
  if (fileExtensions.includes(tld)) {
    return false;
  }

  // Verificar se TLD é válido
  if (!validTLDs.includes(tld)) {
    return false;
  }

  // Verificar formato básico
  const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(email)) {
    return false;
  }

  // Rejeitar emails genéricos/automáticos
  const genericPrefixes = ['noreply', 'no-reply', 'donotreply', 'mailer', 'daemon'];
  const localPart = email.split('@')[0].toLowerCase();
  if (genericPrefixes.some(prefix => localPart.includes(prefix))) {
    return false;
  }

  return true;
}

/**
 * Extrai email da bio usando regex
 */
function extractEmailFromBio(bio: string): string | null {
  if (!bio) return null;

  // Padrões de email
  const patterns = [
    /\b[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+\b/,
    /\b[a-zA-Z0-9._-]+\s*\[\s*at\s*\]\s*[a-zA-Z0-9._-]+\s*\[\s*dot\s*\]\s*[a-zA-Z0-9_-]+\b/i,
    /contato:\s*([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/i,
    /email:\s*([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/i,
    /📧\s*([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/i,
    /✉️\s*([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/i
  ];

  for (const pattern of patterns) {
    const match = bio.match(pattern);
    if (match) {
      const email = match[1] || match[0];
      // Limpar espaços e caracteres especiais
      const cleaned = email.replace(/\s+/g, '').replace(/\[at\]/gi, '@').replace(/\[dot\]/gi, '.');

      if (cleaned.includes('@') && cleaned.includes('.')) {
        const lowercased = cleaned.toLowerCase();

        // Validar email antes de retornar
        if (isValidEmail(lowercased)) {
          return lowercased;
        }
      }
    }
  }

  return null;
}

/**
 * Valida se um telefone é real (formato brasileiro ou internacional válido)
 */
function isValidPhone(phone: string): boolean {
  const length = phone.length;

  // Padrão ITU-T E.164: mínimo 8 dígitos, máximo 15 dígitos
  if (length < 8 || length > 15) {
    return false;
  }

  // REJEITAR: IDs do Facebook/Instagram/Threads (começam com 756665, 169109, etc.)
  const fbInstagramPatterns = [
    /^756665/,  // Facebook/Instagram tracking IDs
    /^169109/,  // Facebook/Instagram session IDs
    /^532874/,  // Outros IDs falsos observados
    /^681454/,
    /^100201/,
    /^6446901002$/, // Threads.com ID fake (CRÍTICO: aparece em TODOS os perfis threads.com)
    /^64469/       // Outros IDs do Threads.com
  ];

  for (const pattern of fbInstagramPatterns) {
    if (pattern.test(phone)) {
      return false;
    }
  }

  // Número local sem DDD: 8-9 dígitos
  // Ex: 99999999 ou 999999999
  if (length >= 8 && length <= 9) {
    return true;
  }

  // Telefone local brasileiro: 10-11 dígitos (DDD + número)
  // Ex: 1199999999 ou 11999999999
  if (length >= 10 && length <= 11) {
    const ddd = parseInt(phone.substring(0, 2));
    // Lista COMPLETA de DDDs brasileiros válidos
    const validDDDs = [
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
      68, 69, // Acre/Rondônia
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
      98, 99  // Maranhão
    ];

    if (validDDDs.includes(ddd)) {
      return true;
    }
  }

  // Telefone internacional com código do país: 12-15 dígitos (padrão ITU-T E.164)
  // Ex: 5511999999999 (Brasil - 13 dígitos)
  if (length >= 12 && length <= 15) {
    // Brasil (código 55): 13 dígitos é padrão
    if (phone.startsWith('55') && length === 13) {
      const ddd = parseInt(phone.substring(2, 4));
      // Lista COMPLETA de DDDs brasileiros válidos
      const validDDDs = [
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
        68, 69, // Acre/Rondônia
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
        98, 99  // Maranhão
      ];

      if (validDDDs.includes(ddd)) {
        return true;
      }
    }

    // EUA/Canadá (código 1): 11 dígitos
    if (phone.startsWith('1') && length === 11) {
      return true;
    }

    // Outros países com código de 2 dígitos: validar códigos conhecidos
    const validCountryCodes = [
      44,  // UK
      49,  // Germany
      33,  // France
      39,  // Italy
      34,  // Spain
      351, // Portugal
      52,  // Mexico
      54,  // Argentina
      56,  // Chile
      57,  // Colombia
    ];

    const countryCode2 = parseInt(phone.substring(0, 2));
    const countryCode3 = parseInt(phone.substring(0, 3));

    if (validCountryCodes.includes(countryCode2) || validCountryCodes.includes(countryCode3)) {
      return true;
    }
  }

  return false;
}

/**
 * Extrai telefone da bio usando regex
 */
function extractPhoneFromBio(bio: string): string | null {
  if (!bio) return null;

  // Padrões de telefone (Brasil e internacional) - MELHORADOS
  const patterns = [
    // Brasil com código país
    /\+?\s*55\s*\(?\d{2}\)?\s*\d{4,5}[-\s]?\d{4}/,  // +55 (11) 99999-9999
    /\+?\s*55\s*\d{2}\s*\d{4,5}[-\s]?\d{4}/,        // +55 11 99999-9999 (sem parênteses)

    // Brasil local (com DDD)
    /\(?\d{2}\)?\s*\d{4,5}[-\s]?\d{4}/,             // (11) 99999-9999 ou 11 99999-9999
    /\d{2}\s+\d{4,5}[-\s]?\d{4}/,                   // 11 99999-9999 (com espaço)
    /\d{10,11}(?!\d)/,                               // 11999999999 (sem separadores)

    // Padrões com texto antes
    /whatsapp:?\s*\+?\d[\d\s()-]{8,}/i,             // WhatsApp: +55...
    /zap:?\s*\+?\d[\d\s()-]{8,}/i,                  // Zap: +55...
    /tel(?:efone)?:?\s*\+?\d[\d\s()-]{8,}/i,        // Tel: ou Telefone:
    /contato:?\s*\+?\d[\d\s()-]{8,}/i,              // Contato:
    /fone:?\s*\+?\d[\d\s()-]{8,}/i,                 // Fone:
    /ligu?e?:?\s*\+?\d[\d\s()-]{8,}/i,              // Ligue: ou Liga:
    /agende:?\s*\+?\d[\d\s()-]{8,}/i,               // Agende:

    // Emojis
    /📱\s*\+?\d[\d\s()-]{8,}/,                       // 📱
    /☎️\s*\+?\d[\d\s()-]{8,}/,                       // ☎️
    /📞\s*\+?\d[\d\s()-]{8,}/,                       // 📞
    /📲\s*\+?\d[\d\s()-]{8,}/,                       // 📲

    // Internacional
    /\+\d{1,3}\s?\d{8,14}/                           // +1 555 123 4567
  ];

  for (const pattern of patterns) {
    const match = bio.match(pattern);
    if (match) {
      // Extrair apenas dígitos
      const phone = match[0].replace(/\D+/g, '');

      // Validar formato antes de retornar
      if (isValidPhone(phone)) {
        return phone;
      }
    }
  }

  return null;
}

/**
 * Tenta extrair email/phone do website
 */
async function extractFromWebsite(websiteUrl: string): Promise<{ email: string | null; phone: string | null }> {
  try {
    // Limpar URL do Instagram (remover wrapper)
    let cleanUrl = websiteUrl;
    if (websiteUrl.includes('l.instagram.com')) {
      const urlMatch = websiteUrl.match(/u=([^&]+)/);
      if (urlMatch) {
        cleanUrl = decodeURIComponent(urlMatch[1]);
      }
    }

    // Skip URLs de redes sociais (threads.com SEMPRE tem telefone fake 6446901002)
    const skipDomains = [
      'instagram.com',
      'facebook.com',
      'twitter.com',
      'tiktok.com',
      'linkedin.com',
      'youtube.com',
      'linktr.ee',
      'beacons.ai',
      'threads.com'  // CRÍTICO: Sempre retorna ID fake 6446901002
    ];
    if (skipDomains.some(domain => cleanUrl.includes(domain))) {
      return { email: null, phone: null };
    }

    console.log(`   📄 Buscando dados em: ${cleanUrl}`);

    // Fazer requisição HTTP
    const response = await axios.get(cleanUrl, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const html = response.data;

    // Extrair email com validação
    let email: string | null = null;
    const emailMatches = html.match(/\b[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+\b/g);
    if (emailMatches) {
      // Tentar todos os matches até encontrar um válido
      for (const match of emailMatches) {
        const candidate = match.toLowerCase();
        if (isValidEmail(candidate)) {
          email = candidate;
          break;
        }
      }
    }

    // Extrair telefone com validação
    let phone: string | null = null;
    const phonePatterns = [
      /\+?\d{2}\s?\(?\d{2}\)?\s?\d{4,5}[-\s]?\d{4}/,
      /\(?\d{2,3}\)?\s?\d{4,5}[-\s]?\d{4}/,
      /\+\d{1,3}\s?\d{8,14}/
    ];

    for (const pattern of phonePatterns) {
      const match = html.match(pattern);
      if (match) {
        const candidate = match[0].replace(/\D+/g, '');
        // Validar com a nova função
        if (isValidPhone(candidate)) {
          phone = candidate;
          break;
        }
      }
    }

    return { email, phone };

  } catch (error: any) {
    console.log(`   ⚠️  Erro ao acessar website: ${error.message}`);
    return { email: null, phone: null };
  }
}

/**
 * Usa GPT-4o Mini para extrair NOME COMPLETO, email e telefone da bio
 */
async function extractContactsWithAI(bio: string): Promise<{ full_name: string | null; email: string | null; phone: string | null }> {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Você é um especialista em extrair informações de contato de biografias do Instagram.

TAREFA:
Extraia NOME COMPLETO, EMAIL e TELEFONE da bio, se existirem.

REGRAS IMPORTANTES:
1. NOME COMPLETO (CRÍTICO):
   - Procure por nome próprio de pessoa/profissional na primeira linha da bio
   - Ignore nomes de clínicas/empresas SE houver nome de pessoa
   - Exemplos: "Dra. Maria Silva", "João Santos - Nutricionista", "Ana Costa"
   - Se só tem nome de clínica/empresa, retorne null

2. Identifique emails mesmo escritos de forma criativa:
   - "arroba" ou "@" = @
   - "ponto" ou "." = .
   - Espaços entre caracteres
   - Underscores, hífens, números

3. Identifique telefones em QUALQUER formato:
   - Com/sem DDD, com/sem código do país
   - Com/sem parênteses, espaços, hífens
   - Após emojis (📱, ☎️, 📞, 📲)
   - Após palavras-chave (WhatsApp, Zap, Tel, Fone, Contato, Agende, Ligue)

4. Ignore emails genéricos (noreply@, no-reply@, info@)
5. Retorne SOMENTE JSON: {"full_name": "...", "email": "...", "phone": "..."}
6. Se não encontrar, use null

EXEMPLOS PRÁTICOS:
- "Dra. Maria Silva\n📧 contato@gmail.com | 📱11 99999-9999" → {"full_name": "Maria Silva", "email": "contato@gmail.com", "phone": "11999999999"}
- "João Santos - Dermatologista\nWhatsApp: (11) 98765-4321" → {"full_name": "João Santos", "email": null, "phone": "11987654321"}
- "Clínica Beleza\nEmail: clinica@outlook.com" → {"full_name": null, "email": "clinica@outlook.com", "phone": null}
- "Ana Costa | Nutricionista\n📱 11 9 8765-4321" → {"full_name": "Ana Costa", "email": null, "phone": "11987654321"}`
        },
        {
          role: 'user',
          content: `Bio: ${bio}`
        }
      ],
      temperature: 0.3,
      max_tokens: 150,
      response_format: { type: "json_object" }
    });

    const result = response.choices[0]?.message?.content?.trim();

    // Rastrear custos da API
    if (response.usage) {
      costMetrics.total_calls++;
      costMetrics.contact_extraction_calls++;
      costMetrics.total_prompt_tokens += response.usage.prompt_tokens;
      costMetrics.total_completion_tokens += response.usage.completion_tokens;
      costMetrics.total_tokens += response.usage.total_tokens;
      const callCost = (response.usage.prompt_tokens * GPT4O_MINI_INPUT_COST) +
                       (response.usage.completion_tokens * GPT4O_MINI_OUTPUT_COST);
      costMetrics.total_cost_usd += callCost;
    }

    if (!result) {
      return { full_name: null, email: null, phone: null };
    }

    const parsed = JSON.parse(result);

    // Extrair e limpar nome completo
    let full_name = parsed.full_name;
    if (full_name && typeof full_name === 'string') {
      full_name = full_name.trim();
      // Remover títulos profissionais (Dr., Dra., etc.)
      full_name = full_name.replace(/^(Dr\.?a?|Professor\.?a?)\s+/i, '').trim();
      if (full_name.length < 3) {
        full_name = null;
      }
    } else {
      full_name = null;
    }

    // Validar email extraído
    let email = parsed.email;
    if (email && !isValidEmail(email)) {
      email = null;
    }

    // Validar telefone extraído
    let phone = parsed.phone;
    if (phone) {
      // Limpar o telefone (remover não-dígitos)
      phone = phone.replace(/\D+/g, '');
      if (!isValidPhone(phone)) {
        phone = null;
      }
    }

    return { full_name, email, phone };

  } catch (error: any) {
    console.log(`   ⚠️  Erro ao usar AI para extrair contatos: ${error.message}`);
    return { full_name: null, email: null, phone: null };
  }
}

/**
 * Usa GPT-4o Mini para extrair nome de pessoa do username
 */
async function extractNameWithAI(username: string): Promise<string | null> {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Você é um especialista em extrair nomes legíveis de usernames do Instagram.

TAREFA:
Extraia o NOME COMPLETO do username (pessoa OU empresa), separando palavras corretamente e removendo apenas prefixos profissionais desnecessários.

REGRAS IMPORTANTES:
1. SEMPRE extraia um nome legível - NUNCA retorne "NONE"
2. Separe nomes compostos MESMO SEM espaços (ex: "analuiza" → "Ana Luiza", "boaforma" → "Boa Forma")
3. Ignore underscores no início/fim (ex: "_alanguimmaraes" → "Alan Guimarães", "matheussonda_" → "Matheus Sonda")
4. Underscores NO MEIO separam palavras (ex: "castro_mandinha" → "Castro Mandinha", "clinica_boaforma" → "Clinica Boa Forma")
5. Remova APENAS prefixos profissionais redundantes quando o nome já indica a profissão:
   - "nutricionistajuliana" → "Juliana" (redundante)
   - "clinica_boaforma" → "Clinica Boa Forma" (NÃO remover - faz parte do nome)
   - "academia_silva" → "Academia Silva" (NÃO remover - faz parte do nome)
6. Retorne o nome capitalizado, com acentos corrigidos quando aplicável
7. Para empresas, mantenha o tipo no nome (Clínica, Academia, Espaço, etc.)

EXEMPLOS:
- "nutricionistajulianacorrea" → "Juliana Correa"
- "dra.silvialeitefaria" → "Silvia Leite Faria"
- "personaltrainer.bianca" → "Bianca"
- "clinica_boaforma" → "Clinica Boa Forma"
- "academia_silva" → "Academia Silva"
- "espacosaude" → "Espaço Saúde"
- "centromedico" → "Centro Médico"
- "analuizaantunes" → "Ana Luiza Antunes"
- "_alanguimmaraes" → "Alan Guimarães"
- "malumorini" → "Malu Morini"
- "castro_mandinha" → "Castro Mandinha"
- "matheussonda_" → "Matheus Sonda"
- "dihsofia" → "Dih Sofia"
- "nathalia.sto" → "Nathalia Sto"
- "santana.matheuss" → "Santana Matheus"
- "musculacaoeremedio" → "Musculação e Remédio"
- "cortes_musculacao" → "Cortes Musculação"
- "dicas.muscular" → "Dicas Muscular"`
        },
        {
          role: 'user',
          content: username
        }
      ],
      temperature: 0.3,
      max_tokens: 50
    });

    const result = response.choices[0]?.message?.content?.trim();

    // Rastrear custos da API
    if (response.usage) {
      costMetrics.total_calls++;
      costMetrics.name_extraction_calls++;
      costMetrics.total_prompt_tokens += response.usage.prompt_tokens;
      costMetrics.total_completion_tokens += response.usage.completion_tokens;
      costMetrics.total_tokens += response.usage.total_tokens;
      const callCost = (response.usage.prompt_tokens * GPT4O_MINI_INPUT_COST) +
                       (response.usage.completion_tokens * GPT4O_MINI_OUTPUT_COST);
      costMetrics.total_cost_usd += callCost;
    }

    if (!result || result.length < 3) {
      return null;
    }

    return result;

  } catch (error: any) {
    console.log(`   ⚠️  Erro ao usar AI para extrair nome: ${error.message}`);
    return null;
  }
}

/**
 * Extrai um nome legível do username do Instagram (método regex)
 */
function extractFullNameFromUsername(username: string): string {
  // Lista de prefixos profissionais para remover
  const professionalPrefixes = [
    'nutricionista', 'nutri', 'nutrição', 'nutricao',
    'dr', 'dra', 'doutor', 'doutora', 'medico', 'medica',
    'fisioterapeuta', 'fisio', 'fisioterapia',
    'personal', 'personaltrainer', 'treinador', 'treinadora', 'trainer',
    'psicologo', 'psicologa', 'psi', 'psiquiatra',
    'dentista', 'odonto', 'ortodontista',
    'dermatologista', 'dermato', 'derma',
    'advogado', 'advogada', 'adv',
    'professor', 'professora', 'prof',
    'coach', 'coaching',
    'clinica', 'clinic', 'espaco', 'studio', 'academia',
    'oficial', 'official'
  ];

  // Guardar o original para detectar camelCase
  let original = username;
  let name = username.toLowerCase();

  // Remover prefixos profissionais (tentar os mais longos primeiro)
  const sortedPrefixes = professionalPrefixes.sort((a, b) => b.length - a.length);
  for (const prefix of sortedPrefixes) {
    // Remover no início
    if (name.startsWith(prefix)) {
      name = name.substring(prefix.length);
      original = original.substring(prefix.length);
    }
    // Remover no final
    if (name.endsWith(prefix)) {
      name = name.substring(0, name.length - prefix.length);
      original = original.substring(0, original.length - prefix.length);
    }
  }

  // Detectar camelCase no original e adicionar espaços
  // Ex: "julianaCorrea" → "juliana Correa"
  original = original.replace(/([a-z])([A-Z])/g, '$1 $2');

  // Usar o original processado com camelCase
  name = original.toLowerCase();

  // Remover underscores e pontos, substituir por espaços
  name = name.replace(/[._]/g, ' ');

  // Remover números e caracteres especiais no final
  name = name.replace(/\d+$/, '').trim();

  // Remover números isolados
  name = name.replace(/\b\d+\b/g, '').trim();

  // Remover múltiplos espaços
  name = name.replace(/\s+/g, ' ');

  // Capitalizar cada palavra
  name = name
    .split(' ')
    .filter(word => word.length > 0)
    .map(word => {
      // Manter siglas em uppercase (2 letras ou menos)
      if (word.length <= 2) {
        return word.toUpperCase();
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ')
    .trim();

  // Se ficou muito curto ou vazio, retornar username original
  if (name.length < 3) {
    return username;
  }

  return name;
}

/**
 * Extrai cidade e estado de hashtags
 */
function extractCityStateFromHashtags(hashtags: string[] | null): { city: string | null; state: string | null; neighborhood: string | null } {
  if (!hashtags || hashtags.length === 0) {
    return { city: null, state: null, neighborhood: null };
  }

  // Mapa de cidades brasileiras principais (lowercase)
  const cityMap: Record<string, { city: string; state: string }> = {
    'saopaulo': { city: 'São Paulo', state: 'SP' },
    'riodejaneiro': { city: 'Rio de Janeiro', state: 'RJ' },
    'belohorizonte': { city: 'Belo Horizonte', state: 'MG' },
    'brasilia': { city: 'Brasília', state: 'DF' },
    'curitiba': { city: 'Curitiba', state: 'PR' },
    'fortaleza': { city: 'Fortaleza', state: 'CE' },
    'salvador': { city: 'Salvador', state: 'BA' },
    'recife': { city: 'Recife', state: 'PE' },
    'portoalegre': { city: 'Porto Alegre', state: 'RS' },
    'manaus': { city: 'Manaus', state: 'AM' },
    'goiania': { city: 'Goiânia', state: 'GO' },
    'campinas': { city: 'Campinas', state: 'SP' },
    'natal': { city: 'Natal', state: 'RN' },
    'florianopolis': { city: 'Florianópolis', state: 'SC' },
    'vitoria': { city: 'Vitória', state: 'ES' }
  };

  // Bairros conhecidos do Rio de Janeiro e São Paulo
  const neighborhoodMap: Record<string, { neighborhood: string; city: string; state: string }> = {
    'barradatijuca': { neighborhood: 'Barra da Tijuca', city: 'Rio de Janeiro', state: 'RJ' },
    'copacabana': { neighborhood: 'Copacabana', city: 'Rio de Janeiro', state: 'RJ' },
    'ipanema': { neighborhood: 'Ipanema', city: 'Rio de Janeiro', state: 'RJ' },
    'leblon': { neighborhood: 'Leblon', city: 'Rio de Janeiro', state: 'RJ' },
    'botafogo': { neighborhood: 'Botafogo', city: 'Rio de Janeiro', state: 'RJ' },
    'tucuruvi': { neighborhood: 'Tucuruvi', city: 'São Paulo', state: 'SP' },
    'moema': { neighborhood: 'Moema', city: 'São Paulo', state: 'SP' },
    'pinheiros': { neighborhood: 'Pinheiros', city: 'São Paulo', state: 'SP' },
    'vilamariana': { neighborhood: 'Vila Mariana', city: 'São Paulo', state: 'SP' },
    'zonanorte': { neighborhood: 'Zona Norte', city: 'São Paulo', state: 'SP' },
    'zonasul': { neighborhood: 'Zona Sul', city: 'São Paulo', state: 'SP' }
  };

  let city: string | null = null;
  let state: string | null = null;
  let neighborhood: string | null = null;

  for (const tag of hashtags) {
    const tagLower = tag.toLowerCase().replace(/[^a-z]/g, '');

    // Verificar bairros primeiro (mais específico)
    if (neighborhoodMap[tagLower]) {
      neighborhood = neighborhoodMap[tagLower].neighborhood;
      city = neighborhoodMap[tagLower].city;
      state = neighborhoodMap[tagLower].state;
      break; // Bairro é mais específico, podemos parar
    }

    // Verificar cidades
    if (cityMap[tagLower]) {
      city = cityMap[tagLower].city;
      state = cityMap[tagLower].state;
    }
  }

  return { city, state, neighborhood };
}

/**
 * Extrai telefone de link do WhatsApp
 */
function extractPhoneFromWhatsAppLink(websiteUrl: string): string | null {
  if (!websiteUrl) return null;

  // Padrões de links WhatsApp
  const patterns = [
    /wa\.me\/(\d+)/,
    /whatsapp\.com\/send\?phone=(\d+)/,
    /api\.whatsapp\.com\/send\?phone=(\d+)/,
    /message\/([A-Z0-9]+)/i  // WhatsApp Business link code
  ];

  for (const pattern of patterns) {
    const match = websiteUrl.match(pattern);
    if (match && match[1]) {
      const phone = match[1].replace(/\D+/g, '');
      if (isValidPhone(phone)) {
        return phone;
      }
    }
  }

  return null;
}

/**
 * Detecta se full_name é na verdade um endereço
 */
function extractAddressFromFullName(fullName: string): { address: string | null; city: string | null; state: string | null; zipCode: string | null } {
  if (!fullName) {
    return { address: null, city: null, state: null, zipCode: null };
  }

  // Padrões que indicam endereço
  const addressIndicators = [
    /\b(rua|av|avenida|alameda|travessa|praça|largo)\b/i,
    /\d{5}-?\d{3}/, // CEP
    /\b(brasil|brazil)\b/i,
    /,\s*\d+\s*,/ // Número de endereço
  ];

  const hasAddressIndicator = addressIndicators.some(pattern => pattern.test(fullName));

  if (!hasAddressIndicator) {
    return { address: null, city: null, state: null, zipCode: null };
  }

  // Extrair CEP
  const zipMatch = fullName.match(/(\d{5}-?\d{3})/);
  const zipCode = zipMatch ? zipMatch[1].replace('-', '') : null;

  // Extrair cidade (geralmente antes de "Brazil" ou após vírgula)
  let city: string | null = null;
  const cityMatch = fullName.match(/,\s*([^,]+),?\s*(Brazil|Brasil)?/i);
  if (cityMatch) {
    city = cityMatch[1].trim();
  }

  // Tentar extrair estado (sigla de 2 letras)
  const stateMatch = fullName.match(/\b([A-Z]{2})\b/);
  const state = stateMatch ? stateMatch[1] : null;

  return {
    address: fullName,
    city,
    state,
    zipCode
  };
}

/**
 * Separa primeiro nome e sobrenome
 */
function splitFirstLastName(fullName: string): { firstName: string | null; lastName: string | null } {
  if (!fullName || fullName.length < 3) {
    return { firstName: null, lastName: null };
  }

  const parts = fullName.trim().split(/\s+/);

  if (parts.length === 1) {
    return { firstName: parts[0], lastName: null };
  }

  const firstName = parts[0];
  const lastName = parts.slice(1).join(' ');

  return { firstName, lastName };
}

/**
 * Enriquece um lead específico
 */
async function enrichLead(lead: InstagramLead): Promise<EnrichmentResult> {
  const result: EnrichmentResult = {
    id: lead.id,
    username: lead.username,
    original: {
      full_name: lead.full_name,
      email: lead.email,
      phone: lead.phone
    },
    enriched: {
      full_name: lead.full_name,
      email: lead.email,
      phone: lead.phone,
      first_name: null,
      last_name: null,
      city: null,
      state: null,
      neighborhood: null,
      address: null,
      zip_code: null
    },
    sources: [],
    consent_indicators: []
  };

  // Detectar indicadores de consentimento para marketing
  result.consent_indicators = detectConsentIndicators(lead.bio, lead.website);

  // 1. TENTAR EXTRAIR NOME + EMAIL + TELEFONE DA BIO COM AI (PRIORIDADE MÁXIMA)
  if (lead.bio && lead.bio.length > 20) {
    console.log(`   🤖 Usando AI para extrair nome/contatos da bio`);
    const aiContacts = await extractContactsWithAI(lead.bio);

    // 1.1. Nome da bio tem PRIORIDADE sobre username
    if (aiContacts.full_name && aiContacts.full_name.length >= 3) {
      result.enriched.full_name = aiContacts.full_name;
      result.sources.push('bio-ai');
      console.log(`   ✅ Nome encontrado na bio: ${aiContacts.full_name}`);
    }

    // 1.2. Email da bio
    if (!result.enriched.email && aiContacts.email) {
      result.enriched.email = aiContacts.email;
      result.sources.push('bio-ai');
      console.log(`   ✅ Email encontrado na bio: ${aiContacts.email}`);
    }

    // 1.3. Telefone da bio
    if (!result.enriched.phone && aiContacts.phone) {
      result.enriched.phone = aiContacts.phone;
      result.sources.push('bio-ai');
      console.log(`   ✅ Telefone encontrado na bio: ${aiContacts.phone}`);
    }
  }

  // 2. FALLBACK: Extrair EMAIL da bio com regex (se AI não encontrou)
  if (!result.enriched.email && lead.bio) {
    const emailFromBio = extractEmailFromBio(lead.bio);
    if (emailFromBio) {
      result.enriched.email = emailFromBio;
      result.sources.push('bio-regex');
      console.log(`   ✅ Email encontrado na bio (regex): ${emailFromBio}`);
    }
  }

  // 3. FALLBACK: Extrair PHONE da bio com regex (se AI não encontrou)
  if (!result.enriched.phone && lead.bio) {
    const phoneFromBio = extractPhoneFromBio(lead.bio);
    if (phoneFromBio) {
      result.enriched.phone = phoneFromBio;
      result.sources.push('bio-regex');
      console.log(`   ✅ Telefone encontrado na bio (regex): ${phoneFromBio}`);
    }
  }

  // 4. FALLBACK: Extrair nome do USERNAME (se não encontrou na bio)
  if (!result.enriched.full_name && (!lead.full_name || lead.full_name === lead.username)) {
    console.log(`   🤖 Usando AI para extrair nome do username: ${lead.username}`);
    const aiName = await extractNameWithAI(lead.username);

    if (aiName && aiName.length >= 3) {
      result.enriched.full_name = aiName;
      result.sources.push('username-ai');
      console.log(`   ✅ Nome extraído do username: ${aiName}`);
    } else {
      // Último fallback: usar regex no username
      const extractedName = extractFullNameFromUsername(lead.username);
      if (extractedName !== lead.username && extractedName.length >= 3) {
        result.enriched.full_name = extractedName;
        result.sources.push('username-regex');
        console.log(`   ✅ Nome extraído do username (regex): ${extractedName}`);
      }
    }
  }

  // 5. EMAIL/PHONE - Tentar extrair do website
  if ((!result.enriched.email || !result.enriched.phone) && lead.website) {
    const websiteData = await extractFromWebsite(lead.website);

    if (!result.enriched.email && websiteData.email) {
      result.enriched.email = websiteData.email;
      result.sources.push('website');
      console.log(`   ✅ Email encontrado no website: ${websiteData.email}`);
    }

    if (!result.enriched.phone && websiteData.phone) {
      result.enriched.phone = websiteData.phone;
      result.sources.push('website');
      console.log(`   ✅ Telefone encontrado no website: ${websiteData.phone}`);
    }
  }

  // 5. PHONE - Tentar extrair de link WhatsApp
  if (!result.enriched.phone && lead.website) {
    const phoneFromWhatsApp = extractPhoneFromWhatsAppLink(lead.website);
    if (phoneFromWhatsApp) {
      result.enriched.phone = phoneFromWhatsApp;
      result.sources.push('whatsapp-link');
      console.log(`   ✅ Telefone extraído de link WhatsApp: ${phoneFromWhatsApp}`);
    }
  }

  // 6. CITY/STATE/NEIGHBORHOOD - Extrair de hashtags (bio + posts combinados)
  const allHashtags = [...(lead.hashtags_bio || []), ...(lead.hashtags_posts || [])];
  const locationFromHashtags = extractCityStateFromHashtags(allHashtags);
  if (locationFromHashtags.city) {
    result.enriched.city = locationFromHashtags.city;
    result.enriched.state = locationFromHashtags.state;
    result.enriched.neighborhood = locationFromHashtags.neighborhood;
    result.sources.push('hashtags');
    console.log(`   ✅ Localização extraída de hashtags: ${locationFromHashtags.neighborhood ? locationFromHashtags.neighborhood + ', ' : ''}${locationFromHashtags.city}/${locationFromHashtags.state}`);
  }

  // 7. ADDRESS - Verificar se full_name é endereço
  if (result.enriched.full_name) {
    const addressData = extractAddressFromFullName(result.enriched.full_name);
    if (addressData.address) {
      result.enriched.address = addressData.address;
      result.enriched.zip_code = addressData.zipCode;

      // Sobrescrever cidade/estado se encontrado no endereço
      if (addressData.city && !result.enriched.city) {
        result.enriched.city = addressData.city;
      }
      if (addressData.state && !result.enriched.state) {
        result.enriched.state = addressData.state;
      }

      // Limpar full_name para tentar extrair nome real
      result.enriched.full_name = null;
      result.sources.push('address-from-fullname');
      console.log(`   ✅ Endereço detectado em full_name: ${addressData.city || ''}${addressData.state ? '/' + addressData.state : ''} (CEP: ${addressData.zipCode || 'N/A'})`);
    }
  }

  // 8. FIRST_NAME/LAST_NAME - Separar nome completo
  if (result.enriched.full_name) {
    const { firstName, lastName } = splitFirstLastName(result.enriched.full_name);
    result.enriched.first_name = firstName;
    result.enriched.last_name = lastName;
    if (firstName) {
      console.log(`   ✅ Nome separado: ${firstName}${lastName ? ' ' + lastName : ''}`);
    }
  }

  return result;
}

/**
 * Detecta indicadores de consentimento para marketing direto na bio
 */
function detectConsentIndicators(bio: string | null, website: string | null): string[] {
  const indicators: string[] = [];

  if (!bio && !website) return indicators;

  const text = `${bio || ''} ${website || ''}`.toLowerCase();

  // Padrões que indicam abertura para contato comercial
  const patterns = {
    'parcerias': /parcerias?|parceria comercial|partner/i,
    'orcamento': /orçamento|cotação|solicite.*orçamento/i,
    'consulta': /consulta gratuita|agende.*consulta|marque.*consulta/i,
    'contato_comercial': /aceito contato|contato comercial|fale.*conosco/i,
    'whatsapp_business': /whatsapp.*atendimento|whatsapp.*comercial|whatsapp business/i,
    'agende': /agende|agendar|marque.*horário|reserve.*horário/i,
    'link_agendamento': /calendly|agendor|schedule|booking/i,
    'orcamentos': /solicite|peça.*orçamento|pedir.*orçamento/i,
    'atendimento': /atendimento|suporte|help desk/i,
    'formulario': /formulário|preencha|cadastr/i,
    'email_contato': /contato.*@|email.*contato/i,
    'dm_aberto': /dm.*aberto|direct.*aberto|respondo.*dm/i
  };

  for (const [key, pattern] of Object.entries(patterns)) {
    if (pattern.test(text)) {
      indicators.push(key);
    }
  }

  // Presença de telefone/email na bio indica abertura
  if (bio) {
    if (/\+?\d{2,3}\s*\(?\d{2}\)?[\s-]?\d{4,5}[\s-]?\d{4}/.test(bio)) {
      indicators.push('telefone_publico');
    }
    if (/[a-z0-9._-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(bio)) {
      indicators.push('email_publico');
    }
  }

  return indicators;
}

/**
 * Gera arquivo CSV com os resultados do enriquecimento
 */
function generateCSV(results: EnrichmentResult[]): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
  const filename = `enriquecimento-leads-${timestamp}.csv`;
  const filepath = join(process.cwd(), filename);

  // Cabeçalho do CSV
  const headers = [
    'username',
    'full_name',
    'first_name',
    'last_name',
    'email',
    'phone',
    'city',
    'state',
    'neighborhood',
    'address',
    'zip_code',
    'sources',
    'utilizavel_facebook', // nome + (telefone OU email)
    'indicadores_consentimento', // Indicadores de abertura para marketing
    'score_consentimento' // Quantidade de indicadores (0-N)
  ].join(',');

  // Linhas de dados
  const rows = results.map(r => {
    const utilizavel = (r.enriched.first_name && (r.enriched.phone || r.enriched.email)) ? 'SIM' : 'NAO';
    const indicadores = r.consent_indicators.join('; ');
    const scoreConsentimento = r.consent_indicators.length;

    return [
      r.username,
      escapeCSV(r.enriched.full_name),
      escapeCSV(r.enriched.first_name),
      escapeCSV(r.enriched.last_name),
      escapeCSV(r.enriched.email),
      escapeCSV(r.enriched.phone),
      escapeCSV(r.enriched.city),
      escapeCSV(r.enriched.state),
      escapeCSV(r.enriched.neighborhood),
      escapeCSV(r.enriched.address),
      escapeCSV(r.enriched.zip_code),
      escapeCSV(r.sources.join('; ')),
      utilizavel,
      escapeCSV(indicadores),
      scoreConsentimento
    ].join(',');
  });

  // Combinar cabeçalho + dados
  const csvContent = [headers, ...rows].join('\n');

  // Salvar arquivo
  writeFileSync(filepath, csvContent, 'utf-8');

  return filename;
}

/**
 * Escapa caracteres especiais para CSV
 */
function escapeCSV(value: string | null): string {
  if (!value) return '';

  // Se contém vírgula, aspas ou quebra de linha, envolver em aspas
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  return value;
}

/**
 * Script principal
 */
async function main() {
  console.log('🔍 ENRIQUECIMENTO DE LEADS DO INSTAGRAM\n');

  // 1. Buscar apenas leads não enriquecidos (LIMITADO A 50 PARA VALIDAÇÃO)
  console.log('📊 Buscando leads não enriquecidos da tabela instagram_leads...');
  console.log('⚠️  MODO VALIDAÇÃO: Processando 50 leads + análise de consentimento\n');
  const { data: leads, error } = await supabase
    .from('instagram_leads')
    .select('id, username, full_name, bio, email, phone, website, hashtags_bio, hashtags_posts, segment')
    .eq('dado_enriquecido', false)
    .order('created_at', { ascending: false })
    .limit(50);  // VALIDAÇÃO: 50 leads para análise profunda

  if (error) {
    console.error('❌ Erro ao buscar leads:', error.message);
    process.exit(1);
  }

  if (!leads || leads.length === 0) {
    console.log('⚠️  Nenhum lead encontrado na tabela.');
    process.exit(0);
  }

  console.log(`✅ ${leads.length} leads encontrados\n`);

  // 2. Estatísticas iniciais
  const statsInitial = {
    total: leads.length,
    withFullName: leads.filter(l => l.full_name && l.full_name !== l.username).length,
    withEmail: leads.filter(l => l.email).length,
    withPhone: leads.filter(l => l.phone).length,
    withWebsite: leads.filter(l => l.website).length
  };

  console.log('📊 ESTATÍSTICAS INICIAIS:');
  console.log(`   Total de leads: ${statsInitial.total}`);
  console.log(`   Com full_name válido: ${statsInitial.withFullName} (${((statsInitial.withFullName / statsInitial.total) * 100).toFixed(1)}%)`);
  console.log(`   Com email: ${statsInitial.withEmail} (${((statsInitial.withEmail / statsInitial.total) * 100).toFixed(1)}%)`);
  console.log(`   Com phone: ${statsInitial.withPhone} (${((statsInitial.withPhone / statsInitial.total) * 100).toFixed(1)}%)`);
  console.log(`   Com website: ${statsInitial.withWebsite} (${((statsInitial.withWebsite / statsInitial.total) * 100).toFixed(1)}%)\n`);

  // 3. Processar cada lead
  console.log('🔄 Processando leads...\n');
  const results: EnrichmentResult[] = [];
  let enrichedCount = 0;

  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    console.log(`[${i + 1}/${leads.length}] @${lead.username}`);

    const result = await enrichLead(lead);
    results.push(result);

    // Verificar se houve enriquecimento
    const hasChanges = (
      result.enriched.email !== result.original.email ||
      result.enriched.phone !== result.original.phone ||
      result.enriched.full_name !== result.original.full_name
    );

    if (hasChanges) {
      enrichedCount++;
      console.log(`   ✅ Enriquecido (fontes: ${result.sources.join(', ')})`);
    } else {
      console.log(`   ℹ️  Sem novos dados encontrados`);
    }

    console.log('');

    // Delay para evitar rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // 4. Estatísticas finais
  console.log('\n✅ PROCESSAMENTO COMPLETO!\n');

  const statsFinal = {
    emailsEnriched: results.filter(r => r.enriched.email && !r.original.email).length,
    phonesEnriched: results.filter(r => r.enriched.phone && !r.original.phone).length,
    totalEnriched: enrichedCount
  };

  console.log('📊 ESTATÍSTICAS FINAIS:');
  console.log(`   Leads enriquecidos: ${statsFinal.totalEnriched}/${statsInitial.total} (${((statsFinal.totalEnriched / statsInitial.total) * 100).toFixed(1)}%)`);
  console.log(`   Novos emails encontrados: ${statsFinal.emailsEnriched}`);
  console.log(`   Novos telefones encontrados: ${statsFinal.phonesEnriched}`);

  // 5. Listar leads enriquecidos
  if (enrichedCount > 0) {
    console.log('\n📋 LEADS ENRIQUECIDOS:');
    results
      .filter(r => r.sources.length > 0)
      .forEach(r => {
        console.log(`\n   @${r.username}:`);
        if (r.enriched.email && !r.original.email) {
          console.log(`      Email: ${r.enriched.email} (fonte: ${r.sources.join(', ')})`);
        }
        if (r.enriched.phone && !r.original.phone) {
          console.log(`      Phone: ${r.enriched.phone} (fonte: ${r.sources.join(', ')})`);
        }
      });
  }

  // 6. Gerar CSV com resultados
  console.log('\n📄 Gerando arquivo CSV...');
  const csvFilename = generateCSV(results);
  console.log(`✅ CSV gerado: ${csvFilename}`);

  // 7. Calcular leads utilizáveis para Facebook
  const utilizaveis = results.filter(r =>
    r.enriched.first_name && (r.enriched.phone || r.enriched.email)
  ).length;
  const taxaUtilizavel = ((utilizaveis / results.length) * 100).toFixed(1);

  console.log('\n📊 MÉTRICAS FACEBOOK CUSTOM AUDIENCE:');
  console.log(`   Leads utilizáveis (nome + telefone/email): ${utilizaveis}/${results.length} (${taxaUtilizavel}%)`);
  console.log(`   Meta: 75%`);
  console.log(`   Status: ${parseFloat(taxaUtilizavel) >= 75 ? '✅ META ATINGIDA!' : '❌ Abaixo da meta'}`);

  // 7.1 Análise de consentimento para marketing direto
  const comIndicadores = results.filter(r => r.consent_indicators.length > 0).length;
  const comAltoConsentimento = results.filter(r => r.consent_indicators.length >= 2).length;
  const indicadoresMaisComuns = results
    .flatMap(r => r.consent_indicators)
    .reduce((acc, ind) => {
      acc[ind] = (acc[ind] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

  console.log('\n🔒 ANÁLISE DE CONSENTIMENTO PARA MARKETING:');
  console.log(`   Leads com indicadores de consentimento: ${comIndicadores}/${results.length} (${((comIndicadores / results.length) * 100).toFixed(1)}%)`);
  console.log(`   Leads com alto consentimento (2+ indicadores): ${comAltoConsentimento}/${results.length} (${((comAltoConsentimento / results.length) * 100).toFixed(1)}%)`);
  console.log(`   Top 5 indicadores mais comuns:`);
  Object.entries(indicadoresMaisComuns)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .forEach(([ind, count]) => {
      console.log(`      - ${ind}: ${count} leads`);
    });

  // 8. Relatório de custos OpenAI
  console.log('\n💰 CUSTOS OPENAI (GPT-4o-mini):');
  console.log(`   Total de chamadas: ${costMetrics.total_calls}`);
  console.log(`   - Extração de nomes: ${costMetrics.name_extraction_calls}`);
  console.log(`   - Extração de contatos: ${costMetrics.contact_extraction_calls}`);
  console.log(`   Tokens de entrada: ${costMetrics.total_prompt_tokens.toLocaleString()}`);
  console.log(`   Tokens de saída: ${costMetrics.total_completion_tokens.toLocaleString()}`);
  console.log(`   Total de tokens: ${costMetrics.total_tokens.toLocaleString()}`);
  console.log(`   Custo total: $${costMetrics.total_cost_usd.toFixed(4)}`);
  console.log(`   Custo por lead: $${(costMetrics.total_cost_usd / results.length).toFixed(4)}`);

  console.log('\n🎉 Enriquecimento concluído!');
}

// Executar script
main().catch(error => {
  console.error('❌ Erro fatal:', error);
  process.exit(1);
});
