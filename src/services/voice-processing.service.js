const axios = require('axios');
const { logger } = require('@/utils/logger');
const { EnhancedBookingFlow } = require('./agents/enhanced-booking-flow');

class VoiceProcessingService {
    constructor(config) {
        this.config = {
            // Configuração para APIs de reconhecimento de voz
            openaiApiKey: config.openaiApiKey, // OpenAI Whisper
            googleApiKey: config.googleApiKey, // Google Speech-to-Text
            azureApiKey: config.azureApiKey,   // Azure Speech Services
            preferredProvider: config.preferredProvider || 'openai', // openai, google, azure
            language: config.language || 'pt-BR',
            ...config
        };
        
        this.enhancedBookingFlow = new EnhancedBookingFlow();
    }

    /**
     * Verifica se a mensagem é de áudio/voz
     */
    isVoiceMessage(message) {
        return message.type === 'audio' || 
               message.type === 'voice' ||
               (message.type === 'document' && message.document?.mime_type?.startsWith('audio/'));
    }

    /**
     * Processa mensagem de voz
     */
    async processVoiceMessage(message, context) {
        try {
            logger.info('Processing voice message', { messageId: message.id });
            
            // Baixar arquivo de áudio
            const audioBuffer = await this.downloadAudioFile(message);
            
            // Converter áudio em texto
            const transcribedText = await this.transcribeAudio(audioBuffer);
            
            logger.info('Voice transcription completed', { 
                originalLength: audioBuffer.length,
                transcribedText: transcribedText.substring(0, 100) + '...'
            });
            
            // Processar texto transcrito com IA de agendamento
            const aiResponse = await this.enhancedBookingFlow.handleBookingIntent(
                transcribedText, 
                context, 
                context.agent
            );
            
            // Adicionar contexto de que veio de voz
            if (aiResponse) {
                aiResponse.data = {
                    ...aiResponse.data,
                    originalVoiceMessage: true,
                    transcribedText: transcribedText,
                    confidence: aiResponse.data?.confidence || 0.8
                };
            }
            
            return {
                success: true,
                transcribedText: transcribedText,
                aiResponse: aiResponse,
                confidence: aiResponse?.data?.confidence || 0.8
            };
            
        } catch (error) {
            logger.error('Error processing voice message:', error);
            return {
                success: false,
                error: error.message,
                fallbackMessage: 'Desculpe, não consegui entender sua mensagem de voz. Pode tentar novamente ou digitar sua mensagem?'
            };
        }
    }

    /**
     * Baixa arquivo de áudio do WhatsApp
     */
    async downloadAudioFile(message) {
        try {
            let mediaId = null;
            
            if (message.type === 'audio') {
                mediaId = message.audio?.id;
            } else if (message.type === 'voice') {
                mediaId = message.voice?.id;
            } else if (message.type === 'document') {
                mediaId = message.document?.id;
            }
            
            if (!mediaId) {
                throw new Error('No media ID found in voice message');
            }
            
            // Baixar arquivo via WhatsApp API
            const downloadUrl = `${this.config.baseUrl}/${mediaId}`;
            const response = await axios.get(downloadUrl, {
                headers: {
                    'Authorization': `Bearer ${this.config.accessToken}`
                }
            });
            
            // Baixar o arquivo de áudio
            const audioResponse = await axios.get(response.data.url, {
                responseType: 'arraybuffer'
            });
            
            return Buffer.from(audioResponse.data);
            
        } catch (error) {
            logger.error('Error downloading audio file:', error);
            throw new Error('Failed to download audio file');
        }
    }

    /**
     * Converte áudio em texto usando diferentes provedores
     */
    async transcribeAudio(audioBuffer) {
        try {
            switch (this.config.preferredProvider) {
                case 'openai':
                    return await this.transcribeWithOpenAI(audioBuffer);
                case 'google':
                    return await this.transcribeWithGoogle(audioBuffer);
                case 'azure':
                    return await this.transcribeWithAzure(audioBuffer);
                default:
                    return await this.transcribeWithOpenAI(audioBuffer);
            }
        } catch (error) {
            logger.error('Error transcribing audio:', error);
            throw new Error('Failed to transcribe audio');
        }
    }

    /**
     * Transcrição usando OpenAI Whisper
     */
    async transcribeWithOpenAI(audioBuffer) {
        try {
            const formData = new FormData();
            formData.append('file', audioBuffer, {
                filename: 'audio.ogg',
                contentType: 'audio/ogg'
            });
            formData.append('model', 'whisper-1');
            formData.append('language', this.config.language);
            formData.append('response_format', 'json');
            
            const response = await axios.post('https://api.openai.com/v1/audio/transcriptions', formData, {
                headers: {
                    'Authorization': `Bearer ${this.config.openaiApiKey}`,
                    'Content-Type': 'multipart/form-data'
                }
            });
            
            return response.data.text;
            
        } catch (error) {
            logger.error('OpenAI transcription error:', error);
            throw error;
        }
    }

