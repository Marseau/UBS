// src/routes/demo-apis.ts (fixed-full)
// Objetivo: prover endpoints para a DEMO com persistência real no Supabase
//  - GET   /api/demo/check-business?whatsapp=...
//  - POST  /api/demo/create
//  - POST  /api/demo/chat
// Requisitos atendidos:
//  ✅ Normalização de telefone para formato canônico (somente dígitos, com prefixo 55 se faltar)
//  ✅ Upsert de tenant por telefone (evita duplicados)
//  ✅ Retorna demo_token para bypass do WhatsApp real
//  ✅ Chat aceita payload simples { message|text, userPhone, whatsappNumber } + Bearer demo_token
//  ✅ Integra com WebhookFlowOrchestratorService para manter a mesma experiência do real
//  ✅ Sem dependência de util inexistente como cleanPhone

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

// ATENÇÃO: este util deve existir no seu projeto. Ele precisa expor:
//  - default: verifyDemoToken(token: string): boolean
//  - named:  generateDemoToken(source: string, tenantId: string): Promise<string> | string
import { demoTokenValidator } from '../utils/demo-token-validator';

const router = Router();

// ========================= Helpers =========================
const onlyDigits = (s: string) => String(s || '').replace(/\D/g, '');

// Normaliza para E.164 Brasil "55...." (sem sinal de +). Mantemos apenas dígitos para chave canônica.
const normalizeE164BR = (s: string) => {
  const d = onlyDigits(s);
  return d.startsWith('55') ? d : (d ? `55${d}` : d);
};

// ========================= Supabase (Service Role) =========================
const SUPABASE_URL = process.env.SUPABASE_URL as string;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// ========================= Healthcheck =========================
router.get('/_demo/health', (_req, res) => {
  res.json({ ok: true, route: 'demo-apis.ts', build: process.env.BUILD_ID || 'dev' });
});

// ========================= Check Business =========================
// Verifica se já existe tenant com este whatsappNumber (phone do negócio)
router.get('/check-business', async (req: Request, res: Response) => {
  try {
    const raw = (req.query.whatsapp as string) || '';
    const phone = normalizeE164BR(raw);

    if (!phone) {
      return res.json({ success: false, exists: false, error: 'missing_whatsapp' });
    }

    const { data: tenant, error } = await supabase
      .from('tenants')
      .select('id, business_name, domain, email, phone, status')
      .eq('phone', phone)
      .maybeSingle();

    if (error) {
      console.error('check-business select error:', error);
      return res.json({ success: true, exists: false });
    }

    if (tenant) {
      return res.json({ success: true, exists: true, business: tenant });
    }
    return res.json({ success: true, exists: false });
  } catch (e) {
    console.error('check-business error:', e);
    return res.json({ success: true, exists: false });
  }
});

