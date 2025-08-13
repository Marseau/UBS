"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const bcrypt_1 = __importDefault(require("bcrypt"));
const uuid_1 = require("uuid");
const supabase_js_1 = require("@supabase/supabase-js");
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = (0, supabase_js_1.createClient)(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});
const winston_1 = __importDefault(require("winston"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const router = express_1.default.Router();
const logger = winston_1.default.createLogger({
    level: 'info',
    format: winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.json()),
    defaultMeta: { service: 'auth-service' },
    transports: [
        new winston_1.default.transports.Console()
    ]
});
router.post('/register', async (req, res) => {
    try {
        const { email, password, firstName, lastName, phone, document, businessName, businessDescription, domain } = req.body;
        logger.info('Registration attempt', { email, domain });
        if (!email || !password || !firstName || !lastName || !phone || !document || !businessName || !domain) {
            return res.status(400).json({
                success: false,
                message: 'Todos os campos obrigatórios devem ser preenchidos'
            });
        }
        const validDomains = ['beauty', 'healthcare', 'legal', 'education', 'sports', 'consulting'];
        if (!validDomains.includes(domain)) {
            return res.status(400).json({
                success: false,
                message: 'Domínio de negócio inválido'
            });
        }
        const { data: existingUser } = await supabase
            .from('users')
            .select('id')
            .eq('email', email)
            .single();
        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: 'Email já está em uso'
            });
        }
        const { data: existingAdmin } = await supabase
            .from('admin_users')
            .select('id')
            .eq('email', email)
            .single();
        if (existingAdmin) {
            return res.status(409).json({
                success: false,
                message: 'Email já está em uso'
            });
        }
        const userId = (0, uuid_1.v4)();
        const tenantId = (0, uuid_1.v4)();
        const adminUserId = (0, uuid_1.v4)();
        const saltRounds = 10;
        const passwordHash = await bcrypt_1.default.hash(password, saltRounds);
        const slug = businessName
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]/g, '-')
            .replace(/-+/g, '-')
            .trim('-');
        const { data: existingTenant } = await supabase
            .from('tenants')
            .select('id')
            .eq('slug', slug)
            .single();
        let finalSlug = slug;
        if (existingTenant) {
            finalSlug = `${slug}-${Math.random().toString(36).substring(2, 8)}`;
        }
        const tenantData = {
            id: tenantId,
            name: businessName,
            slug: finalSlug,
            business_name: businessName,
            domain: domain,
            email: email,
            phone: phone,
            whatsapp_phone: phone,
            status: 'trial',
            subscription_plan: 'starter',
            business_description: businessDescription || `${businessName} - Negócio especializado em ${domain}`,
            business_address: {
                street: '',
                city: '',
                state: '',
                zipcode: '',
                country: 'Brasil'
            },
            ai_settings: {
                model: 'gpt-4',
                temperature: 0.7,
                max_tokens: 1000,
                enable_function_calling: true,
                enable_multimodal: true
            },
            business_rules: {
                working_hours: {
                    monday: { start: '09:00', end: '18:00' },
                    tuesday: { start: '09:00', end: '18:00' },
                    wednesday: { start: '09:00', end: '18:00' },
                    thursday: { start: '09:00', end: '18:00' },
                    friday: { start: '09:00', end: '18:00' },
                    saturday: { start: '09:00', end: '14:00' },
                    sunday: { start: null, end: null }
                },
                booking_rules: {
                    advance_booking_hours: 2,
                    max_booking_days: 30,
                    same_day_booking: true
                },
                cancellation_policy: {
                    free_cancellation_hours: 24,
                    penalty_percentage: 0
                }
            },
            domain_config: {
                domain_specific_settings: {},
                custom_prompts: {
                    greeting: `Olá! Bem-vindo ao ${businessName}. Como posso ajudá-lo hoje?`,
                    booking_confirmation: `Perfeito! Seu agendamento foi confirmado.`,
                    emergency_escalation: domain === 'healthcare' ? 'Detectei que pode ser uma emergência. Transferindo para atendimento humano.' : null
                }
            },
            whatsapp_settings: {
                phone_number_id: null,
                webhook_url: null,
                verify_token: null
            }
        };
        const { error: tenantError } = await supabase
            .from('tenants')
            .insert([tenantData]);
        if (tenantError) {
            logger.error('Tenant creation error', { error: tenantError });
            if (tenantError.code === '23505') {
                if (tenantError.details?.includes('phone')) {
                    return res.status(409).json({
                        success: false,
                        message: 'Este número de telefone WhatsApp já está sendo usado por outro negócio. Cada negócio deve ter um número único para receber mensagens.',
                        field: 'phone'
                    });
                }
                if (tenantError.details?.includes('email')) {
                    return res.status(409).json({
                        success: false,
                        message: 'Este email já está sendo usado por outro negócio.',
                        field: 'email'
                    });
                }
                if (tenantError.details?.includes('slug')) {
                    return res.status(409).json({
                        success: false,
                        message: 'Nome de negócio já existe. Tente um nome diferente.',
                        field: 'businessName'
                    });
                }
            }
            return res.status(500).json({
                success: false,
                message: 'Erro ao criar conta do negócio'
            });
        }
        const userData = {
            id: userId,
            name: `${firstName} ${lastName}`,
            email: email,
            phone: phone,
            preferences: {
                preferred_language: 'pt-BR',
                notification_preferences: {
                    whatsapp: true,
                    email: true,
                    sms: false
                },
                timezone: 'America/Sao_Paulo',
                document: document
            }
        };
        const { error: userError } = await supabase
            .from('users')
            .insert([userData]);
        if (userError) {
            logger.error('User creation error', { error: userError });
            await supabase.from('tenants').delete().eq('id', tenantId);
            return res.status(500).json({
                success: false,
                message: 'Erro ao criar conta do usuário'
            });
        }
        const adminUserData = {
            id: adminUserId,
            email: email,
            password_hash: passwordHash,
            name: `${firstName} ${lastName}`,
            role: 'tenant_admin',
            tenant_id: tenantId,
            is_active: true
        };
        const { error: adminError } = await supabase
            .from('admin_users')
            .insert([adminUserData]);
        if (adminError) {
            logger.error('Admin user creation error', { error: adminError });
            await supabase.from('users').delete().eq('id', userId);
            await supabase.from('tenants').delete().eq('id', tenantId);
            return res.status(500).json({
                success: false,
                message: 'Erro ao criar conta administrativa'
            });
        }
        const userTenantData = {
            user_id: userId,
            tenant_id: tenantId,
            role: 'owner',
            total_bookings: 0,
            first_interaction: new Date().toISOString(),
            last_interaction: new Date().toISOString(),
            tenant_preferences: {
                preferred_services: [],
                notification_settings: {
                    appointment_reminders: true,
                    marketing_messages: true
                }
            }
        };
        const { error: relationError } = await supabase
            .from('user_tenants')
            .insert([userTenantData]);
        if (relationError) {
            logger.error('User-tenant relation error', { error: relationError });
            await supabase.from('admin_users').delete().eq('id', adminUserId);
            await supabase.from('users').delete().eq('id', userId);
            await supabase.from('tenants').delete().eq('id', tenantId);
            return res.status(500).json({
                success: false,
                message: 'Erro ao configurar relacionamento'
            });
        }
        // --- LOGIN AUTOMÁTICO APÓS REGISTRO ---
        const jwtSecret = process.env.JWT_SECRET || 'seu-segredo-jwt-padrao';
        const token = jsonwebtoken_1.default.sign(
            { 
                id: adminUserId, 
                email: email, 
                role: 'tenant_admin',
                tenantId: tenantId
            }, 
            jwtSecret, 
            { expiresIn: '7d' }
        );

        logger.info('User registered successfully and token generated', { email, adminUserId, tenantId });
        
        return res.status(201).json({
            success: true,
            message: 'Conta criada com sucesso!',
            token: token,
            user: {
                id: adminUserId,
                name: `${firstName} ${lastName}`,
                email: email,
                role: 'tenant_admin',
                tenantId: tenantId
            }
        });
    }
    catch (error) {
        logger.error('Registration error', { error });
        return res.status(500).json({
            success: false,
            message: 'Erro interno do servidor'
        });
    }
});

