"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MediaProcessorService = void 0;
class MediaProcessorService {
    constructor(openai) {
        this.openai = openai;
    }
    async processImage(content, mimeType) {
        try {
            const base64Image = content.toString('base64');
            const dataUrl = `data:${mimeType};base64,${base64Image}`;
            const response = await this.openai.chat.completions.create({
                model: 'gpt-4-vision-preview',
                messages: [
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'text',
                                text: 'Analise esta imagem e descreva o que você vê de forma detalhada. Se for relacionado a um negócio ou serviço, identifique o contexto e forneça informações relevantes que possam ajudar no atendimento ao cliente.'
                            },
                            {
                                type: 'image_url',
                                image_url: {
                                    url: dataUrl,
                                    detail: 'high'
                                }
                            }
                        ]
                    }
                ],
                max_tokens: 500,
                temperature: 0.3
            });
            return response.choices[0]?.message?.content || 'Não foi possível analisar a imagem';
        }
        catch (error) {
            console.error('Error processing image:', error);
            return this.fallbackImageAnalysis(mimeType);
        }
    }
    async processAudio(content, mimeType) {
        try {
            const audioFile = new File([content], 'audio.wav', { type: mimeType });
            const transcription = await this.openai.audio.transcriptions.create({
                file: audioFile,
                model: 'whisper-1',
                language: 'pt',
                response_format: 'text',
                temperature: 0.0
            });
            return transcription || 'Não foi possível transcrever o áudio';
        }
        catch (error) {
            console.error('Error processing audio:', error);
            return this.fallbackAudioAnalysis(mimeType, content.length);
        }
    }
    async extractText(content, mimeType) {
        try {
            if (mimeType.includes('pdf')) {
                return await this.extractPdfText(content);
            }
            else if (mimeType.includes('text')) {
                return content.toString('utf-8');
            }
            else if (mimeType.includes('word') || mimeType.includes('docx')) {
                return await this.extractWordText(content);
            }
            else {
                throw new Error(`Unsupported document type: ${mimeType}`);
            }
        }
        catch (error) {
            console.error('Error extracting text from document:', error);
            return this.fallbackDocumentAnalysis(mimeType, content.length);
        }
    }
    async analyzeForBusinessContext(analysis, businessDomain) {
        try {
            const contextPrompt = `
Analise o seguinte conteúdo de mídia no contexto de um negócio ${businessDomain ? `do setor ${businessDomain}` : 'genérico'}:

${analysis}

Forneça insights relevantes para atendimento ao cliente, como:
- Possíveis necessidades ou interesses identificados
- Serviços que podem ser relevantes
- Informações que podem ajudar no agendamento
- Contexto que pode melhorar o atendimento

Responda de forma concisa e focada no atendimento.`;
            const response = await this.openai.chat.completions.create({
                model: 'gpt-3.5-turbo',
                messages: [{ role: 'user', content: contextPrompt }],
                max_tokens: 300,
                temperature: 0.5
            });
            return response.choices[0]?.message?.content || analysis;
        }
        catch (error) {
            console.error('Error analyzing business context:', error);
            return analysis;
        }
    }
    async detectSensitiveContent(analysis) {
        const sensitivePatterns = [
            /cpf/i,
            /rg/i,
            /cartão de crédito/i,
            /senha/i,
            /documento\s+pessoal/i,
            /número\s+de\s+telefone/i,
            /endereço/i,
            /dados\s+bancários/i
        ];
        const concerns = [];
        let hasSensitive = false;
        for (const pattern of sensitivePatterns) {
            if (pattern.test(analysis)) {
                hasSensitive = true;
                concerns.push(`Possível informação sensível detectada: ${pattern.source}`);
            }
        }
        return { hasSensitive, concerns };
    }
    fallbackImageAnalysis(mimeType) {
        const imageType = mimeType.split('/')[1] || 'unknown';
        return `Imagem recebida (formato: ${imageType}). Para uma análise detalhada, entre em contato diretamente conosco.`;
    }
    fallbackAudioAnalysis(mimeType, size) {
        const duration = Math.round(size / 16000);
        return `Áudio recebido (${duration}s aproximadamente). Não foi possível transcrever automaticamente. Nossa equipe pode revisar o áudio se necessário.`;
    }
    fallbackDocumentAnalysis(mimeType, size) {
        const sizeKb = Math.round(size / 1024);
        return `Documento recebido (${sizeKb}KB, tipo: ${mimeType}). Para análise detalhada do conteúdo, nossa equipe pode revisar o documento.`;
    }
    async extractPdfText(content) {
        return 'Documento PDF recebido. Para análise completa, nossa equipe pode revisar o conteúdo.';
    }
    async extractWordText(content) {
        return 'Documento Word recebido. Para análise completa, nossa equipe pode revisar o conteúdo.';
    }
    validateMedia(content, mimeType) {
        const maxSize = 25 * 1024 * 1024;
        if (content.length > maxSize) {
            return {
                isValid: false,
                error: `Arquivo muito grande (${Math.round(content.length / 1024 / 1024)}MB). Limite: 25MB`
            };
        }
        const supportedTypes = [
            'image/jpeg',
            'image/png',
            'image/gif',
            'image/webp',
            'audio/mpeg',
            'audio/wav',
            'audio/ogg',
            'audio/mp4',
            'application/pdf',
            'text/plain',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ];
        if (!supportedTypes.includes(mimeType)) {
            return {
                isValid: false,
                error: `Tipo de arquivo não suportado: ${mimeType}`
            };
        }
        return { isValid: true };
    }
    getCapabilities() {
        return {
            'image': ['analysis', 'description', 'business_context', 'sensitive_detection'],
            'audio': ['transcription', 'business_context', 'sensitive_detection'],
            'document': ['text_extraction', 'business_context', 'sensitive_detection'],
            'video': ['frame_analysis']
        };
    }
    async processVideo(videoUrl) {
        return `Processed video: ${videoUrl}`;
    }
    async processDocument(docUrl) {
        return `Processed document: ${docUrl}`;
    }
}
exports.MediaProcessorService = MediaProcessorService;
exports.default = MediaProcessorService;
//# sourceMappingURL=media-processor.service.js.map