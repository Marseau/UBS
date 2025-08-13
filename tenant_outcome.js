#!/usr/bin/env node

/**
 * TENANT_OUTCOME - ANÁLISE POR TENANT POR PERÍODO
 * 
 * Períodos: 7, 30 e 90 dias
 * Agrupamento de conversation_outcomes:
 * - agendamentos: appointment_created + appointment_confirmed
 * - remarcados: appointment_rescheduled
 * - informativos: info_request_fulfilled + price_inquiry + business_hours_inquiry + location_inquiry + appointment_inquiry + appointment_noshow_followup
 * - cancelados: appointment_cancelled
 * - modificados: appointment_modified
 * - falhaIA: booking_abandoned + timeout_abandoned + conversation_timeout
 * - spam: wrong_number + spam_detected
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Definir os grupos de outcomes
 */
const OUTCOME_GROUPS = {
    agendamentos: ['appointment_created', 'appointment_confirmed'],
    remarcados: ['appointment_rescheduled'],
    informativos: [
        'info_request_fulfilled',
        'price_inquiry', 
        'business_hours_inquiry',
        'location_inquiry',
        'appointment_inquiry',
        'appointment_noshow_followup'
    ],
    cancelados: ['appointment_cancelled'],
    modificados: ['appointment_modified'],
    falhaIA: ['booking_abandoned', 'timeout_abandoned', 'conversation_timeout'],
    spam: ['wrong_number', 'spam_detected']
};

/**
 * Calcular outcomes por tenant por período
 */
async function calculateTenantOutcomes(tenantId, tenantName, periodDays) {
    console.log(`📊 Outcomes ${periodDays}d: ${tenantName}`);
    
    try {
        const now = new Date();
        const periodStart = new Date();
        periodStart.setDate(now.getDate() - periodDays);
        
        console.log(`   📅 Período: ${periodStart.toISOString().split('T')[0]} até ${now.toISOString().split('T')[0]}`);
        
        // Buscar conversas com outcomes do período
        const { data: conversations, error } = await supabase
            .from('conversation_history')
            .select('conversation_outcome, conversation_context, created_at')
            .eq('tenant_id', tenantId)
            .gte('created_at', periodStart.toISOString())
            .lte('created_at', now.toISOString())
            .not('conversation_outcome', 'is', null)
            .not('conversation_context', 'is', null);
            
        if (error) {
            console.error(`   ❌ Erro: ${error.message}`);
            return null;
        }
        
        if (!conversations || conversations.length === 0) {
            console.log('   📭 Nenhuma conversa com outcome encontrada');
            return {
                agendamentos: 0,
                remarcados: 0,
                informativos: 0,
                cancelados: 0,
                modificados: 0,
                falhaIA: 0,
                spam: 0,
                total_conversas: 0,
                total_mensagens: 0
            };
        }
        
        console.log(`   📊 ${conversations.length} mensagens com outcomes`);
        
        // Agrupar por session_id para contar conversas únicas
        const sessionMap = new Map();
        
        conversations.forEach(conv => {
            const sessionId = conv.conversation_context?.session_id;
            const outcome = conv.conversation_outcome;
            
            if (!sessionId || !outcome) return;
            
            if (!sessionMap.has(sessionId)) {
                sessionMap.set(sessionId, {
                    session_id: sessionId,
                    conversation_start: conv.created_at,
                    final_outcome: outcome
                });
            } else {
                const session = sessionMap.get(sessionId);
                // Usar o outcome mais recente da conversa
                if (new Date(conv.created_at) > new Date(session.conversation_start)) {
                    session.final_outcome = outcome;
                }
            }
        });
        
        const totalConversas = sessionMap.size;
        console.log(`   💬 ${totalConversas} conversas únicas`);
        
        // Inicializar contadores
        const results = {
            agendamentos: 0,
            remarcados: 0,
            informativos: 0,
            cancelados: 0,
            modificados: 0,
            falhaIA: 0,
            spam: 0,
            total_conversas: totalConversas,
            total_mensagens: conversations.length,
            outcomes_detalhados: {}
        };
        
        // Contar outcomes por grupo
        Array.from(sessionMap.values()).forEach(session => {
            const outcome = session.final_outcome;
            
            // Contar outcome específico
            results.outcomes_detalhados[outcome] = (results.outcomes_detalhados[outcome] || 0) + 1;
            
            // Classificar por grupo
            Object.entries(OUTCOME_GROUPS).forEach(([groupName, outcomes]) => {
                if (outcomes.includes(outcome)) {
                    results[groupName]++;
                }
            });
        });
        
        // Mostrar breakdown detalhado
        console.log(`   📋 Breakdown por grupo:`);
        Object.entries(OUTCOME_GROUPS).forEach(([groupName, outcomes]) => {
            if (results[groupName] > 0) {
                console.log(`      ${groupName}: ${results[groupName]} conversas`);
                
                // Mostrar detalhes dos outcomes específicos
                outcomes.forEach(outcome => {
                    const count = results.outcomes_detalhados[outcome] || 0;
                    if (count > 0) {
                        console.log(`         ${outcome}: ${count}`);
                    }
                });
            }
        });
        
        return results;
        
    } catch (error) {
        console.error(`   💥 Erro: ${error.message}`);
        return null;
    }
}

