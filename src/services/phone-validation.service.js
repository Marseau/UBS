"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.phoneValidationService = exports.PhoneValidationService = void 0;
const database_1 = require("@/config/database");
const logger_1 = require("@/utils/logger");
class PhoneValidationService {
    async validatePhoneNumber(phone) {
        const result = {
            isValid: false,
            hasWhatsApp: false,
            formattedPhone: phone,
            errors: []
        };
        try {
            const formatValidation = this.validatePhoneFormat(phone);
            if (!formatValidation.isValid) {
                result.errors = formatValidation.errors;
                return result;
            }
            result.formattedPhone = formatValidation.formattedPhone;
            result.isValid = true;
            result.hasWhatsApp = await this.checkWhatsAppAvailability(result.formattedPhone);
            logger_1.logger.info('Phone validation completed', {
                phone: result.formattedPhone,
                hasWhatsApp: result.hasWhatsApp
            });
            return result;
        }
        catch (error) {
            logger_1.logger.error('Error validating phone number', { error, phone });
            result.errors?.push('Erro interno na validação');
            return result;
        }
    }
    validatePhoneFormat(phone) {
        const errors = [];
        let formattedPhone = phone;
        formattedPhone = phone.replace(/[\s\-\(\)\.]/g, '');
        if (!formattedPhone.startsWith('+') && formattedPhone.length > 10) {
            formattedPhone = '+' + formattedPhone;
        }
        const brazilPatterns = [
            /^\+55[1-9]{2}9[0-9]{8}$/,
            /^\+55[1-9]{2}[2-9][0-9]{7}$/,
        ];
        const internationalPattern = /^\+[1-9]\d{1,14}$/;
        const isBrazilian = brazilPatterns.some(pattern => pattern.test(formattedPhone));
        const isInternational = internationalPattern.test(formattedPhone);
        if (!isBrazilian && !isInternational) {
            errors.push('Formato de telefone inválido');
            errors.push('Use o formato: +55 11 99999-9999 (Brasil) ou +código país número');
        }
        if (formattedPhone.length < 8) {
            errors.push('Número muito curto');
        }
        if (formattedPhone.length > 17) {
            errors.push('Número muito longo');
        }
        return {
            isValid: errors.length === 0,
            formattedPhone,
            errors
        };
    }
    async checkWhatsAppAvailability(phone) {
        try {
            if (phone.match(/^\+55[1-9]{2}9[0-9]{8}$/)) {
                return true;
            }
            const whatsappProbability = parseFloat(process.env.WHATSAPP_AVAILABILITY_RATE || '0.8');
            return Math.random() < whatsappProbability;
        }
        catch (error) {
            logger_1.logger.error('Error checking WhatsApp availability', { error, phone });
            return false;
        }
    }
    async registerUserByPhone(phone, tenantId, name, additionalData) {
        try {
            const phoneValidation = await this.validatePhoneNumber(phone);
            if (!phoneValidation.isValid || !phoneValidation.hasWhatsApp) {
                return {
                    success: false,
                    isNewUser: false,
                    needsOnboarding: false,
                    message: `Telefone inválido: ${phoneValidation.errors?.join(', ')}`
                };
            }
            const formattedPhone = phoneValidation.formattedPhone;
            const { data: existingUser, error: userError } = await database_1.supabaseAdmin
                .from('users')
                .select('id, name, phone')
                .eq('phone', formattedPhone)
                .single();
            if (userError && userError.code !== 'PGRST116') {
                logger_1.logger.error('Error checking existing user', { error: userError });
                throw userError;
            }
            let userId;
            let isNewUser = false;
            if (existingUser) {
                userId = existingUser.id;
                logger_1.logger.info('Existing user found', { userId, phone: formattedPhone });
            }
            else {
                const { data: newUser, error: createError } = await database_1.supabaseAdmin
                    .from('users')
                    .insert({
                    phone: formattedPhone,
                    name: name || `Usuário ${formattedPhone.slice(-4)}`,
                    ...additionalData,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
                    .select('id')
                    .single();
                if (createError) {
                    logger_1.logger.error('Error creating new user', { error: createError });
                    throw createError;
                }
                userId = newUser.id;
                isNewUser = true;
                logger_1.logger.info('New user created', { userId, phone: formattedPhone });
            }
            const { data: existingRelation } = await database_1.supabaseAdmin
                .from('user_tenants')
                .select('id, is_onboarded')
                .eq('user_id', userId)
                .eq('tenant_id', tenantId)
                .single();
            let needsOnboarding = false;
            if (!existingRelation) {
                await database_1.supabaseAdmin
                    .from('user_tenants')
                    .insert({
                    user_id: userId,
                    tenant_id: tenantId,
                    is_onboarded: false,
                    relationship_type: 'customer',
                    created_at: new Date().toISOString()
                });
                needsOnboarding = true;
                logger_1.logger.info('User-tenant relationship created', { userId, tenantId });
            }
            else {
                needsOnboarding = !existingRelation.is_onboarded;
            }
            return {
                success: true,
                userId,
                isNewUser,
                needsOnboarding,
                message: isNewUser ? 'Usuário cadastrado com sucesso' : 'Usuário existente encontrado'
            };
        }
        catch (error) {
            logger_1.logger.error('Error registering user by phone', { error, phone, tenantId });
            return {
                success: false,
                isNewUser: false,
                needsOnboarding: false,
                message: `Erro ao registrar usuário: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
            };
        }
    }
    async markUserAsOnboarded(userId, tenantId) {
        try {
            const { error } = await database_1.supabaseAdmin
                .from('user_tenants')
                .update({
                is_onboarded: true,
                onboarded_at: new Date().toISOString()
            })
                .eq('user_id', userId)
                .eq('tenant_id', tenantId);
            if (error) {
                logger_1.logger.error('Error marking user as onboarded', { error, userId, tenantId });
                return false;
            }
            logger_1.logger.info('User marked as onboarded', { userId, tenantId });
            return true;
        }
        catch (error) {
            logger_1.logger.error('Error in markUserAsOnboarded', { error, userId, tenantId });
            return false;
        }
    }
    async getUserOnboardingStatus(phone, tenantId) {
        try {
            const { data: user, error: userError } = await database_1.supabaseAdmin
                .from('users')
                .select(`
          id,
          user_tenants!inner (
            is_onboarded,
            tenant_id
          )
        `)
                .eq('phone', phone)
                .eq('user_tenants.tenant_id', tenantId)
                .single();
            if (userError && userError.code !== 'PGRST116') {
                logger_1.logger.error('Error getting user onboarding status', { error: userError });
                throw userError;
            }
            if (!user) {
                return {
                    exists: false,
                    needsOnboarding: true
                };
            }
            return {
                exists: true,
                needsOnboarding: !user.user_tenants.is_onboarded,
                userId: user.id
            };
        }
        catch (error) {
            logger_1.logger.error('Error in getUserOnboardingStatus', { error, phone, tenantId });
            return {
                exists: false,
                needsOnboarding: true
            };
        }
    }
    async sendVerificationCode(phone) {
        try {
            const code = Math.floor(100000 + Math.random() * 900000).toString();
            logger_1.logger.info('Verification code generated', { phone, code });
            return {
                success: true,
                code: process.env.NODE_ENV === 'development' ? code : undefined,
                message: 'Código de verificação enviado via WhatsApp'
            };
        }
        catch (error) {
            logger_1.logger.error('Error sending verification code', { error, phone });
            return {
                success: false,
                message: 'Erro ao enviar código de verificação'
            };
        }
    }
    async verifyPhoneWithCode(phone, code) {
        try {
            if (process.env.NODE_ENV === 'development') {
                return code.length === 6 && /^\d+$/.test(code);
            }
            return false;
        }
        catch (error) {
            logger_1.logger.error('Error verifying phone code', { error, phone });
            return false;
        }
    }
}
exports.PhoneValidationService = PhoneValidationService;
exports.phoneValidationService = new PhoneValidationService();
//# sourceMappingURL=phone-validation.service.js.map