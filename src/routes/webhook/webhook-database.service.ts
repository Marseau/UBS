/**
 * Database service for webhook operations
 */

import { supabaseAdmin } from '../../config/database';
import { logger } from './webhook-validation.middleware';
import { SessionData } from './webhook-message-parser';

// ===== DB Service =====
export class DatabaseService {
    static async findTenantByBusinessPhone(phoneNumberId: string): Promise<any | null> {
        try {
            const digits = String(phoneNumberId || '').replace(/\D/g, '');
            const plusDigits = `+${digits}`;
            const { data: tenant, error } = await supabaseAdmin
                .from('tenants').select('*')
                .or(`whatsapp_phone.eq.${digits},whatsapp_phone.eq.${plusDigits}`)
                .single();
            if (!error && tenant) return tenant;

            const fb = await supabaseAdmin
                .from('tenants').select('*')
                .or(`phone.eq.${digits},phone.eq.${plusDigits}`)
                .single();
            if (!fb.error && fb.data) return fb.data;

            const j = await supabaseAdmin
                .from('tenants').select('*')
                .contains('whatsapp_numbers', [{ phone_number_id: digits }]);
            if (!j.error && j.data?.[0]) return j.data[0];

            return null;
        } catch (error) {
            logger.error('Database tenant search error', { phoneNumberId, error });
            return null;
        }
    }

    static async listServices(tenantId: string): Promise<Array<{ name: string; duration?: string; price?: string }>> {
        try {
            const { data, error } = await supabaseAdmin
                .from('services').select('*')
                .eq('tenant_id', tenantId).limit(200);
            if (error || !data) return [];
            return data.map((s: any) => ({
                name: s?.name || s?.title || 'Serviço',
                duration: s?.duration ?? s?.duration_minutes ?? s?.duration_min ?? s?.time ?? s?.length,
                price: s?.price ?? s?.value ?? s?.cost ?? s?.amount
            }));
        } catch (error) {
            logger.error('Database services error', { tenantId, error });
            return [];
        }
    }

    static async findUserByPhone(tenantId: string, phone: string): Promise<any | null> {
        try {
            const raw = String(phone || '').trim();
            const digits = raw.replace(/\D/g, '');
            const candidatesSet = new Set<string>();
            if (digits) {
                candidatesSet.add(digits);
                candidatesSet.add(`+${digits}`);
                if (digits.startsWith('55')) {
                    const local = digits.slice(2);
                    if (local) {
                        candidatesSet.add(local);
                        candidatesSet.add(`+${local}`);
                    }
                } else {
                    candidatesSet.add(`55${digits}`);
                    candidatesSet.add(`+55${digits}`);
                }
            }
            const candidates = Array.from(candidatesSet);
            const orClause = candidates.map(v => `phone.eq.${v}`).join(',');
            // 1) Dentro do tenant
            const jt = await supabaseAdmin
                .from('users').select('id, name, email, phone, user_tenants!inner(tenant_id)')
                .eq('user_tenants.tenant_id', tenantId)
                .or(orClause)
                .limit(1).maybeSingle();
            if (!jt.error && jt.data) return jt.data;
            // 2) Fallback global
            const u = await supabaseAdmin
                .from('users').select('*')
                .or(orClause)
                .limit(1).maybeSingle();
            return u.data || null;
        } catch (error) {
            logger.error('Database user search error', { tenantId, phone, error });
            return null;
        }
    }

    static async listUserAppointments(tenantId: string, userId: string): Promise<any[]> {
        try {
            const { data } = await supabaseAdmin
                .from('appointments').select('*')
                .eq('tenant_id', tenantId)
                .eq('user_id', userId)
                .neq('status', 'cancelled')
                .gte('start_time', new Date().toISOString())
                .order('start_time', { ascending: true })
                .limit(20);
            return data || [];
        } catch (error) {
            logger.error('Database appointments error', { tenantId, userId, error });
            return [];
        }
    }