    /**
     * Transcrição usando Google Speech-to-Text
     */
    async transcribeWithGoogle(audioBuffer) {
        try {
            const request = {
                config: {
                    encoding: 'OGG_OPUS',
                    sampleRateHertz: 16000,
                    languageCode: this.config.language,
                    enableAutomaticPunctuation: true,
                    enableWordTimeOffsets: false
                },
                audio: {
                    content: audioBuffer.toString('base64')
                }
            };
            
            const response = await axios.post(
                `https://speech.googleapis.com/v1/speech:recognize?key=${this.config.googleApiKey}`,
                request
            );
            
            if (response.data.results && response.data.results.length > 0) {
                return response.data.results[0].alternatives[0].transcript;
            }
            
            throw new Error('No transcription result');
            
        } catch (error) {
            logger.error('Google transcription error:', error);
            throw error;
        }
    }

    /**
     * Transcrição usando Azure Speech Services
     */
    async transcribeWithAzure(audioBuffer) {
        try {
            const response = await axios.post(
                'https://brazilsouth.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1',
                audioBuffer,
                {
                    headers: {
                        'Ocp-Apim-Subscription-Key': this.config.azureApiKey,
                        'Content-Type': 'audio/ogg; codecs=opus',
                        'Accept': 'application/json'
                    }
                }
            );
            
            if (response.data.DisplayText) {
                return response.data.DisplayText;
            }
            
            throw new Error('No transcription result');
            
        } catch (error) {
            logger.error('Azure transcription error:', error);
            throw error;
        }
    }

    /**
     * Gera resposta para mensagem de voz
     */
    async generateVoiceResponse(transcriptionResult, context) {
        try {
            const { transcribedText, aiResponse, confidence } = transcriptionResult;
            
            // Se a transcrição tem baixa confiança, pedir confirmação
            if (confidence < 0.7) {
                return {
                    success: true,
                    message: `🎤 **Entendi:** "${transcribedText}"\n\n❓ **Confirma que é isso mesmo?**\n\n💬 **Responda:**\n• "Sim" para confirmar\n• "Não" para tentar novamente\n• Ou digite sua mensagem`,
                    shouldContinue: true,
                    data: {
                        needsConfirmation: true,
                        transcribedText: transcribedText,
                        originalVoiceMessage: true
                    }
                };
            }
            
            // Se é intenção de agendamento, usar fluxo normal
            if (aiResponse) {
                return {
                    success: true,
                    message: aiResponse.message,
                    shouldContinue: aiResponse.shouldContinue,
                    data: aiResponse.data,
                    whatsappButtons: aiResponse.whatsappButtons,
                    voiceContext: {
                        transcribedText: transcribedText,
                        confidence: confidence
                    }
                };
            }
            
            // Se não é agendamento, responder normalmente
            return {
                success: true,
                message: `🎤 **Entendi sua mensagem:** "${transcribedText}"\n\nComo posso ajudá-lo(a) hoje? 😊\n\nPosso te ajudar com:\n• 📅 Agendamentos\n• ℹ️ Informações sobre serviços\n• 💰 Preços\n• 📞 Suporte`,
                shouldContinue: true,
                data: {
                    transcribedText: transcribedText,
                    originalVoiceMessage: true
                }
            };
            
        } catch (error) {
            logger.error('Error generating voice response:', error);
            return {
                success: false,
                message: 'Desculpe, tive um problema ao processar sua mensagem de voz. Pode tentar novamente ou digitar sua mensagem?',
                shouldContinue: true
            };
        }
    }

    /**
     * Processa confirmação de transcrição
     */
    async processTranscriptionConfirmation(message, context) {
        try {
            const messageText = this.extractMessageText(message);
            const text = messageText.toLowerCase();
            
            // Verificar se confirma ou nega
            if (text.includes('sim') || text.includes('confirmo') || text.includes('correto')) {
                // Usar texto transcrito original
                const originalTranscription = context.voiceContext?.transcribedText;
                
                if (originalTranscription) {
                    return await this.enhancedBookingFlow.handleBookingIntent(
                        originalTranscription,
                        context,
                        context.agent
                    );
                }
            }
            
            if (text.includes('não') || text.includes('nao') || text.includes('incorreto')) {
                return {
                    success: true,
                    message: '🎤 **Sem problemas!**\n\nPode gravar sua mensagem novamente ou digitar o que gostaria de fazer.',
                    shouldContinue: true,
                    data: {
                        requestNewVoice: true
                    }
                };
            }
            
            // Se não confirmou nem negou, processar como nova mensagem
            return await this.enhancedBookingFlow.handleBookingIntent(
                messageText,
                context,
                context.agent
            );
            
        } catch (error) {
            logger.error('Error processing transcription confirmation:', error);
            return {
                success: false,
                message: 'Desculpe, tive um problema. Pode tentar novamente?',
                shouldContinue: true
            };
        }
    }