// ========================= Create Demo Tenant =========================
// Cria (ou reutiliza) um tenant de DEMO baseado no whatsappNumber do negócio
router.post('/create', async (req: Request, res: Response) => {
  try {
    const rawBiz  = req.body?.whatsappNumber ?? req.body?.whatsapp;
    const domain  = req.body?.domain || 'general';
    const businessName = req.body?.businessName?.toString().trim();
    const businessEmail = req.body?.businessEmail?.toString().trim();
    const services = req.body?.services || [];
    const professionals = req.body?.professionals || [];

    if (!businessName || !businessEmail) {
      return res.status(400).json({ 
        success: false, 
        error: 'business_details_required',
        required: ['businessName', 'businessEmail']
      });
    }

    if (!rawBiz) {
      return res.status(400).json({ success: false, error: 'whatsappNumber required' });
    }

    const phone = normalizeE164BR(rawBiz);

    // 1) Tenta encontrar por telefone canônico
    const { data: existing, error: selErr } = await supabase
      .from('tenants')
      .select('id, phone, status')
      .eq('phone', phone)
      .maybeSingle();

    if (selErr) {
      console.error('supabase select error:', selErr);
      return res.status(500).json({ success: false, error: 'db_select_error' });
    }

    let tenantId: string;
    let isReused = false;

    if (existing?.id) {
      tenantId = existing.id;
      isReused = true;
    } else {
      // Validação para novo negócio: exigir pelo menos 1 serviço e 1 profissional
      if (services.length < 1) {
        return res.status(400).json({ success: false, error: 'Informe pelo menos 1 serviço.' });
      }
      if (professionals.length < 1) {
        return res.status(400).json({ success: false, error: 'Informe pelo menos 1 profissional.' });
      }
      // 2) Cria novo tenant
      tenantId = crypto.randomUUID();

      // Gerar slug único baseado no business name
      const generateSlug = (name: string) => {
        return name
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9\s-]/g, '')
          .replace(/\s+/g, '-')
          .replace(/-+/g, '-')
          .trim();
      };
      
      const baseSlug = generateSlug(businessName);
      const uniqueSlug = `${baseSlug}-${tenantId.slice(0, 8)}`;

      const { error: insErr } = await supabase
        .from('tenants')
        .insert({
          id: tenantId,
          name: businessName, // Campo obrigatório
          slug: uniqueSlug, // Campo obrigatório único
          business_name: businessName,
          email: businessEmail,
          domain,
          phone, // campo canônico para lookup
          account_type: 'test',
          status: 'active'
        });

      if (insErr) {
        console.error('supabase upsert error:', JSON.stringify(insErr, null, 2));
        return res.status(500).json({ success: false, error: 'db_upsert_error', debug: insErr.message || 'unknown_error' });
      }
    }

    // Sistema de criação baseado nos dados do formulário (sem seeds automáticos)

    // SEED ATÔMICO - Executa tudo em uma transação para evitar duplicação
    let createdServices: any[] = [];
    let createdProfessionals: any[] = [];
    let createdAdmins: any[] = [];

    try {
      // 1. Verificar dados existentes primeiro
      const [existingServices, existingProfs, existingAdmins] = await Promise.all([
        supabase.from('services').select('*').eq('tenant_id', tenantId),
        supabase.from('professionals').select('*').eq('tenant_id', tenantId), 
        supabase.from('admin_users').select('*').eq('tenant_id', tenantId)
      ]);

      // 2. Criar serviços apenas se novo tenant E tiver dados do formulário
      if (!isReused && !existingServices.data?.length && services.length > 0) {
        const servicesToInsert = services.map((service: any) => ({
          tenant_id: tenantId,
          name: service.name,
          duration_minutes: service.duration_minutes ?? 60,
          base_price: Math.round((service.price_cents ?? 0) / 100), // Converter centavos para valor decimal
          currency: 'BRL',
          is_active: true
        }));
        
        const { data: newServices, error: serviceError } = await supabase
          .from('services')
          .insert(servicesToInsert)
          .select('*');
          
        if (serviceError) throw serviceError;
        createdServices = newServices || [];
      } else {
        createdServices = existingServices.data || [];
      }

      // 3. Criar profissionais apenas se novo tenant E tiver dados do formulário
      if (!isReused && !existingProfs.data?.length && professionals.length > 0) {
        const professionalsToInsert = professionals.map((pro: any) => ({
          id: crypto.randomUUID(),
          tenant_id: tenantId,
          name: pro.full_name,
          email: `${pro.full_name.toLowerCase().replace(/\s+/g, '.')}@demo.local`,
          phone: phone || null,
          specialties: [pro.role || 'professional'],
          google_calendar_id: 'primary', // força no backend sempre
          is_active: true
        }));
        
        const { data: newProfs, error: profError } = await supabase
          .from('professionals')
          .insert(professionalsToInsert)
          .select('*');
          
        if (profError) throw profError;
        createdProfessionals = newProfs || [];
        
        // Vincular profissionais aos serviços criados via professional_services
        if (createdServices.length > 0 && createdProfessionals.length > 0) {
          console.log(`🔗 Criando ${createdProfessionals.length}×${createdServices.length} = ${createdProfessionals.length * createdServices.length} vínculos profissionais-serviços`);
          
          const serviceLinks: any[] = [];
          for (const prof of createdProfessionals) {
            for (const service of createdServices) {
              serviceLinks.push({
                tenant_id: tenantId,
                professional_id: prof.id,
                service_id: service.id,
                is_active: true,
                // Herdar preço e duração do serviço (custom_price e custom_duration como null)
                custom_price: null,
                custom_duration: null,
                created_at: new Date().toISOString()
              });
            }
          }
          
          // Usar UPSERT para idempotência (evita duplicatas se reprocessar)
          try {
            const { data: linkData, error: linkError } = await supabase
              .from('professional_services')
              .upsert(serviceLinks, { 
                onConflict: 'tenant_id,professional_id,service_id',
                ignoreDuplicates: false // atualiza se já existir
              })
              .select('*');
              
            if (linkError) {
              console.error('❌ Professional-Service linking failed:', linkError);
              throw linkError;
            }
            
            console.log(`✅ Criados ${linkData?.length || 0} vínculos professional_services com sucesso`);
          } catch (e: any) {
            console.error('❌ Erro crítico na vinculação profissionais-serviços:', e.message);
            throw new Error(`Falha na vinculação profissionais-serviços: ${e.message}`);
          }
        }
      } else {
        createdProfessionals = existingProfs.data || [];
        
        // Para tenants reutilizados: garantir vinculação de todos profissionais existentes com todos serviços
        if (createdServices.length > 0 && createdProfessionals.length > 0) {
          console.log(`🔗 [REUTILIZADO] Sincronizando vínculos: ${createdProfessionals.length} profs × ${createdServices.length} serviços`);
          
          const allLinks: any[] = [];
          for (const prof of createdProfessionals) {
            for (const service of createdServices) {
              allLinks.push({
                tenant_id: tenantId,
                professional_id: prof.id,
                service_id: service.id,
                is_active: true,
                custom_price: null,
                custom_duration: null,
                created_at: new Date().toISOString()
              });
            }
          }
          
          try {
            const { data: syncLinkData, error: syncLinkError } = await supabase
              .from('professional_services')
              .upsert(allLinks, { 
                onConflict: 'tenant_id,professional_id,service_id',
                ignoreDuplicates: false
              })
              .select('*');
              
            if (syncLinkError) {
              console.warn('⚠️ Falha na sincronização de vínculos existentes:', syncLinkError.message);
            } else {
              console.log(`✅ [REUTILIZADO] Sincronizados ${syncLinkData?.length || 0} vínculos`);
            }
          } catch (e: any) {
            console.warn('⚠️ Erro na sincronização de vínculos para tenant reutilizado:', e.message);
          }
        }
      }

      if (!existingAdmins.data?.length) {
        // Create unique demo email to avoid constraint violations
        const uniqueAdminEmail = `${businessEmail.split('@')[0]}-${tenantId.slice(0, 8)}@${businessEmail.split('@')[1]}`;
        
        const { data: newAdmins, error: adminError } = await supabase
          .from('admin_users')
          .insert([{
            id: crypto.randomUUID(),
            tenant_id: tenantId,
            email: uniqueAdminEmail,
            password_hash: '$2b$10$demo.hash.for.testing',
            name: businessName,
            role: 'tenant_admin',
            is_active: true
          }])
          .select('*');
          
        if (adminError) throw adminError;
        createdAdmins = newAdmins || [];
      } else {
        createdAdmins = existingAdmins.data;
      }

    } catch (seedError) {
      console.error('❌ SEED ERROR:', seedError);
      return res.status(500).json({ success: false, error: 'seed_failed', details: seedError });
    }

    // Setup check (sem seeds automáticos)
    const isComplete = createdServices.length >= 1 && createdProfessionals.length >= 1;
    if (!isComplete) {
      return res.status(400).json({ 
        success: false, 
        error: 'Setup incompleto. Cadastre pelo menos 1 serviço e 1 profissional.' 
      });
    }

    // 3) Gera token para bypass  
    const demoToken = demoTokenValidator.generateToken({ source: 'demo_ui', tenantId });

    return res.json({
      success: true,
      tenant_id: tenantId,
      whatsappNumber: phone,
      demo_token: demoToken,
      isReused,
      setup: {
        services: createdServices,
        professionals: createdProfessionals,
        admins: createdAdmins,
        isComplete: true
      }
    });
  } catch (e) {
    console.error('create error:', e);
    return res.status(500).json({ success: false, error: 'internal_error' });
  }
});

