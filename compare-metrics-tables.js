const { getAdminClient } = require('./dist/config/database.js');

async function compareMetricsTables() {
    console.log('🔍 COMPARAÇÃO DETALHADA: tenant_platform_metrics VS platform_metrics');
    console.log('=' .repeat(80));
    
    const client = getAdminClient();
    
    try {
        // 1. ANÁLISE DA ESTRUTURA DAS TABELAS
        console.log('\n📊 1. ESTRUTURAS DAS TABELAS:');
        console.log('-' .repeat(50));
        
        // tenant_platform_metrics
        const { data: tpmSample } = await client
            .from('tenant_platform_metrics')
            .select('*')
            .limit(1);
        
        console.log('\n🏢 TENANT_PLATFORM_METRICS:');
        if (tpmSample && tpmSample[0]) {
            const tpmColumns = Object.keys(tpmSample[0]);
            console.log(`   📋 Total de colunas: ${tpmColumns.length}`);
            console.log('   📋 Estrutura:');
            
            // Categorizar colunas
            const categories = {
                'Identificação': [],
                'Receita': [],
                'Agendamentos': [], 
                'Clientes': [],
                'IA': [],
                'Ranking': [],
                'Business Intelligence': [],
                'Timestamps': [],
                'Outros': []
            };
            
            tpmColumns.forEach(col => {
                const lower = col.toLowerCase();
                if (col.includes('id') || col.includes('tenant')) {
                    categories['Identificação'].push(col);
                } else if (lower.includes('revenue') || lower.includes('mrr')) {
                    categories['Receita'].push(col);
                } else if (lower.includes('appointment')) {
                    categories['Agendamentos'].push(col);
                } else if (lower.includes('customer')) {
                    categories['Clientes'].push(col);
                } else if (lower.includes('ai') || lower.includes('interaction')) {
                    categories['IA'].push(col);
                } else if (lower.includes('ranking') || lower.includes('position')) {
                    categories['Ranking'].push(col);
                } else if (lower.includes('risk') || lower.includes('efficiency') || lower.includes('conversion')) {
                    categories['Business Intelligence'].push(col);
                } else if (lower.includes('at') || lower.includes('date')) {
                    categories['Timestamps'].push(col);
                } else {
                    categories['Outros'].push(col);
                }
            });
            
            Object.entries(categories).forEach(([category, cols]) => {
                if (cols.length > 0) {
                    console.log(`      ${category}: ${cols.join(', ')}`);
                }
            });
        }
        
        // platform_metrics
        const { data: pmSample } = await client
            .from('platform_metrics')
            .select('*')
            .limit(1);
        
        console.log('\n🌍 PLATFORM_METRICS:');
        if (pmSample && pmSample[0]) {
            const pmColumns = Object.keys(pmSample[0]);
            console.log(`   📋 Total de colunas: ${pmColumns.length}`);
            console.log('   📋 Estrutura:');
            
            // Categorizar colunas
            const categories = {
                'Identificação': [],
                'Receita': [],
                'Agendamentos': [], 
                'Clientes': [],
                'IA': [],
                'Chat/Comunicação': [],
                'Timestamps': [],
                'Outros': []
            };
            
            pmColumns.forEach(col => {
                const lower = col.toLowerCase();
                if (col.includes('id') || col.includes('tenant')) {
                    categories['Identificação'].push(col);
                } else if (lower.includes('revenue') || lower.includes('mrr')) {
                    categories['Receita'].push(col);
                } else if (lower.includes('appointment') || lower.includes('cancellation') || lower.includes('reschedule')) {
                    categories['Agendamentos'].push(col);
                } else if (lower.includes('customer')) {
                    categories['Clientes'].push(col);
                } else if (lower.includes('ai') || lower.includes('interaction') || lower.includes('response')) {
                    categories['IA'].push(col);
                } else if (lower.includes('chat') || lower.includes('spam') || lower.includes('time')) {
                    categories['Chat/Comunicação'].push(col);
                } else if (lower.includes('at') || lower.includes('date')) {
                    categories['Timestamps'].push(col);
                } else {
                    categories['Outros'].push(col);
                }
            });
            
            Object.entries(categories).forEach(([category, cols]) => {
                if (cols.length > 0) {
                    console.log(`      ${category}: ${cols.join(', ')}`);
                }
            });
        }
        
        // 2. COMPARAÇÃO DE DADOS
        console.log('\n📈 2. COMPARAÇÃO DE DADOS:');
        console.log('-' .repeat(50));
        
        // tenant_platform_metrics - dados agregados
        const { data: tpmData } = await client
            .from('tenant_platform_metrics')
            .select('*')
            .order('created_at', { ascending: false });
        
        console.log('\n🏢 TENANT_PLATFORM_METRICS (todos os registros):');
        console.log(`   📋 Total registros: ${tpmData?.length || 0}`);
        
        if (tpmData && tpmData.length > 0) {
            // Mostrar resumo por data
            const byDate = {};
            tpmData.forEach(record => {
                const date = record.metric_date;
                if (!byDate[date]) {
                    byDate[date] = {
                        tenants: 0,
                        totalRevenue: 0,
                        platformRevenue: record.platform_total_revenue,
                        platformAppointments: record.platform_total_appointments,
                        platformCustomers: record.platform_total_customers
                    };
                }
                byDate[date].tenants++;
                byDate[date].totalRevenue += record.revenue_participation_value || 0;
            });
            
            Object.entries(byDate).forEach(([date, summary]) => {
                console.log(`   📅 ${date}:`);
                console.log(`      🏢 Tenants: ${summary.tenants}`);
                console.log(`      💰 Receita soma tenants: R$ ${summary.totalRevenue.toLocaleString('pt-BR')}`);
                console.log(`      🌍 Receita plataforma (campo): R$ ${summary.platformRevenue?.toLocaleString('pt-BR') || 0}`);
                console.log(`      📅 Agendamentos plataforma: ${summary.platformAppointments || 0}`);
                console.log(`      👤 Clientes plataforma: ${summary.platformCustomers || 0}`);
            });
        }
        
        // platform_metrics - dados diretos
        const { data: pmData } = await client
            .from('platform_metrics')
            .select('*')
            .order('created_at', { ascending: false });
        
        console.log('\n🌍 PLATFORM_METRICS (todos os registros):');
        console.log(`   📋 Total registros: ${pmData?.length || 0}`);
        
        if (pmData && pmData.length > 0) {
            pmData.forEach((record, i) => {
                console.log(`   📅 ${record.metric_date} (registro ${i + 1}):`);
                console.log(`      💰 Total MRR: R$ ${record.total_mrr?.toLocaleString('pt-BR') || 0}`);
                console.log(`      💵 Total Revenue: R$ ${record.total_revenue?.toLocaleString('pt-BR') || 0}`);
                console.log(`      📅 Total Appointments: ${record.total_appointments || 0}`);
                console.log(`      👤 Total Customers: ${record.total_customers || 0}`);
                console.log(`      🏢 Total Tenants: ${record.total_tenants || 0}`);
                console.log(`      🤖 AI Interactions: ${record.total_ai_interactions || 0}`);
                if (record.total_chat_time_minutes) {
                    console.log(`      💬 Chat Time: ${record.total_chat_time_minutes} min`);
                }
            });
        }
        
        // 3. SUBSCRIPTION_PAYMENTS para contexto
        console.log('\n💳 3. SUBSCRIPTION_PAYMENTS (fonte de receita real):');
        console.log('-' .repeat(50));
        
        const { data: payments, error: paymentsError } = await client
            .from('subscription_payments')
            .select('*')
            .eq('payment_status', 'completed')
            .order('payment_date', { ascending: false });
        
        if (!paymentsError && payments) {
            console.log(`   📋 Total pagamentos completos: ${payments.length}`);
            
            const totalReceita = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
            console.log(`   💰 Receita total real: R$ ${totalReceita.toLocaleString('pt-BR')}`);
            
            // Por tenant
            const byTenant = {};
            payments.forEach(p => {
                if (!byTenant[p.tenant_id]) {
                    byTenant[p.tenant_id] = { count: 0, total: 0 };
                }
                byTenant[p.tenant_id].count++;
                byTenant[p.tenant_id].total += p.amount || 0;
            });
            
            console.log(`   🏢 Tenants com pagamentos: ${Object.keys(byTenant).length}`);
            Object.entries(byTenant).forEach(([tenantId, data]) => {
                console.log(`      ${tenantId.slice(-8)}: ${data.count} pagamentos, R$ ${data.total.toLocaleString('pt-BR')}`);
            });
        }
        
        // 4. ANÁLISE COMPARATIVA
        console.log('\n🔍 4. ANÁLISE COMPARATIVA:');
        console.log('-' .repeat(50));
        
        console.log('\n📊 COMPLETUDE DAS TABELAS:');
        console.log('✅ tenant_platform_metrics:');
        console.log('   • Métricas por tenant (granular)');
        console.log('   • Participação percentual');
        console.log('   • Ranking e posicionamento');
        console.log('   • Business Intelligence (risk, efficiency)');
        console.log('   • Campos de plataforma duplicados em cada registro');
        
        console.log('\n✅ platform_metrics:');
        console.log('   • Métricas agregadas da plataforma');
        console.log('   • Dados de chat e comunicação');
        console.log('   • Dados de spam e qualidade');
        console.log('   • Estrutura mais limpa (sem duplicação)');
        console.log('   • Campos específicos de IA e chat');
        
        console.log('\n🎯 RECOMENDAÇÃO:');
        console.log('📋 Use tenant_platform_metrics para métricas de tenant');
        console.log('📋 Use platform_metrics para métricas agregadas da plataforma');
        console.log('📋 Elimine duplicação de dados de plataforma em tenant_platform_metrics');
        console.log('📋 Mantenha subscription_payments como fonte da verdade para receita');
        
    } catch (error) {
        console.error('❌ Erro na comparação:', error.message);
    }
}

compareMetricsTables();