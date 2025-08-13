/**
 * TABELA COMPARATIVA COMPLETA DE MÉTRICAS
 * 
 * Script definitivo que gera a tabela solicitada no prompt:
 * | Métrica | Tenant | Período | Valor Bruto | Sistema Principal | Sistema Validado | Status |
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// Configuração Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Variáveis de ambiente SUPABASE não configuradas');
    console.error('SUPABASE_URL:', supabaseUrl ? '✅ Configurado' : '❌ Ausente');
    console.error('SUPABASE_SERVICE_ROLE_KEY:', supabaseKey ? '✅ Configurado' : '❌ Ausente');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Configurações
const PERIODS = ['7d', '30d', '90d'];
const CORE_METRICS = [
    'total_conversations',
    'total_appointments',
    'monthly_revenue',
    'new_customers',
    'appointment_success_rate',
    'cancellation_rate',
    'no_show_rate',
    'avg_cost_per_appointment_usd',
    'total_professionals',
    'services_available',
    'ai_interaction_rate',
    'customer_recurrence_rate'
];

/**
 * Calcula data de início para o período
 */
function getStartDate(period) {
    const now = new Date();
    const days = parseInt(period.replace('d', ''));
    const startDate = new Date(now.getTime() - (days * 24 * 60 * 60 * 1000));
    return startDate.toISOString();
}

/**
 * Busca tenants disponíveis no sistema
 */
async function getAvailableTenants() {
    console.log('🔍 Buscando tenants disponíveis...');
    
    // Tentar diferentes fontes de tenants
    
    // 1. Tentar tabela user_tenants
    try {
        const { data: userTenants, error } = await supabase
            .from('user_tenants')
            .select('tenant_id, role')
            .eq('role', 'admin')
            .limit(20);
        
        if (!error && userTenants?.length > 0) {
            const uniqueTenants = [...new Set(userTenants.map(ut => ut.tenant_id))];
            console.log(`✅ Encontrados ${uniqueTenants.length} tenants via user_tenants`);
            
            return uniqueTenants.slice(0, 10).map(id => ({
                id,
                business_name: `Tenant ${id.substring(0, 8)}`,
                source: 'user_tenants'
            }));
        }
    } catch (error) {
        console.log('⚠️ user_tenants não acessível:', error.message);
    }

    // 2. Tentar via conversations
    try {
        const { data: conversations, error } = await supabase
            .from('conversations')
            .select('tenant_id')
            .limit(50);
        
        if (!error && conversations?.length > 0) {
            const uniqueTenants = [...new Set(conversations.map(c => c.tenant_id))];
            console.log(`✅ Encontrados ${uniqueTenants.length} tenants via conversations`);
            
            return uniqueTenants.slice(0, 10).map(id => ({
                id,
                business_name: `Tenant ${id.substring(0, 8)}`,
                source: 'conversations'
            }));
        }
    } catch (error) {
        console.log('⚠️ conversations não acessível:', error.message);
    }

    // 3. Tentar via appointments
    try {
        const { data: appointments, error } = await supabase
            .from('appointments')
            .select('tenant_id')
            .limit(50);
        
        if (!error && appointments?.length > 0) {
            const uniqueTenants = [...new Set(appointments.map(a => a.tenant_id))];
            console.log(`✅ Encontrados ${uniqueTenants.length} tenants via appointments`);
            
            return uniqueTenants.slice(0, 10).map(id => ({
                id,
                business_name: `Tenant ${id.substring(0, 8)}`,
                source: 'appointments'
            }));
        }
    } catch (error) {
        console.log('⚠️ appointments não acessível:', error.message);
    }

    console.log('❌ Nenhuma fonte de tenants disponível');
    return [];
}

/**
 * Calcula métricas brutas dos dados primários
 */
