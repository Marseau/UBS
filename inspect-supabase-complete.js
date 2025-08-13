const { getAdminClient } = require('./dist/config/database.js');

async function inspectSupabaseComplete() {
    console.log('🔍 INSPEÇÃO COMPLETA DO SUPABASE - DUPLICAÇÕES E CONFLITOS');
    console.log('=' .repeat(80));
    
    const client = getAdminClient();
    
    try {
        // 1. TABELAS RELACIONADAS A MÉTRICAS
        console.log('\n📊 1. TABELAS DE MÉTRICAS:');
        console.log('-' .repeat(50));
        
        const metricsTables = [
            'tenant_platform_metrics',
            'platform_metrics',
            'platform_daily_aggregates',
            'tenant_metrics', 
            'subscription_payments',
            'saas_metrics',
            'business_metrics'
        ];
        
        for (const table of metricsTables) {
            try {
                const { data, error, count } = await client
                    .from(table)
                    .select('*', { count: 'exact', head: true });
                
                if (error) {
                    console.log(`❌ ${table}: NÃO EXISTE (${error.message})`);
                } else {
                    console.log(`✅ ${table}: ${count || 0} registros`);
                    
                    // Se tem dados, mostrar sample
                    if (count > 0) {
                        const { data: sample } = await client
                            .from(table)
                            .select('*')
                            .limit(1);
                        
                        if (sample && sample[0]) {
                            const columns = Object.keys(sample[0]);
                            console.log(`   📋 Colunas: ${columns.join(', ')}`);
                            
                            // Procurar por campos de receita
                            const revenueFields = columns.filter(col => 
                                col.includes('revenue') || col.includes('total') || col.includes('mrr')
                            );
                            if (revenueFields.length > 0) {
                                console.log(`   💰 Campos de receita: ${revenueFields.join(', ')}`);
                            }
                        }
                    }
                }
            } catch (err) {
                console.log(`❌ ${table}: ERRO - ${err.message}`);
            }
        }
        
        // 2. FUNÇÕES SQL RELACIONADAS A MÉTRICAS
        console.log('\n🔧 2. FUNÇÕES SQL:');
        console.log('-' .repeat(50));
        
        const functions = [
            'get_platform_metrics',
            'get_platform_metrics_complete',
            'get_platform_metrics_with_comparisons',
            'get_tenant_metrics',
            'get_tenant_metrics_for_period',
            'get_saas_metrics',
            'calculate_platform_metrics',
            'calculate_platform_metrics_complete',
            'calculate_tenant_platform_metrics',
            'calculate_tenant_platform_metrics_simplified',
            'update_platform_metrics',
            'update_platform_metrics_complete'
        ];
        
        for (const funcName of functions) {
            try {
                const { data, error } = await client.rpc(funcName);
                if (error) {
                    if (error.message.includes('does not exist')) {
                        console.log(`❌ ${funcName}: NÃO EXISTE`);
                    } else {
                        console.log(`⚠️  ${funcName}: EXISTE mas com erro - ${error.message.slice(0, 60)}...`);
                    }
                } else {
                    console.log(`✅ ${funcName}: FUNCIONANDO`);
                }
            } catch (err) {
                console.log(`❌ ${funcName}: ERRO - ${err.message.slice(0, 60)}...`);
            }
        }
        
        // 3. VERIFICAR DADOS ESPECÍFICOS NAS TABELAS QUE EXISTEM
        console.log('\n📈 3. ANÁLISE DETALHADA DAS TABELAS EXISTENTES:');
        console.log('-' .repeat(50));
        
        // tenant_platform_metrics
        try {
            const { data: tpm, error: tpmError } = await client
                .from('tenant_platform_metrics')
                .select('*')
                .limit(3);
            
            if (!tpmError && tpm && tpm.length > 0) {
                console.log('\n📊 TENANT_PLATFORM_METRICS:');
                console.log(`   📋 Registros: ${tpm.length} (mostrando primeiros 3)`);
                tpm.forEach((record, i) => {
                    console.log(`   ${i+1}. Tenant: ${record.tenant_id?.slice(-8) || 'N/A'}`);
                    console.log(`      Data: ${record.metric_date || 'N/A'}`);
                    console.log(`      Receita tenant: ${record.revenue_participation_value || 0}`);
                    console.log(`      Receita plataforma: ${record.platform_total_revenue || 0}`);
                    console.log(`      Agendamentos: ${record.platform_total_appointments || 0}`);
                });
            }
        } catch (err) {
            console.log('❌ Erro analisando tenant_platform_metrics:', err.message);
        }
        
        // platform_metrics (se existir)
        try {
            const { data: pm, error: pmError } = await client
                .from('platform_metrics')
                .select('*')
                .limit(3);
            
            if (!pmError && pm && pm.length > 0) {
                console.log('\n📊 PLATFORM_METRICS:');
                console.log(`   📋 Registros: ${pm.length} (mostrando primeiros 3)`);
                pm.forEach((record, i) => {
                    console.log(`   ${i+1}. Data: ${record.metric_date || 'N/A'}`);
                    console.log(`      Receita total: ${record.total_revenue || record.total_mrr || 0}`);
                    console.log(`      Agendamentos: ${record.total_appointments || 0}`);
                    console.log(`      Clientes: ${record.total_customers || 0}`);
                });
            }
        } catch (err) {
            console.log('❌ Erro analisando platform_metrics:', err.message);
        }
        
        // 4. TESTAR FUNÇÕES QUE FUNCIONAM
        console.log('\n🧪 4. TESTE DAS FUNÇÕES FUNCIONAIS:');
        console.log('-' .repeat(50));
        
        // Testar get_platform_metrics
        try {
            const { data: platformData, error: platformError } = await client
                .rpc('get_platform_metrics', { p_period_days: 30 });
            
            if (!platformError && platformData && platformData[0]) {
                console.log('\n📊 get_platform_metrics(30):');
                const metrics = platformData[0];
                console.log(`   💰 Total Revenue: ${metrics.total_revenue}`);
                console.log(`   📅 Total Appointments: ${metrics.total_appointments}`);
                console.log(`   👤 Total Customers: ${metrics.total_customers}`);
                console.log(`   🤖 Total AI: ${metrics.total_ai_interactions}`);
                console.log(`   🏢 Active Tenants: ${metrics.total_active_tenants}`);
            }
        } catch (err) {
            console.log('❌ Erro testando get_platform_metrics:', err.message);
        }
        
        // 5. VERIFICAR CRON JOBS OU TRIGGERS
        console.log('\n⏰ 5. VERIFICAÇÃO DE AUTOMAÇÕES:');
        console.log('-' .repeat(50));
        
        try {
            // Verificar se há triggers ou procedures relacionados
            const { data: triggers, error: triggersError } = await client
                .from('information_schema.triggers')
                .select('*')
                .ilike('trigger_name', '%metric%');
            
            if (!triggersError && triggers && triggers.length > 0) {
                console.log(`✅ Triggers encontrados: ${triggers.length}`);
                triggers.forEach(trigger => {
                    console.log(`   📋 ${trigger.trigger_name} em ${trigger.event_object_table}`);
                });
            } else {
                console.log('❌ Nenhum trigger relacionado a métricas encontrado');
            }
        } catch (err) {
            console.log('⚠️  Não foi possível verificar triggers:', err.message);
        }
        
        // 6. RESUMO E DIAGNÓSTICO
        console.log('\n📋 6. DIAGNÓSTICO FINAL:');
        console.log('-' .repeat(50));
        console.log('✅ Análise completa realizada');
        console.log('🔍 Verifique os resultados acima para identificar:');
        console.log('   • Tabelas duplicadas');
        console.log('   • Funções conflitantes');
        console.log('   • Dados inconsistentes');
        console.log('   • Automações sobrepostas');
        
    } catch (error) {
        console.error('❌ Erro na inspeção:', error.message);
    }
}

inspectSupabaseComplete();