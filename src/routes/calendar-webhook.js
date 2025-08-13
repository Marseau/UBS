/**
 * GOOGLE CALENDAR WEBHOOK ROUTES
 * 
 * Recebe push notifications do Google Calendar e sincroniza automaticamente
 */

const express = require('express');
const { CalendarSyncBidirectionalService } = require('../services/calendar-sync-bidirectional.service');
const { supabaseAdmin } = require('../config/database');

const router = express.Router();
const syncService = new CalendarSyncBidirectionalService();

/**
 * WEBHOOK - Google Calendar Push Notifications
 * Triggered quando há mudanças no Google Calendar
 */
router.post('/google-calendar-webhook', async (req, res) => {
    try {
        console.log('📅 Google Calendar webhook recebido:', req.headers);
        
        // Verificar headers do Google
        const channelId = req.headers['x-goog-channel-id'];
        const resourceState = req.headers['x-goog-resource-state'];
        const resourceId = req.headers['x-goog-resource-id'];
        
        if (!channelId || !resourceState) {
            console.log('⚠️ Headers inválidos do Google Calendar webhook');
            return res.status(400).json({ error: 'Invalid webhook headers' });
        }

        console.log(`🔔 Calendar change detected: ${resourceState} (Channel: ${channelId})`);

        // Buscar qual profissional/tenant corresponde a este canal
        // TODO: Implementar mapeamento canal -> profissional quando webhook estiver configurado
        const { data: professional, error: profError } = await supabaseAdmin
            .from('professionals')
            .select('id, tenant_id, name, google_calendar_credentials')
            .not('google_calendar_credentials', 'is', null)
            .limit(1)
            .single();

        if (profError || !professional) {
            console.log(`⚠️ Canal ${channelId} não encontrado ou profissional não configurado`);
            return res.status(200).json({ status: 'ignored', reason: 'channel_not_found' });
        }

        console.log(`👤 Sincronizando calendar do profissional: ${professional.name} (Tenant: ${professional.tenant_id})`);

        // Executar sincronização
        const syncResult = await syncService.fullSync(professional.tenant_id, professional.id);

        if (syncResult.success) {
            console.log(`✅ Sincronização concluída: ${JSON.stringify(syncResult.summary)}`);
            
            return res.status(200).json({
                status: 'success',
                channel_id: channelId,
                professional_id: professional.id,
                tenant_id: professional.tenant_id,
                sync_result: syncResult.summary
            });
        } else {
            console.error(`❌ Erro na sincronização:`, syncResult.error);
            
            return res.status(500).json({
                status: 'error',
                channel_id: channelId,
                error: syncResult.error
            });
        }

    } catch (error) {
        console.error('❌ Erro no webhook do Google Calendar:', error);
        
        return res.status(500).json({
            status: 'error',
            message: 'Internal server error',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * MANUAL SYNC - Sincronização manual por tenant/profissional
 */
router.post('/sync/:tenantId/:professionalId', async (req, res) => {
    try {
        const { tenantId, professionalId } = req.params;
        
        console.log(`🔄 Sincronização manual solicitada: Tenant ${tenantId}, Professional ${professionalId}`);

        const syncResult = await syncService.fullSync(tenantId, professionalId);

        if (syncResult.success) {
            return res.json({
                success: true,
                message: 'Sincronização concluída com sucesso',
                result: syncResult
            });
        } else {
            return res.status(500).json({
                success: false,
                error: syncResult.error
            });
        }

    } catch (error) {
        console.error('❌ Erro na sincronização manual:', error);
        
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * IMPORT ONLY - Apenas importar novos eventos (sem sync de mudanças)
 */
router.post('/import/:tenantId/:professionalId', async (req, res) => {
    try {
        const { tenantId, professionalId } = req.params;
        
        console.log(`📥 Importação manual solicitada: Tenant ${tenantId}, Professional ${professionalId}`);

        const importResult = await syncService.importExternalEvents(tenantId, professionalId);

        return res.json({
            success: importResult.success,
            message: importResult.success ? 'Eventos importados com sucesso' : 'Erro na importação',
            result: importResult
        });

    } catch (error) {
        console.error('❌ Erro na importação manual:', error);
        
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * STATUS - Verificar status da sincronização
 */
router.get('/status/:tenantId', async (req, res) => {
    try {
        const { tenantId } = req.params;

        // Buscar profissionais com Google Calendar configurado
        const { data: professionals, error } = await supabaseAdmin
            .from('professionals')
            .select(`
                id, 
                name, 
                google_calendar_credentials
            `)
            .eq('tenant_id', tenantId);

        if (error) {
            return res.status(500).json({ error: error.message });
        }

        // Buscar appointments externos
        const { data: externalAppointments, error: apptError } = await supabaseAdmin
            .from('appointments')
            .select('id, external_event_id, appointment_data, created_at')
            .eq('tenant_id', tenantId)
            .not('external_event_id', 'is', null);

        if (apptError) {
            return res.status(500).json({ error: apptError.message });
        }

        return res.json({
            tenant_id: tenantId,
            professionals_with_calendar: professionals?.length || 0,
            external_appointments: externalAppointments?.length || 0,
            professionals: professionals?.map(p => ({
                id: p.id,
                name: p.name,
                has_credentials: !!p.google_calendar_credentials,
                webhook_configured: false // TODO: Implementar quando webhook estiver configurado
            })) || [],
            sync_status: 'ready'
        });

    } catch (error) {
        console.error('❌ Erro ao verificar status:', error);
        
        return res.status(500).json({
            error: error.message
        });
    }
});

module.exports = router;