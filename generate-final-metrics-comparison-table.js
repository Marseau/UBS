/**
 * TABELA COMPARATIVA FINAL DE MÉTRICAS
 * 
 * Versão definitiva baseada na estrutura real do banco:
 * - Tabelas de dados: tenants, user_tenants, users, appointments, services, professionals, conversation_history, subscription_payments
 * - Tabelas de métricas: tenant_metrics, platform_metrics  
 * 
 * Gera a tabela solicitada:
 * | Métrica | Tenant | Período | Valor Bruto | Sistema Principal | Sistema Validado | Status |
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// Configuração Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Configurações
const PERIODS = ['7d', '30d', '90d'];

// Métricas fundamentais que podem ser calculadas com as tabelas disponíveis
const CALCULABLE_METRICS = [
    'total_appointments',
    'monthly_revenue',
    'new_customers',
    'appointment_success_rate',
    'total_professionals',
    'services_available',
    'cancellation_rate',
    'avg_cost_per_appointment',
    'total_unique_customers',
    'conversation_volume',
    'ai_cost_total',
    'subscription_revenue'
];

/**
 * Calcula data de início para período
 */
function getStartDate(period) {
    const now = new Date();
    const days = parseInt(period.replace('d', ''));
    const startDate = new Date(now.getTime() - (days * 24 * 60 * 60 * 1000));
    return startDate.toISOString();
}

/**
 * Busca tenants ativos do sistema
 */
async function getActiveTenants() {
    console.log('🔍 Buscando tenants ativos...');
    
    const { data: tenants, error } = await supabase
        .from('tenants')
        .select('id, business_name, status')
        .eq('status', 'active')
        .limit(15); // Limitar para não sobrecarregar

    if (error) {
        console.error('❌ Erro buscando tenants:', error.message);
        return [];
    }

    console.log(`✅ Encontrados ${tenants?.length || 0} tenants ativos`);
    return tenants || [];
}

/**
 * Calcula métricas brutas a partir dos dados primários
 */
async function calculateRawMetricsFromPrimaryData(tenantId, period) {
    const startDate = getStartDate(period);
    const metrics = {};
    
    console.log(`    📊 Calculando métricas brutas (${period})...`);

    try {
        // 1. APPOINTMENTS - Fonte principal de dados de negócio
        const { data: appointments } = await supabase
            .from('appointments')
            .select('id, status, quoted_price, final_price, user_id, created_at')
            .eq('tenant_id', tenantId)
            .gte('created_at', startDate);

        metrics.total_appointments = appointments?.length || 0;

        // 2. REVENUE - Base em appointments completed
        const completedAppointments = appointments?.filter(apt => 
            apt.status === 'confirmed' || apt.status === 'completed'
        ) || [];
        
        const totalRevenue = completedAppointments.reduce((sum, apt) => {
            const price = parseFloat(apt.final_price || apt.quoted_price || 0);
            return sum + price;
        }, 0);
        
        metrics.monthly_revenue = totalRevenue;
        console.log(`      💰 Revenue calculado: R$ ${totalRevenue.toFixed(2)}`);

        // 3. SUCCESS RATE
        const confirmedCount = appointments?.filter(apt => 
            apt.status === 'confirmed' || apt.status === 'completed'
        )?.length || 0;
        
        metrics.appointment_success_rate = appointments?.length > 0 ? 
            (confirmedCount / appointments.length) * 100 : 0;

        // 4. CANCELLATION RATE
        const cancelledCount = appointments?.filter(apt => 
            apt.status === 'cancelled'
        )?.length || 0;
        
        metrics.cancellation_rate = appointments?.length > 0 ? 
            (cancelledCount / appointments.length) * 100 : 0;

        // 5. AVERAGE COST
        metrics.avg_cost_per_appointment = completedAppointments.length > 0 ? 
            totalRevenue / completedAppointments.length : 0;

        // 6. UNIQUE CUSTOMERS
        const uniqueUserIds = new Set(appointments?.map(apt => apt.user_id).filter(Boolean) || []);
        metrics.total_unique_customers = uniqueUserIds.size;
        metrics.new_customers = uniqueUserIds.size; // Approximation

        // 7. PROFESSIONALS
        const { data: professionals } = await supabase
            .from('professionals')
            .select('id')
            .eq('tenant_id', tenantId)
            .eq('is_active', true);

        metrics.total_professionals = professionals?.length || 0;

        // 8. SERVICES
        const { data: services } = await supabase
            .from('services')
            .select('id')
            .eq('tenant_id', tenantId)
            .eq('is_active', true);

        metrics.services_available = services?.length || 0;

        // 9. CONVERSATION METRICS
        const { data: conversations } = await supabase
            .from('conversation_history')
            .select('id, api_cost_usd, processing_cost_usd')
            .eq('tenant_id', tenantId)
            .gte('created_at', startDate);

        metrics.conversation_volume = conversations?.length || 0;

        const totalAiCost = conversations?.reduce((sum, conv) => {
            const apiCost = parseFloat(conv.api_cost_usd || 0);
            const processingCost = parseFloat(conv.processing_cost_usd || 0);
            return sum + apiCost + processingCost;
        }, 0) || 0;

        metrics.ai_cost_total = totalAiCost;

        // 10. SUBSCRIPTION REVENUE
        const { data: subscriptions } = await supabase
            .from('subscription_payments')
            .select('amount, payment_status')
            .eq('tenant_id', tenantId)
            .gte('payment_date', startDate.split('T')[0])
            .eq('payment_status', 'completed');

        metrics.subscription_revenue = subscriptions?.reduce((sum, sub) => 
            sum + (parseFloat(sub.amount) || 0), 0
        ) || 0;

        console.log(`      📋 Total de métricas calculadas: ${Object.keys(metrics).length}`);

    } catch (error) {
        console.error(`      ❌ Erro calculando métricas brutas: ${error.message}`);
    }

    return metrics;
}

