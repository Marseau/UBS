#!/usr/bin/env node

/**
 * ANÁLISE ALTERNATIVA DAS MÉTRICAS - SEM RPC execute_sql
 * 
 * Script para investigar dados usando apenas queries Supabase diretas
 */

const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('🔍 ANÁLISE ALTERNATIVA DAS MÉTRICAS');
console.log('==================================\n');

async function analisarDadosBase() {
    console.log('📊 DADOS BASE PARA CÁLCULOS (ÚLTIMOS 30 DIAS)');
    console.log('=============================================');
    
    // Data de corte (30 dias atrás)
    const dataCorte = new Date();
    dataCorte.setDate(dataCorte.getDate() - 30);
    const dataCorteISO = dataCorte.toISOString();
    
    console.log(`🗓️  Data de corte: ${dataCorteISO}\n`);
    
    // 1. Análise de Conversation History
    console.log('💬 CONVERSATION HISTORY:');
    const { data: conversations, error: convError } = await supabase
        .from('conversation_history')
        .select('*')
        .gte('created_at', dataCorteISO);
    
    if (convError) {
        console.error('❌ Erro:', convError);
    } else {
        // Processar dados de conversas
        const sessionsUnicas = new Set();
        const tenantsUnicos = new Set();
        let totalMinutos = 0;
        let totalComMinutos = 0;
        
        conversations.forEach(conv => {
            if (conv.conversation_context?.session_id) {
                sessionsUnicas.add(conv.conversation_context.session_id);
            }
            if (conv.tenant_id) {
                tenantsUnicos.add(conv.tenant_id);
            }
            if (conv.duration_minutes) {
                totalMinutos += conv.duration_minutes;
                totalComMinutos++;
            }
        });
        
        console.log(`   Total mensagens: ${conversations.length}`);
        console.log(`   Sessões únicas: ${sessionsUnicas.size}`);
        console.log(`   Tenants únicos: ${tenantsUnicos.size}`);
        console.log(`   Total minutos: ${totalMinutos}`);
        console.log(`   Média minutos/sessão: ${totalComMinutos > 0 ? (totalMinutos / totalComMinutos).toFixed(2) : 0} min`);
    }
    
    // 2. Análise de Appointments
    console.log('\n📅 APPOINTMENTS:');
    const { data: appointments, error: apptError } = await supabase
        .from('appointments')
        .select('*')
        .gte('created_at', dataCorteISO);
    
    if (apptError) {
        console.error('❌ Erro:', apptError);
    } else {
        const tenantsUnicos = new Set();
        let receitaTotal = 0;
        let appointmentsComReceita = 0;
        
        appointments.forEach(appt => {
            if (appt.tenant_id) {
                tenantsUnicos.add(appt.tenant_id);
            }
            const receita = appt.final_price || appt.quoted_price || 0;
            if (receita > 0) {
                receitaTotal += receita;
                appointmentsComReceita++;
            }
        });
        
        console.log(`   Total appointments: ${appointments.length}`);
        console.log(`   Tenants únicos: ${tenantsUnicos.size}`);
        console.log(`   Receita total: R$ ${receitaTotal.toFixed(2)}`);
        console.log(`   Appointments com receita: ${appointmentsComReceita}`);
        console.log(`   Receita média: R$ ${appointmentsComReceita > 0 ? (receitaTotal / appointmentsComReceita).toFixed(2) : 0}`);
    }
    
    // 3. Análise de Tenants
    console.log('\n🏢 TENANTS:');
    const { data: tenants, error: tenantError } = await supabase
        .from('tenants')
        .select('*');
    
    if (tenantError) {
        console.error('❌ Erro:', tenantError);
    } else {
        console.log(`   Total tenants: ${tenants.length}`);
        
        // Mostrar alguns tenants de exemplo
        console.log('\n   Primeiros 5 tenants:');
        tenants.slice(0, 5).forEach((tenant, index) => {
            console.log(`   ${index + 1}. ${tenant.name || 'N/A'} (${tenant.domain || 'N/A'}) - ID: ${tenant.id}`);
        });
    }
}