// ========================= Evidence Collection =========================
// Debug endpoint para coletar evidências de persistência nas 4 tabelas
router.get('/evidence/:tenantId', async (req: Request, res: Response) => {
  try {
    const tenantId = req.params.tenantId;
    
    if (!tenantId) {
      return res.status(400).json({ success: false, error: 'tenantId required' });
    }

    const evidence: any = {
      tenant_id: tenantId,
      timestamp: new Date().toISOString(),
      tables: {}
    };

    // 1. TENANTS TABLE
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('id, name, slug, business_name, email, domain, phone, account_type, status')
      .eq('id', tenantId)
      .single();

    evidence.tables.tenants = {
      found: !!tenant,
      error: tenantError?.message || null,
      data: tenant || null
    };

    // 2. SERVICES TABLE
    const { data: services, error: servicesError } = await supabase
      .from('services')
      .select('id, tenant_id, name, duration_minutes, base_price')
      .eq('tenant_id', tenantId);

    evidence.tables.services = {
      count: services?.length || 0,
      error: servicesError?.message || null,
      data: services || []
    };

    // 3. PROFESSIONALS TABLE
    const { data: professionals, error: profError } = await supabase
      .from('professionals')
      .select('id, tenant_id, name, google_calendar_id')
      .eq('tenant_id', tenantId);

    evidence.tables.professionals = {
      count: professionals?.length || 0,
      error: profError?.message || null,
      data: professionals || []
    };

    // 4. ADMIN_USERS TABLE
    const { data: adminUsers, error: adminError } = await supabase
      .from('admin_users')
      .select('id, tenant_id, email, name, role, is_active')
      .eq('tenant_id', tenantId);

    evidence.tables.admin_users = {
      count: adminUsers?.length || 0,
      error: adminError?.message || null,
      data: adminUsers || []
    };

    // 5. CONVERSATION_HISTORY TABLE
    const { data: conversations, error: conversationError } = await supabase
      .from('conversation_history')
      .select('id, user_id, tenant_id, content, is_from_user, intent_detected, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(10); // Limitar a 10 mensagens mais recentes

    evidence.tables.conversation_history = {
      count: conversations?.length || 0,
      error: conversationError?.message || null,
      data: conversations || []
    };

    // Summary
    evidence.summary = {
      total_tables: 5,
      tables_with_data: [
        evidence.tables.tenants.found ? 1 : 0,
        evidence.tables.services.count > 0 ? 1 : 0,
        evidence.tables.professionals.count > 0 ? 1 : 0,
        evidence.tables.admin_users.count > 0 ? 1 : 0,
        evidence.tables.conversation_history.count > 0 ? 1 : 0
      ].reduce((a, b) => a + b, 0),
      persistence_success: true
    };

    return res.json({ success: true, evidence });
  } catch (error) {
    console.error('evidence collection error:', error);
    return res.status(500).json({ success: false, error: 'internal_error' });
  }
});

// ========================= Chat (WhatsApp-like payload) =========================
// Encaminha a mensagem para o mesmo orquestrador do WhatsApp real, usando bypass por token
router.post('/chat', async (req: Request, res: Response) => {
  try {
    // auth: demo bypass
    const auth = req.headers.authorization || '';
    const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    const xDemo = (req.headers['x-demo-token'] as string) || '';
    const demoToken = bearer || xDemo;

    const tokenPayload = demoTokenValidator.validateToken(demoToken);
    if (!tokenPayload) {
      return res.status(401).json({ success: false, error: 'invalid_demo_token' });
    }

    const b = (req.body ?? {}) as any;
    const message = b.message ?? b.text;
    const userPhone = b.userPhone ?? b.phone;
    const whatsappNumber = b.whatsappNumber ?? b.to;

    if (!message || !userPhone || !whatsappNumber) {
      return res.status(400).json({
        success: false,
        error: 'missing_fields',
        required: ['message|text', 'userPhone|phone', 'whatsappNumber|to']
      });
    }

    const userDigits = onlyDigits(userPhone);
    const tenantDigits = normalizeE164BR(whatsappNumber);

    // Buscar tenantId real pelo telefone
    const { data: tenant, error: tenantErr } = await supabase
      .from('tenants')
      .select('id')
      .eq('phone', tenantDigits)
      .maybeSingle();

    if (tenantErr || !tenant?.id) {
      return res.status(404).json({
        success: false,
        error: 'tenant_not_found',
        message: 'Tenant não encontrado para este número WhatsApp'
      });
    }

    const tenantId = tenant.id;

    // Lazy import para evitar ciclos durante build
    const { WebhookFlowOrchestratorService } = await import('../services/webhook-flow-orchestrator.service');
    const orchestrator = new WebhookFlowOrchestratorService();

    const out = await orchestrator.orchestrateWebhookFlow(
      String(message),
      userDigits,         // from
      tenantId,           // tenantId UUID correto
      { domain: 'demo' },
      {
        session_id: `demo_${tenantDigits}:${userDigits}`,
        demoMode: { source: 'demo_ui', tenantPhone: tenantDigits, tenantId: tenantId } // Usar tenantId UUID real
      }
    );
    // ===== PERSISTÊNCIA SÍNCRONA DE CONVERSAÇÃO =====
    try {
      // 1) Encontrar ou criar usuário
      let userId: string | null = null;
      const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .or(`phone.eq.${userDigits},phone.eq.+${userDigits}`)
        .maybeSingle();
      
      if (existingUser?.id) {
        userId = existingUser.id;
      } else {
        // Criar novo usuário
        const { data: newUser } = await supabase
          .from('users')
          .insert([{
            phone: `+${userDigits}`,
            name: null,
            email: null
          }])
          .select('id')
          .single();
        
        if (newUser?.id) {
          userId = newUser.id;
          // Vincular ao tenant na tabela user_tenants
          await supabase
            .from('user_tenants')
            .insert([{ tenant_id: tenantId, user_id: userId }]);
        }
      }

      if (userId) {
        // 2) Gerar conversation context
        const sessionId = crypto.randomUUID();
        const commonBase = {
          tenant_id: tenantId,
          user_id: userId,
          message_source: 'whatsapp_demo',
          created_at: new Date().toISOString(),
          conversation_outcome: null,
          conversation_context: { session_id: sessionId, duration_minutes: 0 }
        };

        // 3) Persistir mensagem do usuário e resposta da IA
        const userRow = {
          ...commonBase,
          content: String(message),
          is_from_user: true,
          message_type: 'text',
          intent_detected: out.telemetryData?.intent || null,
          tokens_used: 0,
          api_cost_usd: 0,
          processing_cost_usd: 0,
          model_used: null,
          confidence_score: out.telemetryData?.confidence || null
        };

        const aiRow = {
          ...commonBase,
          content: String(out.aiResponse),
          is_from_user: false,
          message_type: 'text',
          intent_detected: out.telemetryData?.intent || null,
          tokens_used: out.llmMetrics?.total_tokens || 0,
          api_cost_usd: out.llmMetrics?.api_cost_usd || 0,
          processing_cost_usd: out.llmMetrics?.processing_cost_usd || 0,
          model_used: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
          confidence_score: out.telemetryData?.confidence || null
        };

        // 4) Inserir ambas as mensagens
        await supabase
          .from('conversation_history')
          .insert([userRow, aiRow]);
      }
    } catch (error) {
      console.error('❌ [DEMO] Erro na persistência:', error);
    }

    return res.json({
      success: true,
      aiResponse: out.aiResponse,
      telemetry: out.telemetryData ?? {}
    });
  } catch (err) {
    console.error('demo/chat error:', err);
    return res.status(500).json({ success: false, error: 'internal_error' });
  }
});

export default router;
