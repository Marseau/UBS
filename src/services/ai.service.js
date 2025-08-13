"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AIService = void 0;
const openai_1 = __importDefault(require("openai"));
const whatsapp_service_1 = require("./whatsapp.service");
class AIService {
    constructor() {
        this.openai = new openai_1.default({
            apiKey: process.env.OPENAI_API_KEY || ''
        });
        this.whatsappService = new whatsapp_service_1.WhatsAppService();
    }
    async processIncomingMessage(message, contacts) {
        try {
            console.log('🤖 Processing WhatsApp message with AI');
            const response = `Olá! Recebi sua mensagem: "${message.text?.body || 'mensagem recebida'}". Em breve nosso sistema de IA estará totalmente funcional!`;
            await this.whatsappService.sendTextMessage(message.from, response);
        }
        catch (error) {
            console.error('Error in AI processing:', error);
            await this.whatsappService.sendTextMessage(message.from, 'Desculpe, estou com dificuldades técnicas. Tente novamente em alguns instantes.');
        }
    }
    async healthCheck() {
        return {
            status: 'ok',
            details: {
                openai: !!process.env.OPENAI_API_KEY,
                whatsapp: true
            }
        };
    }
}
exports.AIService = AIService;
//# sourceMappingURL=ai.service.js.map