/**
 * Extrai métricas do sistema tenant_metrics
 */
async function getTenantSystemMetrics(tenantId, period) {
    console.log(`    🔍 Buscando tenant_metrics (${period})...`);
    
    try {
        const { data, error } = await supabase
            .from('tenant_metrics')
            .select('metric_data, metricas_validadas')
            .eq('tenant_id', tenantId)
            .eq('period', period)
            .order('created_at', { ascending: false })
            .limit(1);

        if (error || !data?.length) {
            console.log(`      ⚠️ Nenhuma métrica encontrada no tenant_metrics`);
            return {};
        }

        const metricRow = data[0];
        
        // Extrair do campo metric_data (JSONB)
        const metricData = metricRow.metric_data || {};
        const validatedData = metricRow.metricas_validadas || {};

        // Combinar ambos os dados
        const combinedMetrics = { ...metricData, ...validatedData };
        
        console.log(`      ✅ Métricas encontradas: ${Object.keys(combinedMetrics).length} campos`);
        
        return combinedMetrics;

    } catch (error) {
        console.error(`      ❌ Erro acessando tenant_metrics: ${error.message}`);
        return {};
    }
}

/**
 * Extrai métricas do sistema platform_metrics (dados validados)
 */
async function getPlatformSystemMetrics(tenantId, period) {
    console.log(`    🌐 Buscando platform_metrics (${period})...`);
    
    try {
        const { data, error } = await supabase
            .from('platform_metrics')
            .select('comprehensive_metrics, metricas_validadas, participation_metrics')
            .eq('period', period)
            .order('created_at', { ascending: false })
            .limit(1);

        if (error || !data?.length) {
            console.log(`      ⚠️ Nenhuma métrica encontrada no platform_metrics`);
            return {};
        }

        const platformRow = data[0];
        
        // Buscar dados específicos do tenant nos dados de plataforma
        const comprehensiveMetrics = platformRow.comprehensive_metrics || {};
        const validatedMetrics = platformRow.metricas_validadas || {};
        const participationMetrics = platformRow.participation_metrics || {};
        
        // Tentar encontrar dados do tenant específico
        let tenantSpecificMetrics = {};
        
        // Verificar se há dados por tenant nos comprehensive_metrics
        if (comprehensiveMetrics.tenants && comprehensiveMetrics.tenants[tenantId]) {
            tenantSpecificMetrics = comprehensiveMetrics.tenants[tenantId];
        }
        
        // Verificar no metricas_validadas
        if (validatedMetrics[tenantId]) {
            tenantSpecificMetrics = { ...tenantSpecificMetrics, ...validatedMetrics[tenantId] };
        }

        console.log(`      ✅ Métricas de plataforma: ${Object.keys(tenantSpecificMetrics).length} campos`);
        
        return tenantSpecificMetrics;

    } catch (error) {
        console.error(`      ❌ Erro acessando platform_metrics: ${error.message}`);
        return {};
    }
}

