// src/routes/demo-apis.ts
import express from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { handleIncomingMessage } from '../services/message-handler'; // bypass p/ fluxo oficial (v3)
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
// 1) Criar ou reutilizar TENANT de teste
// body: { businessName, businessEmail, whatsappNumber, userNumber, domain }
// =====================================================
router.post('/create-tenant', async (req, res) => {
  try {
    const { businessName, businessEmail, whatsappNumber, userNumber, domain } = req.body || {};
    if (!businessName || !businessEmail || !whatsappNumber || !userNumber || !domain) {
      return res.status(400).json({ error: 'Campos obrigatórios faltando' });
    }

    const businessPhoneDigits = cleanPhone(whatsappNumber);
    const userPhoneDigits = cleanPhone(userNumber);

    // Reutiliza tenant test com o mesmo phone
    const { data: existingTenant } = await supabase
      .from('tenants')
      .select('id, business_name, domain, account_type, phone')
      .eq('phone', businessPhoneDigits)
      .maybeSingle();

    if (existingTenant && existingTenant.account_type === 'test') {
      // Verificar se tenant existente tem setup completo (profissionais + serviços)
      const setupStatus = await validateTenantSetup(existingTenant.id);
      
      // Gerar token para ativar chat
      const demoToken = generateDemoToken('demo_ui', existingTenant.id);
      
      return res.json({
        success: true,
        isReused: true,
        tenantId: existingTenant.id,
        businessName: existingTenant.business_name,
        domain: existingTenant.domain,
        setupComplete: setupStatus.isComplete,
        setupDetails: setupStatus,
        demoToken
      });
    }

    // Cria tenant de teste
    const tenantId = crypto.randomUUID();
    const { error: tenantErr } = await supabase.from('tenants').insert([{
      id: tenantId,
      business_name: businessName,
      domain,
      phone: businessPhoneDigits,
      account_type: 'test',
      status: 'active',
      created_at: new Date().toISOString()
    }]);
    if (tenantErr) throw tenantErr;

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
    if (!whatsapp || typeof whatsapp !== 'string') {
      return res.status(400).json({ success: false, error: 'Número WhatsApp é obrigatório' });
    }
    const digits = cleanPhone(whatsapp);

    const { data: tenant, error } = await supabase
      .from('tenants')
      .select('id, business_name, domain, phone, account_type, status')
      .eq('phone', digits)
      .maybeSingle();
    if (error) throw error;

    if (tenant) return res.json({ success: true, exists: true, business: tenant, tenant });
    return res.json({ success: true, exists: false });
  } catch (err) {
    console.error('❌ check-business', err);
    return res.status(500).json({ success: false, error: 'Erro interno' });
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
  try {
    const token = req.headers['x-demo-token'] as string;
    const payload = demoTokenValidator.validateToken(token);
    if (!payload) {
      return res.status(401).send('Invalid demo token');
    }

    const { tenantId, userPhone, text } = req.body || {};
    if (!tenantId || !userPhone || !text) {
      return res.status(400).send('Missing tenantId, userPhone or text');
    }

    const result = await handleIncomingMessage({
      tenantId,
      userPhone,
      text,
      source: 'demo'
    });

    return res.json(result);
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
      phone: '+5511999999999', // Telefone placeholder
      specialties: getDomainSpecialties(domain),
      status: 'active',
      // ✅ GOOGLE CALENDAR JÁ LINKADO (primary)
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
      google_calendar_id: 'primary',
      created_at: new Date().toISOString()
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

export default router;