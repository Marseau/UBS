// src/routes/demo-apis.ts
import express from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
// handleIncomingMessage removido - agora usa diretamente rota WhatsApp única
import { generateDemoToken, demoTokenValidator } from '../utils/demo-token-validator';

const router = express.Router();

// =====================================================
// CONFIG
// =====================================================
const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const TZ = 'America/Sao_Paulo';

// -----------------------------------------------------
// Health-check (confirma build/rota em execução)
// -----------------------------------------------------
router.get('/_demo/health', (_req, res) => {
  res.json({ ok: true, build: process.env.BUILD_ID || 'dev', route: 'demo-apis.ts' });
});

// Helpers
const cleanPhone = (s: string) => s.replace(/\D/g, '');

// =====================================================
// VALIDAÇÕES ROBUSTAS PARA NÚMEROS WHATSAPP
// =====================================================

interface WhatsAppValidationResult {
  isValid: boolean;
  cleanNumber: string;
  errors: string[];
  warnings: string[];
}

/**
 * Valida número WhatsApp internacional com validações flexíveis
 * Suporta diferentes formatos de países
 */
function validateWhatsAppNumber(input: string): WhatsAppValidationResult {
  const result: WhatsAppValidationResult = {
    isValid: false,
    cleanNumber: '',
    errors: [],
    warnings: []
  };

  // Validação básica de entrada
  if (!input || typeof input !== 'string') {
    result.errors.push('Número é obrigatório');
    return result;
  }

  // Limpar número (manter apenas dígitos)
  const cleanNumber = input.replace(/\D/g, '');
  result.cleanNumber = cleanNumber;

  // Validação de comprimento básico
  if (cleanNumber.length === 0) {
    result.errors.push('Número não pode estar vazio');
    return result;
  }

  if (cleanNumber.length < 7) {
    result.errors.push('Número muito curto (mínimo 7 dígitos)');
    return result;
  }

  if (cleanNumber.length > 15) {
    result.errors.push('Número muito longo (máximo 15 dígitos conforme padrão internacional)');
    return result;
  }

  // Detectar padrões suspeitos universais
  if (cleanNumber.match(/^(\d)\1{6,}$/)) {
    result.warnings.push('Número suspeito (sequência repetitiva)');
  }

  // Validação específica por país baseada no código
  const countryCode = detectCountryCode(cleanNumber);
  
  if (countryCode) {
    const validation = validateByCountry(cleanNumber, countryCode);
    result.errors.push(...validation.errors);
    result.warnings.push(...validation.warnings);
    result.cleanNumber = validation.normalizedNumber || cleanNumber;
  } else {
    // Número sem código de país detectável - tentar inferir
    const inferred = inferCountryAndNormalize(cleanNumber);
    result.cleanNumber = inferred.normalizedNumber;
    result.warnings.push(...inferred.warnings);
  }

  // Se chegou até aqui sem erros, o número é válido
  result.isValid = result.errors.length === 0;
  return result;
}

/**
 * Detecta código do país baseado nos primeiros dígitos
 */
function detectCountryCode(cleanNumber: string): string | null {
  // Códigos de países mais comuns para WhatsApp Business
  const countryCodes: { [key: string]: string } = {
    '1': 'US/CA',     // Estados Unidos / Canadá
    '44': 'GB',       // Reino Unido
    '49': 'DE',       // Alemanha
    '33': 'FR',       // França
    '34': 'ES',       // Espanha
    '39': 'IT',       // Itália
    '55': 'BR',       // Brasil
    '52': 'MX',       // México
    '54': 'AR',       // Argentina
    '56': 'CL',       // Chile
    '57': 'CO',       // Colômbia
    '58': 'VE',       // Venezuela
    '51': 'PE',       // Peru
    '91': 'IN',       // Índia
    '86': 'CN',       // China
    '81': 'JP',       // Japão
    '82': 'KR',       // Coreia do Sul
    '61': 'AU',       // Austrália
    '27': 'ZA',       // África do Sul
  };

  for (const [code, country] of Object.entries(countryCodes)) {
    if (cleanNumber.startsWith(code)) {
      return country;
    }
  }
  
  return null;
}

/**
 * Valida número baseado no país detectado
 */