/**
 * Determina status da comparação
 */
function getComparisonStatus(raw, tenant_system, platform_system) {
    const tolerance = 1.0; // Tolerância de 1 unidade ou 1%
    
    const hasRaw = raw > 0;
    const hasTenant = tenant_system > 0;
    const hasPlatform = platform_system > 0;
    
    if (!hasRaw && !hasTenant && !hasPlatform) {
        return '⚪ SEM_DADOS';
    }
    
    if (!hasRaw && (hasTenant || hasPlatform)) {
        return '⚠️ SEM_DADOS_BRUTOS';
    }
    
    const rawTenantMatch = Math.abs(raw - tenant_system) <= tolerance;
    const rawPlatformMatch = Math.abs(raw - platform_system) <= tolerance;
    const tenantPlatformMatch = Math.abs(tenant_system - platform_system) <= tolerance;
    
    if (rawTenantMatch && rawPlatformMatch) {
        return '✅ PERFEITO';
    }
    
    if (rawTenantMatch) {
        return '🟢 TENANT_OK';
    }
    
    if (rawPlatformMatch) {
        return '🟡 PLATFORM_OK';
    }
    
    if (tenantPlatformMatch && !rawTenantMatch) {
        return '🔶 SISTEMAS_OK_RAW_DIFF';
    }
    
    return '🔥 DIVERGENTE';
}

/**
 * Gera a tabela comparativa completa
 */