async function analisarAtividadePorTenant() {
    console.log('\n🎯 ATIVIDADE POR TENANT (ÚLTIMOS 30 DIAS)');
    console.log('========================================');
    
    const dataCorte = new Date();
    dataCorte.setDate(dataCorte.getDate() - 30);
    const dataCorteISO = dataCorte.toISOString();
    
    // Buscar todos os tenants
    const { data: tenants, error: tenantError } = await supabase
        .from('tenants')
        .select('id, name, domain');
    
    if (tenantError) {
        console.error('❌ Erro ao buscar tenants:', tenantError);
        return;
    }
    
    console.log('📋 Analisando atividade para cada tenant...\n');
    console.log('ID\t\t\t\t\tNome\t\t\tDomínio\t\t\tConvs\tAppts\tReceita');
    console.log(''.padEnd(120, '-'));
    
    let tenantsAtivos = 0;
    let tenantsInativos = 0;
    
    for (const tenant of tenants) {
        // Buscar conversas do tenant
        const { data: conversations } = await supabase
            .from('conversation_history')
            .select('conversation_context')
            .eq('tenant_id', tenant.id)
            .gte('created_at', dataCorteISO);
        
        // Buscar appointments do tenant
        const { data: appointments } = await supabase
            .from('appointments')
            .select('final_price, quoted_price')
            .eq('tenant_id', tenant.id)
            .gte('created_at', dataCorteISO);
        
        // Calcular métricas
        const sessionsUnicas = new Set();
        if (conversations) {
            conversations.forEach(conv => {
                if (conv.conversation_context?.session_id) {
                    sessionsUnicas.add(conv.conversation_context.session_id);
                }
            });
        }
        
        const totalConversas = sessionsUnicas.size;
        const totalAppointments = appointments ? appointments.length : 0;
        
        let receitaTotal = 0;
        if (appointments) {
            appointments.forEach(appt => {
                const receita = appt.final_price || appt.quoted_price || 0;
                receitaTotal += receita;
            });
        }
        
        const isAtivo = totalConversas > 0 || totalAppointments > 0;
        if (isAtivo) tenantsAtivos++;
        else tenantsInativos++;
        
        // Mostrar dados formatados
        console.log(
            `${tenant.id}\t${(tenant.name || 'N/A').substring(0, 15).padEnd(15)}\t` +
            `${(tenant.domain || 'N/A').substring(0, 15).padEnd(15)}\t` +
            `${totalConversas}\t${totalAppointments}\tR$ ${receitaTotal.toFixed(2)}`
        );
    }
    
    console.log(''.padEnd(120, '-'));
    console.log(`📈 RESUMO:`);
    console.log(`   Tenants Ativos: ${tenantsAtivos}`);
    console.log(`   Tenants Inativos: ${tenantsInativos}`);
    console.log(`   Total: ${tenants.length}`);
}

async function compararMetricas() {
    console.log('\n⚖️  COMPARAÇÃO TENANT_METRICS vs PLATFORM_METRICS');
    console.log('================================================');
    
    // Buscar platform_metrics mais recente
    const { data: platformMetrics, error: platformError } = await supabase
        .from('platform_metrics')
        .select('*')
        .order('calculation_date', { ascending: false })
        .limit(1);
    
    if (platformError) {
        console.error('❌ Erro ao buscar platform_metrics:', platformError);
        return;
    }
    
    if (platformMetrics.length === 0) {
        console.log('⚠️  Nenhum registro em platform_metrics encontrado');
        return;
    }
    
    const platform = platformMetrics[0];
    console.log('📊 PLATFORM_METRICS (mais recente):');
    console.log(`   Data: ${platform.calculation_date}`);
    console.log(`   Período: ${platform.period_days} dias`);
    console.log(`   Active Tenants: ${platform.active_tenants}`);
    console.log(`   Total Conversations: ${platform.total_conversations}`);
    console.log(`   Total Appointments: ${platform.total_appointments}`);
    console.log(`   Total Revenue: R$ ${platform.total_revenue}`);
    console.log(`   Platform MRR: R$ ${platform.platform_mrr}`);
    console.log(`   Total Chat Minutes: ${platform.total_chat_minutes}`);
    
    // Buscar tenant_metrics
    const { data: tenantMetrics, error: tenantError } = await supabase
        .from('tenant_metrics')
        .select('*')
        .eq('period', '30d')
        .order('calculated_at', { ascending: false })
        .limit(10);
    
    if (tenantError) {
        console.error('❌ Erro ao buscar tenant_metrics:', tenantError);
        return;
    }
    
    console.log(`\n📊 TENANT_METRICS (${tenantMetrics.length} registros mais recentes):`);
    tenantMetrics.forEach((tm, index) => {
        console.log(`   ${index + 1}. Tenant: ${tm.tenant_id}`);
        console.log(`      Tipo: ${tm.metric_type}`);
        console.log(`      Calculado: ${tm.calculated_at}`);
        if (tm.metric_data) {
            if (tm.metric_data.appointments) {
                console.log(`      Appointments: ${tm.metric_data.appointments.count}`);
            }
            if (tm.metric_data.revenue) {
                console.log(`      Revenue: R$ ${tm.metric_data.revenue.participation_value || 0}`);
            }
            if (tm.metric_data.customers) {
                console.log(`      Customers: ${tm.metric_data.customers.count}`);
            }
        }
        console.log('');
    });
}

async function executarAnaliseCompleta() {
    try {
        await analisarDadosBase();
        await analisarAtividadePorTenant();
        await compararMetricas();
        
        console.log('\n✅ ANÁLISE ALTERNATIVA COMPLETA');
        console.log('===============================');
        console.log('🔍 Principais descobertas:');
        console.log('   1. Dados base identificados e quantificados');
        console.log('   2. Atividade por tenant mapeada');
        console.log('   3. Comparação entre tenant_metrics e platform_metrics realizada');
        console.log('   4. Estrutura JSONB do tenant_metrics analisada');
        
    } catch (error) {
        console.error('❌ Erro durante análise:', error);
    }
}

// Executar análise
executarAnaliseCompleta();