/**
 * Script para enriquecer leads existentes do Instagram
 * Extrai email/phone da bio e websites
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import OpenAI from 'openai';

// Carregar variáveis de ambiente
config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Inicializar OpenAI para extração de nomes
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!
});

interface InstagramLead {
  id: number;
  username: string;
  full_name: string | null;
  bio: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
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
  };
  sources: string[];
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

  // Número local sem DDD: 8-9 dígitos
  // Ex: 99999999 ou 999999999
  if (length >= 8 && length <= 9) {
    return true;
  }

  // Telefone local brasileiro: 10-11 dígitos (DDD + número)
  // Ex: 1199999999 ou 11999999999
  if (length >= 10 && length <= 11) {
    const ddd = parseInt(phone.substring(0, 2));
    if (ddd >= 11 && ddd <= 99) {
      return true;
    }
  }

  // Telefone internacional com código do país: 12-15 dígitos (padrão ITU-T E.164)
  // Ex: 5511999999999 (Brasil - 13 dígitos)
  // Ex: 14155551234 (EUA - 11 dígitos)
  // Ex: 447700900123 (UK - 12 dígitos)
  // Ex: 61412345678 (Austrália - 11 dígitos)
  if (length >= 12 && length <= 15) {
    // Brasil (código 55): 13 dígitos é padrão
    if (phone.startsWith('55') && length === 13) {
      return true;
    }

    // Outros países (códigos 1-99): 12-15 dígitos
    const countryCode = parseInt(phone.substring(0, 2));
    if (countryCode >= 1 && countryCode <= 99) {
      return true;
    }

    // Países com códigos de 3 dígitos (ex: 351 Portugal, 886 Taiwan)
    const countryCode3 = parseInt(phone.substring(0, 3));
    if (countryCode3 >= 100 && countryCode3 <= 999 && length >= 12) {
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

  // Padrões de telefone (Brasil e internacional)
  const patterns = [
    /\+?\d{2}\s?\(?\d{2}\)?\s?\d{4,5}[-\s]?\d{4}/,  // Brasil: +55 (11) 99999-9999
    /\(?\d{2,3}\)?\s?\d{4,5}[-\s]?\d{4}/,           // Local: (11) 99999-9999
    /\+\d{1,3}\s?\d{8,14}/,                          // Internacional
    /whatsapp:?\s*\+?\d[\d\s()-]{8,}/i,             // WhatsApp na bio
    /📱\s*\+?\d[\d\s()-]{8,}/,                       // Emoji telefone
    /tel:?\s*\+?\d[\d\s()-]{8,}/i,                  // tel: na bio
    /contato:?\s*\+?\d[\d\s()-]{8,}/i               // Contato: na bio
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

    // Skip URLs de redes sociais
    const skipDomains = ['instagram.com', 'facebook.com', 'twitter.com', 'tiktok.com', 'linkedin.com', 'youtube.com', 'linktr.ee', 'beacons.ai'];
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
 * Usa GPT-4o Mini para extrair email e telefone da bio
 */
