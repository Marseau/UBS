"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CalendarService = void 0;
const googleapis_1 = require("googleapis");
const database_1 = require("../config/database");
const EncryptionService = require("../utils/encryption.service");
const { ensureFreshGoogleToken } = require("../utils/google-token");
class CalendarService {
    constructor() {
        this.initializeGoogleAuth();
        this.encryptionService = new EncryptionService();
    }
    async initializeGoogleAuth() {
        try {
            this.auth = new googleapis_1.google.auth.OAuth2(process.env.GOOGLE_CALENDAR_CLIENT_ID, process.env.GOOGLE_CALENDAR_CLIENT_SECRET, process.env.GOOGLE_CALENDAR_REDIRECT_URI);
            if (process.env.GOOGLE_CALENDAR_REFRESH_TOKEN) {
                this.auth.setCredentials({
                    refresh_token: process.env.GOOGLE_CALENDAR_REFRESH_TOKEN,
                    access_token: process.env.GOOGLE_CALENDAR_ACCESS_TOKEN
                });
            }
            this.calendar = googleapis_1.google.calendar({ version: 'v3', auth: this.auth });
        }
        catch (error) {
            console.error('Failed to initialize Google Calendar:', error);
        }
    }
    async createCalendarEvent(appointment) {
        try {
            // Validate appointment data
            if (!appointment) {
                throw new Error("Appointment data is required");
            }
            
            if (!appointment.professional_id && !appointment.professional?.id) {
                throw new Error("Professional ID is required for calendar event creation");
            }
            
            // Handle both direct professional_id and nested professional object
            const professionalId = appointment.professional_id || appointment.professional?.id;

            // ✅ Garante token fresco antes de obter auth client
            if (professionalId) {
                try {
                    await ensureFreshGoogleToken({ professionalId });
                } catch (e) {
                    console.warn('⚠️ Falha ao atualizar token (seguindo assim mesmo):', e?.message || e);
                }
            }
            
            const authClient = await this.getAuthClientForProfessional(professionalId);
            if (!authClient) throw new Error("Credenciais do profissional não configuradas para o Google Calendar.");
            // Validate required appointment fields
            if (!appointment.tenant_id) {
                throw new Error("Tenant ID is required for calendar event creation");
            }
            if (!appointment.service_id && !appointment.service?.id) {
                throw new Error("Service ID is required for calendar event creation");
            }
            if (!appointment.user_id && !appointment.customer?.id) {
                throw new Error("User ID is required for calendar event creation");
            }
            if (!appointment.start_time) {
                throw new Error("Start time is required for calendar event creation");
            }
            if (!appointment.end_time) {
                throw new Error("End time is required for calendar event creation");
            }

            // Handle nested objects from JOIN queries
            let tenant, service, user;
            
            if (appointment.tenant) {
                tenant = appointment.tenant;
            } else {
                const { data: tenantData, error: tenantError } = await database_1.supabase
                    .from('tenants')
                    .select('business_name, business_address, domain')
                    .eq('id', appointment.tenant_id)
                    .single();
                if (tenantError) throw new Error(`Failed to fetch tenant: ${tenantError.message}`);
                tenant = tenantData;
            }
            
            if (appointment.service) {
                service = appointment.service;
            } else {
                const serviceId = appointment.service_id || appointment.service?.id;
                const { data: serviceData, error: serviceError } = await database_1.supabase
                    .from('services')
                    .select('name, description')
                    .eq('id', serviceId)
                    .single();
                if (serviceError) throw new Error(`Failed to fetch service: ${serviceError.message}`);
                service = serviceData;
            }
            
            if (appointment.customer) {
                user = appointment.customer;
            } else if (appointment.user) {
                user = appointment.user;
            } else {
                const userId = appointment.user_id || appointment.customer?.id;
                const { data: userData, error: userError } = await database_1.supabase
                    .from('users')
                    .select('name, email, phone')
                    .eq('id', userId)
                    .single();
                if (userError) throw new Error(`Failed to fetch user: ${userError.message}`);
                user = userData;
            }
            
            if (!tenant || !service || !user) {
                throw new Error('Failed to load required appointment data (tenant, service, or user)');
            }
            const event = {
                summary: `${service.name} - ${tenant.business_name}`,
                description: this.buildEventDescription(appointment, service, user, tenant),
                start: {
                    dateTime: appointment.start_time,
                    timeZone: appointment.timezone || 'America/Sao_Paulo'
                },
                end: {
                    dateTime: appointment.end_time,
                    timeZone: appointment.timezone || 'America/Sao_Paulo'
                },
                location: this.formatLocation(tenant.business_address),
                attendees: this.buildAttendees(user, tenant),
                reminders: {
                    useDefault: false,
                    overrides: [
                        { method: 'email', minutes: 24 * 60 },
                        { method: 'popup', minutes: 60 },
                        { method: 'popup', minutes: 15 }
                    ]
                },
                status: 'confirmed',
                transparency: 'opaque',
                colorId: this.getColorForDomain(tenant.domain),
                extendedProperties: {
                    private: {
                        appointmentId: appointment.id,
                        tenantId: appointment.tenant_id,
                        serviceId: appointment.service_id,
                        userId: appointment.user_id,
                        source: 'whatsapp-booking-system'
                    }
                }
            };
            const response = await this.calendar.events.insert({
                calendarId: 'primary',
                resource: event,
                sendUpdates: 'all'
            });
            await database_1.supabase
                .from('appointments')
                .update({ external_event_id: response.data.id })
                .eq('id', appointment.id);
            return {
                success: true,
                eventId: response.data.id,
                eventUrl: response.data.htmlLink,
                message: 'Calendar event created successfully'
            };
        }
        catch (error) {
            console.error('Failed to create calendar event:', error);
            
            // Categorize error types for better handling
            let errorType = 'unknown';
            let errorMessage = error instanceof Error ? error.message : 'Unknown error';
            
            if (errorMessage.includes('invalid_grant') || errorMessage.includes('unauthorized')) {
                errorType = 'auth_expired';
                errorMessage = 'Google Calendar authorization has expired. Please re-authorize.';
            } else if (errorMessage.includes('not found') || errorMessage.includes('missing')) {
                errorType = 'data_missing';
            } else if (errorMessage.includes('required')) {
                errorType = 'validation_error';
            } else if (errorMessage.includes('credentials')) {
                errorType = 'credentials_error';
            }
            
            return {
                success: false,
                error: errorMessage,
                errorType: errorType,
                message: `Failed to create calendar event: ${errorMessage}`
            };
        }
    }
    async updateCalendarEvent(appointment) {
        try {
            if (!appointment.external_event_id) {
                return await this.createCalendarEvent(appointment);
            }
            const { data: tenant } = await database_1.supabase
                .from('tenants')
                .select('business_name, business_address')
                .eq('id', appointment.tenant_id)
                .single();
            const { data: service } = await database_1.supabase
                .from('services')
                .select('name, description')
                .eq('id', appointment.service_id)
                .single();
            const { data: user } = await database_1.supabase
                .from('users')
                .select('name, email, phone')
                .eq('id', appointment.user_id)
                .single();
            const event = {
                summary: `${service?.name} - ${tenant?.business_name}`,
                description: this.buildEventDescription(appointment, service, user, tenant),
                start: {
                    dateTime: appointment.start_time,
                    timeZone: appointment.timezone || 'America/Sao_Paulo'
                },
                end: {
                    dateTime: appointment.end_time,
                    timeZone: appointment.timezone || 'America/Sao_Paulo'
                },
                location: this.formatLocation(tenant?.business_address),
                status: this.mapAppointmentStatus(appointment.status)
            };
            const response = await this.calendar.events.update({
                calendarId: 'primary',
                eventId: appointment.external_event_id,
                resource: event,
                sendUpdates: 'all'
            });
            return {
                success: true,
                eventId: response.data.id,
                eventUrl: response.data.htmlLink,
                message: 'Calendar event updated successfully'
            };
        }
        catch (error) {
            console.error('Failed to update calendar event:', error);
            return {
                success: false,
                message: `Failed to update calendar event: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }
    async cancelCalendarEvent(appointment) {
        try {
            if (!appointment.external_event_id) {
                return {
                    success: true,
                    message: 'No calendar event to cancel'
                };
            }
            await this.calendar.events.delete({
                calendarId: 'primary',
                eventId: appointment.external_event_id,
                sendUpdates: 'all'
            });
            return {
                success: true,
                message: 'Calendar event cancelled successfully'
            };
        }
        catch (error) {
            console.error('Failed to cancel calendar event:', error);
            return {
                success: false,
                message: `Failed to cancel calendar event: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }
    async checkCalendarConflicts(tenantId, startTime, endTime, excludeEventId) {
        try {
            const calendarId = await this.getCalendarId(tenantId);
            const response = await this.calendar.events.list({
                calendarId,
                timeMin: startTime,
                timeMax: endTime,
                singleEvents: true,
                orderBy: 'startTime'
            });
            const conflicts = response.data.items?.filter((event) => event.id !== excludeEventId &&
                event.status !== 'cancelled' &&
                this.hasTimeOverlap(startTime, endTime, event.start?.dateTime, event.end?.dateTime)) || [];
            return {
                hasConflicts: conflicts.length > 0,
                conflicts: conflicts.map((event) => ({
                    id: event.id,
                    summary: event.summary,
                    start: event.start?.dateTime,
                    end: event.end?.dateTime
                })),
                message: conflicts.length > 0
                    ? `Found ${conflicts.length} conflicting event(s)`
                    : 'No conflicts found'
            };
        }
        catch (error) {
            console.error('Failed to check calendar conflicts:', error);
            return {
                hasConflicts: false,
                conflicts: [],
                message: 'Failed to check conflicts'
            };
        }
    }
    async getAvailableSlots(tenantId, date, duration, businessHours) {
        try {
            const calendarId = await this.getCalendarId(tenantId);
            const startOfDay = `${date}T${businessHours.start}:00`;
            const endOfDay = `${date}T${businessHours.end}:00`;
            const response = await this.calendar.freebusy.query({
                resource: {
                    timeMin: startOfDay,
                    timeMax: endOfDay,
                    items: [{ id: calendarId }]
                }
            });
            const busyTimes = response.data.calendars[calendarId]?.busy || [];
            const slots = this.generateAvailableSlots(startOfDay, endOfDay, duration, busyTimes);
            return slots;
        }
        catch (error) {
            console.error('Failed to get available slots:', error);
            return [];
        }
    }
    async syncWithCalendar(tenantId) {
        try {
            const calendarId = await this.getCalendarId(tenantId);
            const syncToken = await this.getSyncToken(tenantId);
            const response = await this.calendar.events.list({
                calendarId,
                syncToken,
                singleEvents: true
            });
            const changes = response.data.items || [];
            let created = 0, updated = 0, deleted = 0;
            for (const event of changes) {
                const appointmentId = event.extendedProperties?.private?.appointmentId;
                if (appointmentId) {
                    if (event.status === 'cancelled') {
                        await database_1.supabase
                            .from('appointments')
                            .update({
                            status: 'cancelled',
                            cancelled_at: new Date().toISOString(),
                            cancellation_reason: 'Cancelled via calendar'
                        })
                            .eq('id', appointmentId);
                        deleted++;
                    }
                    else {
                        await database_1.supabase
                            .from('appointments')
                            .update({
                            start_time: event.start?.dateTime,
                            end_time: event.end?.dateTime
                        })
                            .eq('id', appointmentId);
                        updated++;
                    }
                }
            }
            await this.saveSyncToken(tenantId, response.data.nextSyncToken);
            return {
                success: true,
                created,
                updated,
                deleted,
                message: `Sync completed: ${created} created, ${updated} updated, ${deleted} deleted`
            };
        }
        catch (error) {
            console.error('Failed to sync with calendar:', error);
            return {
                success: false,
                created: 0,
                updated: 0,
                deleted: 0,
                message: `Sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }
    buildEventDescription(appointment, service, user, tenant) {
        const lines = [
            `📅 Agendamento: ${service?.name}`,
            `👤 Cliente: ${user?.name || 'N/A'}`,
            `📞 Telefone: ${user?.phone || 'N/A'}`,
            `📧 Email: ${user?.email || 'N/A'}`,
            `🏢 Empresa: ${tenant?.business_name}`,
            '',
            `💰 Valor: R$ ${appointment.quoted_price || 'A definir'}`,
            `🆔 ID: ${appointment.id}`,
            '',
            `📝 Observações: ${appointment.customer_notes || 'Nenhuma'}`,
            '',
            `🤖 Agendado via WhatsApp AI Bot`
        ];
        return lines.join('\n');
    }
    formatLocation(address) {
        if (!address)
            return '';
        if (typeof address === 'string')
            return address;
        const parts = [
            address.street,
            address.number,
            address.complement,
            address.neighborhood,
            address.city,
            address.state,
            address.zipCode
        ].filter(Boolean);
        return parts.join(', ');
    }
    buildAttendees(user, tenant) {
        const attendees = [];
        if (user?.email) {
            attendees.push({
                email: user.email,
                displayName: user.name,
                responseStatus: 'needsAction'
            });
        }
        if (tenant?.email) {
            attendees.push({
                email: tenant.email,
                displayName: tenant.business_name,
                responseStatus: 'accepted',
                organizer: true
            });
        }
        return attendees;
    }
    getColorForDomain(domain) {
        const colors = {
            'healthcare': '2',
            'beauty': '9',
            'legal': '11',
            'education': '5',
            'sports': '10',
            'consulting': '3',
            'other': '8'
        };
        return colors[domain] || colors.other;
    }
    mapAppointmentStatus(status) {
        const statusMap = {
            'confirmed': 'confirmed',
            'pending': 'tentative',
            'cancelled': 'cancelled',
            'completed': 'confirmed',
            'no_show': 'cancelled',
            'rescheduled': 'confirmed'
        };
        return statusMap[status] || 'tentative';
    }
    async getCalendarId(tenantId) {
        return 'primary';
    }
    hasTimeOverlap(start1, end1, start2, end2) {
        if (!start2 || !end2)
            return false;
        const s1 = new Date(start1).getTime();
        const e1 = new Date(end1).getTime();
        const s2 = new Date(start2).getTime();
        const e2 = new Date(end2).getTime();
        return s1 < e2 && e1 > s2;
    }
    generateAvailableSlots(startTime, endTime, duration, busyTimes) {
        const slots = [];
        const start = new Date(startTime).getTime();
        const end = new Date(endTime).getTime();
        const durationMs = duration * 60 * 1000;
        let currentTime = start;
        while (currentTime + durationMs <= end) {
            const slotEnd = currentTime + durationMs;
            const slotStart = new Date(currentTime).toISOString();
            const slotEndStr = new Date(slotEnd).toISOString();
            const hasConflict = busyTimes.some(busy => this.hasTimeOverlap(slotStart, slotEndStr, busy.start, busy.end));
            if (!hasConflict) {
                slots.push({
                    start: slotStart,
                    end: slotEndStr,
                    available: true
                });
            }
            currentTime += 30 * 60 * 1000;
        }
        return slots;
    }
    async getSyncToken(tenantId) {
        return undefined;
    }
    async saveSyncToken(tenantId, token) {
        // Implementation for saving sync tokens
    }

    /**
     * ✅ DATA RETENTION POLICY: Clean up expired tokens
     * Removes credentials for professionals with expired tokens (older than 7 days)
     */
    async cleanupExpiredTokens() {
        try {
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

            // Find professionals with expired credentials
            const { data: expiredProfessionals, error } = await database_1.supabaseAdmin
                .from('professionals')
                .select('id, google_calendar_credentials')
                .not('google_calendar_credentials', 'is', null);

            if (error) {
                console.error('Error fetching professionals for token cleanup:', error);
                return;
            }

            let cleanedCount = 0;
            for (const professional of expiredProfessionals || []) {
                try {
                    // Decrypt to check expiry date
                    const credentials = await this.encryptionService.decryptCredentials(professional.google_calendar_credentials);
                    
                    // Check if token is expired (Google tokens typically last 1 hour)
                    if (credentials.expiry_date && new Date(credentials.expiry_date) < sevenDaysAgo) {
                        // Remove expired credentials
                        await database_1.supabaseAdmin
                            .from('professionals')
                            .update({ 
                                google_calendar_credentials: null,
                                google_calendar_id: null 
                            })
                            .eq('id', professional.id);
                        
                        cleanedCount++;
                        console.log(`Cleaned expired Google Calendar credentials for professional ${professional.id}`);
                    }
                } catch (decryptError) {
                    console.error(`Error processing credentials for professional ${professional.id}:`, decryptError);
                }
            }

            console.log(`✅ Token cleanup completed: ${cleanedCount} expired credentials removed`);
            return { success: true, cleanedCount };
        } catch (error) {
            console.error('Failed to cleanup expired tokens:', error);
            return { success: false, error: error.message };
        }
    }
    /**
     * Gera a URL de autorização do Google para um profissional específico.
     * @param {string} professionalId - O ID do profissional para associar ao estado do OAuth.
     * @returns {string} - A URL para redirecionar o usuário.
     */
    generateAuthUrl(professionalId) {
        const scopes = [
            'https://www.googleapis.com/auth/calendar.readonly',
            'https://www.googleapis.com/auth/calendar.events'
        ];
        
        return this.auth.generateAuthUrl({
            access_type: 'offline', // Pede um refresh_token
            prompt: 'consent',      // Garante que o usuário veja a tela de consentimento
            scope: scopes,
            state: professionalId   // Passa o ID do profissional para o callback
        });
    }
    /**
     * Processa o callback do OAuth, troca o código por tokens e os salva.
     * @param {string} code - O código de autorização retornado pelo Google.
     * @param {string} professionalId - O ID do profissional.
     */
    async processOAuthCallback(code, professionalId) {
        try {
            const { tokens } = await this.auth.getToken(code);
            
            // É crucial salvar o refresh_token para acesso futuro
            if (!tokens.refresh_token) {
                 // O Google só fornece o refresh_token na primeira autorização.
                 // Se ele não vier, pode ser uma re-autorização.
                 // Neste caso, podemos apenas atualizar o access_token se necessário
                 // ou instruir o usuário a revogar o acesso e tentar novamente
                 // para obter um novo refresh_token.
                 console.warn(`Refresh token não recebido para o profissional ${professionalId}. Isso é esperado em re-autorizações.`);
            }

            // ✅ ENCRYPT TOKENS BEFORE STORING
            const encryptedCredentials = await this.encryptionService.encryptCredentials(tokens);

            const { error } = await database_1.supabaseAdmin
                .from('professionals')
                .update({
                    google_calendar_credentials: encryptedCredentials,
                    google_calendar_id: 'primary' // Assume o calendário principal
                })
                .eq('id', professionalId);

            if (error) {
                console.error('Erro ao salvar credenciais do Google no banco de dados:', error);
                throw new Error('Falha ao salvar credenciais.');
            }

            console.log(`Credenciais do Google Calendar salvas com sucesso para o profissional ${professionalId}`);

        } catch (error) {
            console.error(`Erro ao processar o callback do Google OAuth para o profissional ${professionalId}:`, error);
            throw error; // Re-lança o erro para a rota lidar com o redirecionamento
        }
    }
    /**
     * Cria e configura um cliente OAuth2 autenticado para um profissional específico.
     * @param {string} professionalId - O ID do profissional.
     * @returns {Promise<import('google-auth-library').OAuth2Client | null>}
     */
    async getAuthClientForProfessional(professionalId) {
        const { data: professional, error } = await database_1.supabaseAdmin
            .from('professionals')
            .select('google_calendar_credentials')
            .eq('id', professionalId)
            .single();

        if (error || !professional || !professional.google_calendar_credentials) {
            console.error(`Credenciais do Google não encontradas para o profissional ${professionalId}:`, error);
            return null;
        }

        // ✅ DECRYPT CREDENTIALS BEFORE USING
        const decryptedCredentials = await this.encryptionService.decryptCredentials(professional.google_calendar_credentials);

        const authClient = new googleapis_1.google.auth.OAuth2(
            process.env.GOOGLE_CALENDAR_CLIENT_ID,
            process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
            process.env.GOOGLE_CALENDAR_REDIRECT_URI
        );
        
        authClient.setCredentials(decryptedCredentials);
        return authClient;
    }

    /**
     * Consulta horários disponíveis para um profissional específico
     * @param {string} professionalId - ID do profissional
     * @param {string} date - Data no formato YYYY-MM-DD
     * @param {number} duration - Duração em minutos
     * @param {Object} businessHours - Horário de funcionamento {start: "09:00", end: "18:00"}
     * @returns {Array} Lista de horários disponíveis
     */
    async getAvailableSlotsForProfessional(professionalId, date, duration = 60, businessHours = { start: "09:00", end: "18:00" }) {
        try {
            console.log(`🗓️ Consultando horários para profissional ${professionalId} em ${date}`);

            // Buscar credenciais do profissional
            const { data: professional, error } = await database_1.supabaseAdmin
                .from('professionals')
                .select('google_calendar_credentials, google_calendar_id, name')
                .eq('id', professionalId)
                .single();

            if (error || !professional) {
                console.log('❌ Profissional não encontrado ou sem configuração');
                return [];
            }

            if (!professional.google_calendar_credentials) {
                console.log('❌ Profissional sem credenciais do Google Calendar');
                return [];
            }

            // ✅ Garante token fresco para este profissional
            try {
                await ensureFreshGoogleToken({ professionalId });
            } catch (e) {
                console.warn('⚠️ Falha ao atualizar token (seguindo assim mesmo):', e?.message || e);
            }

            // Usar o cliente autenticado existente
            const authClient = await this.getAuthClientForProfessional(professionalId);
            if (!authClient) {
                console.log('❌ Falha ao obter cliente autenticado');
                return [];
            }

            // Criar instância do Calendar API para este profissional
            const calendar = googleapis_1.google.calendar({ version: 'v3', auth: authClient });

            // Definir intervalo de consulta
            const startOfDay = `${date}T${businessHours.start}:00-03:00`; // Brasília timezone
            const endOfDay = `${date}T${businessHours.end}:00-03:00`;

            console.log(`📅 Consultando de ${startOfDay} até ${endOfDay}`);

            // Consultar períodos ocupados
            const response = await calendar.freebusy.query({
                resource: {
                    timeMin: startOfDay,
                    timeMax: endOfDay,
                    timeZone: 'America/Sao_Paulo',
                    items: [{ id: professional.google_calendar_id || 'primary' }]
                }
            });

            const calendarId = professional.google_calendar_id || 'primary';
            const busyTimes = response.data.calendars[calendarId]?.busy || [];

            console.log(`📊 Encontrados ${busyTimes.length} períodos ocupados`);

            // Gerar slots disponíveis
            const availableSlots = this.generateAvailableSlots(startOfDay, endOfDay, duration, busyTimes);

            console.log(`✅ ${availableSlots.length} horários disponíveis para ${professional.name}`);

            return availableSlots.map(slot => ({
                time: new Date(slot.start).toLocaleTimeString('pt-BR', { 
                    hour: '2-digit', 
                    minute: '2-digit',
                    timeZone: 'America/Sao_Paulo'
                }),
                datetime: slot.start,
                available: true,
                professional: professional.name,
                professionalId: professionalId
            }));

        } catch (error) {
            console.error('❌ Erro ao consultar horários do profissional:', error.message);
            return [];
        }
    }

    /**
     * Consulta horários disponíveis para múltiplos profissionais de um tenant
     * @param {string} tenantId - ID do tenant
     * @param {string} date - Data no formato YYYY-MM-DD
     * @param {number} duration - Duração em minutos
     * @returns {Array} Lista consolidada de horários disponíveis
     */
    async getAvailableSlotsForTenant(tenantId, date, duration = 60) {
        try {
            console.log(`🏢 Consultando horários para tenant ${tenantId} em ${date}`);

            // Buscar profissionais do tenant com credenciais válidas
            const { data: professionals, error } = await database_1.supabaseAdmin
                .from('professionals')
                .select('id, name, google_calendar_credentials, google_calendar_id')
                .eq('tenant_id', tenantId)
                .not('google_calendar_credentials', 'is', null);

            if (error) {
                console.error('❌ Erro ao buscar profissionais:', error);
                return [];
            }

            if (!professionals || professionals.length === 0) {
                console.log('⚠️ Nenhum profissional com Google Calendar configurado');
                return [];
            }

            console.log(`👥 Encontrados ${professionals.length} profissionais com calendário`);

            // Buscar configuração de horário do tenant
            const { data: tenant } = await database_1.supabaseAdmin
                .from('tenants')
                .select('business_config')
                .eq('id', tenantId)
                .single();

            const businessHours = tenant?.business_config?.business_hours || { start: "09:00", end: "18:00" };

            // Consultar horários para cada profissional
            const allSlots = [];
            for (const professional of professionals) {
                const slots = await this.getAvailableSlotsForProfessional(
                    professional.id, 
                    date, 
                    duration, 
                    businessHours
                );
                allSlots.push(...slots);
            }

            // Remover duplicatas e ordenar por horário
            const uniqueSlots = allSlots.reduce((acc, slot) => {
                const key = slot.time;
                if (!acc.find(s => s.time === key)) {
                    acc.push(slot);
                }
                return acc;
            }, []);

            uniqueSlots.sort((a, b) => a.time.localeCompare(b.time));

            console.log(`📋 Total: ${uniqueSlots.length} horários únicos disponíveis`);

            return uniqueSlots;

        } catch (error) {
            console.error('❌ Erro ao consultar horários do tenant:', error.message);
            return [];
        }
    }
}
exports.CalendarService = CalendarService;
exports.default = CalendarService;
//# sourceMappingURL=calendar.service.js.map