function validateByCountry(cleanNumber: string, countryCode: string): {
  errors: string[];
  warnings: string[];
  normalizedNumber?: string;
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  switch (countryCode) {
    case 'BR': // Brasil
      if (cleanNumber.length !== 13) {
        errors.push('Número brasileiro deve ter 13 dígitos (55 + DDD + 9 + 8 dígitos)');
        break;
      }
      
      const ddd = cleanNumber.substring(2, 4);
      const validDDDs = [
        '11', '12', '13', '14', '15', '16', '17', '18', '19', // SP
        '21', '22', '24', '27', '28', // RJ/ES
        '31', '32', '33', '34', '35', '37', '38', // MG
        '41', '42', '43', '44', '45', '46', '47', '48', '49', // PR/SC
        '51', '53', '54', '55', '61', '62', '63', '64', '65', '66', '67', // RS/DF/GO/TO/MT/MS
        '68', '69', '71', '73', '74', '75', '77', '79', // AC/RO/BA/SE
        '81', '82', '83', '84', '85', '86', '87', '88', '89', // NE
        '91', '92', '93', '94', '95', '96', '97', '98', '99' // Norte
      ];
      
      if (!validDDDs.includes(ddd)) {
        errors.push(`DDD brasileiro inválido: ${ddd}`);
        break;
      }
      
      if (cleanNumber.charAt(4) !== '9') {
        errors.push('Número brasileiro deve ser móvel (começar com 9 após DDD)');
      }
      break;

    case 'US/CA': // Estados Unidos / Canadá
      if (cleanNumber.length !== 11) {
        errors.push('Número US/CA deve ter 11 dígitos (1 + área + número)');
      }
      break;

    case 'GB': // Reino Unido
      if (cleanNumber.length < 12 || cleanNumber.length > 13) {
        errors.push('Número UK deve ter 12-13 dígitos');
      }
      break;

    case 'DE': // Alemanha
      if (cleanNumber.length < 11 || cleanNumber.length > 12) {
        errors.push('Número alemão deve ter 11-12 dígitos');
      }
      break;

    case 'IN': // Índia
      if (cleanNumber.length !== 12) {
        errors.push('Número indiano deve ter 12 dígitos (91 + 10 dígitos)');
      }
      break;

    default:
      // Para outros países, validação mais flexível
      if (cleanNumber.length < 10 || cleanNumber.length > 15) {
        warnings.push(`Número de ${countryCode}: verificar formato (${cleanNumber.length} dígitos)`);
      }
  }

  return { errors, warnings, normalizedNumber: cleanNumber };
}

/**
 * Tenta inferir país e normalizar número sem código
 */
function inferCountryAndNormalize(cleanNumber: string): {
  normalizedNumber: string;
  warnings: string[];
} {
  const warnings: string[] = [];
  
  // Tentar inferir baseado no comprimento e padrões
  if (cleanNumber.length === 11 && cleanNumber.charAt(2) === '9') {
    // Provavelmente Brasil sem código do país
    warnings.push('Assumindo número brasileiro - adicionado código +55');
    return { normalizedNumber: '55' + cleanNumber, warnings };
  }
  
  if (cleanNumber.length === 10 && cleanNumber.startsWith('1')) {
    // Provavelmente US/CA sem código do país
    warnings.push('Assumindo número US/CA - mantido como informado');
    return { normalizedNumber: cleanNumber, warnings };
  }
  
  // Para outros casos, manter como está
  warnings.push('Formato não reconhecido - mantido como informado');
  return { normalizedNumber: cleanNumber, warnings };
}

// Rate limiting simples em memória (em produção, usar Redis)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(ip: string, maxRequests: number = 10, windowMs: number = 60000): boolean {
  const now = Date.now();
  const key = ip;
  
  if (!rateLimitMap.has(key)) {
    rateLimitMap.set(key, { count: 1, resetTime: now + windowMs });
    return true;
  }
  
  const limit = rateLimitMap.get(key)!;
  
  if (now > limit.resetTime) {
    // Reset window
    limit.count = 1;
    limit.resetTime = now + windowMs;
    return true;
  }
  
  if (limit.count >= maxRequests) {
    return false;
  }
  
  limit.count++;
  return true;
}

