/**
 * Dynamic Tenant Resolver - Elimina hardcoded de tenants
 *
 * Este utilitário resolve tenants dinamicamente baseado em:
 * 1. Número WhatsApp fornecido
 * 2. Domínio de negócio
 * 3. Primeiro tenant ativo disponível
 *
 * USO:
 * ```typescript
 * import { resolveTenant, getActiveTenantByDomain } from '../utils/dynamic-tenant-resolver';
 *
 * // Resolver por número
 * const tenant = await resolveTenant('5511940017007');
 *
 * // Resolver por domínio
 * const beautyTenant = await getActiveTenantByDomain('beauty');
 *
 * // Primeiro tenant ativo
 * const anyTenant = await getFirstActiveTenant();
 * ```
 */

import { supabaseAdmin } from '../config/database';

export interface Tenant {
  id: string;
  name: string;
  business_name: string;
  domain: string;
  whatsapp_phone: string | null;
  phone: string;
  whatsapp_numbers?: any[];
  status: string | null;
}

/**
 * Resolve tenant baseado no número de WhatsApp (múltiplas tentativas)
 */
export async function resolveTenant(phoneNumberId: string): Promise<any | null> {
  try {
    const digits = String(phoneNumberId || '').replace(/\D/g, '');
    const plusDigits = `+${digits}`;

    console.log(`🔍 [DYNAMIC RESOLVER] Buscando tenant por: ${digits} / ${plusDigits}`);

    // 1. Busca por whatsapp_phone
    const { data: tenant, error } = await supabaseAdmin
      .from('tenants').select('*')
      .or(`whatsapp_phone.eq.${digits},whatsapp_phone.eq.${plusDigits}`)
      .single();

    if (!error && tenant) {
      console.log(`✅ [DYNAMIC RESOLVER] Encontrado por whatsapp_phone: ${tenant.name} (${tenant.id})`);
      return tenant;
    }

    // 2. Busca por phone normal
    const fallback = await supabaseAdmin
      .from('tenants').select('*')
      .or(`phone.eq.${digits},phone.eq.${plusDigits}`)
      .single();

    if (!fallback.error && fallback.data) {
      console.log(`✅ [DYNAMIC RESOLVER] Encontrado por phone: ${fallback.data.name} (${fallback.data.id})`);
      return fallback.data;
    }

    // 3. Busca por whatsapp_numbers array
    const jsonSearch = await supabaseAdmin
      .from('tenants').select('*')
      .contains('whatsapp_numbers', [{ phone_number_id: digits }]);

    if (!jsonSearch.error && jsonSearch.data?.[0]) {
      console.log(`✅ [DYNAMIC RESOLVER] Encontrado por whatsapp_numbers: ${jsonSearch.data[0].name} (${jsonSearch.data[0].id})`);
      return jsonSearch.data[0];
    }

    console.log(`❌ [DYNAMIC RESOLVER] Nenhum tenant encontrado para: ${digits}`);
    return null;
  } catch (error) {
    console.error('🚨 [DYNAMIC RESOLVER] Erro na busca:', { phoneNumberId, error });
    return null;
  }
}

/**
 * Busca tenant ativo por domínio de negócio
 */
export async function getActiveTenantByDomain(domain: string): Promise<any | null> {
  try {
    console.log(`🎯 [DOMAIN RESOLVER] Buscando tenant ativo para domínio: ${domain}`);

    const { data: tenant, error } = await supabaseAdmin
      .from('tenants')
      .select('*')
      .eq('domain', domain as any)
      .eq('status', 'active')
      .not('whatsapp_phone', 'is', null)
      .limit(1)
      .single();

    if (!error && tenant) {
      console.log(`✅ [DOMAIN RESOLVER] Encontrado: ${tenant.name} (${tenant.id}) - domínio ${domain}`);
      return tenant;
    }

    console.log(`❌ [DOMAIN RESOLVER] Nenhum tenant ativo encontrado para domínio: ${domain}`);
    return null;
  } catch (error) {
    console.error('🚨 [DOMAIN RESOLVER] Erro na busca:', { domain, error });
    return null;
  }
}

/**
 * Busca o primeiro tenant ativo disponível
 */