    /**
     * Extrai texto da mensagem
     */
    extractMessageText(message) {
        if (message.type === 'text') {
            return message.text?.body || '';
        }
        
        if (message.type === 'button') {
            return message.button?.text || message.button?.payload || '';
        }
        
        if (message.type === 'interactive') {
            if (message.interactive?.button_reply) {
                return message.interactive.button_reply.title;
            }
            if (message.interactive?.list_reply) {
                return message.interactive.list_reply.title;
            }
        }
        
        return '';
    }

    /**
     * Gera exemplo de conversa com voz
     */
    generateVoiceConversationExample() {
        return {
            title: "Fluxo de Agendamento com Voz",
            conversation: [
                {
                    user: "[Grava mensagem de voz: 'Oi! Quero agendar um corte de cabelo para amanhã']",
                    ai: `🎤 **Entendi:** "Oi! Quero agendar um corte de cabelo para amanhã"

🎯 **Perfeito! Vou te ajudar a agendar!**

💇‍♀️ **Serviço:** Serviço de Beleza
💰 **Valor:** R$ 80,00
⏱️ **Duração:** 60 minutos

📅 **Clique no botão do dia desejado:**
• Ou me diga sua preferência de período
• "Prefiro manhã/tarde/noite"
• "Qualquer horário está bom"

💡 **Dica:** Após escolher o dia, vou mostrar os horários específicos!"`,
                    buttons: [
                        { title: "ter 16/01", id: "date_2024-01-16" },
                        { title: "qua 17/01", id: "date_2024-01-17" },
                        { title: "🌅 Manhã", id: "period_manha" }
                    ]
                },
                {
                    user: "[Clica em 'ter 16/01']",
                    ai: `⏰ **Horários para terça-feira (16/01)**

Clique no horário desejado:

💡 **Dica:** Se nenhum horário funcionar, escolha "Outro dia"`,
                    buttons: [
                        { title: "09:00", id: "select_time:2024-01-16_09:00" },
                        { title: "14:00", id: "select_time:2024-01-16_14:00" },
                        { title: "16:00", id: "select_time:2024-01-16_16:00" },
                        { title: "📅 Outro dia", id: "other_date" }
                    ]
                },
                {
                    user: "[Grava mensagem de voz: 'Quero às 14 horas']",
                    ai: `🎤 **Entendi:** "Quero às 14 horas"

✅ **Confirmar Agendamento**

📅 **Data:** terça-feira (16/01)
🕐 **Horário:** 14:00
💇‍♀️ **Serviço:** Serviço de Beleza
💰 **Valor:** R$ 80,00
⏱️ **Duração:** 60 minutos

👤 **Agora preciso de algumas informações:**
• Qual seu nome?
• Seu telefone para contato?

💬 **Responda com:** "Nome, Telefone"`,
                    buttons: [
                        { title: "✅ Confirmar", id: "confirm_booking" },
                        { title: "🔄 Trocar Horário", id: "change_time" },
                        { title: "❌ Cancelar", id: "cancel_booking" }
                    ]
                },
                {
                    user: "[Grava mensagem de voz: 'Maria Silva, 11999999999']",
                    ai: `🎤 **Entendi:** "Maria Silva, 11999999999"

✨ **AGENDAMENTO CONFIRMADO!** ✨

💇‍♀️ **Serviço:** Serviço de Beleza
👤 **Cliente:** Maria Silva
📅 **Data:** terça-feira, 16 de janeiro de 2024
🕐 **Horário:** 14:00
💰 **Valor:** R$ 80.00
🔢 **Código:** ABC12345

📍 **Dicas importantes:**
• Chegue 10 minutos antes
• Traga um documento com foto

Obrigada por escolher nosso salão! 💄✨`
                }
            ]
        };
    }

    /**
     * Configuração recomendada para diferentes provedores
     */
    getProviderConfig() {
        return {
            openai: {
                name: 'OpenAI Whisper',
                pros: ['Alta precisão', 'Suporte a português', 'Fácil integração'],
                cons: ['Custo por uso', 'Limite de taxa'],
                pricing: '~$0.006 por minuto'
            },
            google: {
                name: 'Google Speech-to-Text',
                pros: ['Muito preciso', 'Suporte nativo ao português', 'Gratuito até 60min/mês'],
                cons: ['Configuração complexa', 'Limite de caracteres'],
                pricing: 'Gratuito até 60min/mês, depois $0.006/min'
            },
            azure: {
                name: 'Azure Speech Services',
                pros: ['Excelente para português', 'Integração com Microsoft', 'Recursos avançados'],
                cons: ['Mais caro', 'Configuração complexa'],
                pricing: '~$0.01 por minuto'
            }
        };
    }
}

module.exports = { VoiceProcessingService }; 