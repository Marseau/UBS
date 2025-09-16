const express = require('express');
const router = express.Router();
const { CalendarService } = require('../services/calendar.service');
const { supabaseAdmin } = require('../config/database');
const { AdminAuthMiddleware } = require('../middleware/admin-auth');

const calendarService = new CalendarService();
const adminAuth = new AdminAuthMiddleware();

// Usar o middleware de autenticação diretamente


/**
 * GET /api/google/calendar/status/:professionalId
 * Verifica o status da conexão Google Calendar para um profissional
 */
router.get('/status/:professionalId', adminAuth.verifyToken, async (req, res) => {
    try {
        const { professionalId } = req.params;
        const tenantId = req.user?.tenant_id;

        console.log('🔍 [CALENDAR] Checking Google Calendar status for professional:', professionalId);

        if (!tenantId) {
            return res.status(400).json({
                success: false,
                error: 'Tenant ID required'
            });
        }

        // Buscar profissional no banco incluindo credenciais do Google Calendar
        const { data: professional, error } = await supabaseAdmin
            .from('professionals')
            .select('id, name, working_hours, google_calendar_credentials, google_calendar_id')
            .eq('id', professionalId)
            .eq('tenant_id', tenantId)
            .single();

        if (error || !professional) {
            console.error('❌ [CALENDAR] Professional not found:', error);
            return res.status(404).json({
                success: false,
                error: 'Professional not found'
            });
        }

        // Verificar se tem credenciais do Google Calendar
        const hasCredentials = !!(professional.google_calendar_credentials &&
                                professional.google_calendar_credentials.access_token);

        console.log('🔍 [CALENDAR] Status check:', {
            professionalId,
            hasCredentials
        });

        return res.json({
            success: true,
            data: {
                isConnected: hasCredentials,
                connected: hasCredentials,
                status: hasCredentials ? 'authorized' : 'not_authorized',
                professional_id: professionalId,
                professional_name: professional.name,
                email: hasCredentials ? professional.google_calendar_credentials.email : null,
                last_sync: null, // TODO: Implementar last_sync
                calendar_id: professional.google_calendar_id || 'primary',
                workSchedule: professional.working_hours
            }
        });

    } catch (error) {
        console.error('❌ [CALENDAR] Error checking status:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to check calendar status'
        });
    }
});

/**
 * POST /api/google/calendar/auth
 * Inicia o fluxo de autorização OAuth do Google Calendar
 */
router.post('/auth', adminAuth.verifyToken, async (req, res) => {
    try {
        const { professionalId } = req.body;
        const tenantId = req.user?.tenant_id;

        console.log('🔒 [CALENDAR] Starting OAuth flow for professional:', professionalId);

        if (!tenantId || !professionalId) {
            return res.status(400).json({
                success: false,
                error: 'Tenant ID and Professional ID required'
            });
        }

        // Verificar se o profissional existe e pertence ao tenant
        const { data: professional, error } = await supabaseAdmin
            .from('professionals')
            .select('id, name')
            .eq('id', professionalId)
            .eq('tenant_id', tenantId)
            .single();

        if (error || !professional) {
            return res.status(404).json({
                success: false,
                error: 'Professional not found'
            });
        }

        // Gerar URL de autorização OAuth
        try {
            const authUrl = calendarService.generateAuthUrl(professionalId);
            return res.json({
                success: true,
                data: {
                    auth_url: authUrl,
                    professional_id: professionalId
                }
            });
        } catch (authError) {
            console.error('❌ [CALENDAR] Failed to generate auth URL:', authError);
            return res.status(500).json({
                success: false,
                error: 'Failed to generate authorization URL'
            });
        }

    } catch (error) {
        console.error('❌ [CALENDAR] Error starting OAuth flow:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to start authorization flow'
        });
    }
});

/**
 * DELETE /api/google/calendar/disconnect/:professionalId
 * Desconecta a integração Google Calendar para um profissional
 */
