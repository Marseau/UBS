/**
 * Electronic Signature Service
 * Provides abstraction layer for e-signature providers (D4Sign, Clicksign, etc.)
 *
 * @see https://docapi.d4sign.com.br/docs/introdução-a-api
 */

import crypto from 'crypto';

// ============================================
// INTERFACES
// ============================================

export interface SignerData {
  email: string;
  name: string;
  cpf?: string;
  phone?: string;
  /** 1=Email, 2=SMS, 3=WhatsApp, 4=Não notificar */
  authMethod?: number;
}

export interface DocumentData {
  name: string;
  /** Base64 encoded PDF */
  content: string;
  /** UUID of the safe/folder to store the document */
  safeId?: string;
}

export type DocumentStatus =
  | 'pending'      // Aguardando envio
  | 'processing'   // Processando
  | 'waiting'      // Aguardando assinatura
  | 'signed'       // Assinado por todos
  | 'cancelled'    // Cancelado
  | 'expired';     // Expirado

export interface DocumentStatusResult {
  status: DocumentStatus;
  signedAt?: string;
  signedByAll: boolean;
  signers: Array<{
    email: string;
    name: string;
    signed: boolean;
    signedAt?: string;
  }>;
}

export interface CreateDocumentResult {
  success: boolean;
  documentId?: string;
  documentKey?: string;
  error?: string;
}

export interface AddSignerResult {
  success: boolean;
  signerId?: string;
  signerKey?: string;
  error?: string;
}

export interface SigningUrlResult {
  success: boolean;
  url?: string;
  error?: string;
}

// ============================================
// ABSTRACT PROVIDER INTERFACE
// ============================================

export interface ESignatureProvider {
  readonly providerName: string;

  /**
   * Upload a document to the provider
   */
  createDocument(data: DocumentData): Promise<CreateDocumentResult>;

  /**
   * Add a signer to the document
   */
  addSigner(documentId: string, signer: SignerData): Promise<AddSignerResult>;

  /**
   * Get the signing URL for a specific signer
   */
  getSigningUrl(documentId: string, signerId: string): Promise<SigningUrlResult>;

  /**
   * Get the current status of a document
   */
  getDocumentStatus(documentId: string): Promise<DocumentStatusResult>;

  /**
   * Cancel a document
   */
  cancelDocument(documentId: string): Promise<boolean>;

  /**
   * Validate webhook signature
   */
  validateWebhookSignature(payload: string, signature: string): boolean;
}

// ============================================
// D4SIGN PROVIDER IMPLEMENTATION
// ============================================

interface D4SignConfig {
  apiKey: string;
  cryptKey: string;
  baseUrl: string;
  defaultSafeId?: string;
}

interface D4SignApiResponse {
  uuid?: string;
  uuidDoc?: string;
  key?: string;
  key_signer?: string;
  message?: string;
  statusCode?: number;
  status?: string;
  statusDoc?: string;
  list?: Array<{
    email: string;
    name: string;
    status: string;
    signed?: { status: string; date?: string };
  }>;
  url?: string;
}

export class D4SignProvider implements ESignatureProvider {
  readonly providerName = 'D4Sign';
  private config: D4SignConfig;

  constructor(config?: Partial<D4SignConfig>) {
    this.config = {
      apiKey: config?.apiKey || process.env.D4SIGN_API_KEY || '',
      cryptKey: config?.cryptKey || process.env.D4SIGN_CRYPT_KEY || '',
      baseUrl: config?.baseUrl || process.env.D4SIGN_API_URL || 'https://sandbox.d4sign.com.br/api/v1',
      defaultSafeId: config?.defaultSafeId || process.env.D4SIGN_SAFE_ID,
    };

    if (!this.config.apiKey || !this.config.cryptKey) {
      console.warn('[D4Sign] API credentials not configured. Set D4SIGN_API_KEY and D4SIGN_CRYPT_KEY.');
    }
  }

