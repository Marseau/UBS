/**
 * Contract Security Service
 * Handles token validation, integrity checks, and audit logging
 */

import crypto from 'crypto';
import { supabase } from '../config/database';

// Token expiration time in days
const TOKEN_EXPIRATION_DAYS = 7;

// Rate limiting: max access attempts per hour
const MAX_ACCESS_PER_HOUR = 10;

interface TokenValidationResult {
  valid: boolean;
  reason: string;
  deliveryId?: string;
  delivery?: any;
}

interface AccessLogEntry {
  delivery_id?: string;
  contract_id?: string;
  action: 'view' | 'sign' | 'download' | 'email_sent' | 'link_generated';
  ip_address?: string;
  user_agent?: string;
  success: boolean;
  error_message?: string;
  metadata?: Record<string, any>;
}

class ContractSecurityService {
  /**
   * Generate integrity hash for contract data
   * Used to verify the contract hasn't been tampered with
   */
  generateIntegrityHash(data: {
    client_name: string;
    client_document: string;
    contract_value: number;
    lead_value: number;
    signature_name: string;
    signature_date: string;
  }): string {
    const secret = process.env.CONTRACT_INTEGRITY_SECRET || process.env.JWT_SECRET || 'aic-contract-secret';
    const payload = JSON.stringify({
      cn: data.client_name,
      cd: data.client_document,
      cv: data.contract_value,
      lv: data.lead_value,
      sn: data.signature_name,
      sd: data.signature_date
    });

    return crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
  }

  /**
   * Verify contract integrity
   */
  verifyIntegrity(contract: any): boolean {
    if (!contract.integrity_hash) return false;

    const expectedHash = this.generateIntegrityHash({
      client_name: contract.client_name,
      client_document: contract.client_document,
      contract_value: contract.contract_value,
      lead_value: contract.lead_value,
      signature_name: contract.signature_name,
      signature_date: contract.signature_date
    });

    return crypto.timingSafeEqual(
      Buffer.from(contract.integrity_hash),
      Buffer.from(expectedHash)
    );
  }