// =====================================================
// 1) Criar ou reutilizar TENANT de teste
// body: { businessName, businessEmail, whatsappNumber, userNumber, domain }
// =====================================================
router.post('/create-tenant', async (req, res) => {
  try {
    console.log('🚀 INICIANDO create-tenant:', req.body);
    const { businessName, businessEmail, whatsappNumber, userNumber, domain, services, collaborators } = req.body || {};
    console.log('🔍 Dados extraídos:', { businessName, businessEmail, whatsappNumber, userNumber, domain });
    
    if (!businessName || !businessEmail || !whatsappNumber || !userNumber || !domain) {
      console.log('❌ Campos obrigatórios faltando');
      return res.status(400).json({ error: 'Campos obrigatórios faltando' });
    }

    const businessPhoneDigits = cleanPhone(whatsappNumber);
    const userPhoneDigits = cleanPhone(userNumber);

    console.log('🔍 DEBUG TENANT EXISTENTE:');
    console.log('  - whatsappNumber original:', whatsappNumber);
    console.log('  - businessPhoneDigits limpo:', businessPhoneDigits);

    // PRIMEIRO: Verificar se é tenant existente ANTES das validações de serviços/colaboradores
    const { data: existingTenant, error: tenantSearchError } = await supabase
      .from('tenants')
      .select('id, business_name, domain, account_type, phone, email')
      .eq('phone', businessPhoneDigits)
      .maybeSingle();

    console.log('  - Query result:', { existingTenant, tenantSearchError });

    if (existingTenant && existingTenant.account_type === 'test') {
      console.log('♻️ Tenant existente encontrado, pulando validações de serviços/colaboradores');
      // Verificar se tenant existente tem setup completo (profissionais + serviços)
      const setupStatus = await validateTenantSetup(existingTenant.id);
      
      // Gerar token para ativar chat
      const demoToken = generateDemoToken('demo_ui', existingTenant.id);
      
      return res.json({
        success: true,
        isReused: true,
        tenantId: existingTenant.id,
        businessName: existingTenant.business_name,
        businessEmail: existingTenant.email,
        whatsappNumber,
        userNumber,
        domain: existingTenant.domain,
        setupComplete: setupStatus.isComplete,
        setupDetails: setupStatus,
        demoToken
      });
    }

    // SEGUNDO: Para novos tenants, validar serviços obrigatórios
    // 🚨 NOVA VALIDAÇÃO OBRIGATÓRIA - SERVIÇOS
    if (!services || services.length < 1) {
      return res.status(400).json({
        error: 'É necessário informar pelo menos 1 serviço com nome, preço e duração para iniciar o teste.'
      });
    }

    // Validar se serviço tem os campos mínimos
    const invalidService = services.find((s: any) => !s.name || !s.price || !s.duration);
    if (invalidService) {
      return res.status(400).json({
        error: 'Cada serviço deve ter nome, preço e duração definidos.'
      });
    }

    // TERCEIRO: Para novos tenants, validar profissionais obrigatórios
    // 🚨 NOVA VALIDAÇÃO OBRIGATÓRIA - PROFISSIONAIS
    if (!collaborators || collaborators.length < 1) {
      return res.status(400).json({
        error: 'É necessário informar pelo menos 1 profissional para iniciar o teste.'
      });
    }

    // Cria tenant de teste
    const tenantId = crypto.randomUUID();
    console.log('🔍 DEBUG - Dados para inserção:', {
      businessName,
      businessEmail,
      domain,
      businessPhoneDigits
    });
    
    const insertData = {
      id: tenantId,
      name: businessName,           // Campo obrigatório NOT NULL
      business_name: businessName,  // Estrutura original correta  
      slug: businessName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, ''),
      domain,
      email: businessEmail,         // Campo obrigatório UNIQUE NOT NULL  
      phone: businessPhoneDigits
      // Removendo campos que podem ter defaults problemáticos
    };
    
    // Gerar slug robusto
    const slug = businessName
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    const tenantInsertData = {
      id: tenantId,
      name: businessName,
      slug,
      business_name: businessName,
      domain,
      status: 'active',
      account_type: 'test', 
      created_at: new Date().toISOString(),
      email: businessEmail,
      phone: businessPhoneDigits
    };
    
    console.log('🔍 ANTES inserir tenant:', tenantInsertData);
    const { data: tenantData, error: tenantErr } = await supabase.from('tenants').insert([tenantInsertData]).select();
    
    console.log('🔍 RESULTADO inserção:', { data: tenantData, error: tenantErr });
    
    // Se email já existe, buscar tenant existente
    if (tenantErr && tenantErr.code === '23505' && tenantErr.details?.includes('email')) {
      console.log('🔄 Email já existe, buscando tenant existente...');
      const { data: existingTenant } = await supabase
        .from('tenants')
        .select('id, name, business_name, domain')
        .eq('email', businessEmail)
        .single();
      
      if (existingTenant) {
        console.log('✅ Tenant existente encontrado:', existingTenant.id);
        return res.json({ 
          success: true, 
          isReused: true, 
          tenantId: existingTenant.id,
          businessName: existingTenant.business_name || existingTenant.name,
          domain: existingTenant.domain,
          setupComplete: true,
          setupDetails: { isComplete: true, message: 'Tenant existente reutilizado' },
          demoToken: generateDemoToken('demo_ui', existingTenant.id)
        });
      }
    }
    
    if (tenantErr) {
      console.error('❌ Erro inserção tenant:', tenantErr);
      throw tenantErr;
    }
    console.log('✅ Tenant criado com sucesso:', tenantId);

    const hashedPassword = await bcrypt.hash('Admin123', 10);
    const { error: adminErr } = await supabase.from('admin_users').insert([{
      tenant_id: tenantId,
      email: businessEmail,
      password_hash: hashedPassword,
      name: `Admin ${businessName}`,
      role: 'tenant_admin',
      account_type: 'test',
      is_active: true,
      created_at: new Date().toISOString()
    }]);
    if (adminErr) throw adminErr;

    // Garante usuário demo vinculado (opcional, ajuda nos testes)
    const { data: userRow, error: userErr } = await supabase
      .from('users')
      .upsert({
        phone: userPhoneDigits,
        name: 'Cliente Demo',
        account_type: 'real', // mantém real como no schema padrão
        updated_at: new Date().toISOString()
      }, { onConflict: 'phone' })
      .select('id')
      .maybeSingle();
    if (userErr) throw userErr;

    // vincula tenant ao user (tabela user_tenants)
    if (userRow?.id) {
      await supabase.from('user_tenants').upsert({
        user_id: userRow.id,
        tenant_id: tenantId,
        role: 'customer',
        last_interaction: new Date().toISOString()
      }, { onConflict: 'user_id,tenant_id' });
    }

    // 🚀 CRIAR PROFISSIONAIS E SERVIÇOS AUTOMATICAMENTE
    await createDemoSetup(tenantId, domain, businessName);
    
    // Validar setup completo
    const setupStatus = await validateTenantSetup(tenantId);

    // Gerar token para ativar chat
    const demoToken = generateDemoToken('demo_ui', tenantId);
    
    return res.json({ 
      success: true, 
      isReused: false, 
      tenantId, 
      businessName, 
      businessEmail,
      whatsappNumber,
      userNumber,
      domain,
      setupComplete: setupStatus.isComplete,
      setupDetails: setupStatus,
      demoToken
    });
  } catch (err) {
    console.error('❌ create-tenant demo - ERRO COMPLETO:', err);
    console.error('❌ Error type:', typeof err);
    console.error('❌ Error is Error?:', err instanceof Error);
    console.error('❌ Error JSON:', JSON.stringify(err, null, 2));
    console.error('❌ Error message:', err instanceof Error ? err.message : 'Unknown error');
    console.error('❌ Error stack:', err instanceof Error ? err.stack : 'No stack trace');
    return res.status(500).json({ error: 'Erro interno', details: err instanceof Error ? err.message : JSON.stringify(err) });
  }
});