// Forgot Password Route
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Email é obrigatório'
            });
        }

        // Check if user exists in admin_users table
        const { data: adminUser, error: adminError } = await supabase
            .from('admin_users')
            .select('id, email, name, role')
            .eq('email', email)
            .single();

        if (adminError || !adminUser) {
            // For security, don't reveal if email exists or not
            return res.json({
                success: true,
                message: 'Se o email estiver cadastrado, você receberá as instruções para redefinir sua senha.'
            });
        }

        // Generate reset token (you would implement email sending here)
        const resetToken = (0, uuid_1.v4)();
        
        // For now, we'll return the token (in production, send via email)
        logger.info('Password reset requested', { email, resetToken });
        
        return res.json({
            success: true,
            message: 'Se o email estiver cadastrado, você receberá as instruções para redefinir sua senha.',
            // In production, remove this and send via email
            resetToken: resetToken
        });

    } catch (error) {
        logger.error('Forgot password error', { error });
        return res.status(500).json({
            success: false,
            message: 'Erro interno do servidor'
        });
    }
});

// Import subscription auth middleware
const { getSubscriptionStatus } = require('../middleware/subscription-auth');
const { AdminAuthMiddleware } = require('../middleware/admin-auth');
const adminAuth = new AdminAuthMiddleware();

// Route para verificar status da subscription
router.get('/subscription-status', adminAuth.verifyToken, async (req, res) => {
    await getSubscriptionStatus(req, res);
});

exports.default = router;
//# sourceMappingURL=auth.js.map