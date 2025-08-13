require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function analisarEstruturaDados() {
    console.log('🔍 ANALISANDO ESTRUTURA PARA POPULAR DADOS REAIS');
    console.log('='.repeat(70));
    
    const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    
    try {
        // 1. Buscar tenants reais existentes
        console.log('🏢 VERIFICANDO TENANTS EXISTENTES:');
        const { data: tenants } = await client
            .from('tenants')
            .select('id, name, domain, created_at')
            .order('created_at', { ascending: false });
            
        if (tenants?.length > 0) {
            console.log(`✅ ${tenants.length} tenants encontrados:`);
            tenants.forEach((t, i) => {
                console.log(`   ${i+1}. ${t.name} | ${t.domain} | ${t.id.substring(0,8)}... | ${t.created_at?.substring(0,10)}`);
            });
        } else {
            console.log('❌ Nenhum tenant encontrado!');
            return;
        }
        
        // 2. Verificar estrutura da tabela appointments
        console.log('\n📅 VERIFICANDO TABELA APPOINTMENTS:');
        const { data: appointments, count: aptCount } = await client
            .from('appointments')
            .select('*', { count: 'exact' })
            .limit(1);
            
        console.log(`📊 Total de appointments existentes: ${aptCount || 0}`);
        
        if (appointments?.[0]) {
            console.log('✅ Schema appointments:');
            Object.keys(appointments[0]).forEach(key => {
                console.log(`   - ${key}: ${typeof appointments[0][key]} | ${appointments[0][key]}`);
            });
        } else {
            console.log('⚠️ Tabela appointments vazia ou inexistente');
        }
        
        // 3. Verificar estrutura da tabela conversation_history
        console.log('\n💬 VERIFICANDO TABELA CONVERSATION_HISTORY:');
        const { data: conversations, count: convCount } = await client
            .from('conversation_history')
            .select('*', { count: 'exact' })
            .limit(1);
            
        console.log(`📊 Total de conversations existentes: ${convCount || 0}`);
        
        if (conversations?.[0]) {
            console.log('✅ Schema conversation_history:');
            Object.keys(conversations[0]).forEach(key => {
                console.log(`   - ${key}: ${typeof conversations[0][key]} | ${String(conversations[0][key]).substring(0,50)}...`);
            });
        } else {
            console.log('⚠️ Tabela conversation_history vazia ou inexistente');
        }
        
        // 4. Verificar estado atual das métricas (para comparação)
        console.log('\n📊 VERIFICANDO ESTADO ATUAL DAS MÉTRICAS:');
        const { data: currentMetrics, count: metricsCount } = await client
            .from('tenant_metrics')
            .select('tenant_id, comprehensive_metrics', { count: 'exact' })
            .limit(3);
            
        console.log(`📈 Total de registros de métricas: ${metricsCount || 0}`);
        
        if (currentMetrics?.length > 0) {
            console.log('📋 Amostra de métricas atuais (com dados mock):');
            currentMetrics.forEach((m, i) => {
                const comp = m.comprehensive_metrics || {};
                console.log(`   ${i+1}. Tenant: ${m.tenant_id?.substring(0,8)} | Revenue: R$ ${comp.total_revenue || 0} | Appointments: ${comp.total_appointments || 0}`);
            });
        }
        
        // 5. CONCLUSÃO E PRÓXIMOS PASSOS
        console.log('\n' + '='.repeat(70));
        console.log('🎯 ANÁLISE COMPLETADA - PRÓXIMOS PASSOS:');
        
        if (tenants?.length > 0) {
            console.log(`✅ Sistema pronto para popular dados reais para ${tenants.length} tenants`);
            console.log('📋 Dados necessários:');
            console.log('   1. Appointments por tenant (últimos 90 dias)');
            console.log('   2. Conversations WhatsApp com agendamentos');
            console.log('   3. Preços realísticos por domínio de negócio');
            console.log('   4. Status variados (confirmed, cancelled, completed)');
            
            console.log('\n🚀 PRONTO PARA POPULAR DADOS REAIS!');
        } else {
            console.log('❌ Sistema não tem tenants - impossível popular dados');
        }
        
    } catch (error) {
        console.error('💥 Erro na análise:', error.message);
    }
}

analisarEstruturaDados().then(() => process.exit(0)).catch(console.error);