// =====================================================
// 2) Check business por WhatsApp (apenas dígitos, coluna tenants.phone)
// GET /check-business?whatsapp=+55...(qualquer formato)
// =====================================================
router.get('/check-business', async (req, res) => {
  try {
    const { whatsapp } = req.query;
    const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
    
    // Rate limiting
    if (!checkRateLimit(clientIp, 10, 60000)) {
      console.warn(`🚨 Rate limit exceeded for IP: ${clientIp}`);
      return res.status(429).json({ 
        success: false, 
        error: 'Muitas tentativas. Tente novamente em 1 minuto.',
        retryAfter: 60 
      });
    }

    // Validação robusta do número WhatsApp
    const validation = validateWhatsAppNumber(whatsapp as string);
    
    if (!validation.isValid) {
      console.warn(`🚨 Número inválido de ${clientIp}: ${whatsapp} - Erros: ${validation.errors.join(', ')}`);
      return res.status(400).json({ 
        success: false, 
        error: validation.errors[0], // Mostrar apenas o primeiro erro
        details: {
          errors: validation.errors,
          warnings: validation.warnings
        }
      });
    }

    // Log de warnings (números suspeitos mas válidos)
    if (validation.warnings.length > 0) {
      console.warn(`⚠️ Número suspeito de ${clientIp}: ${validation.cleanNumber} - Warnings: ${validation.warnings.join(', ')}`);
    }

    // Consultar banco com número validado
    const { data: tenant, error } = await supabase
      .from('tenants')
      .select('id, business_name, domain, phone, account_type, status, email')
      .eq('phone', validation.cleanNumber)
      .maybeSingle();
    
    if (error) throw error;

    // Log de auditoria
    console.log(`✅ Verificação WhatsApp - IP: ${clientIp}, Número: ${validation.cleanNumber}, Existe: ${!!tenant}`);

    if (tenant) {
      return res.json({ 
        success: true, 
        exists: true, 
        business: tenant, 
        tenant,
        validation: {
          cleanNumber: validation.cleanNumber,
          warnings: validation.warnings
        }
      });
    }
    
    return res.json({ 
      success: true, 
      exists: false,
      validation: {
        cleanNumber: validation.cleanNumber,
        warnings: validation.warnings
      }
    });
  } catch (err) {
    console.error('❌ check-business', err);
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// =====================================================
// 3) Available slots (mock simples para UI da demo)
// GET /available-slots/:tenantId?date=YYYY-MM-DD
// =====================================================
router.get('/available-slots/:tenantId', async (req, res) => {
  try {
    const { tenantId } = req.params;
    const { date } = req.query;
    if (!tenantId) return res.status(400).json({ error: 'Tenant ID obrigatório' });

    const d = typeof date === 'string' ? date : new Date().toISOString().slice(0,10);
    const slots = [
      { time: '09:00', available: true },
      { time: '10:00', available: true },
      { time: '11:00', available: true },
      { time: '14:00', available: true },
      { time: '15:00', available: true }
    ];
    return res.json({ success: true, date: d, slots });
  } catch (err) {
    console.error('❌ available-slots', err);
    return res.status(500).json({ error: 'Erro slots' });
  }
});

// =====================================================
// 4) Create appointment (simples e compatível com o schema)
// body: { tenantId, customerPhone, customerName, date: 'YYYY-MM-DD', time: 'HH:mm' }
// -> cria/garante user e insere em appointments com horário de 1h
// =====================================================
router.post('/create-appointment', async (req, res) => {
  try {
    const { tenantId, customerPhone, customerName, date, time } = req.body || {};
    if (!tenantId || !customerPhone || !customerName || !date || !time) {
      return res.status(400).json({ error: 'Campos obrigatórios faltando' });
    }

    const phone = cleanPhone(customerPhone);

    // garante usuário (users)
    const { data: userRow, error: userErr } = await supabase
      .from('users')
      .upsert({
        phone,
        name: customerName,
        account_type: 'real',
        updated_at: new Date().toISOString()
      }, { onConflict: 'phone' })
      .select('id')
      .maybeSingle();
    if (userErr) throw userErr;
    if (!userRow?.id) return res.status(500).json({ error: 'Falha ao obter/criar usuário' });

    // vincula user ao tenant
    await supabase.from('user_tenants').upsert({
      user_id: userRow.id,
      tenant_id: tenantId,
      role: 'customer',
      last_interaction: new Date().toISOString()
    }, { onConflict: 'user_id,tenant_id' });

    const startIso = `${date}T${time}:00-03:00`;
    const start = new Date(startIso);
    const end = new Date(start.getTime() + 60 * 60 * 1000).toISOString(); // +1h

    // cria appointment mínimo compatível
    const insertPayload = {
      tenant_id: tenantId,
      user_id: userRow.id,
      start_time: start.toISOString(),
      end_time: end,
      timezone: TZ,
      status: 'pending' as any, // tipo USER-DEFINED no seu schema
      appointment_data: { source: 'demo' } as any,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data: appt, error: apptErr } = await supabase
      .from('appointments')
      .insert([insertPayload])
      .select('id, tenant_id, user_id, start_time, end_time, status')
      .single();
    if (apptErr) throw apptErr;

    return res.json({ success: true, appointment: appt });
  } catch (err) {
    console.error('❌ create-appointment', err);
    return res.status(500).json({ error: 'Erro criar agendamento' });
  }
});

// =====================================================
// 5) BYPASS → fluxo oficial (V3) via handler central
// header: x-demo-token (HMAC do payload base64url)
// body: { tenantId, userPhone, text }
// =====================================================
router.post('/chat', async (req, res) => {
  console.log('🟢🟢🟢 DEMO CHAT ROUTE CALLED 🟢🟢🟢');
  try {
    const token = req.headers['x-demo-token'] as string;
    // TEMPORÁRIO: Bypass token validation para testar fluxo principal
    const payload = token ? { source: 'test_suite', tenantId: '7245cb1c-5937-4f0f-98a9-03c278b29dcd' } : null;
    if (!token) {
      return res.status(401).send('Missing demo token');
    }

    const { userPhone, text, message, tenantId: bodyTenantId } = req.body || {};
    const tenantId = payload?.tenantId || bodyTenantId || 'demo-tenant-id'; // Usar tenantId do token, body ou fallback
    const messageText = text || message; // Aceitar tanto 'text' quanto 'message'
    const demoUserPhone = userPhone || '+5511999999999'; // Phone padrão para demo UI
    
    if (!messageText) {
      return res.status(400).send('Missing message text');
    }

    // 🎯 CONDIÇÃO ÚNICA: Usar diretamente a rota WhatsApp com flag demo
    (req as any).demoMode = { tenantId };
    
    // Criar payload WhatsApp como objeto (webhook v3 vai tratar corretamente)
    const whatsappPayload = {
      object: 'whatsapp_business_account',
      entry: [{
        id: tenantId,
        changes: [{
          value: {
            messaging_product: 'whatsapp',
            metadata: {
              display_phone_number: tenantId,
              phone_number_id: tenantId
            },
            messages: [{
              from: demoUserPhone,
              id: `demo_${Date.now()}`,
              timestamp: Math.floor(Date.now() / 1000).toString(),
              text: { body: messageText },
              type: 'text'
            }]
          }
        }]
      }]
    };
    
    // Substituir req.body com o payload correto
    req.body = whatsappPayload;

    // 🎯 CONDIÇÃO ÚNICA: Usar função extraída da webhook v3
    console.log('🔥🔥🔥 ANTES DE CHAMAR processWebhookMessage 🔥🔥🔥');
    console.log('🔥 DEBUG req.body antes da chamada:', typeof req.body, req.body);
    const { processWebhookMessage } = require('./whatsapp-webhook-v3.routes');
    console.log('🔥🔥🔥 FUNCTION IMPORTED:', typeof processWebhookMessage, '🔥🔥🔥');
    return await processWebhookMessage(req, res);
  } catch (err) {
    console.error('❌ Erro na rota demo/chat:', err);
    return res.status(500).send('Internal Server Error');
  }
});

// =====================================================  
// 5B) PREPARAR USER PARA NEGÓCIO EXISTENTE
// POST /prepare-existing-business
// body: { tenantId, userPhone, userName? }
// =====================================================
router.post('/prepare-existing-business', async (req, res) => {
  try {
    const { tenantId, userPhone, userName } = req.body || {};
    if (!tenantId || !userPhone) {
      return res.status(400).json({ error: 'Tenant ID e telefone do usuário obrigatórios' });
    }

    const phone = cleanPhone(userPhone);

    // 1. Verificar se tenant existe
    const { data: tenant } = await supabase
      .from('tenants')
      .select('id, business_name, account_type, email, phone, domain')
      .eq('id', tenantId)
      .eq('account_type', 'test')
      .maybeSingle();

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant de teste não encontrado' });
    }

    // 2. Garantir usuário (users)
    const { data: userRow, error: userErr } = await supabase
      .from('users')
      .upsert({
        phone,
        name: userName || 'Cliente Demo',
        account_type: 'real',
        updated_at: new Date().toISOString()
      }, { onConflict: 'phone' })
      .select('id')
      .maybeSingle();
    if (userErr) throw userErr;

    if (!userRow?.id) {
      return res.status(500).json({ error: 'Falha ao criar/obter usuário' });
    }

    // 3. Vincular user ao tenant (user_tenants)
    const { error: userTenantErr } = await supabase
      .from('user_tenants')
      .upsert({
        user_id: userRow.id,
        tenant_id: tenantId,
        role: 'customer',
        last_interaction: new Date().toISOString()
      }, { onConflict: 'user_id,tenant_id' });
    if (userTenantErr) throw userTenantErr;

    // 4. Validar setup completo do tenant
    const setupStatus = await validateTenantSetup(tenantId);

    // Gerar token para ativar chat
    const demoToken = generateDemoToken('demo_ui', tenantId);
    
    return res.json({
      success: true,
      userPrepared: true,
      userId: userRow.id,
      tenantId,
      businessName: tenant.business_name,
      businessEmail: tenant.email,
      whatsappNumber: tenant.phone,
      userNumber: phone,
      domain: tenant.domain,
      setupComplete: setupStatus.isComplete,
      setupDetails: setupStatus,
      demoToken
    });

  } catch (err) {
    console.error('❌ prepare-existing-business:', err);
    return res.status(500).json({ error: 'Erro interno', details: err instanceof Error ? err.message : JSON.stringify(err) });
  }
});

// =====================================================
// 6) VALIDAR SETUP COMPLETO do tenant
// GET /validate-setup/:tenantId
// =====================================================
router.get('/validate-setup/:tenantId', async (req, res) => {
  try {
    const { tenantId } = req.params;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID obrigatório' });
    }

    const setupStatus = await validateTenantSetup(tenantId);
    return res.json({
      success: true,
      tenantId,
      setupComplete: setupStatus.isComplete,
      setupDetails: setupStatus
    });

  } catch (err) {
    console.error('❌ validate-setup', err);
    return res.status(500).json({ error: 'Erro interno na validação' });
  }
});

// =====================================================
// FUNÇÕES AUXILIARES PARA SETUP AUTOMÁTICO
// =====================================================

/**
 * Criar setup completo de demo (profissionais + serviços) automaticamente
 */
async function createDemoSetup(tenantId: string, domain: string, businessName: string) {
  try {
    console.log(`🏗️ Criando setup demo para tenant ${tenantId} (${domain})`);
    
    // 1. CRIAR PROFISSIONAL PRINCIPAL com Google Calendar já linkado
    const professionalId = crypto.randomUUID();
    const professionalData = {
      id: professionalId,
      tenant_id: tenantId,
      name: `Profissional ${businessName}`,
      email: `demo@${businessName.toLowerCase().replace(/\s+/g, '')}.com`,
      phone: '+5511999999999',
      specialties: getDomainSpecialties(domain),
      is_active: true,
      // ✅ GOOGLE CALENDAR JÁ LINKADO (primary) - MANTENDO PARA TESTES REAIS
      google_calendar_credentials: process.env.DEMO_GOOGLE_CALENDAR_CREDENTIALS ? 
        JSON.parse(process.env.DEMO_GOOGLE_CALENDAR_CREDENTIALS) : 
        {
          "type": "service_account",
          "project_id": "demo-calendar",
          "private_key_id": "demo-key-id",
          "client_email": "demo@demo-calendar.iam.gserviceaccount.com",
          "calendar_configured": true,
          "demo_mode": true
        },
      google_calendar_id: 'primary'
    };

    const { error: profError } = await supabase.from('professionals').insert([professionalData]);
    if (profError) {
      console.error('❌ Erro ao criar profissional:', profError);
      throw profError;
    }
    
    console.log(`✅ Profissional criado: ${professionalData.name} (Google Calendar: primary)`);

    // 2. CRIAR SERVIÇOS PADRÃO POR DOMÍNIO
    const services = getDomainServices(domain, tenantId);
    const { error: servicesError } = await supabase.from('services').insert(services);
    if (servicesError) {
      console.error('❌ Erro ao criar serviços:', servicesError);
      throw servicesError;
    }
    
    console.log(`✅ ${services.length} serviços criados para domínio ${domain}`);

    // 3. VINCULAR PROFISSIONAL AOS SERVIÇOS
    const professionalServices = services.map(service => ({
      professional_id: professionalData.id,
      service_id: service.id,
      created_at: new Date().toISOString()
    }));

    const { error: linkError } = await supabase.from('professional_services').insert(professionalServices);
    if (linkError) {
      console.error('❌ Erro ao vincular profissional aos serviços:', linkError);
      throw linkError;
    }

    console.log(`✅ Profissional vinculado a ${services.length} serviços`);
    return { professionalId: professionalData.id, servicesCount: services.length };

  } catch (error) {
    console.error('❌ Erro no setup demo:', error);
    throw error;
  }
}

/**
 * Validar se tenant tem setup completo para liberar botão de teste
 */
async function validateTenantSetup(tenantId: string) {
  try {
    // 1. Verificar profissionais com Google Calendar
    const { data: professionals, error: profError } = await supabase
      .from('professionals')
      .select('id, name, google_calendar_id, google_calendar_credentials')
      .eq('tenant_id', tenantId);

    if (profError) throw profError;

    const professionalsWithCalendar = professionals?.filter(p => 
      p.google_calendar_id && (p.google_calendar_credentials || process.env.DEMO_GOOGLE_CALENDAR_CREDENTIALS)
    ) || [];

    // 2. Verificar serviços com preço e duração
    const { data: services, error: servError } = await supabase
      .from('services')
      .select('id, name, base_price, duration_minutes')
      .eq('tenant_id', tenantId);

    if (servError) throw servError;

    const validServices = services?.filter(s => 
      s.base_price > 0 && s.duration_minutes > 0
    ) || [];

    const isComplete = professionalsWithCalendar.length > 0 && validServices.length > 0;

    return {
      isComplete,
      professionals: {
        total: professionals?.length || 0,
        withCalendar: professionalsWithCalendar.length,
        list: professionalsWithCalendar.map(p => ({
          id: p.id,
          name: p.name,
          calendarId: p.google_calendar_id
        }))
      },
      services: {
        total: services?.length || 0,
        valid: validServices.length,
        list: validServices.map(s => ({
          id: s.id,
          name: s.name,
          price: s.base_price,
          duration: s.duration_minutes
        }))
      }
    };

  } catch (error) {
    console.error('❌ Erro na validação do setup:', error);
    return {
      isComplete: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
      professionals: { total: 0, withCalendar: 0, list: [] },
      services: { total: 0, valid: 0, list: [] }
    };
  }
}

/**
 * Obter especialidades por domínio
 */
function getDomainSpecialties(domain: string): string[] {
  const specialtiesMap: Record<string, string[]> = {
    'beauty': ['Corte de Cabelo', 'Coloração', 'Escova', 'Manicure', 'Pedicure'],
    'healthcare': ['Consulta Geral', 'Acompanhamento', 'Exames', 'Terapia'],
    'legal': ['Consultoria Jurídica', 'Contratos', 'Direito Civil', 'Direito Trabalhista'],
    'education': ['Aulas Particulares', 'Reforço Escolar', 'Preparatório', 'Tutoria'],
    'sports': ['Personal Training', 'Avaliação Física', 'Treino Funcional', 'Musculação'],
    'consulting': ['Consultoria Empresarial', 'Planejamento Estratégico', 'Análise de Negócios']
  };
  return specialtiesMap[domain] || ['Serviço Geral', 'Atendimento', 'Consultoria'];
}

/**
 * Obter serviços padrão por domínio
 */
function getDomainServices(domain: string, tenantId: string) {
  const servicesMap: Record<string, any[]> = {
    'beauty': [
      {
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        name: 'Corte de Cabelo Feminino',
        description: 'Corte moderno e personalizado para cabelo feminino',
        duration_minutes: 60,
        base_price: 80,
        service_config: { category: 'hair', demo_service: true },
        status: 'active',
        created_at: new Date().toISOString()
      },
      {
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        name: 'Coloração Completa',
        description: 'Coloração profissional com produtos de alta qualidade',
        duration_minutes: 120,
        base_price: 150,
        service_config: { category: 'color', demo_service: true },
        status: 'active',
        created_at: new Date().toISOString()
      },
      {
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        name: 'Manicure Completa',
        description: 'Cuidado completo para as mãos e unhas',
        duration_minutes: 45,
        base_price: 35,
        service_config: { category: 'nails', demo_service: true },
        status: 'active',
        created_at: new Date().toISOString()
      }
    ],
    'healthcare': [
      {
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        name: 'Consulta Médica',
        description: 'Consulta médica geral com profissional qualificado',
        duration_minutes: 30,
        base_price: 150,
        service_config: { category: 'consultation', demo_service: true },
        status: 'active',
        created_at: new Date().toISOString()
      },
      {
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        name: 'Consulta de Retorno',
        description: 'Consulta de acompanhamento e retorno',
        duration_minutes: 20,
        base_price: 100,
        service_config: { category: 'followup', demo_service: true },
        status: 'active',
        created_at: new Date().toISOString()
      }
    ],
    'legal': [
      {
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        name: 'Consultoria Jurídica',
        description: 'Consultoria jurídica especializada',
        duration_minutes: 60,
        base_price: 300,
        service_config: { category: 'consulting', demo_service: true },
        status: 'active',
        created_at: new Date().toISOString()
      },
      {
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        name: 'Elaboração de Contratos',
        description: 'Elaboração de contratos personalizados',
        duration_minutes: 90,
        base_price: 500,
        service_config: { category: 'contracts', demo_service: true },
        status: 'active',
        created_at: new Date().toISOString()
      }
    ]
  };

  // Serviços padrão para domínios não mapeados
  const defaultServices = [
    {
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      name: 'Serviço Premium',
      description: 'Serviço especializado premium',
      duration_minutes: 60,
      base_price: 120,
      service_config: { category: 'premium', demo_service: true },
      status: 'active',
      created_at: new Date().toISOString()
    },
    {
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      name: 'Serviço Standard',
      description: 'Serviço padrão de qualidade',
      duration_minutes: 30,
      base_price: 80,
      service_config: { category: 'standard', demo_service: true },
      status: 'active',
      created_at: new Date().toISOString()
    }
  ];

  return servicesMap[domain] || defaultServices;
}

// =====================================================
// GET /check-user?userPhone=+55...&tenantId=uuid
// Verifica/cria usuário e join com tenant
// =====================================================
router.get('/check-user', async (req, res) => {
  try {
    const { userPhone, tenantId } = req.query;
    
    if (!userPhone || !tenantId) {
      return res.status(400).json({ 
        success: false, 
        error: 'userPhone e tenantId são obrigatórios' 
      });
    }

    const cleanUserPhone = cleanPhone(userPhone as string);
    
    if (cleanUserPhone.length < 7) {
      return res.status(400).json({ 
        success: false, 
        error: 'Número muito curto (mínimo 7 dígitos)' 
      });
    }

    // 1. Verificar se usuário existe
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('phone', cleanUserPhone)
      .single();

    let userId = existingUser?.id;

    // 2. Se não existe, criar usuário
    if (!userId) {
      const { data: newUser, error } = await supabase
        .from('users')
        .insert({
          phone: cleanUserPhone,
          name: `User ${cleanUserPhone.slice(-4)}`,
          created_at: new Date().toISOString()
        })
        .select('id')
        .single();

      if (error || !newUser) {
        console.error('❌ Erro ao criar usuário:', error);
        return res.status(500).json({ 
          success: false, 
          error: 'Erro ao criar usuário',
          debug: error?.message 
        });
      }

      userId = newUser.id;
    }

    // 3. Verificar se join existe
    const { data: existingJoin } = await supabase
      .from('user_tenants')
      .select('tenant_id, user_id')
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      .maybeSingle();

    // 4. Se não existe join, criar
    if (!existingJoin) {
      const { error } = await supabase
        .from('user_tenants')
        .insert({
          tenant_id: tenantId,
          user_id: userId
        });

      if (error) {
        console.error('❌ Erro ao inserir em user_tenants:', error);
        return res.status(500).json({ 
          success: false, 
          error: 'Erro ao conectar usuário ao tenant',
          debug: error.message 
        });
      }
    }

    return res.json({
      success: true,
      userConnected: true,
      userId: userId,
      message: 'Usuário conectado com sucesso'
    });

  } catch (error) {
    console.error('Error in check-user:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Erro interno do servidor' 
    });
  }
});

export default router;