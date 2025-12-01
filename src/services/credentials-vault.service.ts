/**
 * CREDENTIALS VAULT SERVICE
 *
 * Serviço de criptografia para armazenamento seguro de credenciais.
 * Usa AES-256-GCM para criptografia autenticada.
 *
 * IMPORTANTE:
 * - A chave mestre (CREDENTIALS_MASTER_KEY) deve ser armazenada em variável de ambiente
 * - NUNCA commitar a chave no código
 * - Rotacionar a chave periodicamente
 * - Todo acesso às credenciais é logado para auditoria
 */

import * as crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

// Supabase client
const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// ============================================================================
// CONFIGURAÇÃO
// ============================================================================

const CONFIG = {
  // Algoritmo de criptografia
  ALGORITHM: 'aes-256-gcm' as const,

  // Tamanho do IV (Initialization Vector) em bytes
  IV_LENGTH: 16,

  // Tamanho do Auth Tag em bytes
  AUTH_TAG_LENGTH: 16,

  // Encoding para strings
  ENCODING: 'base64' as const
};

// ============================================================================
// TIPOS
// ============================================================================

export interface EncryptedData {
  encryptedText: string;   // Texto criptografado (base64)
  iv: string;              // Initialization Vector (base64)
  authTag: string;         // Authentication Tag (base64)
}

export interface InstagramCredentials {
  username: string;
  password: string;
}

