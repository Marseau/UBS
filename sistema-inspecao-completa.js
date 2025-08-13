/**
 * INSPEÇÃO SISTEMÁTICA COMPLETA DO BANCO DE DADOS
 * 
 * Este script faz uma verificação detalhada de:
 * 1. Dados base nas tabelas principais
 * 2. Tabelas de métricas existentes
 * 3. Funções SQL disponíveis
 * 4. Estado atual do tenant específico
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const TARGET_TENANT = 'ea1e9c71-2cde-4959-b367-81fa177407d8';

async function inspecaoCompleta() {
    console.log('🔍 INICIANDO INSPEÇÃO SISTEMÁTICA COMPLETA DO BANCO DE DADOS');
    console.log('=' .repeat(80));
    
    // 1. VERIFICAR DADOS BASE DO TENANT ESPECÍFICO
    await verificarDadosBaseTenant();
    
    // 2. VERIFICAR ESTRUTURA DE TABELAS DE MÉTRICAS
    await verificarTabelasMetricas();
    
    // 3. VERIFICAR FUNÇÕES SQL DISPONÍVEIS
    await verificarFuncoesSQL();
    
    // 4. VERIFICAR DADOS POPULADOS EM TABELAS DE MÉTRICAS
    await verificarDadosMetricas();
    
    // 5. TESTAR FUNÇÕES EXISTENTES
    await testarFuncoes();
    
    // 6. RELATÓRIO FINAL
    await relatorioFinal();
}

async function verificarDadosBaseTenant() {
    console.log('\n📊 1. VERIFICAÇÃO DE DADOS BASE DO TENANT');
    console.log('-' .repeat(50));
    
    try {
        // Verificar tenant específico
        const { data: tenant, error: tenantError } = await supabase
            .from('tenants')
            .select('*')
            .eq('id', TARGET_TENANT)
            .single();
        
        if (tenantError) {
            console.log('❌ Tenant não encontrado:', tenantError.message);
            return;
        }
        
        console.log('✅ Tenant encontrado:', {
            id: tenant.id,
            company_name: tenant.company_name,
            business_domain: tenant.business_domain,
            status: tenant.status,
            created_at: tenant.created_at
        });
        
        // Verificar appointments do tenant
        const { data: appointments, error: aptError } = await supabase
            .from('appointments')
            .select('*')
            .eq('tenant_id', TARGET_TENANT);
        
        console.log(`📅 Appointments: ${appointments?.length || 0} registros`);
        if (appointments && appointments.length > 0) {
            console.log('   - Status:', appointments.reduce((acc, apt) => {
                acc[apt.status] = (acc[apt.status] || 0) + 1;
                return acc;
            }, {}));
        }
        
        // Verificar users relacionados ao tenant
        const { data: userTenants, error: utError } = await supabase
            .from('user_tenants')
            .select('user_id')
            .eq('tenant_id', TARGET_TENANT);
        
        console.log(`👥 Usuários: ${userTenants?.length || 0} registros`);
        
        // Verificar services do tenant
        const { data: services, error: servError } = await supabase
            .from('services')
            .select('*')
            .eq('tenant_id', TARGET_TENANT);
        
        console.log(`🛠️ Serviços: ${services?.length || 0} registros`);
        
        // Verificar conversation_history
        const { data: conversations, error: convError } = await supabase
            .from('conversation_history')
            .select('id, created_at, is_from_user')
            .eq('tenant_id', TARGET_TENANT);
        
        console.log(`💬 Conversas: ${conversations?.length || 0} registros`);
        
    } catch (error) {
        console.error('💥 Erro na verificação de dados base:', error);
    }
}

async function verificarTabelasMetricas() {
    console.log('\n📈 2. VERIFICAÇÃO DE TABELAS DE MÉTRICAS');
    console.log('-' .repeat(50));
    
    const tabelasMetricas = [
        'analytics_tenant_metrics',
        'analytics_system_metrics', 
        'analytics_service_performance',
        'analytics_cache',
        'platform_metrics',
        'saas_metrics',
        'tenant_daily_metrics',
        'mv_daily_appointment_stats',
        'mv_ai_interaction_stats',
        'mv_service_popularity'
    ];
    
    for (const tabela of tabelasMetricas) {
        try {
            const { data, error } = await supabase
                .from(tabela)
                .select('*')
                .limit(1);
            
            if (error) {
                console.log(`❌ ${tabela}: ${error.message}`);
            } else {
                const { count } = await supabase
                    .from(tabela)
                    .select('*', { count: 'exact', head: true });
                
                console.log(`✅ ${tabela}: ${count || 0} registros`);
                
                if (data && data.length > 0) {
                    console.log(`   Campos: ${Object.keys(data[0]).join(', ')}`);
                }
            }
        } catch (err) {
            console.log(`❌ ${tabela}: Erro ao acessar - ${err.message}`);
        }
    }
}

async function verificarFuncoesSQL() {
    console.log('\n⚙️ 3. VERIFICAÇÃO DE FUNÇÕES SQL');
    console.log('-' .repeat(50));
    
    const funcoes = [
        'get_saas_metrics',
        'get_tenant_metrics',
        'get_platform_metrics_complete', 
        'calculate_platform_metrics_complete',
        'update_platform_metrics_complete',
        'aggregate_tenant_daily_metrics',
        'aggregate_system_daily_metrics',
        'refresh_analytics_materialized_views'
    ];
    
    for (const funcao of funcoes) {
        try {
            // Tentar buscar informações da função no catálogo do PostgreSQL
            const { data, error } = await supabase
                .rpc('sql', {
                    query: `
                        SELECT 
                            proname as function_name,
                            prosrc as function_body,
                            proargnames as argument_names
                        FROM pg_proc 
                        WHERE proname = '${funcao}'
                        LIMIT 1
                    `
                });
            
            if (error) {
                // Tentar chamar a função para ver se existe
                try {
                    await supabase.rpc(funcao);
                    console.log(`✅ ${funcao}: Função existe (mas erro no catálogo)`);
                } catch (callError) {
                    if (callError.message.includes('does not exist')) {
                        console.log(`❌ ${funcao}: Função não existe`);
                    } else {
                        console.log(`✅ ${funcao}: Função existe (erro de parâmetros)`);
                    }
                }
            } else if (data && data.length > 0) {
                console.log(`✅ ${funcao}: Função encontrada`);
            } else {
                console.log(`❌ ${funcao}: Função não encontrada`);
            }
        } catch (err) {
            console.log(`❓ ${funcao}: Verificação inconclusiva - ${err.message}`);
        }
    }
}

async function verificarDadosMetricas() {
    console.log('\n📊 4. VERIFICAÇÃO DE DADOS EM TABELAS DE MÉTRICAS');
    console.log('-' .repeat(50));
    
    // Verificar analytics_tenant_metrics para o tenant específico
    try {
        const { data: tenantMetrics } = await supabase
            .from('analytics_tenant_metrics')
            .select('*')
            .eq('tenant_id', TARGET_TENANT)
            .order('metric_date', { ascending: false })
            .limit(5);
        
        console.log(`📈 analytics_tenant_metrics para ${TARGET_TENANT}:`);
        console.log(`   Registros: ${tenantMetrics?.length || 0}`);
        if (tenantMetrics && tenantMetrics.length > 0) {
            tenantMetrics.forEach(metric => {
                console.log(`   - ${metric.metric_date}: ${metric.total_appointments} appointments, R$ ${metric.total_revenue}`);
            });
        }
    } catch (error) {
        console.log('❌ Erro ao verificar analytics_tenant_metrics:', error.message);
    }
    
    // Verificar platform_metrics
    try {
        const { data: platformMetrics } = await supabase
            .from('platform_metrics')
            .select('*')
            .order('metric_date', { ascending: false })
            .limit(3);
        
        console.log(`🏢 platform_metrics:`);
        console.log(`   Registros: ${platformMetrics?.length || 0}`);
        if (platformMetrics && platformMetrics.length > 0) {
            platformMetrics.forEach(metric => {
                console.log(`   - ${metric.metric_date}: MRR: R$ ${metric.total_mrr}, Tenants: ${metric.active_tenants}`);
            });
        }
    } catch (error) {
        console.log('❌ Erro ao verificar platform_metrics:', error.message);
    }
}

async function testarFuncoes() {
    console.log('\n🧪 5. TESTE DE FUNÇÕES EXISTENTES');
    console.log('-' .repeat(50));
    
    // Tentar chamar get_platform_metrics_complete
    try {
        const { data, error } = await supabase
            .rpc('get_platform_metrics_complete');
        
        if (error) {
            console.log('❌ get_platform_metrics_complete:', error.message);
        } else {
            console.log('✅ get_platform_metrics_complete: Funcionando');
            console.log('   Resultado:', JSON.stringify(data, null, 2));
        }
    } catch (err) {
        console.log('❌ get_platform_metrics_complete: Erro -', err.message);
    }
    
    // Tentar chamar get_saas_metrics
    try {
        const { data, error } = await supabase
            .rpc('get_saas_metrics');
        
        if (error) {
            console.log('❌ get_saas_metrics:', error.message);
        } else {
            console.log('✅ get_saas_metrics: Funcionando');
            console.log('   Registros retornados:', data?.length || 0);
        }
    } catch (err) {
        console.log('❌ get_saas_metrics: Erro -', err.message);
    }
    
    // Tentar chamar get_tenant_metrics para o tenant específico
    try {
        const { data, error } = await supabase
            .rpc('get_tenant_metrics', { p_tenant_id: TARGET_TENANT });
        
        if (error) {
            console.log('❌ get_tenant_metrics:', error.message);
        } else {
            console.log('✅ get_tenant_metrics: Funcionando');
            console.log('   Resultado:', JSON.stringify(data, null, 2));
        }
    } catch (err) {
        console.log('❌ get_tenant_metrics: Erro -', err.message);
    }
}

async function relatorioFinal() {
    console.log('\n📋 6. RELATÓRIO FINAL E RECOMENDAÇÕES');
    console.log('=' .repeat(80));
    
    console.log(`
🎯 RESUMO DA INSPEÇÃO:

DADOS BASE:
- Tenant ${TARGET_TENANT}: Verificar se existe e tem dados
- Appointments: Verificar quantos registros existem
- Users: Verificar relacionamentos
- Services: Verificar configurações

TABELAS DE MÉTRICAS:
- Verificar quais tabelas existem
- Verificar se estão populadas
- Identificar tabelas em falta

FUNÇÕES SQL:
- Verificar quais funções estão implementadas
- Testar funcionamento das funções principais
- Identificar funções necessárias

PRÓXIMOS PASSOS RECOMENDADOS:
1. Se dados base existem mas métricas estão vazias → Executar scripts de população
2. Se funções não existem → Executar scripts SQL de criação
3. Se dados base não existem → Criar dados de teste
4. Se tudo existe → Verificar configuração do AnalyticsService

ARQUIVOS IMPORTANTES IDENTIFICADOS:
- /database/complete-platform-metrics-with-all-data.sql
- /database/analytics-optimization-schema.sql  
- /src/services/analytics.service.ts
- /src/routes/dashboard-apis.ts
    `);
}

// Executar inspeção
if (require.main === module) {
    inspecaoCompleta()
        .then(() => {
            console.log('\n🎯 INSPEÇÃO SISTEMÁTICA COMPLETA FINALIZADA!');
            process.exit(0);
        })
        .catch(error => {
            console.error('💥 Erro fatal na inspeção:', error);
            process.exit(1);
        });
}

module.exports = { inspecaoCompleta };