async function calculateRawMetrics(tenantId, period) {
    const startDate = getStartDate(period);
    const metrics = {};
    
    console.log(`    🔢 Calculando métricas brutas para período ${period}...`);

    try {
        // 1. Conversations
        const { data: conversations } = await supabase
            .from('conversations')
            .select('id, status, outcome, customer_phone_number, created_at')
            .eq('tenant_id', tenantId)
            .gte('created_at', startDate);
        
        metrics.total_conversations = conversations?.length || 0;
        console.log(`      📞 Conversations: ${metrics.total_conversations}`);

        // 2. Appointments
        const { data: appointments } = await supabase
            .from('appointments')
            .select('id, status, price, customer_id, created_at')
            .eq('tenant_id', tenantId)
            .gte('created_at', startDate);
        
        metrics.total_appointments = appointments?.length || 0;
        console.log(`      📅 Appointments: ${metrics.total_appointments}`);

        // 3. Revenue (completed appointments)
        const completedAppointments = appointments?.filter(apt => 
            apt.status === 'completed' && apt.price
        ) || [];
        
        metrics.monthly_revenue = completedAppointments.reduce((sum, apt) => sum + (parseFloat(apt.price) || 0), 0);
        console.log(`      💰 Revenue: $${metrics.monthly_revenue.toFixed(2)}`);

        // 4. New customers (unique phone numbers)
        const uniquePhones = new Set();
        conversations?.forEach(conv => {
            if (conv.customer_phone_number) {
                uniquePhones.add(conv.customer_phone_number);
            }
        });
        
        metrics.new_customers = uniquePhones.size;
        console.log(`      👥 New Customers: ${metrics.new_customers}`);

        // 5. Success rate
        const completedCount = appointments?.filter(apt => apt.status === 'completed')?.length || 0;
        metrics.appointment_success_rate = appointments?.length > 0 ? 
            (completedCount / appointments.length) * 100 : 0;

        // 6. Cancellation rate
        const cancelledCount = appointments?.filter(apt => apt.status === 'cancelled')?.length || 0;
        metrics.cancellation_rate = appointments?.length > 0 ? 
            (cancelledCount / appointments.length) * 100 : 0;

        // 7. No-show rate
        const noShowCount = appointments?.filter(apt => apt.status === 'no_show')?.length || 0;
        metrics.no_show_rate = appointments?.length > 0 ? 
            (noShowCount / appointments.length) * 100 : 0;

        // 8. Average cost per appointment
        metrics.avg_cost_per_appointment_usd = completedAppointments.length > 0 ? 
            metrics.monthly_revenue / completedAppointments.length : 0;

        // 9. Professionals
        const { data: professionals } = await supabase
            .from('user_tenants')
            .select('id')
            .eq('tenant_id', tenantId)
            .eq('role', 'professional');
        
        metrics.total_professionals = professionals?.length || 0;

        // 10. Services
        const { data: services } = await supabase
            .from('services')
            .select('id')
            .eq('tenant_id', tenantId)
            .eq('status', 'active');
        
        metrics.services_available = services?.length || 0;

        // 11. AI interaction rate
        const aiHandledCount = conversations?.filter(c => c.outcome === 'ai_handled')?.length || 0;
        metrics.ai_interaction_rate = conversations?.length > 0 ? 
            (aiHandledCount / conversations.length) * 100 : 0;

        // 12. Customer recurrence (aproximação)
        const customerAppointmentCount = {};
        appointments?.forEach(apt => {
            if (apt.customer_id) {
                customerAppointmentCount[apt.customer_id] = (customerAppointmentCount[apt.customer_id] || 0) + 1;
            }
        });
        
        const recurringCustomers = Object.values(customerAppointmentCount).filter(count => count > 1).length;
        const totalCustomers = Object.keys(customerAppointmentCount).length;
        
        metrics.customer_recurrence_rate = totalCustomers > 0 ? 
            (recurringCustomers / totalCustomers) * 100 : 0;

    } catch (error) {
        console.error(`      ❌ Erro calculando métricas brutas: ${error.message}`);
    }

    return metrics;
}

/**
 * Busca métricas do sistema principal
 */
async function getMainSystemMetrics(tenantId, period) {
    try {
        const { data, error } = await supabase
            .from('metric_data')
            .select('metric_type, value, created_at')
            .eq('tenant_id', tenantId)
            .eq('period', period)
            .gte('created_at', getStartDate('7d')) // Últimos 7 dias
            .order('created_at', { ascending: false });

        if (error || !data?.length) {
            return {};
        }

        const metrics = {};
        data.forEach(item => {
            if (!metrics[item.metric_type]) { // Pegar o mais recente
                metrics[item.metric_type] = parseFloat(item.value) || 0;
            }
        });

        return metrics;
    } catch (error) {
        console.log(`      ⚠️ Sistema principal não disponível: ${error.message}`);
        return {};
    }
}

/**
 * Busca métricas do sistema validado
 */
async function getValidatedSystemMetrics(tenantId, period) {
    try {
        const { data, error } = await supabase
            .from('metricas_validadas')
            .select('*')
            .eq('tenant_id', tenantId)
            .eq('periodo', period)
            .gte('created_at', getStartDate('7d')) // Últimos 7 dias
            .order('created_at', { ascending: false })
            .limit(1);

        if (error || !data?.length) {
            return {};
        }

        const row = data[0];
        return {
            total_conversations: row.total_conversations || 0,
            total_appointments: row.total_appointments || 0,
            monthly_revenue: row.monthly_revenue || 0,
            new_customers: row.new_customers || 0,
            appointment_success_rate: row.appointment_success_rate || 0,
            cancellation_rate: row.cancellation_rate || 0,
            no_show_rate: row.no_show_rate || 0,
            avg_cost_per_appointment_usd: row.avg_cost_per_appointment_usd || 0,
            total_professionals: row.total_professionals || 0,
            services_available: row.services_available || 0,
            ai_interaction_rate: row.ai_interaction_rate || 0,
            customer_recurrence_rate: row.customer_recurrence_rate || 0
        };
    } catch (error) {
        console.log(`      ⚠️ Sistema validado não disponível: ${error.message}`);
        return {};
    }
}

