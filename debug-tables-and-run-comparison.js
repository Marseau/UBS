/**
 * DEBUG E EXECUÇÃO - Tabela Comparativa Completa
 * 
 * 1. Verifica estrutura das tabelas
 * 2. Executa análise com dados reais
 * 3. Gera tabela comparativa completa
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// Configuração Supabase
const supabaseUrl = process.env.SUPABASE_URL || 'https://your-project.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'your-service-role-key';
const supabase = createClient(supabaseUrl, supabaseKey);

async function debugDatabaseStructure() {
    console.log('🔍 VERIFICANDO ESTRUTURA DO BANCO DE DADOS\n');
    
    // 1. Verificar tenants
    console.log('1️⃣ VERIFICANDO TABELA TENANTS:');
    try {
        const { data: tenants, error } = await supabase
            .from('tenants')
            .select('id, business_name, status')
            .limit(5);
        
        if (error) {
            console.log('❌ Erro acessando tenants:', error.message);
        } else {
            console.log(`✅ Encontrados ${tenants?.length || 0} tenants`);
            if (tenants?.length > 0) {
                console.log('Exemplo:', JSON.stringify(tenants[0], null, 2));
            }
        }
    } catch (error) {
        console.log('❌ Tabela tenants não existe ou erro de acesso:', error.message);
    }

    // 2. Verificar user_tenants (pode ser a fonte de tenants)
    console.log('\n2️⃣ VERIFICANDO TABELA USER_TENANTS:');
    try {
        const { data: userTenants, error } = await supabase
            .from('user_tenants')
            .select('tenant_id')
            .limit(10);
        
        if (error) {
            console.log('❌ Erro acessando user_tenants:', error.message);
        } else {
            const uniqueTenants = [...new Set(userTenants?.map(ut => ut.tenant_id) || [])];
            console.log(`✅ Encontrados ${uniqueTenants.length} tenant_ids únicos`);
            console.log('Primeiros tenant_ids:', uniqueTenants.slice(0, 5));
        }
    } catch (error) {
        console.log('❌ Tabela user_tenants não existe:', error.message);
    }

    // 3. Verificar conversations
    console.log('\n3️⃣ VERIFICANDO TABELA CONVERSATIONS:');
    try {
        const { data: conversations, error } = await supabase
            .from('conversations')
            .select('id, tenant_id, created_at, status, outcome')
            .limit(5);
        
        if (error) {
            console.log('❌ Erro acessando conversations:', error.message);
        } else {
            console.log(`✅ Encontradas ${conversations?.length || 0} conversations`);
            if (conversations?.length > 0) {
                const tenantIds = [...new Set(conversations.map(c => c.tenant_id))];
                console.log(`Tenant IDs nas conversas: ${tenantIds.slice(0, 3)}`);
            }
        }
    } catch (error) {
        console.log('❌ Tabela conversations não existe:', error.message);
    }

    // 4. Verificar appointments
    console.log('\n4️⃣ VERIFICANDO TABELA APPOINTMENTS:');
    try {
        const { data: appointments, error } = await supabase
            .from('appointments')
            .select('id, tenant_id, created_at, status, price')
            .limit(5);
        
        if (error) {
            console.log('❌ Erro acessando appointments:', error.message);
        } else {
            console.log(`✅ Encontrados ${appointments?.length || 0} appointments`);
            if (appointments?.length > 0) {
                const tenantIds = [...new Set(appointments.map(a => a.tenant_id))];
                console.log(`Tenant IDs nos appointments: ${tenantIds.slice(0, 3)}`);
            }
        }
    } catch (error) {
        console.log('❌ Tabela appointments não existe:', error.message);
    }

    // 5. Verificar sistemas de métricas
    console.log('\n5️⃣ VERIFICANDO SISTEMA DE MÉTRICAS PRINCIPAL:');
    try {
        const { data: metricData, error } = await supabase
            .from('metric_data')
            .select('tenant_id, metric_type, value, period')
            .limit(5);
        
        if (error) {
            console.log('❌ Erro acessando metric_data:', error.message);
        } else {
            console.log(`✅ Encontrados ${metricData?.length || 0} registros de métricas`);
            if (metricData?.length > 0) {
                const tenantIds = [...new Set(metricData.map(m => m.tenant_id))];
                console.log(`Tenant IDs nas métricas: ${tenantIds.slice(0, 3)}`);
            }
        }
    } catch (error) {
        console.log('❌ Tabela metric_data não existe:', error.message);
    }

    console.log('\n6️⃣ VERIFICANDO SISTEMA DE MÉTRICAS VALIDADO:');
    try {
        const { data: validatedMetrics, error } = await supabase
            .from('metricas_validadas')
            .select('tenant_id, periodo, total_conversations, monthly_revenue')
            .limit(5);
        
        if (error) {
            console.log('❌ Erro acessando metricas_validadas:', error.message);
        } else {
            console.log(`✅ Encontrados ${validatedMetrics?.length || 0} registros validados`);
            if (validatedMetrics?.length > 0) {
                const tenantIds = [...new Set(validatedMetrics.map(m => m.tenant_id))];
                console.log(`Tenant IDs nas métricas validadas: ${tenantIds.slice(0, 3)}`);
            }
        }
    } catch (error) {
        console.log('❌ Tabela metricas_validadas não existe:', error.message);
    }
}

/**
 * Busca tenants reais do sistema
 */
