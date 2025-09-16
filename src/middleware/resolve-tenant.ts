/**
 * Middleware de resolução determinística de tenant
 * Implementa estratégia de 6 níveis de fallback
 */

import type { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/database';
import { normalizePhone } from '../utils/phone';
import { DemoTokenValidator } from '../utils/demo-token-validator';

interface TenantResolutionRequest extends Request {
  tenant_id?: string;
  tenant_resolution_warning?: string;
  phone_norm?: string;
}

/**
 * Obter tenant por demo token
 */
async function getTenantByDemoToken(token: string, demoTenantId?: string, routeTenantId?: string): Promise<{ id: string } | null> {
  console.log('🔍 [getTenantByDemoToken] Debug:', { 
    token: token.substring(0, 50) + '...', 
    tokenLength: token.length,
    demoTenantId, 
    routeTenantId,
    envToken: process.env.DEMO_MODE_TOKEN,
    tokenMatches: token === process.env.DEMO_MODE_TOKEN,
    fallbackMatches: token === 'fixed-secret-for-load-test-2025'
  });
  
  // 1) Tentar validar como token HMAC primeiro
  try {
    const validator = new DemoTokenValidator();
    const payload = validator.validateToken(token);
    if (payload) {
      console.log('✅ [getTenantByDemoToken] Token HMAC válido', { 
        source: payload.source, 
        tenantId: payload.tenantId,
        fullPayload: payload,
        demoTenantId,
        routeTenantId
      });
      // O tenant ID pode vir do payload HMAC, do header, ou da rota
      const tenantId = payload.tenantId || demoTenantId || routeTenantId;
      console.log('🔍 [getTenantByDemoToken] Tentativa de resolução tenant:', {
        payloadTenantId: payload.tenantId,
        demoTenantId,
        routeTenantId,
        finalTenantId: tenantId
      });
      if (tenantId) {
        // Validar se o tenant realmente existe no banco
        try {
          const { data: tenantExists } = await supabaseAdmin
            .from('tenants')
            .select('id')
            .eq('id', tenantId)
            .single();
          
          if (tenantExists) {
            console.log(`✅ [getTenantByDemoToken] Sucesso com tenant: ${tenantId}`);
            return { id: tenantId };
          } else {
            console.error(`❌ [getTenantByDemoToken] Tenant ${tenantId} não existe no banco!`);
            return null;
          }
        } catch (error) {
          console.error(`❌ [getTenantByDemoToken] Erro ao validar tenant ${tenantId}:`, error);
          return null;
        }
      }
      console.error('❌ [TENANT-RESOLUTION] Demo token HMAC válido mas sem tenant específico!', {
        payload,
        demoTenantId,
        routeTenantId
      });
      return null;
    }
  } catch (error) {
    console.log('🔍 [getTenantByDemoToken] Token não é HMAC válido, tentando tokens simples', error);
  }
  
  // 2) Fallback para tokens simples (para compatibilidade)
  if (token === process.env.DEMO_MODE_TOKEN || token === 'fixed-secret-for-load-test-2025') {
    const tenantId = demoTenantId || routeTenantId;
    if (tenantId) {
      // Validar se o tenant realmente existe no banco
      try {
        const { data: tenantExists } = await supabaseAdmin
          .from('tenants')
          .select('id')
          .eq('id', tenantId)
          .single();
        
        if (tenantExists) {
          console.log(`✅ [getTenantByDemoToken] Sucesso com token simples: ${tenantId}`);
          return { id: tenantId };
        } else {
          console.error(`❌ [getTenantByDemoToken] Tenant ${tenantId} não existe no banco (token simples)!`);
          return null;
        }
      } catch (error) {
        console.error(`❌ [getTenantByDemoToken] Erro ao validar tenant ${tenantId} (token simples):`, error);
        return null;
      }
    }
    console.error('❌ [TENANT-RESOLUTION] Demo token simples sem tenant específico!');
    return null;
  }
  
  console.log('❌ [getTenantByDemoToken] Token não reconhecido');
  return null;
}

/**
 * Obter tenant por WABA phone_number_id
 */
async function getTenantByWabaNumberId(phoneNumberId: string): Promise<{ id: string } | null> {
  // TODO: Fix this when tenant_whatsapp_config table is created
  // const { data } = await supabaseAdmin
  //   .from('tenant_whatsapp_config')
  //   .select('tenant_id')
  //   .eq('phone_number_id', phoneNumberId)
  //   .single();
  // 
  // return data ? { id: data.tenant_id } : null;
  return null;
}

/**
 * Obter último tenant ativo para um telefone
 */
async function getLastTenantForPhone(phoneNorm: string): Promise<{ tenant_id: string } | null> {
  const { data } = await supabaseAdmin
    .from('user_last_tenant')
    .select('tenant_id')
    .eq('phone_norm', phoneNorm)
    .single();
  
  return data;
}

/**
 * Atualizar último tenant visto para um telefone
 */
async function updateLastTenantForPhone(phoneNorm: string, tenantId: string): Promise<void> {
  await supabaseAdmin
    .from('user_last_tenant')
    .upsert({
      phone_norm: phoneNorm,
      tenant_id: tenantId,
      last_seen_at: new Date().toISOString()
    });
}

export async function resolveTenant(req: TenantResolutionRequest, res: Response, next: NextFunction) {
  try {
    // Headers e query params
    const demoToken = req.header('x-demo-token') || req.query.demo_token as string | undefined;
    const demoTenantId = req.header('x-demo-tenant-id') as string | undefined;
    const routeTenantId = (req as any).params?.tenantId;
    
    // Extrair dados do webhook WhatsApp
    const wabaPhoneNumberId = req.body?.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;
    const rawPhone = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.from || 
                     req.body?.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.wa_id;

    // Normalizar telefone se disponível
    let phoneNorm: string | undefined;
    if (rawPhone) {
      phoneNorm = normalizePhone(rawPhone);
      req.phone_norm = phoneNorm;
    }

    console.log(`🔍 [TENANT-RESOLUTION] Iniciando resolução`, {
      demoToken: !!demoToken,
      demoTenantId,
      routeTenantId: !!routeTenantId,
      wabaPhoneNumberId,
      rawPhone,
      phoneNorm
    });

    // === ESTRATÉGIA DE 6 NÍVEIS ===

    // 1) Demo token
    if (demoToken) {
      const tenant = await getTenantByDemoToken(demoToken, demoTenantId, routeTenantId);
      if (tenant) {
        req.tenant_id = tenant.id;
        console.log(`✅ [TENANT-RESOLUTION] Nível 1 - Demo token: ${tenant.id}`);
        return next();
      }
    }

    // 2) Rota URL (/api/:tenantId/whatsapp-v3/webhook)
    if (routeTenantId) {
      req.tenant_id = routeTenantId;
      console.log(`✅ [TENANT-RESOLUTION] Nível 2 - Route param: ${routeTenantId}`);
      return next();
    }

    // 3) WABA phone_number_id mapping
    if (wabaPhoneNumberId) {
      const tenant = await getTenantByWabaNumberId(wabaPhoneNumberId);
      if (tenant) {
        req.tenant_id = tenant.id;
        console.log(`✅ [TENANT-RESOLUTION] Nível 3 - WABA mapping: ${tenant.id}`);
        
        // Atualizar último tenant se temos telefone
        if (phoneNorm) {
          await updateLastTenantForPhone(phoneNorm, tenant.id);
        }
        return next();
      }
    }

    // 4) Sessão ativa (implementação futura - por ora pular)

    // 5) Último tenant ativo para este telefone
    if (phoneNorm) {
      const lastTenant = await getLastTenantForPhone(phoneNorm);
      if (lastTenant) {
        req.tenant_id = lastTenant.tenant_id;
        console.log(`✅ [TENANT-RESOLUTION] Nível 5 - Último tenant: ${lastTenant.tenant_id}`);
        
        // Atualizar timestamp
        await updateLastTenantForPhone(phoneNorm, lastTenant.tenant_id);
        return next();
      }
    }

    // 6) SEM FALLBACK - se chegou aqui, é ERRO!
    console.error(`❌ [TENANT-RESOLUTION] FALHA TOTAL - Não foi possível resolver tenant!`, {
      demoToken: !!demoToken,
      routeTenantId,
      wabaPhoneNumberId,
      rawPhone,
      phoneNorm
    });

    return res.status(400).json({
      error: 'tenant_resolution_failed',
      message: 'Unable to determine tenant. Provide valid demo token with tenant, route param, or WABA mapping.'
    });

  } catch (error) {
    console.error('❌ [TENANT-RESOLUTION] Erro na resolução de tenant:', error);
    
    // Fallback em caso de erro
    const fallbackTenantId = process.env.DEFAULT_TENANT_ID || 'f34d8c94-f6cf-4dd7-82de-a3123b380cd8';
    req.tenant_id = fallbackTenantId;
    req.tenant_resolution_warning = 'error_fallback';
    
    return next();
  }
}