/**
 * Determina o status da comparação
 */
function getComparisonStatus(raw, main, validated) {
    const tolerance = 0.1; // 0.1% de tolerância para arredondamentos
    
    const rawHasData = raw > 0;
    const mainHasData = main > 0;
    const validatedHasData = validated > 0;
    
    if (!rawHasData && !mainHasData && !validatedHasData) {
        return '⚪ NO_DATA';
    }
    
    if (!rawHasData && (mainHasData || validatedHasData)) {
        return '⚠️ NO_RAW_DATA';
    }
    
    const rawMainMatch = Math.abs(raw - main) <= tolerance;
    const rawValidatedMatch = Math.abs(raw - validated) <= tolerance;
    const mainValidatedMatch = Math.abs(main - validated) <= tolerance;
    
    if (rawMainMatch && rawValidatedMatch) {
        return '✅ PERFECT_MATCH';
    }
    
    if (rawMainMatch) {
        return '🟡 MAIN_MATCHES_RAW';
    }
    
    if (rawValidatedMatch) {
        return '🟡 VALIDATED_MATCHES_RAW';
    }
    
    if (mainValidatedMatch) {
        return '🔶 SYSTEMS_MATCH_DIFF_RAW';
    }
    
    return '🔥 ALL_DIFFERENT';
}

/**
 * Gera a tabela comparativa completa
 */