async function getRealTenants() {
    // Tentar múltiples fontes de tenants
    let tenants = [];

    // Opção 1: Tabela tenants
    try {
        const { data } = await supabase
            .from('tenants')
            .select('id, business_name')
            .limit(10);
        if (data?.length > 0) {
            return data.map(t => ({ id: t.id, business_name: t.business_name || 'Unknown' }));
        }
    } catch (error) {
        console.log('Tabela tenants não disponível');
    }

    // Opção 2: user_tenants únicos
    try {
        const { data } = await supabase
            .from('user_tenants')
            .select('tenant_id')
            .limit(50);
        
        if (data?.length > 0) {
            const uniqueTenantIds = [...new Set(data.map(ut => ut.tenant_id))];
            return uniqueTenantIds.slice(0, 10).map(id => ({ 
                id, 
                business_name: `Tenant ${id.substring(0, 8)}` 
            }));
        }
    } catch (error) {
        console.log('Tabela user_tenants não disponível');
    }

    // Opção 3: conversations únicos
    try {
        const { data } = await supabase
            .from('conversations')
            .select('tenant_id')
            .limit(100);
        
        if (data?.length > 0) {
            const uniqueTenantIds = [...new Set(data.map(c => c.tenant_id))];
            return uniqueTenantIds.slice(0, 10).map(id => ({ 
                id, 
                business_name: `Tenant ${id.substring(0, 8)}` 
            }));
        }
    } catch (error) {
        console.log('Tabela conversations não disponível');
    }

    return [];
}

/**
 * Versão simplificada do cálculo de métricas brutas
 */
async function calculateSimpleRawMetrics(tenantId, period) {
    const startDate = getStartDate(period);
    const metrics = {};

    try {
        // Total Conversations
        const { data: conversations } = await supabase
            .from('conversations')
            .select('id, outcome')
            .eq('tenant_id', tenantId)
            .gte('created_at', startDate);
        
        metrics.total_conversations = conversations?.length || 0;

        // Total Appointments
        const { data: appointments } = await supabase
            .from('appointments')
            .select('id, status, price')
            .eq('tenant_id', tenantId)
            .gte('created_at', startDate);
        
        metrics.total_appointments = appointments?.length || 0;

        // Monthly Revenue
        const completedAppointments = appointments?.filter(apt => 
            apt.status === 'completed' && apt.price
        ) || [];
        
        metrics.monthly_revenue = completedAppointments.reduce((sum, apt) => sum + (apt.price || 0), 0);

        // New Customers (unique phones)
        const uniquePhones = new Set(conversations?.map(c => c.customer_phone_number).filter(Boolean) || []);
        metrics.new_customers = uniquePhones.size;

        // Success Rate
        const completedCount = appointments?.filter(apt => apt.status === 'completed')?.length || 0;
        metrics.appointment_success_rate = appointments.length > 0 ? 
            (completedCount / appointments.length) * 100 : 0;

        // AI Metrics
        const aiHandled = conversations?.filter(c => c.outcome === 'ai_handled')?.length || 0;
        metrics.ai_interaction_rate = conversations.length > 0 ? 
            (aiHandled / conversations.length) * 100 : 0;

    } catch (error) {
        console.log(`Erro calculando métricas para ${tenantId}:`, error.message);
    }

    return metrics;
}