  private async request<T = D4SignApiResponse>(
    method: 'GET' | 'POST' | 'DELETE',
    endpoint: string,
    body?: Record<string, unknown>
  ): Promise<T> {
    const url = `${this.config.baseUrl}${endpoint}?tokenAPI=${this.config.apiKey}&cryptKey=${this.config.cryptKey}`;

    const options: RequestInit = {
      method,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    };

    if (body && method !== 'GET') {
      options.body = JSON.stringify(body);
    }

    console.log(`[D4Sign] ${method} ${endpoint}`);

    const response = await fetch(url, options);
    const data = await response.json() as T;

    if (!response.ok) {
      console.error('[D4Sign] API Error:', data);
      throw new Error((data as D4SignApiResponse).message || `D4Sign API error: ${response.status}`);
    }

    return data;
  }

  /**
   * Upload document to D4Sign
   * @see https://docapi.d4sign.com.br/docs/endpoints-2
   */
  async createDocument(data: DocumentData): Promise<CreateDocumentResult> {
    try {
      const safeId = data.safeId || this.config.defaultSafeId;

      if (!safeId) {
        return { success: false, error: 'Safe ID não configurado. Configure D4SIGN_SAFE_ID.' };
      }

      // D4Sign expects multipart/form-data for file upload
      // For base64, we use the /documents/{safe_id}/uploadbinary endpoint
      const result = await this.request<D4SignApiResponse>('POST', `/documents/${safeId}/uploadbinary`, {
        base64_binary_file: data.content,
        mime_type: 'application/pdf',
        name: data.name,
      });

      if (result.uuid) {
        console.log(`[D4Sign] Document created: ${result.uuid}`);
        return {
          success: true,
          documentId: result.uuid,
          documentKey: result.key,
        };
      }

      return { success: false, error: result.message || 'Erro ao criar documento' };
    } catch (error) {
      console.error('[D4Sign] createDocument error:', error);
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Add signer to document
   * @see https://docapi.d4sign.com.br/docs/endpoints-1
   */
  async addSigner(documentId: string, signer: SignerData): Promise<AddSignerResult> {
    try {
      // First, send document for signature (required before adding signers)
      await this.request('POST', `/documents/${documentId}/sendtosigner`, {
        message: 'Por favor, assine o contrato.',
        workflow: 0, // Sem ordem específica
        skip_email: signer.authMethod === 4 ? 1 : 0, // 4 = não notificar
      });

      // Add signer
      const result = await this.request<D4SignApiResponse>('POST', `/documents/${documentId}/createlist`, {
        signers: [{
          email: signer.email,
          act: '1', // 1=Assinar, 2=Aprovar, 3=Reconhecer, 4=Assinar como parte, 5=Assinar como testemunha
          foreign: '0', // 0=Brasileiro
          certificadoicpbr: '0', // 0=Não requer certificado ICP-Brasil
          assinatura_presencial: '0', // 0=Remoto
          docauth: '0', // 0=Não requer doc
          docauthandselfie: '0', // 0=Não requer selfie
          embed_methodauth: signer.authMethod?.toString() || '1', // 1=Email
          embed_smsnumber: signer.phone,
          whatsapp_number: signer.authMethod === 3 ? signer.phone : undefined,
        }],
      });

      // D4Sign returns key_signer in the response
      if (result.key_signer || result.uuid) {
        console.log(`[D4Sign] Signer added: ${signer.email}`);
        return {
          success: true,
          signerId: result.uuid || signer.email,
          signerKey: result.key_signer,
        };
      }

      return { success: false, error: result.message || 'Erro ao adicionar signatário' };
    } catch (error) {
      console.error('[D4Sign] addSigner error:', error);
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Get URL for embedded signing
   * @see https://docapi.d4sign.com.br/docs/endpoints-1
   */
  async getSigningUrl(documentId: string, signerId: string): Promise<SigningUrlResult> {
    try {
      // D4Sign uses the signer's email or key to generate URL
      const result = await this.request<D4SignApiResponse>('POST', `/documents/${documentId}/resend`, {
        email: signerId,
      });

      // For embedded signing, construct URL with signer key
      if (result.url) {
        return { success: true, url: result.url };
      }

      // If no direct URL, use the viewer with signer key
      const viewerUrl = `${this.config.baseUrl.replace('/api/v1', '')}/documents/${documentId}/viewer?key=${signerId}`;
      return { success: true, url: viewerUrl };
    } catch (error) {
      console.error('[D4Sign] getSigningUrl error:', error);
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Get document status
   */
  async getDocumentStatus(documentId: string): Promise<DocumentStatusResult> {
    try {
      const result = await this.request<D4SignApiResponse>('GET', `/documents/${documentId}`);

      // Map D4Sign status to our status
      const statusMap: Record<string, DocumentStatus> = {
        '1': 'pending',
        '2': 'processing',
        '3': 'waiting',
        '4': 'signed',
        '5': 'cancelled',
        '6': 'expired',
      };

      const status = statusMap[result.statusDoc || '1'] || 'pending';

      const signers = (result.list || []).map(s => ({
        email: s.email,
        name: s.name,
        signed: s.signed?.status === '1',
        signedAt: s.signed?.date,
      }));

      return {
        status,
        signedByAll: status === 'signed',
        signers,
      };
    } catch (error) {
      console.error('[D4Sign] getDocumentStatus error:', error);
      return {
        status: 'pending',
        signedByAll: false,
        signers: [],
      };
    }
  }

  /**
   * Cancel document
   */
  async cancelDocument(documentId: string): Promise<boolean> {
    try {
      await this.request('POST', `/documents/${documentId}/cancel`, {
        comment: 'Cancelado pelo sistema',
      });
      console.log(`[D4Sign] Document cancelled: ${documentId}`);
      return true;
    } catch (error) {
      console.error('[D4Sign] cancelDocument error:', error);
      return false;
    }
  }

  /**
   * Validate webhook signature
   * D4Sign sends webhooks with a hash for verification
   */
  validateWebhookSignature(payload: string, signature: string): boolean {
    const secret = process.env.D4SIGN_WEBHOOK_SECRET || this.config.cryptKey;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    try {
      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch {
      return false;
    }
  }
}

// ============================================
// CLICKSIGN PROVIDER (PLACEHOLDER)
// ============================================

export class ClicksignProvider implements ESignatureProvider {
  readonly providerName = 'Clicksign';

  async createDocument(_data: DocumentData): Promise<CreateDocumentResult> {
    // TODO: Implementar quando necessário
    return { success: false, error: 'Clicksign não implementado' };
  }

  async addSigner(_documentId: string, _signer: SignerData): Promise<AddSignerResult> {
    return { success: false, error: 'Clicksign não implementado' };
  }

  async getSigningUrl(_documentId: string, _signerId: string): Promise<SigningUrlResult> {
    return { success: false, error: 'Clicksign não implementado' };
  }

  async getDocumentStatus(_documentId: string): Promise<DocumentStatusResult> {
    return { status: 'pending', signedByAll: false, signers: [] };
  }

  async cancelDocument(_documentId: string): Promise<boolean> {
    return false;
  }

  validateWebhookSignature(_payload: string, _signature: string): boolean {
    return false;
  }
}

// ============================================
// ZAPSIGN PROVIDER IMPLEMENTATION
// ============================================

interface ZapSignConfig {
  apiToken: string;
  baseUrl: string;
  sandbox: boolean;
}

interface ZapSignSigner {
  token?: string;
  status?: string;
  name: string;
  email: string;
  phone_country?: string;
  phone_number?: string;
  external_id?: string;
  signed_at?: string;
  sign_url?: string;
}

interface ZapSignDocResponse {
  token?: string;
  status?: string;
  name?: string;
  created_at?: string;
  signers?: ZapSignSigner[];
  sign_url?: string;
  signed_file?: string;
  message?: string;
  error?: string;
}

export class ZapSignProvider implements ESignatureProvider {
  readonly providerName = 'ZapSign';
  private config: ZapSignConfig;

  constructor(config?: Partial<ZapSignConfig>) {
    this.config = {
      apiToken: config?.apiToken || process.env.ZAPSIGN_API_TOKEN || '',
      baseUrl: config?.baseUrl || process.env.ZAPSIGN_API_URL || 'https://api.zapsign.com.br/api/v1',
      sandbox: config?.sandbox ?? (process.env.ZAPSIGN_SANDBOX === 'true'),
    };

    if (!this.config.apiToken) {
      console.warn('[ZapSign] API token not configured. Set ZAPSIGN_API_TOKEN.');
    }
  }

  private async request<T = ZapSignDocResponse>(
    method: 'GET' | 'POST' | 'DELETE',
    endpoint: string,
    body?: Record<string, unknown>
  ): Promise<T> {
    const url = `${this.config.baseUrl}${endpoint}`;

    const options: RequestInit = {
      method,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiToken}`,
      },
    };

    if (body && method !== 'GET') {
      options.body = JSON.stringify(body);
    }

    console.log(`[ZapSign] ${method} ${endpoint}`);

    const response = await fetch(url, options);
    const data = await response.json() as T;

    if (!response.ok) {
      console.error('[ZapSign] API Error:', data);
      throw new Error((data as ZapSignDocResponse).message || (data as ZapSignDocResponse).error || `ZapSign API error: ${response.status}`);
    }

    return data;
  }

  /**
   * Create document with signer in one request (ZapSign way)
   * @see https://docs.zapsign.com.br/
   */
  async createDocument(data: DocumentData): Promise<CreateDocumentResult> {
    try {
      // ZapSign creates document with signers in one request
      // For now, just upload the document - signers added separately
      const result = await this.request<ZapSignDocResponse>('POST', '/docs/', {
        name: data.name,
        base64_pdf: data.content,
        lang: 'pt-br',
        disable_signer_emails: false,
        sandbox: this.config.sandbox,
      });

      if (result.token) {
        console.log(`[ZapSign] Document created: ${result.token}`);
        return {
          success: true,
          documentId: result.token,
        };
      }

      return { success: false, error: result.message || result.error || 'Erro ao criar documento' };
    } catch (error) {
      console.error('[ZapSign] createDocument error:', error);
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Add signer to document
   */
  async addSigner(documentId: string, signer: SignerData): Promise<AddSignerResult> {
    try {
      const result = await this.request<ZapSignDocResponse>('POST', `/docs/${documentId}/add-signer/`, {
        name: signer.name,
        email: signer.email,
        phone_country: '55',
        phone_number: signer.phone?.replace(/\D/g, '') || '',
        auth_mode: 'assinaturaTela', // assinaturaTela, tokenEmail, tokenSms, tokenWhatsapp
        send_automatic_email: true,
        send_automatic_whatsapp: signer.authMethod === 3,
      });

      // ZapSign returns the signer info in a different structure
      const signerToken = (result as unknown as ZapSignSigner).token;

      if (signerToken) {
        console.log(`[ZapSign] Signer added: ${signer.email} (${signerToken})`);
        return {
          success: true,
          signerId: signerToken,
          signerKey: signerToken,
        };
      }

      return { success: false, error: result.message || result.error || 'Erro ao adicionar signatario' };
    } catch (error) {
      console.error('[ZapSign] addSigner error:', error);
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Get signing URL for signer
   */
  async getSigningUrl(documentId: string, signerId: string): Promise<SigningUrlResult> {
    try {
      // Get document details to find signer URL
      const result = await this.request<ZapSignDocResponse>('GET', `/docs/${documentId}/`);

      if (result.signers && result.signers.length > 0) {
        // Find signer by token or email
        const signer = result.signers.find(s => s.token === signerId || s.email === signerId);
        if (signer?.sign_url) {
          return { success: true, url: signer.sign_url };
        }
        // Return first signer URL if not found
        if (result.signers[0]?.sign_url) {
          return { success: true, url: result.signers[0].sign_url };
        }
      }

      return { success: false, error: 'URL de assinatura nao encontrada' };
    } catch (error) {
      console.error('[ZapSign] getSigningUrl error:', error);
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Get document status
   */
  async getDocumentStatus(documentId: string): Promise<DocumentStatusResult> {
    try {
      const result = await this.request<ZapSignDocResponse>('GET', `/docs/${documentId}/`);

      // Map ZapSign status to our status
      const statusMap: Record<string, DocumentStatus> = {
        'pending': 'pending',
        'signed': 'signed',
        'cancelled': 'cancelled',
        'expired': 'expired',
      };

      const status = statusMap[result.status || ''] || 'waiting';

      const signers = (result.signers || []).map(s => ({
        email: s.email,
        name: s.name,
        signed: s.status === 'signed',
        signedAt: s.signed_at,
      }));

      const allSigned = signers.length > 0 && signers.every(s => s.signed);

      return {
        status: allSigned ? 'signed' : status,
        signedAt: allSigned ? signers[0]?.signedAt : undefined,
        signedByAll: allSigned,
        signers,
      };
    } catch (error) {
      console.error('[ZapSign] getDocumentStatus error:', error);
      return {
        status: 'pending',
        signedByAll: false,
        signers: [],
      };
    }
  }

  /**
   * Cancel/delete document
   */
  async cancelDocument(documentId: string): Promise<boolean> {
    try {
      await this.request('DELETE', `/docs/${documentId}/`);
      console.log(`[ZapSign] Document cancelled: ${documentId}`);
      return true;
    } catch (error) {
      console.error('[ZapSign] cancelDocument error:', error);
      return false;
    }
  }

  /**
   * Validate webhook signature
   * ZapSign uses a simple token validation
   */
  validateWebhookSignature(payload: string, signature: string): boolean {
    const secret = process.env.ZAPSIGN_WEBHOOK_SECRET;
    if (!secret) return true; // No secret configured, accept all

    try {
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');

      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch {
      return false;
    }
  }
}

// ============================================
// SERVICE SINGLETON
// ============================================

class ESignatureService {
  private provider: ESignatureProvider;

  constructor() {
    const providerName = process.env.ESIGNATURE_PROVIDER?.toLowerCase() || 'd4sign';

    switch (providerName) {
      case 'clicksign':
        this.provider = new ClicksignProvider();
        break;
      case 'zapsign':
        this.provider = new ZapSignProvider();
        break;
      case 'd4sign':
      default:
        this.provider = new D4SignProvider();
        break;
    }

    console.log(`[ESignature] Initialized with provider: ${this.provider.providerName}`);
  }

  getProvider(): ESignatureProvider {
    return this.provider;
  }

  /**
   * Full flow: Create document, add signer, get signing URL
   */
  async createSigningSession(
    pdfBase64: string,
    filename: string,
    signer: SignerData
  ): Promise<{
    success: boolean;
    documentId?: string;
    signerId?: string;
    signingUrl?: string;
    error?: string;
  }> {
    // 1. Create document
    const docResult = await this.provider.createDocument({
      name: filename,
      content: pdfBase64,
    });

    if (!docResult.success || !docResult.documentId) {
      return { success: false, error: docResult.error || 'Erro ao criar documento' };
    }

    // 2. Add signer
    const signerResult = await this.provider.addSigner(docResult.documentId, signer);

    if (!signerResult.success) {
      // Try to cancel document on error
      await this.provider.cancelDocument(docResult.documentId);
      return { success: false, error: signerResult.error || 'Erro ao adicionar signatário' };
    }

    // 3. Get signing URL
    const urlResult = await this.provider.getSigningUrl(
      docResult.documentId,
      signerResult.signerId || signer.email
    );

    return {
      success: true,
      documentId: docResult.documentId,
      signerId: signerResult.signerId,
      signingUrl: urlResult.url,
      error: urlResult.error,
    };
  }
}

export const esignatureService = new ESignatureService();
export default esignatureService;