async function generateComparisonTable() {
    console.log('🚀 GERANDO TABELA COMPARATIVA COMPLETA DE MÉTRICAS\n');
    
    const tenants = await getAvailableTenants();
    
    if (!tenants.length) {
        console.log('❌ Nenhum tenant encontrado. Verifique a conexão com o banco.');
        return null;
    }

    const allResults = [];
    const csvRows = [];
    
    // Cabeçalho CSV
    csvRows.push([
        'Métrica',
        'Tenant',
        'Business_Name',
        'Período',
        'Valor_Bruto',
        'Sistema_Principal', 
        'Sistema_Validado',
        'Status',
        'Diferença_Raw_Main',
        'Diferença_Raw_Validated',
        'Source',
        'Timestamp'
    ]);

    console.log(`📊 Processando ${tenants.length} tenants...\n`);

    for (const [index, tenant] of tenants.entries()) {
        console.log(`\n${index + 1}/${tenants.length} 🏢 ${tenant.business_name} (${tenant.id.substring(0, 8)}...)`);
        
        for (const period of PERIODS) {
            console.log(`  📅 Período: ${period}`);
            
            // Calcular todas as métricas
            const rawMetrics = await calculateRawMetrics(tenant.id, period);
            const mainMetrics = await getMainSystemMetrics(tenant.id, period);
            const validatedMetrics = await getValidatedSystemMetrics(tenant.id, period);
            
            // Comparar cada métrica
            for (const metric of CORE_METRICS) {
                const raw = rawMetrics[metric] || 0;
                const main = mainMetrics[metric] || 0;
                const validated = validatedMetrics[metric] || 0;
                
                const status = getComparisonStatus(raw, main, validated);
                const diffRawMain = Math.abs(raw - main);
                const diffRawValidated = Math.abs(raw - validated);
                
                const result = {
                    metric,
                    tenant: tenant.id,
                    business_name: tenant.business_name,
                    period,
                    raw_value: Number(raw.toFixed(2)),
                    main_system: Number(main.toFixed(2)),
                    validated_system: Number(validated.toFixed(2)),
                    status,
                    diff_raw_main: Number(diffRawMain.toFixed(2)),
                    diff_raw_validated: Number(diffRawValidated.toFixed(2)),
                    source: tenant.source
                };
                
                allResults.push(result);
                
                // Adicionar ao CSV
                csvRows.push([
                    metric,
                    tenant.id,
                    tenant.business_name,
                    period,
                    raw,
                    main,
                    validated,
                    status,
                    diffRawMain,
                    diffRawValidated,
                    tenant.source,
                    new Date().toISOString()
                ]);
            }
        }
    }

    // Gerar relatório de console
    console.log('\n' + '='.repeat(120));
    console.log('📊 RELATÓRIO FINAL - TABELA COMPARATIVA DE MÉTRICAS');
    console.log('='.repeat(120));

    // Resumo por status
    const statusCounts = {};
    allResults.forEach(result => {
        statusCounts[result.status] = (statusCounts[result.status] || 0) + 1;
    });

    console.log('\n📈 RESUMO POR STATUS:');
    Object.entries(statusCounts).sort((a, b) => b[1] - a[1]).forEach(([status, count]) => {
        const percentage = ((count / allResults.length) * 100).toFixed(1);
        console.log(`  ${status}: ${count} casos (${percentage}%)`);
    });

    // Top métricas com problemas
    const problemCases = allResults.filter(r => 
        r.status.includes('DIFFERENT') || r.status.includes('NO_RAW_DATA')
    );

    console.log('\n🔥 CASOS MAIS PROBLEMÁTICOS:');
    if (problemCases.length > 0) {
        console.log('┌─────────────────────────┬────────────┬─────────┬─────────┬─────────────┬───────────────┬─────────────────────┐');
        console.log('│ Métrica                 │ Tenant     │ Período │ Bruto   │ Principal   │ Validado      │ Status              │');
        console.log('├─────────────────────────┼────────────┼─────────┼─────────┼─────────────┼───────────────┼─────────────────────┤');
        
        problemCases.slice(0, 20).forEach(case_ => {
            const metric = case_.metric.padEnd(23);
            const tenant = case_.tenant.substring(0, 8).padEnd(8) + '..';
            const period = case_.period.padEnd(7);
            const raw = String(case_.raw_value).padEnd(7);
            const main = String(case_.main_system).padEnd(9);
            const validated = String(case_.validated_system).padEnd(11);
            const status = case_.status.padEnd(19);
            
            console.log(`│ ${metric} │ ${tenant} │ ${period} │ ${raw} │ ${main} │ ${validated} │ ${status} │`);
        });
        
        console.log('└─────────────────────────┴────────────┴─────────┴─────────┴─────────────┴───────────────┴─────────────────────┘');
        
        if (problemCases.length > 20) {
            console.log(`... e mais ${problemCases.length - 20} casos problemáticos`);
        }
    } else {
        console.log('✅ Nenhum caso problemático encontrado!');
    }

    // Salvar CSV
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('.')[0];
    const filename = `COMPLETE-METRICS-COMPARISON-${timestamp}.csv`;
    
    const csvContent = csvRows.map(row => 
        row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
    ).join('\n');
    
    fs.writeFileSync(filename, csvContent);
    
    // Estatísticas finais
    const totalComparisons = allResults.length;
    const perfectMatches = allResults.filter(r => r.status === '✅ PERFECT_MATCH').length;
    const accuracyRate = ((perfectMatches / totalComparisons) * 100).toFixed(2);
    
    console.log(`\n💾 ARQUIVO SALVO: ${filename}`);
    console.log(`📊 ESTATÍSTICAS FINAIS:`);
    console.log(`   • Total de comparações: ${totalComparisons}`);
    console.log(`   • Matches perfeitos: ${perfectMatches} (${accuracyRate}%)`);
    console.log(`   • Tenants analisados: ${tenants.length}`);
    console.log(`   • Métricas por tenant: ${CORE_METRICS.length}`);
    console.log(`   • Períodos analisados: ${PERIODS.length}`);
    
    console.log('\n' + '='.repeat(120));
    console.log('🎯 TABELA COMPARATIVA COMPLETA GERADA COM SUCESSO!');
    console.log('='.repeat(120));

    return {
        filename,
        results: allResults,
        statistics: {
            total_comparisons: totalComparisons,
            perfect_matches: perfectMatches,
            accuracy_rate: parseFloat(accuracyRate),
            problem_cases: problemCases.length,
            tenants_analyzed: tenants.length
        }
    };
}

/**
 * Função principal
 */
async function main() {
    const startTime = Date.now();
    
    try {
        console.log('🔍 TESTE DE CONEXÃO SUPABASE...');
        
        // Testar conexão
        const { data, error } = await supabase
            .from('conversations')
            .select('count')
            .limit(1);
        
        if (error) {
            console.error('❌ Erro de conexão Supabase:', error.message);
            return;
        }
        
        console.log('✅ Conexão Supabase OK\n');
        
        // Executar análise completa
        const result = await generateComparisonTable();
        
        const endTime = Date.now();
        const duration = ((endTime - startTime) / 1000).toFixed(2);
        
        if (result) {
            console.log(`\n⏱️ Tempo de execução: ${duration}s`);
            console.log(`📄 Arquivo gerado: ${result.filename}`);
        } else {
            console.log('\n❌ Falha na geração da tabela');
        }
        
    } catch (error) {
        console.error('\n❌ ERRO CRÍTICO:', error.message);
        console.error('Stack:', error.stack);
    }
}

// Executar se chamado diretamente
if (require.main === module) {
    main().catch(console.error);
}

module.exports = {
    generateComparisonTable,
    calculateRawMetrics,
    getMainSystemMetrics,
    getValidatedSystemMetrics
};