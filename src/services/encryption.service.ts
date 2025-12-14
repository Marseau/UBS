/**
 * ENCRYPTION SERVICE
 *
 * Serviço para criptografar/descriptografar dados sensíveis como
 * credenciais OAuth do Google Calendar.
 *
 * Usa AES-256-GCM para criptografia simétrica com chave derivada de senha.
 */

import crypto from 'crypto';

// ============================================================================
// CONFIGURAÇÃO
// ============================================================================

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16;  // 128 bits
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;

// Chave mestre (DEVE estar em .env em produção)
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-key-change-in-production';

// ============================================================================
// FUNÇÕES DE CRIPTOGRAFIA
// ============================================================================

/**
 * Deriva uma chave de criptografia a partir da chave mestre
 */
function deriveKey(salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(
    ENCRYPTION_KEY,
    salt,
    100000, // iterations
    KEY_LENGTH,
    'sha512'
  );
}

/**
 * Criptografa um texto usando AES-256-GCM
 *
 * @param plaintext - Texto a ser criptografado
 * @returns String base64 com formato: salt:iv:encrypted:tag
 */
export function encrypt(plaintext: string): string {
  if (!plaintext) {
    throw new Error('[ENCRYPTION] Plaintext não pode ser vazio');
  }

  // Gerar salt e IV aleatórios
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);

  // Derivar chave a partir da chave mestre
  const key = deriveKey(salt);

  // Criar cipher
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  // Criptografar
  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  // Obter tag de autenticação
  const tag = cipher.getAuthTag();

  // Retornar formato: salt:iv:encrypted:tag (tudo em base64)
  return [
    salt.toString('base64'),
    iv.toString('base64'),
    encrypted,
    tag.toString('base64')
  ].join(':');
}

/**
 * Descriptografa um texto criptografado com encrypt()
 *
 * @param ciphertext - String no formato salt:iv:encrypted:tag
 * @returns Texto descriptografado
 */
export function decrypt(ciphertext: string): string {
  if (!ciphertext) {
    throw new Error('[ENCRYPTION] Ciphertext não pode ser vazio');
  }

  // Separar componentes
  const parts = ciphertext.split(':');
  if (parts.length !== 4) {
    throw new Error('[ENCRYPTION] Formato de ciphertext inválido');
  }

  const [saltB64, ivB64, encryptedB64, tagB64] = parts;

  // Validar que todos os componentes existem
  if (!saltB64 || !ivB64 || !encryptedB64 || !tagB64) {
    throw new Error('[ENCRYPTION] Componentes de ciphertext faltando');
  }

  // Converter de base64 para Buffer
  const salt = Buffer.from(saltB64, 'base64');
  const iv = Buffer.from(ivB64, 'base64');
  const encrypted = Buffer.from(encryptedB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');

  // Derivar chave
  const key = deriveKey(salt);

  // Criar decipher
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  // Descriptografar
  let decrypted = decipher.update(encrypted, undefined, 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

// ============================================================================
// FUNÇÕES ESPECÍFICAS PARA OAUTH
// ============================================================================

/**
 * Criptografa credenciais OAuth do Google
 */
export function encryptOAuthCredentials(credentials: {
  client_secret?: string;
  refresh_token?: string;
  access_token?: string;
}): {
  encrypted_client_secret?: string;
  encrypted_refresh_token?: string;
  encrypted_access_token?: string;
} {
  const result: any = {};

  if (credentials.client_secret) {
    result.encrypted_client_secret = encrypt(credentials.client_secret);
  }

  if (credentials.refresh_token) {
    result.encrypted_refresh_token = encrypt(credentials.refresh_token);
  }

  if (credentials.access_token) {
    result.encrypted_access_token = encrypt(credentials.access_token);
  }

  return result;
}

/**
 * Descriptografa credenciais OAuth do Google
 */
export function decryptOAuthCredentials(encryptedCredentials: {
  encrypted_client_secret?: string;
  encrypted_refresh_token?: string;
  encrypted_access_token?: string;
}): {
  client_secret?: string;
  refresh_token?: string;
  access_token?: string;
} {
  const result: any = {};

  try {
    if (encryptedCredentials.encrypted_client_secret) {
      result.client_secret = decrypt(encryptedCredentials.encrypted_client_secret);
    }

    if (encryptedCredentials.encrypted_refresh_token) {
      result.refresh_token = decrypt(encryptedCredentials.encrypted_refresh_token);
    }

    if (encryptedCredentials.encrypted_access_token) {
      result.access_token = decrypt(encryptedCredentials.encrypted_access_token);
    }

    return result;
  } catch (error: any) {
    console.error('[ENCRYPTION] Erro ao descriptografar credenciais OAuth:', error.message);
    throw new Error('Falha ao descriptografar credenciais OAuth');
  }
}

// ============================================================================
// VALIDAÇÃO
// ============================================================================

/**
 * Valida se a chave de criptografia está configurada
 */
export function validateEncryptionSetup(): boolean {
  if (!process.env.ENCRYPTION_KEY) {
    console.warn('⚠️ [ENCRYPTION] ENCRYPTION_KEY não configurada! Usando chave padrão (INSEGURO)');
    return false;
  }

  if (process.env.ENCRYPTION_KEY.length < 32) {
    console.warn('⚠️ [ENCRYPTION] ENCRYPTION_KEY muito curta! Mínimo recomendado: 32 caracteres');
    return false;
  }

  return true;
}

// ============================================================================
// EXPORT
// ============================================================================

export const encryptionService = {
  encrypt,
  decrypt,
  encryptOAuthCredentials,
  decryptOAuthCredentials,
  validateEncryptionSetup
};

export default encryptionService;