async function generateFinalComparisonTable() {
    console.log('🚀 GERANDO TABELA COMPARATIVA FINAL DE MÉTRICAS\n');
    
    const tenants = await getActiveTenants();
    
    if (!tenants.length) {
        console.log('❌ Nenhum tenant ativo encontrado');
        return null;
    }

    const allResults = [];
    const csvRows = [];
    
    // Cabeçalho da tabela solicitada
    csvRows.push([
        'Métrica',
        'Tenant',
        'Business_Name',
        'Período', 
        'Valor_Bruto',
        'Sistema_Principal_(tenant_metrics)',
        'Sistema_Validado_(platform_metrics)',
        'Status',
        'Diff_Raw_Tenant',
        'Diff_Raw_Platform',
        'Observações',
        'Timestamp'
    ]);

    console.log(`📊 Analisando ${tenants.length} tenants x ${PERIODS.length} períodos x ${CALCULABLE_METRICS.length} métricas...\n`);

    let processedCount = 0;
    const totalOperations = tenants.length * PERIODS.length;

    for (const tenant of tenants) {
        console.log(`\n🏢 ${tenant.business_name} (${tenant.id.substring(0, 8)}...)`);
        
        for (const period of PERIODS) {
            processedCount++;
            console.log(`\n  📅 [${processedCount}/${totalOperations}] Período: ${period}`);
            
            // Calcular métricas de todas as fontes
            const rawMetrics = await calculateRawMetricsFromPrimaryData(tenant.id, period);
            const tenantSystemMetrics = await getTenantSystemMetrics(tenant.id, period);
            const platformSystemMetrics = await getPlatformSystemMetrics(tenant.id, period);
            
            // Comparar cada métrica calculável
            for (const metricName of CALCULABLE_METRICS) {
                const raw = rawMetrics[metricName] || 0;
                const tenantSystem = tenantSystemMetrics[metricName] || 0;
                const platformSystem = platformSystemMetrics[metricName] || 0;
                
                const status = getComparisonStatus(raw, tenantSystem, platformSystem);
                const diffRawTenant = Math.abs(raw - tenantSystem);
                const diffRawPlatform = Math.abs(raw - platformSystem);
                
                let observacao = '';
                if (raw === 0 && tenantSystem === 0 && platformSystem === 0) {
                    observacao = 'Sem dados no período';
                } else if (raw > 0 && (tenantSystem === 0 || platformSystem === 0)) {
                    observacao = 'Sistemas não calcularam esta métrica';
                }
                
                const result = {
                    metric: metricName,
                    tenant: tenant.id,
                    business_name: tenant.business_name,
                    period,
                    raw_value: Number(raw.toFixed(2)),
                    tenant_system: Number(tenantSystem.toFixed(2)),
                    platform_system: Number(platformSystem.toFixed(2)),
                    status,
                    diff_raw_tenant: Number(diffRawTenant.toFixed(2)),
                    diff_raw_platform: Number(diffRawPlatform.toFixed(2)),
                    observacao
                };
                
                allResults.push(result);
                
                // Adicionar linha ao CSV
                csvRows.push([
                    metricName,
                    tenant.id,
                    tenant.business_name,
                    period,
                    raw,
                    tenantSystem,
                    platformSystem,
                    status,
                    diffRawTenant,
                    diffRawPlatform,
                    observacao,
                    new Date().toISOString()
                ]);
            }
        }
    }

    // Gerar relatório consolidado
    console.log('\n' + '='.repeat(120));
    console.log('📊 RELATÓRIO FINAL - TABELA COMPARATIVA COMPLETA DE MÉTRICAS');
    console.log('='.repeat(120));

    // Estatísticas por status
    const statusCounts = {};
    allResults.forEach(result => {
        statusCounts[result.status] = (statusCounts[result.status] || 0) + 1;
    });

    console.log('\n📈 DISTRIBUIÇÃO POR STATUS:');
    Object.entries(statusCounts).sort((a, b) => b[1] - a[1]).forEach(([status, count]) => {
        const percentage = ((count / allResults.length) * 100).toFixed(1);
        console.log(`  ${status}: ${count} casos (${percentage}%)`);
    });

    // Top problemas identificados
    const problemCases = allResults.filter(r => 
        r.status.includes('DIVERGENTE') || 
        r.status.includes('SEM_DADOS_BRUTOS') ||
        r.status.includes('SISTEMAS_OK_RAW_DIFF')
    );

    console.log('\n🚨 TOP PROBLEMAS IDENTIFICADOS:');
    if (problemCases.length > 0) {
        console.log('┌─────────────────────────┬──────────────────────┬─────────┬─────────┬──────────┬───────────┬───────────────────────┐');
        console.log('│ Métrica                 │ Business             │ Período │ Bruto   │ Tenant   │ Platform  │ Status                │');
        console.log('├─────────────────────────┼──────────────────────┼─────────┼─────────┼──────────┼───────────┼───────────────────────┤');
        
        problemCases.slice(0, 25).forEach(case_ => {
            const metric = case_.metric.padEnd(23);
            const business = case_.business_name.substring(0, 18).padEnd(18);
            const period = case_.period.padEnd(7);
            const raw = String(case_.raw_value).padEnd(7);
            const tenant = String(case_.tenant_system).padEnd(8);
            const platform = String(case_.platform_system).padEnd(9);
            const status = case_.status.substring(0, 19).padEnd(19);
            
            console.log(`│ ${metric} │ ${business} │ ${period} │ ${raw} │ ${tenant} │ ${platform} │ ${status} │`);
        });
        
        console.log('└─────────────────────────┴──────────────────────┴─────────┴─────────┴──────────┴───────────┴───────────────────────┘');
        
        if (problemCases.length > 25) {
            console.log(`... e mais ${problemCases.length - 25} casos problemáticos (ver CSV completo)`);
        }
    } else {
        console.log('✅ Nenhum problema crítico identificado!');
    }

    // Métricas com maior divergência
    console.log('\n🔍 MÉTRICAS COM MAIOR DIVERGÊNCIA:');
    const metricAccuracy = {};
    
    CALCULABLE_METRICS.forEach(metric => {
        const metricResults = allResults.filter(r => r.metric === metric);
        const perfectMatches = metricResults.filter(r => r.status === '✅ PERFEITO').length;
        const accuracy = metricResults.length > 0 ? (perfectMatches / metricResults.length) * 100 : 0;
        metricAccuracy[metric] = accuracy;
    });

    Object.entries(metricAccuracy)
        .sort((a, b) => a[1] - b[1])
        .slice(0, 10)
        .forEach(([metric, accuracy]) => {
            console.log(`  ${metric}: ${accuracy.toFixed(1)}% de acerto`);
        });

    // Salvar CSV final
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('.')[0];
    const filename = `TABELA-COMPARATIVA-METRICAS-FINAL-${timestamp}.csv`;
    
    const csvContent = csvRows.map(row => 
        row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
    ).join('\n');
    
    fs.writeFileSync(filename, csvContent);
    
    // Estatísticas finais
    const totalComparisons = allResults.length;
    const perfectMatches = allResults.filter(r => r.status === '✅ PERFEITO').length;
    const overallAccuracy = ((perfectMatches / totalComparisons) * 100).toFixed(2);
    
    console.log(`\n💾 ARQUIVO CSV FINAL: ${filename}`);
    console.log('📊 ESTATÍSTICAS FINAIS:');
    console.log(`   • Total de comparações realizadas: ${totalComparisons}`);
    console.log(`   • Matches perfeitos: ${perfectMatches} (${overallAccuracy}%)`);
    console.log(`   • Casos problemáticos: ${problemCases.length}`);
    console.log(`   • Tenants analisados: ${tenants.length}`);
    console.log(`   • Métricas calculadas: ${CALCULABLE_METRICS.length}`);
    console.log(`   • Períodos analisados: ${PERIODS.join(', ')}`);
    
    console.log('\n' + '='.repeat(120));
    console.log('✅ TABELA COMPARATIVA FINAL GERADA COM SUCESSO!');
    console.log(`📄 Arquivo disponível: ${filename}`);
    console.log('='.repeat(120));

    return {
        filename,
        results: allResults,
        statistics: {
            total_comparisons: totalComparisons,
            perfect_matches: perfectMatches,
            overall_accuracy: parseFloat(overallAccuracy),
            problem_cases: problemCases.length,
            tenants_analyzed: tenants.length,
            metrics_calculated: CALCULABLE_METRICS.length
        },
        metric_accuracy: metricAccuracy
    };
}