export async function getFirstActiveTenant(): Promise<any | null> {
  try {
    console.log('🔄 [FIRST ACTIVE] Buscando primeiro tenant ativo...');

    const { data: tenant, error } = await supabaseAdmin
      .from('tenants')
      .select('*')
      .eq('status', 'active')
      .not('whatsapp_phone', 'is', null)
      .limit(1)
      .single();

    if (!error && tenant) {
      console.log(`✅ [FIRST ACTIVE] Encontrado: ${tenant.name} (${tenant.id})`);
      return tenant;
    }

    console.log('❌ [FIRST ACTIVE] Nenhum tenant ativo encontrado!');
    return null;
  } catch (error) {
    console.error('🚨 [FIRST ACTIVE] Erro na busca:', error);
    return null;
  }
}

/**
 * Lista todos os tenants ativos por domínio
 */
export async function getActiveTenantsByDomain(domain?: string): Promise<any[]> {
  try {
    let query = supabaseAdmin
      .from('tenants')
      .select('*')
      .eq('status', 'active')
      .not('whatsapp_phone', 'is', null);

    if (domain) {
      query = query.eq('domain', domain as any);
    }

    const { data: tenants, error } = await query;

    if (!error && tenants) {
      console.log(`✅ [ACTIVE TENANTS] Encontrados ${tenants.length} tenants${domain ? ` para domínio ${domain}` : ''}`);
      return tenants;
    }

    console.log(`❌ [ACTIVE TENANTS] Nenhum tenant encontrado${domain ? ` para domínio ${domain}` : ''}`);
    return [];
  } catch (error) {
    console.error('🚨 [ACTIVE TENANTS] Erro na busca:', { domain, error });
    return [];
  }
}

/**
 * Busca tenant por ID com fallback
 */
export async function getTenantById(tenantId: string): Promise<any | null> {
  try {
    const { data: tenant, error } = await supabaseAdmin
      .from('tenants')
      .select('*')
      .eq('id', tenantId)
      .single();

    if (!error && tenant) {
      console.log(`✅ [TENANT BY ID] Encontrado: ${tenant.name} (${tenant.id})`);
      return tenant;
    }

    console.log(`❌ [TENANT BY ID] Tenant não encontrado: ${tenantId}`);
    return null;
  } catch (error) {
    console.error('🚨 [TENANT BY ID] Erro na busca:', { tenantId, error });
    return null;
  }
}

/**
 * Helper para logs consistentes
 */
export function logTenantResolution(tenant: any | null, context: string = '') {
  if (tenant) {
    console.log(`🎯 [${context}] Tenant resolvido: ${tenant.name} (${tenant.id}) - ${tenant.whatsapp_phone || tenant.phone}`);
  } else {
    console.log(`❌ [${context}] Nenhum tenant resolvido`);
  }
}

/**
 * Configuração padrão para testes
 */
export const TEST_CONFIG = {
  // Usar variáveis de ambiente ou resolução dinâmica
  getTenantId: async (domain?: string): Promise<string> => {
    if (process.env.TENANT_ID) {
      console.log(`🔧 [TEST CONFIG] Usando TENANT_ID do .env: ${process.env.TENANT_ID}`);
      return process.env.TENANT_ID;
    }

    const tenant = domain
      ? await getActiveTenantByDomain(domain)
      : await getFirstActiveTenant();

    if (!tenant) {
      throw new Error(`Nenhum tenant ativo encontrado${domain ? ` para domínio ${domain}` : ''}`);
    }

    return tenant.id;
  },

  getWhatsappNumber: async (domain?: string): Promise<string> => {
    if (process.env.WHATSAPP_NUMBER) {
      console.log(`🔧 [TEST CONFIG] Usando WHATSAPP_NUMBER do .env: ${process.env.WHATSAPP_NUMBER}`);
      return process.env.WHATSAPP_NUMBER;
    }

    const tenant = domain
      ? await getActiveTenantByDomain(domain)
      : await getFirstActiveTenant();

    if (!tenant) {
      throw new Error(`Nenhum tenant ativo encontrado${domain ? ` para domínio ${domain}` : ''}`);
    }

    return tenant.whatsapp_phone || tenant.phone;
  }
};