/**
 * Calcula data de início baseada no período
 */
function getStartDate(period) {
    const now = new Date();
    const days = parseInt(period.replace('d', ''));
    const startDate = new Date(now.getTime() - (days * 24 * 60 * 60 * 1000));
    return startDate.toISOString();
}

/**
 * Executa análise comparativa simplificada
 */
async function runSimplifiedComparison() {
    console.log('\n🔄 EXECUTANDO ANÁLISE COMPARATIVA SIMPLIFICADA\n');

    const tenants = await getRealTenants();
    
    if (!tenants.length) {
        console.log('❌ Nenhum tenant encontrado para análise');
        return;
    }

    console.log(`✅ Analisando ${tenants.length} tenants`);

    const results = [];
    const csvData = [];
    
    // Headers CSV
    csvData.push([
        'Métrica',
        'Tenant_ID',
        'Business_Name',
        'Período',
        'Valor_Bruto',
        'Sistema_Principal', 
        'Sistema_Validado',
        'Status_Comparação',
        'Timestamp'
    ]);

    const periods = ['7d', '30d', '90d'];
    const metricsToCheck = [
        'total_conversations',
        'total_appointments', 
        'monthly_revenue',
        'new_customers',
        'appointment_success_rate',
        'ai_interaction_rate'
    ];

    for (const tenant of tenants.slice(0, 5)) { // Limitar a 5 tenants para teste
        console.log(`\n📊 Processando: ${tenant.business_name} (${tenant.id.substring(0, 8)}...)`);
        
        for (const period of periods) {
            console.log(`  📅 Período: ${period}`);
            
            // Calcular métricas brutas
            const rawMetrics = await calculateSimpleRawMetrics(tenant.id, period);
            
            // Buscar do sistema principal
            const { data: mainSystemData } = await supabase
                .from('metric_data')
                .select('metric_type, value')
                .eq('tenant_id', tenant.id)
                .eq('period', period)
                .gte('created_at', getStartDate('1d'));
            
            const mainMetrics = {};
            mainSystemData?.forEach(item => {
                mainMetrics[item.metric_type] = parseFloat(item.value) || 0;
            });

            // Buscar do sistema validado
            const { data: validatedData } = await supabase
                .from('metricas_validadas')
                .select('*')
                .eq('tenant_id', tenant.id)
                .eq('periodo', period)
                .order('created_at', { ascending: false })
                .limit(1);

            const validatedMetrics = validatedData?.[0] || {};

            // Comparar cada métrica
            for (const metric of metricsToCheck) {
                const raw = rawMetrics[metric] || 0;
                const main = mainMetrics[metric] || 0;
                const validated = validatedMetrics[metric] || 0;

                let status = '❌ NO_DATA';
                if (raw > 0 || main > 0 || validated > 0) {
                    if (Math.abs(raw - main) <= 0.01 && Math.abs(raw - validated) <= 0.01) {
                        status = '✅ PERFECT_MATCH';
                    } else if (Math.abs(raw - main) <= 0.01) {
                        status = '⚠️ MAIN_OK';
                    } else if (Math.abs(raw - validated) <= 0.01) {
                        status = '⚠️ VALIDATED_OK';
                    } else {
                        status = '🔥 MISMATCH';
                    }
                }

                const result = {
                    metric,
                    tenant_id: tenant.id,
                    business_name: tenant.business_name,
                    period,
                    raw_value: Number(raw.toFixed(2)),
                    main_system: Number(main.toFixed(2)),
                    validated_system: Number(validated.toFixed(2)),
                    status
                };

                results.push(result);

                // Adicionar ao CSV
                csvData.push([
                    metric,
                    tenant.id,
                    tenant.business_name,
                    period,
                    raw,
                    main,
                    validated,
                    status,
                    new Date().toISOString()
                ]);
            }
        }
    }

    // Gerar relatório no console
    console.log('\n' + '='.repeat(100));
    console.log('📈 RELATÓRIO COMPARATIVO DE MÉTRICAS - RESUMO');
    console.log('='.repeat(100));

    // Agrupar por status
    const statusSummary = {};
    results.forEach(result => {
        statusSummary[result.status] = (statusSummary[result.status] || 0) + 1;
    });

    console.log('\n📊 RESUMO POR STATUS:');
    Object.entries(statusSummary).forEach(([status, count]) => {
        console.log(`${status}: ${count} casos`);
    });

    // Mostrar casos problemáticos
    const problematicCases = results.filter(r => 
        r.status.includes('MISMATCH') || r.status.includes('NO_DATA')
    );

    console.log('\n🔥 CASOS PROBLEMÁTICOS:');
    if (problematicCases.length > 0) {
        console.log('\n| Métrica | Tenant | Período | Bruto | Principal | Validado | Status |');
        console.log('|---------|--------|---------|-------|-----------|----------|--------|');
        
        problematicCases.slice(0, 15).forEach(case_ => {
            console.log(`| ${case_.metric} | ${case_.tenant_id.substring(0, 8)}... | ${case_.period} | ${case_.raw_value} | ${case_.main_system} | ${case_.validated_system} | ${case_.status} |`);
        });
    } else {
        console.log('✅ Nenhum caso problemático encontrado!');
    }

    // Salvar CSV
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('.')[0];
    const filename = `METRICS-COMPARISON-${timestamp}.csv`;
    
    const csvContent = csvData.map(row => row.join(',')).join('\n');
    fs.writeFileSync(filename, csvContent);
    
    console.log(`\n💾 ARQUIVO CSV SALVO: ${filename}`);
    console.log(`📁 Total de comparações: ${results.length}`);
    
    const totalComparisons = results.length;
    const perfectMatches = results.filter(r => r.status === '✅ PERFECT_MATCH').length;
    const accuracyRate = totalComparisons > 0 ? ((perfectMatches / totalComparisons) * 100).toFixed(2) : 0;
    
    console.log(`✅ Taxa de acerto: ${accuracyRate}% (${perfectMatches}/${totalComparisons})`);
    console.log('\n' + '='.repeat(100));

    return {
        filename,
        total_comparisons: totalComparisons,
        perfect_matches: perfectMatches,
        accuracy_rate: accuracyRate,
        results
    };
}

/**
 * Função principal
 */
async function main() {
    try {
        console.log('🚀 ANÁLISE COMPLETA DE MÉTRICAS - DEBUG E COMPARAÇÃO\n');
        
        // 1. Debug da estrutura
        await debugDatabaseStructure();
        
        // 2. Executar comparação
        const analysis = await runSimplifiedComparison();
        
        if (analysis) {
            console.log(`\n🎯 ANÁLISE FINALIZADA!`);
            console.log(`📄 Arquivo gerado: ${analysis.filename}`);
            console.log(`📊 Resumo: ${analysis.perfect_matches}/${analysis.total_comparisons} matches perfeitos (${analysis.accuracy_rate}%)`);
        }
        
    } catch (error) {
        console.error('❌ Erro na execução:', error);
        process.exit(1);
    }
}

// Executar
if (require.main === module) {
    main();
}