/**
 * Função principal
 */
async function main() {
    const startTime = Date.now();
    
    try {
        console.log('🎯 TABELA COMPARATIVA FINAL DE MÉTRICAS');
        console.log('   Comparando: Valores Brutos vs Sistema Principal vs Sistema Validado\n');
        
        // Testar conexão
        const { data: testConnection } = await supabase
            .from('tenants')
            .select('count')
            .limit(1);
        
        if (!testConnection) {
            throw new Error('Conexão com Supabase falhou');
        }
        
        console.log('✅ Conexão Supabase verificada\n');
        
        // Executar análise completa
        const result = await generateFinalComparisonTable();
        
        const endTime = Date.now();
        const duration = ((endTime - startTime) / 1000).toFixed(2);
        
        if (result) {
            console.log(`\n⚡ EXECUÇÃO CONCLUÍDA EM ${duration}s`);
            console.log(`🎯 Taxa de acerto geral: ${result.statistics.overall_accuracy}%`);
            console.log(`📋 ${result.statistics.problem_cases} casos requerem atenção`);
            console.log(`💾 Dados completos salvos em: ${result.filename}`);
        } else {
            console.log('\n❌ Falha na geração da tabela comparativa');
        }
        
    } catch (error) {
        console.error('\n💥 ERRO CRÍTICO:', error.message);
        if (error.stack) {
            console.error('Stack trace:', error.stack);
        }
        process.exit(1);
    }
}

// Executar script
if (require.main === module) {
    main().catch(console.error);
}

module.exports = {
    generateFinalComparisonTable,
    calculateRawMetricsFromPrimaryData,
    getTenantSystemMetrics,
    getPlatformSystemMetrics,
    CALCULABLE_METRICS,
    PERIODS
};