async function extractContactsWithAI(bio: string): Promise<{ email: string | null; phone: string | null }> {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Você é um especialista em extrair informações de contato de biografias do Instagram.

TAREFA:
Extraia EMAIL e TELEFONE da bio, se existirem.

REGRAS:
1. Identifique emails mesmo escritos de forma criativa (ex: "gmail ponto com", "arroba", etc.)
2. Identifique telefones em qualquer formato (com/sem DDD, com/sem código do país)
3. Ignore emails genéricos (noreply@, no-reply@)
4. Retorne em formato JSON: {"email": "...", "phone": "..."}
5. Se não encontrar, use null

EXEMPLOS DE BIO:
- "📧 contato arroba gmail.com | 📱11 99999-9999" → {"email": "contato@gmail.com", "phone": "11999999999"}
- "WhatsApp: (11) 98765-4321" → {"email": null, "phone": "11987654321"}
- "Email para parcerias: maria ponto silva @ outlook" → {"email": "maria.silva@outlook.com", "phone": null}
- "Consultoria 🔥" → {"email": null, "phone": null}`
        },
        {
          role: 'user',
          content: `Bio: ${bio}`
        }
      ],
      temperature: 0.3,
      max_tokens: 100,
      response_format: { type: "json_object" }
    });

    const result = response.choices[0]?.message?.content?.trim();

    if (!result) {
      return { email: null, phone: null };
    }

    const parsed = JSON.parse(result);

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

    return { email, phone };

  } catch (error: any) {
    console.log(`   ⚠️  Erro ao usar AI para extrair contatos: ${error.message}`);
    return { email: null, phone: null };
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
      phone: lead.phone
    },
    sources: []
  };

  // 1. FULL NAME - Se estiver vazio ou igual ao username, tentar extrair
  if (!lead.full_name || lead.full_name === lead.username) {
    // Primeiro tentar com regex (rápido e grátis)
    let extractedName = extractFullNameFromUsername(lead.username);

    // Se o resultado não tiver espaços E for longo, usar AI para melhorar
    const needsAI = !extractedName.includes(' ') && extractedName.length > 15;

    if (needsAI) {
      console.log(`   🤖 Usando AI para extrair nome de: ${lead.username}`);
      const aiName = await extractNameWithAI(lead.username);
      if (aiName) {
        extractedName = aiName;
        result.sources.push('username-ai');
      }
    }

    if (extractedName !== lead.username && extractedName.length >= 3) {
      result.enriched.full_name = extractedName;
      if (!result.sources.includes('username-ai')) {
        result.sources.push('username');
      }
      console.log(`   ✅ Nome extraído: ${extractedName}`);
    }
  }

  // 2. EMAIL - Tentar extrair da bio
  if (!lead.email && lead.bio) {
    const emailFromBio = extractEmailFromBio(lead.bio);
    if (emailFromBio) {
      result.enriched.email = emailFromBio;
      result.sources.push('bio');
      console.log(`   ✅ Email encontrado na bio: ${emailFromBio}`);
    }
  }

  // 3. PHONE - Tentar extrair da bio
  if (!lead.phone && lead.bio) {
    const phoneFromBio = extractPhoneFromBio(lead.bio);
    if (phoneFromBio) {
      result.enriched.phone = phoneFromBio;
      result.sources.push('bio');
      console.log(`   ✅ Telefone encontrado na bio: ${phoneFromBio}`);
    }
  }

  // 3.5. Se não achou email/phone na bio com regex, tentar com AI
  if ((!result.enriched.email || !result.enriched.phone) && lead.bio && lead.bio.length > 20) {
    console.log(`   🤖 Usando AI para extrair contatos da bio`);
    const aiContacts = await extractContactsWithAI(lead.bio);

    if (!result.enriched.email && aiContacts.email) {
      result.enriched.email = aiContacts.email;
      result.sources.push('bio-ai');
      console.log(`   ✅ Email encontrado com AI: ${aiContacts.email}`);
    }

    if (!result.enriched.phone && aiContacts.phone) {
      result.enriched.phone = aiContacts.phone;
      result.sources.push('bio-ai');
      console.log(`   ✅ Telefone encontrado com AI: ${aiContacts.phone}`);
    }
  }

  // 4. EMAIL/PHONE - Tentar extrair do website
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

  return result;
}

/**
 * Atualiza lead no banco de dados
 */
async function updateLead(result: EnrichmentResult): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('instagram_leads')
      .update({
        full_name: result.enriched.full_name,
        email: result.enriched.email,
        phone: result.enriched.phone,
        dado_enriquecido: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', result.id);

    if (error) {
      console.error(`   ❌ Erro ao atualizar lead ${result.id}:`, error.message);
      return false;
    }

    return true;
  } catch (error: any) {
    console.error(`   ❌ Erro ao atualizar lead ${result.id}:`, error.message);
    return false;
  }
}

/**
 * Script principal
 */
async function main() {
  console.log('🔍 ENRIQUECIMENTO DE LEADS DO INSTAGRAM\n');

  // 1. Buscar apenas leads não enriquecidos
  console.log('📊 Buscando leads não enriquecidos da tabela instagram_leads...');
  const { data: leads, error } = await supabase
    .from('instagram_leads')
    .select('id, username, full_name, bio, email, phone, website')
    .eq('dado_enriquecido', false)
    .order('created_at', { ascending: false });

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
      console.log(`   📝 Atualizando no banco... (fontes: ${result.sources.join(', ')})`);
      await updateLead(result);
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

  console.log('\n🎉 Enriquecimento concluído!');
}

// Executar script
main().catch(error => {
  console.error('❌ Erro fatal:', error);
  process.exit(1);
});