    static async upsertUserForTenant(tenantId: string, phone: string, session: SessionData): Promise<string | null> {
        try {
            const raw = String(phone || '').trim();
            const digits = raw.replace(/\D/g, '');
            const candidatesSet = new Set<string>();
            if (digits) {
                // Priorizar match exato primeiro
                candidatesSet.add(digits);
                candidatesSet.add(`+${digits}`);

                // Apenas adicionar variações se o número for válido (11+ dígitos)
                if (digits.length >= 11) {
                    if (digits.startsWith('55')) {
                        const local = digits.slice(2);
                        if (local && local.length >= 10) {
                            candidatesSet.add(local);
                            candidatesSet.add(`+${local}`);
                        }
                    } else if (digits.length >= 10) {
                        candidatesSet.add(`55${digits}`);
                        candidatesSet.add(`+55${digits}`);
                    }
                }
            }
            const candidates = Array.from(candidatesSet);
            const orClause = candidates.map(v => `phone.eq.${v}`).join(',');

            // Busca usuário existente globalmente
            const existing = await supabaseAdmin.from('users').select('*').or(orClause).limit(1).maybeSingle();
            let userId: string | null = existing.data?.id || null;

            // Cria ou atualiza usuário (aceita parciais: nome OU email)
            const payload: any = {
                name: session.name || existing.data?.name || null,
                email: session.email || existing.data?.email || null,
                phone: digits ? `+${digits}` : (existing.data?.phone || null),
                gender: session.gender || (existing.data as any)?.gender || null
            };
            if (!userId) {
                const ins = await supabaseAdmin.from('users').insert([payload]).select('id').single();
                if (ins.data?.id) userId = ins.data.id;
            } else {
                await supabaseAdmin.from('users').update(payload).eq('id', userId);
            }
            if (!userId) return null;

            // Vincula ao tenant em user_tenants se não existir
            const rel = await supabaseAdmin.from('user_tenants').select('tenant_id,user_id').eq('tenant_id', tenantId).eq('user_id', userId).maybeSingle();
            if (!rel.data) {
                await supabaseAdmin.from('user_tenants').insert([{ tenant_id: tenantId, user_id: userId }]);
            }
            return userId;
        } catch (error) {
            logger.error('Upsert user failed', { tenantId, phone, error });
            return null;
        }
    }

    static async cancelAppointment(tenantId: string, appointmentId: string): Promise<boolean> {
        try {
            const { error } = await supabaseAdmin
                .from('appointments')
                .update({ status: 'cancelled', updated_at: new Date().toISOString() })
                .eq('tenant_id', tenantId).eq('id', appointmentId);
            return !error;
        } catch (error) {
            logger.error('Database cancel appointment error', { tenantId, appointmentId, error });
            return false;
        }
    }

    static async rescheduleAppointment(tenantId: string, appointmentId: string, newDateTime: string): Promise<boolean> {
        try {
            const { error } = await supabaseAdmin
                .from('appointments')
                .update({ start_time: newDateTime, updated_at: new Date().toISOString() })
                .eq('tenant_id', tenantId).eq('id', appointmentId);
            return !error;
        } catch (error) {
            logger.error('Database reschedule appointment error', { tenantId, appointmentId, error });
            return false;
        }
    }

    // ===== Conversation State Helpers =====
    static async setConversationAwaiting(tenantId: string, userId: string, ttlMs: number): Promise<void> {
        try {
            const expiresAt = new Date(Date.now() + ttlMs).toISOString();
            // Tipos gerados não incluem conversation_states; usar any para a tabela
            const existing: any = await (supabaseAdmin as any)
                .from('conversation_states')
                .select('id, current_state')
                .eq('tenant_id', tenantId)
                .eq('user_id', userId)
                .maybeSingle();

            if (existing.data) {
                await (supabaseAdmin as any)
                    .from('conversation_states')
                    .update({ current_state: 'awaiting_response', expires_at: expiresAt })
                    .eq('id', existing.data.id);
            } else {
                await (supabaseAdmin as any)
                    .from('conversation_states')
                    .insert([{
                        tenant_id: tenantId,
                        user_id: userId,
                        current_state: 'awaiting_response',
                        expires_at: expiresAt
                    }]);
            }
        } catch (error) {
            logger.error('Set conversation awaiting error', { tenantId, userId, error });
        }
    }

    static async clearConversationState(tenantId: string, userId: string): Promise<void> {
        try {
            await (supabaseAdmin as any)
                .from('conversation_states')
                .delete()
                .eq('tenant_id', tenantId)
                .eq('user_id', userId);
        } catch (error) {
            logger.error('Clear conversation state error', { tenantId, userId, error });
        }
    }
}