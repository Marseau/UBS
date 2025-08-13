"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const router = express_1.default.Router();
router.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
        console.log('✅ WhatsApp webhook verified successfully');
        res.status(200).send(challenge);
    }
    else {
        console.log('❌ WhatsApp webhook verification failed');
        res.status(403).json({ error: 'Verification failed' });
    }
});
router.post('/webhook', express_1.default.json(), (req, res) => {
    console.log('📱 WhatsApp webhook received:', JSON.stringify(req.body, null, 2));
    try {
        const body = req.body;
        if (body.object === 'whatsapp_business_account') {
            body.entry?.forEach((entry) => {
                entry.changes?.forEach((change) => {
                    if (change.field === 'messages') {
                        const messages = change.value?.messages || [];
                        messages.forEach((message) => {
                            console.log(`📩 Message from ${message.from}: ${message.text?.body || 'Non-text message'}`);
                        });
                    }
                });
            });
        }
        res.status(200).json({ status: 'received' });
    }
    catch (error) {
        console.error('❌ Error processing WhatsApp webhook:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.get('/status', (req, res) => {
    const hasToken = !!process.env.WHATSAPP_TOKEN;
    const hasVerifyToken = !!process.env.WHATSAPP_VERIFY_TOKEN;
    const hasPhoneNumberId = !!process.env.WHATSAPP_PHONE_NUMBER_ID;
    res.json({
        service: 'WhatsApp Business API',
        status: hasToken && hasVerifyToken && hasPhoneNumberId ? 'ready' : 'configuration_needed',
        configuration: {
            whatsapp_token: hasToken ? '✅ Configured' : '❌ Missing',
            verify_token: hasVerifyToken ? '✅ Configured' : '❌ Missing',
            phone_number_id: hasPhoneNumberId ? '✅ Configured' : '❌ Missing'
        },
        webhook_url: `${req.protocol}://${req.get('host')}/api/whatsapp/webhook`,
        timestamp: new Date().toISOString()
    });
});
router.post('/send', express_1.default.json(), (req, res) => {
    const { to, message } = req.body;
    if (!to || !message) {
        return res.status(400).json({
            error: 'Missing required fields',
            required: ['to', 'message']
        });
    }
    console.log(`📤 Would send message to ${to}: ${message}`);
    return res.json({
        status: 'success',
        description: 'Message would be sent (placeholder)',
        to,
        message,
        timestamp: new Date().toISOString()
    });
});
exports.default = router;
//# sourceMappingURL=whatsapp-simple.js.map