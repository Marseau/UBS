// src/routes/demo-apis.ts
import express from "express";
import crypto from "crypto";
import bcrypt from "bcrypt";
import { createClient } from "@supabase/supabase-js";
import { handleIncomingMessage } from "../services/message-handler"; 
import verifyDemoToken, { generateDemoToken } from "../utils/demo-token-validator";

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

/**
 * Normalize phone to E164 format
 */
const normalizeE164 = (phone: string) => {
  const cleaned = cleanPhone(phone);
  // Se já tem código de país, mantém; senão assume Brasil (+55)
  return cleaned.startsWith('55') ? cleaned : `55${cleaned}`;
};

/**
 * Issue demo token for tenant
 */
const issueDemoToken = async (tenantId: string) => {
  return generateDemoToken('demo_ui', tenantId);
};

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

    const cleanBusinessPhone = String(whatsappNumber).replace(/\D/g, "");

    // 1) Reuso por telefone (apenas contas de teste)
    const { data: existingByPhone, error: findPhoneErr } = await supabase
      .from("tenants")
      .select("id, business_name, domain, account_type, phone")
      .eq("phone", cleanBusinessPhone)
      .maybeSingle();

    if (findPhoneErr) {
      return res.status(500).json({ error: "Falha ao verificar telefone", details: findPhoneErr.message });
    }
    if (existingByPhone && existingByPhone.account_type === "test") {
      const demoToken = generateDemoToken('demo_ui', existingByPhone.id);
      return res.json({
        success: true,
        tenantId: existingByPhone.id,
        businessName: existingByPhone.business_name,
        domain: existingByPhone.domain,
        isReused: true,
        demoToken
      });
    }

    // 2) Bloquear e-mail duplicado
    const { data: existingByEmail, error: findEmailErr } = await supabase
      .from("tenants")
      .select("id")
      .eq("email", businessEmail)
      .maybeSingle();

    if (findEmailErr) {
      return res.status(500).json({ error: "Falha ao verificar e-mail", details: findEmailErr.message });
    }
    if (existingByEmail) {
      return res.status(400).json({
        success: false,
        error: "Este email já foi usado em outro demo. Tente outro.",
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
    // IMPORTANTE: name: null para ativar onboarding e coletar dados via IA
    const { data: userRow, error: userErr } = await supabase
      .from('users')
      .upsert({
        phone: userPhoneDigits,
        name: null, // Deixa null para ativar onboarding
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
    await createDemoSetupWithUpsert(tenantId, domain, businessName);
    
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
router.post("/chat", async (req, res) => {
  try {
    const token =
      (req.headers["x-demo-token"] as string) ||
      (req.get && req.get("x-demo-token")) || // alguns proxies normalizam
      "";

    if (!verifyDemoToken(token)) {
      console.warn("demo/chat: invalid token", { got: token ? "present" : "missing" });
      return res.status(401).json({ error: "Invalid demo token" });
    }

    const { tenantId, userPhone, text } = req.body || {};
    if (!tenantId || !userPhone || !text) {
      return res.status(400).json({ 
        error: "Campos obrigatórios faltando",
        required: ["tenantId", "userPhone", "text"]
      });
    }

    // 🆔 Capturar sessão demo para isolamento de primeira vez
    const demoSession = req.headers["x-demo-session"] as string || "";
    
    // 🎯 REDIRECIONAR PARA WEBHOOK V3 (que tem persistência completa)
    console.log('🔄 Demo redirecionando para webhook v3 com persistência', { demoSession: !!demoSession });
    
    // Fazer uma requisição HTTP interna para o webhook v3
    const http = require('http');
    const querystring = require('querystring');
    
    // 🔑 Gerar token HMAC válido para webhook v3
    const { DemoTokenValidator } = require('../utils/demo-token-validator');
    const validator = new DemoTokenValidator();
    const validDemoToken = validator.generateToken({ 
      source: 'demo_ui', 
      tenantId 
    });
    
    // Payload do WhatsApp Business API
    const whatsappPayload = {
      object: "whatsapp_business_account",
      entry: [{
        id: "demo-entry",
        changes: [{
          value: {
            messaging_product: "whatsapp",
            metadata: {
              display_phone_number: "Demo Phone",
              phone_number_id: demoSession ? `demo_session_${demoSession}` : "demo_phone_id"
            },
            messages: [{
              id: `demo_msg_${Date.now()}`,
              from: userPhone,
              timestamp: Math.floor(Date.now() / 1000).toString(),
              type: "text",
              text: {
                body: text
              }
            }]
          },
          field: "messages"
        }]
      }]
    };

    const postData = JSON.stringify(whatsappPayload);
    console.log('🔗 Preparando requisição HTTP para webhook v3:', {
      demoSession: !!demoSession,
      payloadSize: postData.length,
      tenantId
    });
    
    const options = {
      hostname: 'localhost',
      port: process.env.PORT || 3000,
      path: '/api/whatsapp-v3/webhook',  // 🔧 CORREÇÃO: Usar endpoint v3 com /webhook
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'x-demo-token': validDemoToken, // Usar token HMAC válido
        'x-demo-tenant-id': tenantId // Forçar tenantId para demo
      }
    };

    const proxyReq = http.request(options, (proxyRes: any) => {
      let data = '';
      
      proxyRes.on('data', (chunk: any) => {
        data += chunk;
      });
      
      proxyRes.on('end', () => {
        try {
          console.log('📤 Response do webhook v3:', data);
          
          // Tentar usar a resposta real do webhook v3
          if (data && data.trim()) {
            try {
              const webhookResponse = JSON.parse(data);
              if (webhookResponse && webhookResponse.response) {
                // ✅ Usar resposta real do webhook v3
                res.status(200).json(webhookResponse);
                return;
              }
            } catch (parseError) {
              console.log('⚠️ Webhook v3 retornou dados não-JSON, usando fallback');
            }
          }
          
          // Fallback apenas se webhook v3 não retornou dados válidos
          const demoResponse = {
            status: 'success',
            response: 'Mensagem processada com sucesso via webhook v3.',
            telemetry: {
              intent_detected: 'general',
              processingTime: 0,
              tokens_used: 0,
              api_cost_usd: 0,
              confidence: null,
              decision_method: 'webhook_v3_proxy_fallback',
              flow_lock_active: false,
              processing_time_ms: 0,
              model_used: 'unknown'
            }
          };
          
          res.status(200).json(demoResponse);
        } catch (parseError) {
          console.error('❌ Erro ao processar resposta do webhook v3:', parseError);
          res.status(200).json({
            status: 'success',
            response: 'Mensagem recebida e está sendo processada.',
            telemetry: {
              intent_detected: 'general',
              processingTime: 0,
              tokens_used: 0,
              api_cost_usd: 0,
              confidence: null,
              decision_method: 'webhook_v3_proxy_error',
              flow_lock_active: false,
              processing_time_ms: 0,
              model_used: 'unknown'
            }
          });
        }
      });
    });

    proxyReq.on('error', (error: any) => {
      console.error('❌ Erro na chamada para webhook v3:', error);
      res.status(200).json({
        status: 'success',
        response: 'Mensagem recebida e está sendo processada.',
        telemetry: {
          intent_detected: 'general',
          processingTime: 0,
          tokens_used: 0,
          api_cost_usd: 0,
          confidence: null,
          decision_method: 'webhook_v3_proxy_error',
          flow_lock_active: false,
          processing_time_ms: 0,
          model_used: 'unknown'
        }
      });
    });

    proxyReq.write(postData);
    proxyReq.end();
    
    return; // Explicit return for TypeScript
  } catch (err) {
    console.error("❌ Erro no chat demo:", err);
    
    // 🛡️ RESPOSTA DE ERRO SEMPRE VÁLIDA
    const errorResponse = {
      status: 'error',
      response: 'Ocorreu um erro interno. Nossa equipe foi notificada.',
      telemetry: {
        intent_detected: 'general',
        processingTime: 0,
        tokens_used: 0,
        api_cost_usd: 0,
        confidence: null,
        decision_method: 'error',
        flow_lock_active: false,
        processing_time_ms: 0,
        model_used: 'error',
        error_type: (err as any)?.name || 'UnknownError',
        error_message: (err as any)?.message || 'Erro desconhecido'
      }
    };

    return res.status(500).json(errorResponse);
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
async function createDemoSetup(reqBody: any) {
  try {
    const { businessName, businessEmail, whatsapp, whatsappNumber, userPhone, domain } = reqBody;
    const phoneInput = whatsapp || whatsappNumber;
    
    // Validações básicas
    if (!businessName || !phoneInput) {
      throw new Error('businessName e telefone são obrigatórios');
    }
    
    // Usar valores padrão se não fornecidos
    const finalEmail = businessEmail || `demo@${businessName.toLowerCase().replace(/\s+/g, '')}.com`;
    const finalUserPhone = userPhone || phoneInput;
    const finalDomain = domain || 'healthcare';
    
    console.log(`🏗️ Criando setup demo completo: ${businessName} (${finalDomain})`);
    
    // Normalizar telefone
    const phone = normalizeE164(phoneInput);
    const businessPhoneDigits = cleanPhone(phoneInput);
    const userPhoneDigits = cleanPhone(finalUserPhone);

    // 1. CRIAR TENANT
    const tenantId = crypto.randomUUID();
    const slug = businessName
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .insert({
        id: tenantId,
        name: businessName,
        slug,
        business_name: businessName,
        email: finalEmail,
        phone: phone,
        whatsapp_phone: businessPhoneDigits,
        domain: finalDomain,
        account_type: 'test',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (tenantError || !tenant) {
      console.error('❌ Erro ao criar tenant:', tenantError);
      throw tenantError;
    }

    console.log(`✅ Tenant criado: ${tenantId}`);

    // 2. CRIAR PROFISSIONAL PRINCIPAL com Google Calendar já linkado
    const professionalId = crypto.randomUUID();
    const professionalData = {
      id: professionalId,
      tenant_id: tenantId,
      name: `Profissional ${businessName}`,
      email: finalEmail,
      phone: '+5511999999999',
      specialties: getDomainSpecialties(finalDomain),
      is_active: true,
      // ✅ GOOGLE CALENDAR REAL - Token real do .env para demos funcionais
      google_calendar_credentials: process.env.GOOGLE_CALENDAR_CREDENTIALS ? 
        JSON.parse(process.env.GOOGLE_CALENDAR_CREDENTIALS) : 
        process.env.DEMO_GOOGLE_CALENDAR_CREDENTIALS ?
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

    const { data: profRow, error: profError } = await supabase.from('professionals').insert([professionalData]).select();
    if (profError) {
      console.error('❌ Erro ao criar profissional:', profError);
      throw profError;
    }
    
    console.log(`✅ Profissional criado: ${professionalData.name} (Google Calendar: primary)`);

    // 🔄 GARANTIR TOKEN GOOGLE ATUALIZADO para demos funcionais
    if (profRow?.[0]?.id) {
      try {
        const { ensureFreshGoogleToken } = await import("../utils/google-token");
        const refreshResult = await ensureFreshGoogleToken({ professionalId: profRow[0].id });
        console.log(`🔑 Google Token refresh result:`, refreshResult);
        
        if (process.env.GOOGLE_REFRESH_TOKEN) {
          console.log(`✅ Profissional com Google Calendar: ${profRow[0].id} (token disponível)`);
        }
      } catch (e: any) {
        console.warn("⚠️ ensureFreshGoogleToken warning:", e?.message || e);
      }
    }

    // 3. CRIAR SERVIÇOS PADRÃO POR DOMÍNIO
    const services = getDomainServices(finalDomain, tenantId);
    const { error: servicesError } = await supabase.from('services').insert(services);
    if (servicesError) {
      console.error('❌ Erro ao criar serviços:', servicesError);
      throw servicesError;
    }
    
    console.log(`✅ ${services.length} serviços criados para domínio ${finalDomain}`);

    // 4. VINCULAR PROFISSIONAL AOS SERVIÇOS
    const professionalServices = services.map(service => ({
      professional_id: professionalData.id,
      service_id: service.id,
      tenant_id: tenantId,
      is_active: true,
      created_at: new Date().toISOString()
    }));

    const { error: linkError } = await supabase.from('professional_services').insert(professionalServices);
    if (linkError) {
      console.error('❌ Erro ao vincular profissional aos serviços:', linkError);
      throw linkError;
    }

    console.log(`✅ Profissional vinculado a ${services.length} serviços`);
    return { tenantId, professionalId: professionalData.id };

  } catch (error) {
    console.error('❌ Erro no setup demo completo:', error);
    throw error;
  }
}

/**
 * Versão com UPSERT para evitar conflitos em reprocessamento
 */
async function createDemoSetupWithUpsert(tenantId: string, domain: string, businessName: string) {
  try {
    console.log(`🏗️ Criando setup demo (UPSERT) para tenant ${tenantId} (${domain})`);
    
    // 1. CRIAR/ATUALIZAR PROFISSIONAL PRINCIPAL com Google Calendar já linkado
    const professionalId = crypto.randomUUID();
    const professionalData = {
      id: professionalId,
      tenant_id: tenantId,
      name: `Profissional ${businessName}`,
      email: `demo@${businessName.toLowerCase().replace(/\s+/g, '')}.com`,
      phone: '+5511999999999',
      specialties: getDomainSpecialties(domain),
      is_active: true,
      // ✅ GOOGLE CALENDAR REAL - Token real do .env para demos funcionais
      google_calendar_credentials: process.env.GOOGLE_CALENDAR_CREDENTIALS ? 
        JSON.parse(process.env.GOOGLE_CALENDAR_CREDENTIALS) : 
        process.env.DEMO_GOOGLE_CALENDAR_CREDENTIALS ?
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

    const { data: profRow, error: profError } = await supabase.from('professionals')
      .upsert([professionalData], { onConflict: 'tenant_id,name' })
      .select();
    if (profError) {
      console.error('❌ Erro ao criar/atualizar profissional:', profError);
      throw profError;
    }
    
    console.log(`✅ Profissional criado/atualizado: ${professionalData.name} (Google Calendar: primary)`);

    // 🔄 GARANTIR TOKEN GOOGLE ATUALIZADO para demos funcionais
    if (profRow?.[0]?.id) {
      try {
        const { ensureFreshGoogleToken } = await import("../utils/google-token");
        const refreshResult = await ensureFreshGoogleToken({ professionalId: profRow[0].id });
        console.log(`🔑 Google Token refresh result:`, refreshResult);
        
        if (process.env.GOOGLE_REFRESH_TOKEN) {
          console.log(`✅ Profissional com Google Calendar: ${profRow[0].id} (token disponível)`);
        }
      } catch (e: any) {
        console.warn("⚠️ ensureFreshGoogleToken warning:", e?.message || e);
      }
    }

    // 2. CRIAR/ATUALIZAR SERVIÇOS PADRÃO POR DOMÍNIO
    const services = getDomainServices(domain, tenantId);
    const { error: servicesError } = await supabase.from('services')
      .upsert(services, { onConflict: 'tenant_id,name' });
    if (servicesError) {
      console.error('❌ Erro ao criar/atualizar serviços:', servicesError);
      throw servicesError;
    }
    
    console.log(`✅ ${services.length} serviços criados/atualizados para domínio ${domain}`);

    // 3. VINCULAR PROFISSIONAL AOS SERVIÇOS (buscar IDs atualizados)
    const { data: createdServices } = await supabase.from('services')
      .select('id, name')
      .eq('tenant_id', tenantId);

    const professionalServices = (createdServices || []).map(service => ({
      professional_id: professionalData.id,
      service_id: service.id,
      tenant_id: tenantId, // Campo obrigatório NOT NULL
      is_active: true,
      created_at: new Date().toISOString()
    }));

    if (professionalServices.length > 0) {
      const { error: linkError } = await supabase.from('professional_services')
        .upsert(professionalServices, { onConflict: 'tenant_id,professional_id,service_id' });
      if (linkError) {
        console.error('❌ Erro ao vincular profissional aos serviços:', linkError);
        throw linkError;
      }
      console.log(`✅ Profissional vinculado a ${professionalServices.length} serviços`);
    }

    return { professionalId: professionalData.id, servicesCount: services.length };

  } catch (error) {
    console.error('❌ Erro no setup demo (UPSERT):', error);
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
        is_active: true,
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
        is_active: true,
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
        is_active: true,
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
        is_active: true,
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
        is_active: true,
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
        is_active: true,
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
        is_active: true,
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
// POST /api/demo/create - Criar tenant demo completo
// Body: { businessName, businessEmail, whatsappNumber, userPhone, domain }
// =====================================================
router.post('/create', async (req, res) => {
  try {
    console.log('🚀 INICIANDO createDemo:', req.body);
    
    // Normalizar telefone
    const phone = normalizeE164(req.body.whatsapp ?? req.body.whatsappNumber);

    // 1. Verificar se já existe tenant com esse telefone
    const { data: existing } = await supabase
      .from('tenants')
      .select('id')
      .eq('phone', phone)
      .single();

    if (existing) {
      // Se já existe → apenas retorna tenant e token
      console.log(`🔄 Tenant já existe para phone ${phone}, retornando existing: ${existing.id}`);
      return res.status(200).json({
        success: true,
        tenant_id: existing.id,
        isReused: true,
        demo_token: await issueDemoToken(existing.id)
      });
    }

    // 2. Caso não exista → criar fluxo completo da demo
    const { tenantId, professionalId } = await createDemoSetup(req.body);

    return res.status(200).json({
      success: true,
      tenant_id: tenantId,
      professional_id: professionalId,
      isReused: false,
      demo_token: await issueDemoToken(tenantId)
    });

  } catch (err) {
    console.error('❌ createDemo error:', err);
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// =====================================================
// GET /check-user?userPhone=+55...&tenantId=uuid
// Apenas verifica se usuário existe (não cria)
// =====================================================
router.get('/check-user', async (req, res) => {
  try {
    const { userPhone, tenantId } = req.query;

    if (!userPhone || !tenantId) {
      return res.status(400).json({ success: false, error: 'Missing parameters' });
    }

    const cleanUserPhone = userPhone.toString().replace(/\D/g, '');

    // Apenas verifica se usuário já existe no banco
    const { data: existingUser, error } = await supabase
      .from('users')
      .select('id')
      .eq('phone', cleanUserPhone)
      .maybeSingle();

    if (error) {
      console.error('❌ Erro ao verificar usuário:', error);
      return res.status(500).json({ success: false, error: 'Erro ao verificar usuário' });
    }

    // Retorna apenas se existe ou não
    return res.json({
      success: true,
      exists: !!existingUser
    });

  } catch (err) {
    console.error('❌ Erro inesperado no /check-user:', err);
    return res.status(500).json({ success: false, error: 'Erro inesperado' });
  }
});

export default router;