export interface InstagramAccount {
  id: string;
  campaignId: string;
  accountName: string;
  instagramUsername: string;
  instagramUserId?: string;
  status: string;
  sessionDataEncrypted?: string;
  sessionExpiresAt?: Date;
  followsToday: number;
  unfollowsToday: number;
  dmsSentToday: number;
  followsThisHour: number;
  maxFollowsPerDay: number;
  maxUnfollowsPerDay: number;
  maxDmsPerDay: number;
  maxFollowsPerHour: number;
  allowedHoursStart: number;
  allowedHoursEnd: number;
  allowedDays: number[];
  lastActionAt?: Date;
  lastLoginAt?: Date;
  lastError?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface RateLimitStatus {
  canFollow: boolean;
  canUnfollow: boolean;
  canDm: boolean;
  followsRemainingToday: number;
  followsRemainingHour: number;
  unfollowsRemainingToday: number;
  dmsRemainingToday: number;
  isWithinHours: boolean;
  reason: string;
}

// ============================================================================
// FUNÇÕES DE CRIPTOGRAFIA
// ============================================================================

/**
 * Obtém a chave mestre de criptografia
 * IMPORTANTE: Esta chave deve estar em variável de ambiente
 */
function getMasterKey(): Buffer {
  const masterKey = process.env.CREDENTIALS_MASTER_KEY;

  if (!masterKey) {
    throw new Error(
      'CREDENTIALS_MASTER_KEY não configurada. ' +
      'Gere uma chave com: openssl rand -base64 32'
    );
  }

  // Decodificar de base64 e garantir 32 bytes (256 bits)
  const keyBuffer = Buffer.from(masterKey, 'base64');

  if (keyBuffer.length !== 32) {
    throw new Error(
      'CREDENTIALS_MASTER_KEY deve ter exatamente 32 bytes (256 bits). ' +
      'Gere uma nova com: openssl rand -base64 32'
    );
  }

  return keyBuffer;
}

/**
 * Criptografa um texto usando AES-256-GCM
 */
export function encrypt(plainText: string): EncryptedData {
  const masterKey = getMasterKey();

  // Gerar IV aleatório
  const iv = crypto.randomBytes(CONFIG.IV_LENGTH);

  // Criar cipher
  const cipher = crypto.createCipheriv(CONFIG.ALGORITHM, masterKey, iv);

  // Criptografar
  let encrypted = cipher.update(plainText, 'utf8', CONFIG.ENCODING);
  encrypted += cipher.final(CONFIG.ENCODING);

  // Obter auth tag
  const authTag = cipher.getAuthTag();

  return {
    encryptedText: encrypted,
    iv: iv.toString(CONFIG.ENCODING),
    authTag: authTag.toString(CONFIG.ENCODING)
  };
}

/**
 * Descriptografa um texto usando AES-256-GCM
 */
export function decrypt(encryptedData: EncryptedData): string {
  const masterKey = getMasterKey();

  // Decodificar IV e Auth Tag
  const iv = Buffer.from(encryptedData.iv, CONFIG.ENCODING);
  const authTag = Buffer.from(encryptedData.authTag, CONFIG.ENCODING);

  // Criar decipher
  const decipher = crypto.createDecipheriv(CONFIG.ALGORITHM, masterKey, iv);
  decipher.setAuthTag(authTag);

  // Descriptografar
  let decrypted = decipher.update(encryptedData.encryptedText, CONFIG.ENCODING, 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

// ============================================================================
// FUNÇÕES DE AUDITORIA
// ============================================================================

/**
 * Registra acesso às credenciais no log de auditoria
 */
async function logCredentialAccess(
  tableName: string,
  recordId: string,
  accessType: 'read' | 'decrypt' | 'update' | 'delete',
  accessedBy: string,
  reason?: string,
  success: boolean = true,
  errorMessage?: string
): Promise<void> {
  try {
    await supabase.from('credentials_access_log').insert({
      table_name: tableName,
      record_id: recordId,
      accessed_by: accessedBy,
      access_type: accessType,
      reason,
      success,
      error_message: errorMessage
    });
  } catch (error) {
    // Log de auditoria não deve interromper operação principal
    console.error('[VAULT] Erro ao registrar log de auditoria:', error);
  }
}

// ============================================================================
// GESTÃO DE CONTAS INSTAGRAM
// ============================================================================

/**
 * Cria uma nova conta Instagram com credenciais criptografadas
 */
export async function createInstagramAccount(
  campaignId: string,
  accountName: string,
  instagramUsername: string,
  password: string,
  createdBy?: string
): Promise<{ success: boolean; accountId?: string; error?: string }> {
  console.log(`\n🔐 [VAULT] Criando conta Instagram: @${instagramUsername}`);

  try {
    // Criptografar senha
    const encryptedPassword = encrypt(password);

    // Inserir no banco
    const { data, error } = await supabase
      .from('instagram_accounts')
      .insert({
        campaign_id: campaignId,
        account_name: accountName,
        instagram_username: instagramUsername,
        encrypted_password: encryptedPassword.encryptedText,
        encryption_iv: encryptedPassword.iv,
        encryption_tag: encryptedPassword.authTag,
        created_by: createdBy,
        status: 'pending_verification'
      })
      .select('id')
      .single();

    if (error) {
      throw new Error(error.message);
    }

    // Log de auditoria
    await logCredentialAccess(
      'instagram_accounts',
      data.id,
      'update',
      createdBy || 'system',
      'Criação de conta Instagram'
    );

    console.log(`   ✅ Conta criada com ID: ${data.id}`);

    return { success: true, accountId: data.id };

  } catch (error: any) {
    console.error(`   ❌ Erro ao criar conta:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Obtém credenciais descriptografadas de uma conta Instagram
 * ATENÇÃO: Usar apenas quando realmente necessário (login)
 */
export async function getInstagramCredentials(
  accountId: string,
  accessedBy: string,
  reason: string
): Promise<{ success: boolean; credentials?: InstagramCredentials; error?: string }> {
  console.log(`\n🔓 [VAULT] Descriptografando credenciais: ${accountId}`);
  console.log(`   Acessado por: ${accessedBy}`);
  console.log(`   Motivo: ${reason}`);

  try {
    // Buscar dados criptografados
    const { data, error } = await supabase
      .from('instagram_accounts')
      .select('instagram_username, encrypted_password, encryption_iv, encryption_tag')
      .eq('id', accountId)
      .single();

    if (error || !data) {
      throw new Error('Conta não encontrada');
    }

    // Descriptografar senha
    const password = decrypt({
      encryptedText: data.encrypted_password,
      iv: data.encryption_iv,
      authTag: data.encryption_tag
    });

    // Log de auditoria (IMPORTANTE!)
    await logCredentialAccess(
      'instagram_accounts',
      accountId,
      'decrypt',
      accessedBy,
      reason
    );

    console.log(`   ✅ Credenciais descriptografadas para @${data.instagram_username}`);

    return {
      success: true,
      credentials: {
        username: data.instagram_username,
        password
      }
    };

  } catch (error: any) {
    // Log de falha
    await logCredentialAccess(
      'instagram_accounts',
      accountId,
      'decrypt',
      accessedBy,
      reason,
      false,
      error.message
    );

    console.error(`   ❌ Erro ao descriptografar:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Atualiza a senha de uma conta Instagram
 */
export async function updateInstagramPassword(
  accountId: string,
  newPassword: string,
  updatedBy: string
): Promise<{ success: boolean; error?: string }> {
  console.log(`\n🔄 [VAULT] Atualizando senha: ${accountId}`);

  try {
    // Criptografar nova senha
    const encryptedPassword = encrypt(newPassword);

    // Atualizar no banco
    const { error } = await supabase
      .from('instagram_accounts')
      .update({
        encrypted_password: encryptedPassword.encryptedText,
        encryption_iv: encryptedPassword.iv,
        encryption_tag: encryptedPassword.authTag,
        updated_at: new Date().toISOString()
      })
      .eq('id', accountId);

    if (error) {
      throw new Error(error.message);
    }

    // Log de auditoria
    await logCredentialAccess(
      'instagram_accounts',
      accountId,
      'update',
      updatedBy,
      'Atualização de senha'
    );

    console.log(`   ✅ Senha atualizada`);

    return { success: true };

  } catch (error: any) {
    console.error(`   ❌ Erro ao atualizar senha:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Armazena dados de sessão criptografados (cookies após login)
 */
export async function storeSessionData(
  accountId: string,
  sessionData: string,
  expiresAt: Date
): Promise<{ success: boolean; error?: string }> {
  try {
    // Criptografar dados de sessão
    const encryptedSession = encrypt(sessionData);

    // Concatenar IV + Tag + Encrypted para armazenamento único
    const sessionEncrypted = JSON.stringify({
      data: encryptedSession.encryptedText,
      iv: encryptedSession.iv,
      tag: encryptedSession.authTag
    });

    // Atualizar no banco
    const { error } = await supabase
      .from('instagram_accounts')
      .update({
        session_data_encrypted: sessionEncrypted,
        session_expires_at: expiresAt.toISOString(),
        last_login_at: new Date().toISOString(),
        status: 'active'
      })
      .eq('id', accountId);

    if (error) {
      throw new Error(error.message);
    }

    // Log de auditoria
    await logCredentialAccess(
      'instagram_accounts',
      accountId,
      'update',
      'system',
      'Armazenamento de sessão após login'
    );

    return { success: true };

  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Obtém dados de sessão descriptografados
 */
export async function getSessionData(
  accountId: string
): Promise<{ success: boolean; sessionData?: string; expiresAt?: Date; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('instagram_accounts')
      .select('session_data_encrypted, session_expires_at')
      .eq('id', accountId)
      .single();

    if (error || !data || !data.session_data_encrypted) {
      return { success: false, error: 'Sessão não encontrada' };
    }

    // Verificar expiração
    if (data.session_expires_at && new Date(data.session_expires_at) < new Date()) {
      return { success: false, error: 'Sessão expirada' };
    }

    // Descriptografar
    const sessionParts = JSON.parse(data.session_data_encrypted);
    const sessionData = decrypt({
      encryptedText: sessionParts.data,
      iv: sessionParts.iv,
      authTag: sessionParts.tag
    });

    return {
      success: true,
      sessionData,
      expiresAt: data.session_expires_at ? new Date(data.session_expires_at) : undefined
    };

  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ============================================================================
// GESTÃO DE CONTAS
// ============================================================================

/**
 * Busca conta Instagram por campanha
 */
export async function getAccountByCampaign(
  campaignId: string
): Promise<InstagramAccount | null> {
  const { data, error } = await supabase
    .from('instagram_accounts')
    .select('*')
    .eq('campaign_id', campaignId)
    .single();

  if (error || !data) {
    return null;
  }

  return {
    id: data.id,
    campaignId: data.campaign_id,
    accountName: data.account_name,
    instagramUsername: data.instagram_username,
    instagramUserId: data.instagram_user_id,
    status: data.status,
    sessionDataEncrypted: data.session_data_encrypted,
    sessionExpiresAt: data.session_expires_at ? new Date(data.session_expires_at) : undefined,
    followsToday: data.follows_today || 0,
    unfollowsToday: data.unfollows_today || 0,
    dmsSentToday: data.dms_sent_today || 0,
    followsThisHour: data.follows_this_hour || 0,
    maxFollowsPerDay: data.max_follows_per_day,
    maxUnfollowsPerDay: data.max_unfollows_per_day,
    maxDmsPerDay: data.max_dms_per_day,
    maxFollowsPerHour: data.max_follows_per_hour,
    allowedHoursStart: data.allowed_hours_start,
    allowedHoursEnd: data.allowed_hours_end,
    allowedDays: data.allowed_days,
    lastActionAt: data.last_action_at ? new Date(data.last_action_at) : undefined,
    lastLoginAt: data.last_login_at ? new Date(data.last_login_at) : undefined,
    lastError: data.last_error,
    createdAt: new Date(data.created_at),
    updatedAt: new Date(data.updated_at)
  };
}

/**
 * Lista todas as contas Instagram
 */
export async function listInstagramAccounts(): Promise<InstagramAccount[]> {
  const { data, error } = await supabase
    .from('instagram_accounts')
    .select('*')
    .order('created_at', { ascending: false });

  if (error || !data) {
    return [];
  }

  return data.map(d => ({
    id: d.id,
    campaignId: d.campaign_id,
    accountName: d.account_name,
    instagramUsername: d.instagram_username,
    instagramUserId: d.instagram_user_id,
    status: d.status,
    sessionDataEncrypted: d.session_data_encrypted,
    sessionExpiresAt: d.session_expires_at ? new Date(d.session_expires_at) : undefined,
    followsToday: d.follows_today || 0,
    unfollowsToday: d.unfollows_today || 0,
    dmsSentToday: d.dms_sent_today || 0,
    followsThisHour: d.follows_this_hour || 0,
    maxFollowsPerDay: d.max_follows_per_day,
    maxUnfollowsPerDay: d.max_unfollows_per_day,
    maxDmsPerDay: d.max_dms_per_day,
    maxFollowsPerHour: d.max_follows_per_hour,
    allowedHoursStart: d.allowed_hours_start,
    allowedHoursEnd: d.allowed_hours_end,
    allowedDays: d.allowed_days,
    lastActionAt: d.last_action_at ? new Date(d.last_action_at) : undefined,
    lastLoginAt: d.last_login_at ? new Date(d.last_login_at) : undefined,
    lastError: d.last_error,
    createdAt: new Date(d.created_at),
    updatedAt: new Date(d.updated_at)
  }));
}

/**
 * Atualiza status de uma conta
 */
export async function updateAccountStatus(
  accountId: string,
  status: string,
  errorMessage?: string
): Promise<void> {
  const updateData: any = {
    status,
    updated_at: new Date().toISOString()
  };

  if (errorMessage) {
    updateData.last_error = errorMessage;
    updateData.last_error_at = new Date().toISOString();
  }

  await supabase
    .from('instagram_accounts')
    .update(updateData)
    .eq('id', accountId);
}

/**
 * Verifica rate limit de uma conta
 */
export async function checkRateLimit(accountId: string): Promise<RateLimitStatus> {
  const { data } = await supabase.rpc('check_instagram_account_rate_limit', {
    p_account_id: accountId
  });

  if (!data || data.length === 0) {
    return {
      canFollow: false,
      canUnfollow: false,
      canDm: false,
      followsRemainingToday: 0,
      followsRemainingHour: 0,
      unfollowsRemainingToday: 0,
      dmsRemainingToday: 0,
      isWithinHours: false,
      reason: 'Conta não encontrada'
    };
  }

  const result = data[0];
  return {
    canFollow: result.can_follow,
    canUnfollow: result.can_unfollow,
    canDm: result.can_dm,
    followsRemainingToday: result.follows_remaining_today,
    followsRemainingHour: result.follows_remaining_hour,
    unfollowsRemainingToday: result.unfollows_remaining_today,
    dmsRemainingToday: result.dms_remaining_today,
    isWithinHours: result.is_within_hours,
    reason: result.reason
  };
}

/**
 * Incrementa contador de ação
 */
export async function incrementAction(
  accountId: string,
  actionType: 'follow' | 'unfollow' | 'dm'
): Promise<void> {
  await supabase.rpc('increment_instagram_action', {
    p_account_id: accountId,
    p_action_type: actionType
  });
}

// ============================================================================
// EXPORT
// ============================================================================

export const credentialsVault = {
  // Criptografia
  encrypt,
  decrypt,

  // Contas Instagram
  createInstagramAccount,
  getInstagramCredentials,
  updateInstagramPassword,
  storeSessionData,
  getSessionData,
  getAccountByCampaign,
  listInstagramAccounts,
  updateAccountStatus,

  // Rate Limits
  checkRateLimit,
  incrementAction
};

export default credentialsVault;
