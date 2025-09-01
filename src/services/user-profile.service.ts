import { createClient } from '@supabase/supabase-js';

// Criar client Supabase básico sem tipos específicos
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Simple utilities
function normalizeE164(phone: string): string {
  return phone.replace(/[\s\-\(\)]/g, '');
}

export interface UserProfileData {
  tenantId: string;
  userPhone: string;
  name?: string;
  email?: string;
  gender?: string;
}

export interface ConversationState {
  tenantId: string;
  userId: string;
  current_state: 'idle' | 'onboarding_need_name' | 'onboarding_need_email' | string;
  context?: any;
}

/**
 * Insere ou atualiza perfil do usuário no banco
 */
export async function upsertUserProfile({ 
  tenantId, 
  userPhone, 
  name, 
  email, 
  gender 
}: UserProfileData): Promise<string> {
  const phone = normalizeE164(userPhone);
  
  console.log(`🔧 [UPSERT] Persistindo usuário ${phone} no Supabase`);
  console.log(`🔧 [UPSERT PARAMS] name: "${name}", email: "${email}", gender: "${gender}"`);
  
  // Build payload only with defined values to avoid overwriting with null
  const userPayload: any = { phone };
  if (name) userPayload.name = name;
  if (email) userPayload.email = email;
  if (gender) userPayload.gender = gender;
  
  // Upsert user in Supabase
  const { data: user, error: userError } = await supabase
    .from('users')
    .upsert(userPayload, { 
      onConflict: 'phone',
      ignoreDuplicates: false 
    })
    .select()
    .single();

  if (userError) {
    console.error('❌ Error upserting user:', userError);
    throw userError;
  }

  console.log(`✅ [UPSERT] Usuário criado/atualizado: ${user.id}`);

  // Upsert user_tenants relationship
  const { error: tenantError } = await supabase
    .from('user_tenants')
    .upsert({ 
      user_id: user.id, 
      tenant_id: tenantId, 
      role: 'customer' 
    }, { 
      onConflict: 'user_id,tenant_id',
      ignoreDuplicates: true 
    });

  if (tenantError) {
    console.error('❌ Error upserting user_tenants:', tenantError);
    throw tenantError;
  }

  console.log(`✅ [UPSERT] Relacionamento tenant criado: ${user.id} -> ${tenantId}`);
  
  return user.id;
}

/**
 * Obter estado da conversa do usuário
 */
export async function getConversationState({ 
  tenantId, 
  userId 
}: { tenantId: string; userId: string }): Promise<ConversationState> {
  const phone = normalizeE164(userId);
  
  console.log(`🔍 [STATE] Buscando estado para ${phone} no Supabase`);
  
  // Primeiro verificar se usuário existe
  const { data: user } = await supabase
    .from('users')
    .select('id')
    .eq('phone', phone)
    .single();
  
  if (!user) {
    console.log(`🆕 [STATE] Usuário não existe, criando estado inicial para ${phone}`);
    return {
      tenantId,
      userId,
      current_state: 'onboarding_need_name',
      context: {}
    };
  }
  
  // Buscar estado da conversa no Supabase usando SQL raw  
  const { data: stateRows, error } = await supabase
    .from('conversation_states' as any)
    .select('current_state, context')
    .eq('tenant_id', tenantId)
    .eq('user_id', user.id)
    .limit(1);
  
  if (error) {
    console.error('❌ [STATE] Erro ao buscar estado:', error);
    throw error;
  }
  
  if (stateRows && stateRows.length > 0) {
    const state = stateRows[0];
    console.log(`✅ [STATE] Estado encontrado para ${phone}: ${state.current_state}`);
    return {
      tenantId,
      userId,
      current_state: state.current_state || 'idle',
      context: state.context || {}
    };
  }
  
  // Estado não existe, criar inicial
  console.log(`🆕 [STATE] Criando estado inicial para ${phone}`);
  return {
    tenantId,
    userId,
    current_state: 'onboarding_need_name',
    context: {}
  };
}

/**
 * Definir estado da conversa do usuário  
 */
export async function setConversationState({
  tenantId,
  userId,
  state,
  context = {}
}: {
  tenantId: string;
  userId: string;
  state: string;
  context?: any;
}): Promise<void> {
  const phone = normalizeE164(userId);
  
  console.log(`🔄 [STATE] Persistindo estado ${state} para ${phone} no Supabase`);
  
  // Primeiro garantir que o usuário existe
  const { data: user } = await supabase
    .from('users')
    .select('id')
    .eq('phone', phone)
    .single();
    
  if (!user) {
    console.error(`❌ [STATE] Usuário ${phone} não encontrado para atualizar estado`);
    throw new Error('Usuário não encontrado');
  }
  
  // Upsert do estado da conversa
  const { error } = await supabase
    .from('conversation_states' as any)
    .upsert({
      tenant_id: tenantId,
      user_id: user.id,
      current_state: state,
      context: context,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24h
    }, {
      onConflict: 'tenant_id,user_id',
      ignoreDuplicates: false
    });
  
  if (error) {
    console.error('❌ [STATE] Erro ao persistir estado:', error);
    throw error;
  }
  
  console.log(`✅ [STATE] Estado ${state} persistido para ${phone}`);
}