  /**
   * Generate verification code for contract (human-readable)
   */
  generateVerificationCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No confusing chars (0,O,1,I)
    let code = '';
    for (let i = 0; i < 12; i++) {
      if (i > 0 && i % 4 === 0) code += '-';
      code += chars[crypto.randomInt(chars.length)];
    }
    return code; // Format: XXXX-XXXX-XXXX
  }

  /**
   * Validate contract token with rate limiting and expiration check
   */
  async validateToken(token: string, ip?: string): Promise<TokenValidationResult> {
    try {
      // Basic format validation
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!token || !uuidRegex.test(token)) {
        return { valid: false, reason: 'Formato de token invalido' };
      }

      // Get delivery by token
      const { data: delivery, error } = await supabase
        .from('aic_lead_deliveries')
        .select('*, cluster_campaigns(*)')
        .eq('contract_token', token)
        .single();

      if (error || !delivery) {
        await this.logAccess({
          action: 'view',
          ip_address: ip,
          success: false,
          error_message: 'Token nao encontrado',
          metadata: { token_prefix: token.substring(0, 8) }
        });
        return { valid: false, reason: 'Link invalido ou expirado' };
      }

      // Check if already used
      if (delivery.contract_token_used_at) {
        await this.logAccess({
          delivery_id: delivery.id,
          action: 'view',
          ip_address: ip,
          success: false,
          error_message: 'Token ja utilizado'
        });
        return {
          valid: false,
          reason: 'Este link ja foi utilizado para assinar o contrato',
          deliveryId: delivery.id
        };
      }

      // Check expiration
      if (delivery.contract_token_expires_at) {
        const expiresAt = new Date(delivery.contract_token_expires_at);
        if (expiresAt < new Date()) {
          await this.logAccess({
            delivery_id: delivery.id,
            action: 'view',
            ip_address: ip,
            success: false,
            error_message: 'Token expirado'
          });
          return {
            valid: false,
            reason: 'Este link expirou. Solicite um novo link.',
            deliveryId: delivery.id
          };
        }
      }

      // Check if already signed
      if (delivery.status === 'contrato_assinado') {
        return {
          valid: false,
          reason: 'already_signed',
          deliveryId: delivery.id,
          delivery
        };
      }

      // Rate limiting - check access count in last hour
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count } = await supabase
        .from('aic_contract_access_logs')
        .select('*', { count: 'exact', head: true })
        .eq('delivery_id', delivery.id)
        .eq('action', 'view')
        .gte('created_at', oneHourAgo);

      if (count && count >= MAX_ACCESS_PER_HOUR) {
        await this.logAccess({
          delivery_id: delivery.id,
          action: 'view',
          ip_address: ip,
          success: false,
          error_message: 'Rate limit exceeded'
        });
        return {
          valid: false,
          reason: 'Muitas tentativas de acesso. Tente novamente em 1 hora.'
        };
      }

      // Update access tracking
      await supabase
        .from('aic_lead_deliveries')
        .update({
          contract_access_count: (delivery.contract_access_count || 0) + 1,
          contract_last_access_ip: ip
        })
        .eq('id', delivery.id);

      // Log successful access
      await this.logAccess({
        delivery_id: delivery.id,
        action: 'view',
        ip_address: ip,
        success: true
      });

      return {
        valid: true,
        reason: 'Token valido',
        deliveryId: delivery.id,
        delivery
      };

    } catch (error) {
      console.error('[ContractSecurity] Token validation error:', error);
      return { valid: false, reason: 'Erro ao validar token' };
    }
  }

  /**
   * Invalidate token after successful signature
   */
  async invalidateToken(deliveryId: string): Promise<void> {
    await supabase
      .from('aic_lead_deliveries')
      .update({
        contract_token_used_at: new Date().toISOString()
      })
      .eq('id', deliveryId);
  }

  /**
   * Generate new token with expiration
   */
  async generateSecureToken(deliveryId: string): Promise<string> {
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + TOKEN_EXPIRATION_DAYS * 24 * 60 * 60 * 1000);

    await supabase
      .from('aic_lead_deliveries')
      .update({
        contract_token: token,
        contract_token_expires_at: expiresAt.toISOString(),
        contract_token_used_at: null, // Reset if regenerating
        contract_access_count: 0
      })
      .eq('id', deliveryId);

    await this.logAccess({
      delivery_id: deliveryId,
      action: 'link_generated',
      success: true,
      metadata: { expires_at: expiresAt.toISOString() }
    });

    return token;
  }

  /**
   * Log access for audit trail
   */
  async logAccess(entry: AccessLogEntry): Promise<void> {
    try {
      await supabase
        .from('aic_contract_access_logs')
        .insert({
          delivery_id: entry.delivery_id,
          contract_id: entry.contract_id,
          action: entry.action,
          ip_address: entry.ip_address,
          user_agent: entry.user_agent,
          success: entry.success,
          error_message: entry.error_message,
          metadata: entry.metadata || {}
        });
    } catch (error) {
      console.error('[ContractSecurity] Failed to log access:', error);
    }
  }

  /**
   * Validate signature data completeness
   */
  validateSignatureData(data: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Required fields
    if (!data.client_name?.trim()) errors.push('Nome do cliente obrigatorio');
    if (!data.client_document?.trim()) errors.push('CPF/CNPJ obrigatorio');
    if (!data.client_email?.trim()) errors.push('Email obrigatorio');
    if (!data.signature_name?.trim()) errors.push('Assinatura obrigatoria');

    // Email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (data.client_email && !emailRegex.test(data.client_email)) {
      errors.push('Formato de email invalido');
    }

    // CPF/CNPJ basic validation (length)
    const docClean = data.client_document?.replace(/\D/g, '') || '';
    if (docClean && docClean.length !== 11 && docClean.length !== 14) {
      errors.push('CPF deve ter 11 digitos ou CNPJ 14 digitos');
    }

    // Signature must match client name (first word at minimum)
    if (data.signature_name && data.client_name) {
      const sigFirstWord = data.signature_name.trim().split(' ')[0].toLowerCase();
      const nameFirstWord = data.client_name.trim().split(' ')[0].toLowerCase();
      if (sigFirstWord !== nameFirstWord) {
        errors.push('Assinatura deve corresponder ao nome do contratante');
      }
    }

    // Terms must be accepted
    if (!data.terms_accepted) {
      errors.push('Voce deve aceitar os termos do contrato');
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Get access history for a contract
   */
  async getAccessHistory(deliveryId: string): Promise<any[]> {
    const { data, error } = await supabase
      .from('aic_contract_access_logs')
      .select('*')
      .eq('delivery_id', deliveryId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('[ContractSecurity] Failed to get access history:', error);
      return [];
    }

    return data || [];
  }
}

export const contractSecurityService = new ContractSecurityService();
export default contractSecurityService;