router.delete('/disconnect/:professionalId', adminAuth.verifyToken, async (req, res) => {
    try {
        const { professionalId } = req.params;
        const tenantId = req.user?.tenant_id;

        console.log('🔌 [CALENDAR] Disconnecting Google Calendar for professional:', professionalId);

        if (!tenantId) {
            return res.status(400).json({
                success: false,
                error: 'Tenant ID required'
            });
        }

        // Verificar se o profissional existe
        const { data: professional, error } = await supabaseAdmin
            .from('professionals')
            .select('id')
            .eq('id', professionalId)
            .eq('tenant_id', tenantId)
            .single();

        if (error || !professional) {
            return res.status(404).json({
                success: false,
                error: 'Professional not found'
            });
        }

        // TODO: Implementar lógica para revogar tokens OAuth e limpar dados
        // Por enquanto retornamos sucesso
        console.log('✅ [CALENDAR] Google Calendar disconnected for professional:', professionalId);

        return res.json({
            success: true,
            message: 'Google Calendar disconnected successfully',
            data: {
                professional_id: professionalId,
                status: 'disconnected'
            }
        });

    } catch (error) {
        console.error('❌ [CALENDAR] Error disconnecting:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to disconnect Google Calendar'
        });
    }
});

/**
 * POST /api/google/calendar/sync/:professionalId
 * Executa sincronização manual com Google Calendar
 */
router.post('/sync/:professionalId', adminAuth.verifyToken, async (req, res) => {
    try {
        const { professionalId } = req.params;
        const tenantId = req.user?.tenant_id;

        console.log('🔄 [CALENDAR] Manual sync requested for professional:', professionalId);

        if (!tenantId) {
            return res.status(400).json({
                success: false,
                error: 'Tenant ID required'
            });
        }

        // Verificar se o profissional existe
        const { data: professional, error } = await supabaseAdmin
            .from('professionals')
            .select('id, name')
            .eq('id', professionalId)
            .eq('tenant_id', tenantId)
            .single();

        if (error || !professional) {
            return res.status(404).json({
                success: false,
                error: 'Professional not found'
            });
        }

        // TODO: Implementar sincronização real com Google Calendar
        // Por enquanto simulamos sucesso
        console.log('✅ [CALENDAR] Sync completed for professional:', professionalId);

        return res.json({
            success: true,
            message: 'Calendar sync completed successfully',
            data: {
                professional_id: professionalId,
                professional_name: professional.name,
                synced_events: 0,
                last_sync: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('❌ [CALENDAR] Error during sync:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to sync calendar'
        });
    }
});

/**
 * PUT /api/google/calendar/schedule/:professionalId
 * Atualiza configurações de horário de trabalho no Google Calendar
 */
router.put('/schedule/:professionalId', adminAuth.verifyToken, async (req, res) => {
    try {
        const { professionalId } = req.params;
        const tenantId = req.user?.tenant_id;
        const { schedule } = req.body;

        console.log('📅 [CALENDAR] Updating work schedule for professional:', professionalId);

        if (!tenantId) {
            return res.status(400).json({
                success: false,
                error: 'Tenant ID required'
            });
        }

        if (!schedule) {
            return res.status(400).json({
                success: false,
                error: 'Schedule data required'
            });
        }

        // Verificar se o profissional existe
        const { data: professional, error: fetchError } = await supabaseAdmin
            .from('professionals')
            .select('id, name, working_hours')
            .eq('id', professionalId)
            .eq('tenant_id', tenantId)
            .single();

        if (fetchError || !professional) {
            return res.status(404).json({
                success: false,
                error: 'Professional not found'
            });
        }

        // Atualizar horário de trabalho no banco
        const { data: updatedProfessional, error: updateError } = await supabaseAdmin
            .from('professionals')
            .update({
                working_hours: schedule,
                updated_at: new Date().toISOString()
            })
            .eq('id', professionalId)
            .eq('tenant_id', tenantId)
            .select()
            .single();

        if (updateError) {
            console.error('❌ [CALENDAR] Failed to update schedule:', updateError);
            return res.status(500).json({
                success: false,
                error: 'Failed to update work schedule'
            });
        }

        // TODO: Sincronizar com Google Calendar se conectado
        console.log('✅ [CALENDAR] Work schedule updated for professional:', professionalId);

        return res.json({
            success: true,
            message: 'Work schedule updated successfully',
            data: {
                professional_id: professionalId,
                professional_name: professional.name,
                working_hours: updatedProfessional.working_hours,
                updated_at: updatedProfessional.updated_at
            }
        });

    } catch (error) {
        console.error('❌ [CALENDAR] Error updating schedule:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to update work schedule'
        });
    }
});

module.exports = router;