/**
 * Gerar relatório completo por tenant por período
 */
async function generateTenantOutcomeReport() {
    console.log('📊 RELATÓRIO TENANT_OUTCOME POR PERÍODO');
    console.log('Períodos: 7, 30 e 90 dias');
    console.log('='.repeat(80));
    
    try {
        const { data: tenants, error } = await supabase
            .from('tenants')
            .select('id, name')
            .eq('status', 'active')
            .order('name');
        
        if (error) throw error;
        if (!tenants || tenants.length === 0) {
            console.log('❌ Nenhum tenant encontrado');
            return;
        }
        
        // Filtrar apenas tenants com dados de conversa
        const tenantsWithData = tenants.filter(t => 
            ['Bella Vista Spa', 'Studio Glamour', 'Charme Total', 'Clínica Mente Sã', 'Centro Terapêutico'].includes(t.name)
        );
        
        console.log(`📊 Analisando ${tenantsWithData.length} tenants com dados:\\n`);
        
        const periods = [7, 30, 90];
        const results = {};
        
        // Processar cada tenant
        for (const tenant of tenantsWithData) {
            console.log(`\\n🏢 TENANT: ${tenant.name} (${tenant.id.substring(0, 8)})`);
            console.log('='.repeat(70));
            
            results[tenant.id] = {
                name: tenant.name,
                periods: {}
            };
            
            // Processar cada período
            for (const periodDays of periods) {
                console.log(`\\n📅 PERÍODO ${periodDays} DIAS:`);
                console.log('-'.repeat(40));
                
                const outcomeData = await calculateTenantOutcomes(tenant.id, tenant.name, periodDays);
                
                if (outcomeData) {
                    results[tenant.id].periods[`${periodDays}d`] = outcomeData;
                }
            }
            
            // Resumo do tenant
            console.log(`\\n📋 RESUMO ${tenant.name}:`);
            console.log('-'.repeat(40));
            Object.entries(results[tenant.id].periods).forEach(([period, data]) => {
                console.log(`${period.padEnd(4)}: ${data.total_conversas} conversas | Agend: ${data.agendamentos} | Info: ${data.informativos} | Falha: ${data.falhaIA} | Spam: ${data.spam}`);
            });
        }
        
        // Tabela consolidada por período - mais clara
        periods.forEach((period) => {
            console.log(`\\n\\n📋 TABELA - PERÍODO ${period} DIAS`);
            console.log('='.repeat(100));
            console.log('TENANT                    | TOTAL | AGEND | REMAR | INFO  | CANCE | MODIF | FALHA | SPAM  |');
            console.log('-'.repeat(100));
            
            Object.entries(results).forEach(([tenantId, tenantData]) => {
                const data = tenantData.periods[`${period}d`];
                if (data && data.total_conversas > 0) {
                    const name = tenantData.name.padEnd(24);
                    const total = String(data.total_conversas).padStart(5);
                    
                    // Calcular percentuais
                    const agendPct = total > 0 ? ((data.agendamentos / data.total_conversas) * 100).toFixed(1) : '0.0';
                    const remarPct = total > 0 ? ((data.remarcados / data.total_conversas) * 100).toFixed(1) : '0.0';
                    const infoPct = total > 0 ? ((data.informativos / data.total_conversas) * 100).toFixed(1) : '0.0';
                    const cancePct = total > 0 ? ((data.cancelados / data.total_conversas) * 100).toFixed(1) : '0.0';
                    const modifPct = total > 0 ? ((data.modificados / data.total_conversas) * 100).toFixed(1) : '0.0';
                    const falhaPct = total > 0 ? ((data.falhaIA / data.total_conversas) * 100).toFixed(1) : '0.0';
                    const spamPct = total > 0 ? ((data.spam / data.total_conversas) * 100).toFixed(1) : '0.0';
                    
                    const agendStr = `${data.agendamentos}(${agendPct}%)`.padStart(7);
                    const remarStr = `${data.remarcados}(${remarPct}%)`.padStart(7);
                    const infoStr = `${data.informativos}(${infoPct}%)`.padStart(7);
                    const canceStr = `${data.cancelados}(${cancePct}%)`.padStart(7);
                    const modifStr = `${data.modificados}(${modifPct}%)`.padStart(7);
                    const falhaStr = `${data.falhaIA}(${falhaPct}%)`.padStart(7);
                    const spamStr = `${data.spam}(${spamPct}%)`.padStart(7);
                    
                    console.log(`${name} | ${total} | ${agendStr} | ${remarStr} | ${infoStr} | ${canceStr} | ${modifStr} | ${falhaStr} | ${spamStr} |`);
                }
            });
            
            console.log('-'.repeat(100));
        });
        
        console.log('='.repeat(120));
        
        // Estatísticas agregadas
        console.log('\\n📊 ESTATÍSTICAS AGREGADAS (90 DIAS)');
        console.log('-'.repeat(60));
        
        let totalConversas90d = 0;
        let totalAgendamentos90d = 0;
        let totalInformativos90d = 0;
        let totalFalhaIA90d = 0;
        let totalSpam90d = 0;
        
        Object.values(results).forEach(tenantData => {
            const data90d = tenantData.periods['90d'];
            if (data90d) {
                totalConversas90d += data90d.total_conversas;
                totalAgendamentos90d += data90d.agendamentos;
                totalInformativos90d += data90d.informativos;
                totalFalhaIA90d += data90d.falhaIA;
                totalSpam90d += data90d.spam;
            }
        });
        
        console.log(`Total conversas (90d): ${totalConversas90d}`);
        console.log(`Agendamentos: ${totalAgendamentos90d} (${((totalAgendamentos90d/totalConversas90d)*100).toFixed(1)}%)`);
        console.log(`Informativos: ${totalInformativos90d} (${((totalInformativos90d/totalConversas90d)*100).toFixed(1)}%)`);
        console.log(`Falha IA: ${totalFalhaIA90d} (${((totalFalhaIA90d/totalConversas90d)*100).toFixed(1)}%)`);
        console.log(`Spam: ${totalSpam90d} (${((totalSpam90d/totalConversas90d)*100).toFixed(1)}%)`);
        
        // Top performers
        console.log('\\n🏆 TOP PERFORMERS (90 DIAS)');
        console.log('-'.repeat(60));
        
        const tenantsBy90d = Object.entries(results)
            .filter(([,data]) => data.periods['90d']?.total_conversas > 0)
            .sort(([,a], [,b]) => b.periods['90d'].total_conversas - a.periods['90d'].total_conversas);
        
        console.log('Por total de conversas:');
        tenantsBy90d.slice(0, 3).forEach(([,data], index) => {
            const d = data.periods['90d'];
            console.log(`   ${index + 1}. ${data.name}: ${d.total_conversas} conversas`);
        });
        
        console.log('\\nPor taxa de agendamento:');
        tenantsBy90d
            .filter(([,data]) => data.periods['90d'].total_conversas >= 10) // Mín 10 conversas
            .sort(([,a], [,b]) => {
                const rateA = (a.periods['90d'].agendamentos / a.periods['90d'].total_conversas);
                const rateB = (b.periods['90d'].agendamentos / b.periods['90d'].total_conversas);
                return rateB - rateA;
            })
            .slice(0, 3)
            .forEach(([,data], index) => {
                const d = data.periods['90d'];
                const rate = ((d.agendamentos / d.total_conversas) * 100).toFixed(1);
                console.log(`   ${index + 1}. ${data.name}: ${rate}% (${d.agendamentos}/${d.total_conversas})`);
            });
        
        console.log('\\n✅ RELATÓRIO TENANT_OUTCOME CONCLUÍDO');
        return results;
        
    } catch (error) {
        console.error('💥 ERRO NO RELATÓRIO:', error);
        process.exit(1);
    }
}

// Executar relatório
if (require.main === module) {
    generateTenantOutcomeReport().then(() => {
        process.exit(0);
    }).catch(error => {
        console.error('Erro fatal:', error);
        process.exit(1);
    });
}

module.exports = { calculateTenantOutcomes, OUTCOME_GROUPS };