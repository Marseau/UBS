/**
 * Backblaze B2 Storage Service
 * Uses N8N workflow webhook to upload files to B2
 *
 * The webhook calls Sub-B2Token to get upload/download tokens,
 * then uploads the file to B2 and returns a URL with authorization token.
 */

import FormData from 'form-data';
import https from 'https';
import http from 'http';
import { URL } from 'url';

interface UploadResult {
  success: boolean;
  fileId?: string;
  fileName?: string;
  url?: string;
  error?: string;
}

interface B2WebhookResponse {
  success: boolean;
  fileId?: string;
  fileName?: string;
  url?: string;
  error?: string;
}

class B2StorageService {
  private webhookUrl: string;

  constructor() {
    this.webhookUrl = process.env.N8N_B2_UPLOAD_WEBHOOK ||
      'http://localhost:5678/webhook/aic-upload-contract-pdf';
  }

  /**
   * Upload a PDF contract to B2 via N8N workflow
   * Returns a URL with authorization token (valid for 24h)
   */
  async uploadContract(buffer: Buffer, contractId: string): Promise<UploadResult> {
    try {
      console.log(`[B2Storage] Uploading contract: ${contractId}`);
      console.log(`[B2Storage] Buffer size: ${buffer.length} bytes`);

      // Pass contract_id in query string for reliable access in N8N
      const urlWithParams = `${this.webhookUrl}?contract_id=${encodeURIComponent(contractId)}`;

      // Create form data with PDF binary
      const formData = new FormData();
      formData.append('data', buffer, {
        filename: `${contractId}.pdf`,
        contentType: 'application/pdf',
      });

      const result = await this.sendFormData(formData, urlWithParams);

      if (result.success) {
        console.log(`[B2Storage] Upload successful: ${result.fileId}`);
        console.log(`[B2Storage] URL: ${result.url}`);
      }

      return result;
    } catch (error) {
      console.error('[B2Storage] Upload error:', error);
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Upload any file to B2 with custom prefix
   * @param buffer - File buffer
   * @param fileName - File name/id (without extension)
   * @param prefix - Folder prefix (e.g., 'proposals', 'contracts')
   */
  async uploadFile(
    buffer: Buffer,
    fileName: string,
    _contentType: string = 'application/pdf'
  ): Promise<UploadResult> {
    // Extract prefix and ID from path like "proposals/PROPOSTA-XYZ"
    const parts = fileName.split('/');
    const prefix: string = parts.length > 1 ? (parts[0] ?? 'contracts') : 'contracts';
    const fileId: string = parts.length > 1 ? (parts[1] ?? fileName) : fileName;

    try {
      console.log(`[B2Storage] Uploading ${prefix} file: ${fileId}`);
      console.log(`[B2Storage] Buffer size: ${buffer.length} bytes`);

      // Pass file_id and prefix in query string
      const urlWithParams = `${this.webhookUrl}?contract_id=${encodeURIComponent(fileId)}&prefix=${encodeURIComponent(prefix)}`;

      // Create form data with PDF binary
      const formData = new FormData();
      formData.append('data', buffer, {
        filename: `${fileId}.pdf`,
        contentType: 'application/pdf',
      });

      const result = await this.sendFormData(formData, urlWithParams);

      if (result.success) {
        console.log(`[B2Storage] Upload successful: ${result.fileId}`);
        console.log(`[B2Storage] URL: ${result.url}`);
      }

      return result;
    } catch (error) {
      console.error('[B2Storage] Upload error:', error);
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Send FormData using native http/https module
   */
  private sendFormData(formData: FormData, urlString: string): Promise<UploadResult> {
    return new Promise((resolve) => {
      const parsedUrl = new URL(urlString);
      const isHttps = parsedUrl.protocol === 'https:';
      const httpModule = isHttps ? https : http;

      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'POST',
        headers: formData.getHeaders(),
      };

      const req = httpModule.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              const result = JSON.parse(data) as B2WebhookResponse;
              if (result.success) {
                resolve({
                  success: true,
                  fileId: result.fileId,
                  fileName: result.fileName,
                  url: result.url,
                });
              } else {
                resolve({
                  success: false,
                  error: result.error || 'Unknown error',
                });
              }
            } else {
              resolve({
                success: false,
                error: `HTTP ${res.statusCode}: ${data}`,
              });
            }
          } catch (e) {
            resolve({
              success: false,
              error: `Parse error: ${(e as Error).message}. Response: ${data}`,
            });
          }
        });
      });

      req.on('error', (error) => {
        resolve({
          success: false,
          error: error.message,
        });
      });

      formData.pipe(req);
    });
  }
}

export const b2StorageService = new B2StorageService();
export default b2StorageService;
