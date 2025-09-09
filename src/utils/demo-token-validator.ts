import * as crypto from "crypto";

const DEMO_SECRET = process.env.DEMO_MODE_TOKEN || "fixed-secret-for-load-test-2025";

// simples e suficiente para DEMO (sem HMAC no browser)
export default function verifyDemoToken(headerValue?: string): boolean {
  const secret = process.env.DEMO_MODE_TOKEN || "fixed-secret-for-load-test-2025";
  return !!headerValue && headerValue === secret;
}

// =====================================================
// Shared in-memory secret management (process-wide)
// Colocado no topo para evitar TDZ em inicialização
// =====================================================
let SHARED_DEMO_SECRET: string | null = null;
let SHARED_DEMO_SECRET_CREATED = false;

function getOrCreateSharedSecret(): string {
  if (SHARED_DEMO_SECRET) {
    return SHARED_DEMO_SECRET;
  }
  SHARED_DEMO_SECRET = crypto.randomBytes(32).toString('hex');
  SHARED_DEMO_SECRET_CREATED = true;
  return SHARED_DEMO_SECRET;
}

function sharedWasNewlyGenerated(): boolean {
  const wasNew = SHARED_DEMO_SECRET_CREATED;
  // Reset flag para evitar logs repetidos
  SHARED_DEMO_SECRET_CREATED = false;
  return wasNew;
}

/**
 * Sistema de validação de tokens HMAC para demo mode
 * Substitui x-demo-mode inseguro por x-demo-token assinado
 */

interface DemoTokenPayload {
  timestamp: number;
  tenantId?: string;
  source: 'demo_ui' | 'test_suite';
  expiresIn: number; // milliseconds
}

export class DemoTokenValidator {
  private readonly secret: string;
  private readonly maxAge: number = 5 * 60 * 1000; // 5 minutos

  constructor() {
    // Compartilhar um secret em memória entre múltiplas instâncias no mesmo processo
    // para evitar tokens inválidos quando DEMO_MODE_TOKEN não está configurado.
    const shared = getOrCreateSharedSecret();
    this.secret = process.env.DEMO_MODE_TOKEN || shared;
    if (!process.env.DEMO_MODE_TOKEN && sharedWasNewlyGenerated()) {
      console.warn('⚠️ DEMO_MODE_TOKEN não configurado, usando secret temporário compartilhado em memória');
    }
  }

  /**
   * Gera token HMAC assinado para demo mode
   */
  generateToken(payload: Omit<DemoTokenPayload, 'timestamp' | 'expiresIn'>): string {
    const fullPayload: DemoTokenPayload = {
      ...payload,
      timestamp: Date.now(),
      expiresIn: this.maxAge
    };

    const dataToSign = JSON.stringify(fullPayload);
    const signature = crypto
      .createHmac('sha256', this.secret)
      .update(dataToSign)
      .digest('hex');

    // Base64 encode: payload + signature
    const token = Buffer.from(`${dataToSign}.${signature}`).toString('base64');
    return token;
  }

  /**
   * Valida token HMAC e retorna payload se válido
   */
  validateToken(token: string): DemoTokenPayload | null {
    try {
      // Decode base64
      const decoded = Buffer.from(token, 'base64').toString('utf-8');
      const [payloadStr, signature] = decoded.split('.');

      if (!payloadStr || !signature) {
        console.log('🔒 Token inválido: formato incorreto');
        return null;
      }

      // Verify signature
      const expectedSignature = crypto
        .createHmac('sha256', this.secret)
        .update(payloadStr)
        .digest('hex');

      // Use timing-safe comparison - ensure same length buffers
      const signatureBuffer = Buffer.from(signature, 'hex');
      const expectedBuffer = Buffer.from(expectedSignature, 'hex');
      
      if (signatureBuffer.length !== expectedBuffer.length || 
          !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
        console.log('🔒 Token inválido: assinatura incorreta');
        return null;
      }

      // Parse payload
      const payload: DemoTokenPayload = JSON.parse(payloadStr);
      console.log('📋 [DemoTokenValidator] Payload parsed:', payload);

      // Check expiration
      const age = Date.now() - payload.timestamp;
      if (age > payload.expiresIn) {
        console.log('🔒 Token expirado:', { age, maxAge: payload.expiresIn });
        return null;
      }

      console.log('✅ Token válido:', { source: payload.source, tenantId: payload.tenantId, age: `${Math.round(age/1000)}s` });
      return payload;

    } catch (error) {
      console.log('🔒 Erro ao validar token:', error);
      return null;
    }
  }

  /**
   * Middleware Express para validação de demo tokens
   */
  middleware() {
    return (req: any, res: any, next: any) => {
      const demoToken = req.headers['x-demo-token'];

      if (!demoToken) {
        // Não é request de demo, continuar normal
        req.demoMode = null;
        return next();
      }

      const payload = this.validateToken(demoToken as string);
      if (!payload) {
        console.log('🔒 Demo token inválido, rejeitando request');
        return res.status(401).json({ 
          error: 'Invalid demo token',
          code: 'DEMO_TOKEN_INVALID'
        });
      }

      // Token válido, marcar como demo mode
      req.demoMode = payload;
      console.log('🎭 Demo mode ativado:', payload.source);
      next();
    };
  }

  /**
   * Gera secret padrão se não configurado (apenas para desenvolvimento)
   */
  private generateDefaultSecret(): string {
    return crypto.randomBytes(32).toString('hex');
  }
}

// Singleton instance - garante instância única global
let _demoTokenValidatorInstance: DemoTokenValidator | null = null;

export const demoTokenValidator = (() => {
  if (!_demoTokenValidatorInstance) {
    _demoTokenValidatorInstance = new DemoTokenValidator();
    console.log('🔑 DemoTokenValidator singleton criado');
  }
  return _demoTokenValidatorInstance;
})();

/**
 * Utility para gerar tokens de demo na CLI
 */
export function generateDemoToken(source: 'demo_ui' | 'test_suite' = 'demo_ui', tenantId?: string): string {
  return demoTokenValidator.generateToken({ source, tenantId });
}