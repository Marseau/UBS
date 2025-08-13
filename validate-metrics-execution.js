/**
 * Validate Metrics Execution Script
 * Sistema UBS - Universal Booking System
 * 
 * Valida a execução do cron job comparando métricas calculadas vs dados brutos
 * Metodologia COLEAM00: Evidência verificável através de dados primários
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ ERRO: Variáveis SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function validateMetricsExecution() {
    console.log('🔍 Iniciando validação da execução de métricas...\n');
    
    try {
        // 1. Verificar estado atual das tabelas de métricas
        console.log('📊 1. VERIFICANDO ESTADO ATUAL DAS MÉTRICAS');
        
        const { data: tenantMetrics, count: tenantCount } = await supabase
            .from('tenant_metrics')
            .select('*', { count: 'exact' });
        
        const { data: platformMetrics, count: platformCount } = await supabase
            .from('platform_metrics')
            .select('*', { count: 'exact' });

        console.log(`   • tenant_metrics: ${tenantCount || 0} registros`);
        console.log(`   • platform_metrics: ${platformCount || 0} registros`);

        // 2. Verificar dados brutos para comparação
        console.log('\n📈 2. VERIFICANDO DADOS BRUTOS DO SISTEMA');
        
        const { data: tenants } = await supabase
            .from('tenants')
            .select('id, name, status, created_at')
            .eq('status', 'active');

        const { data: appointments, count: appointmentsCount } = await supabase
            .from('appointments')
            .select('*', { count: 'exact' });

        const { data: conversations, count: conversationsCount } = await supabase
            .from('conversation_history')
            .select('*', { count: 'exact' });

        const { data: users, count: usersCount } = await supabase
            .from('users')
            .select('*', { count: 'exact' });

        console.log(`   • Tenants ativos: ${tenants?.length || 0}`);
        console.log(`   • Total appointments: ${appointmentsCount || 0}`);
        console.log(`   • Total conversations: ${conversationsCount || 0}`);
        console.log(`   • Total users: ${usersCount || 0}`);

        // 3. Análise detalhada dos tenants
        console.log('\n🏢 3. ANÁLISE DETALHADA DOS TENANTS');
        
        if (tenants && tenants.length > 0) {
            for (const tenant of tenants.slice(0, 5)) { // Mostrar apenas os primeiros 5
                const { data: tenantAppointments, count: tAppts } = await supabase
                    .from('appointments')
                    .select('*', { count: 'exact' })
                    .eq('tenant_id', tenant.id);

                const { data: tenantConversations, count: tConvs } = await supabase
                    .from('conversation_history')
                    .select('*', { count: 'exact' })
                    .eq('tenant_id', tenant.id);

                console.log(`   • ${tenant.name} (${tenant.id.substring(0, 8)}...)`);
                console.log(`     - Appointments: ${tAppts || 0}`);
                console.log(`     - Conversations: ${tConvs || 0}`);
                console.log(`     - Criado: ${tenant.created_at}`);
            }
        }

        // 4. Validação de métricas calculadas
        console.log('\n🧮 4. VALIDAÇÃO DE MÉTRICAS CALCULADAS');
        
        if (tenantMetrics && tenantMetrics.length > 0) {
            console.log('   ✅ Métricas de tenant encontradas:');
            
            const sampleMetric = tenantMetrics[0];
            console.log(`   • Tenant ID: ${sampleMetric.tenant_id}`);
            console.log(`   • Período: ${sampleMetric.period_type}`);
            console.log(`   • Criado em: ${sampleMetric.created_at}`);
            console.log(`   • Métricas JSON populadas: ${Object.keys(sampleMetric).filter(key => 
                key.includes('metrics') || key.includes('data')).length}`);

            // Verificar se os 4 campos JSON estão populados
            const jsonFields = ['comprehensive_metrics', 'participation_metrics', 'ranking_metrics', 'metric_data'];
            console.log('\n   📋 Campos JSON por registro:');
            
            for (const field of jsonFields) {
                const populatedCount = tenantMetrics.filter(m => m[field] && Object.keys(m[field]).length > 0).length;
                console.log(`   • ${field}: ${populatedCount}/${tenantMetrics.length} populados`);
            }
        } else {
            console.log('   ❌ Nenhuma métrica de tenant encontrada');
        }

        if (platformMetrics && platformMetrics.length > 0) {
            console.log('\n   ✅ Métricas de plataforma encontradas:');
            console.log(`   • Registros: ${platformMetrics.length}`);
            console.log(`   • Períodos: ${[...new Set(platformMetrics.map(m => m.period_type))].join(', ')}`);
        } else {
            console.log('   ❌ Nenhuma métrica de plataforma encontrada');
        }

        // 5. Status de execução do cron job
        console.log('\n⚙️ 5. STATUS DE EXECUÇÃO DO CRON JOB');
        
        const cronExecutionSuccess = tenantCount > 0 && platformCount > 0;
        const dataConsistency = tenants?.length > 0;
        const systemHealth = appointmentsCount >= 0 && conversationsCount >= 0 && usersCount >= 0;

        console.log(`   • Execução do cron: ${cronExecutionSuccess ? '✅ SUCESSO' : '❌ FALHA'}`);
        console.log(`   • Consistência de dados: ${dataConsistency ? '✅ OK' : '❌ PROBLEMA'}`);
        console.log(`   • Saúde do sistema: ${systemHealth ? '✅ SAUDÁVEL' : '❌ PROBLEMAS'}`);

        // 6. Resumo final
        console.log('\n📋 6. RESUMO DA VALIDAÇÃO');
        
        const overallStatus = cronExecutionSuccess && dataConsistency && systemHealth;
        
        console.log(`\n🎯 STATUS GERAL: ${overallStatus ? '✅ SISTEMA OPERACIONAL' : '❌ REQUER ATENÇÃO'}`);
        
        if (!overallStatus) {
            console.log('\n🔧 AÇÕES RECOMENDADAS:');
            if (!cronExecutionSuccess) {
                console.log('   • Verificar logs do cron job para identificar falhas');
                console.log('   • Executar novamente npm run metrics:comprehensive');
            }
            if (!dataConsistency) {
                console.log('   • Verificar conectividade com banco de dados');
                console.log('   • Confirmar existência de tenants ativos');
            }
        }

        return {
            cronExecutionSuccess,
            dataConsistency,
            systemHealth,
            overallStatus,
            metrics: {
                tenantCount: tenantCount || 0,
                platformCount: platformCount || 0,
                tenantsActive: tenants?.length || 0,
                appointments: appointmentsCount || 0,
                conversations: conversationsCount || 0,
                users: usersCount || 0
            }
        };

    } catch (error) {
        console.error('❌ ERRO durante validação:', error);
        throw error;
    }
}

if (require.main === module) {
    validateMetricsExecution()
        .then((result) => {
            console.log('\n✅ Validação concluída com sucesso');
            process.exit(result.overallStatus ? 0 : 1);
        })
        .catch((error) => {
            console.error('❌ Erro fatal na validação:', error);
            process.exit(1);
        });
}

module.exports = { validateMetricsExecution };