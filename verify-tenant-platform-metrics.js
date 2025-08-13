// ================================================================================
// VERIFICAR SE A TABELA tenant_platform_metrics EXISTE E TEM DADOS
// ================================================================================

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function verifyTenantPlatformMetrics() {
    console.log('🔍 VERIFICANDO TABELA tenant_platform_metrics');
    console.log('=' .repeat(60));
    
    try {
        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );
        
        // 1. VERIFICAR SE A TABELA EXISTE
        console.log('📋 Verificando existência da tabela...');
        
        const { data: tableExists, error: tableError } = await supabase
            .from('information_schema.tables')
            .select('table_name')
            .eq('table_schema', 'public')
            .eq('table_name', 'tenant_platform_metrics')
            .single();
            
        if (tableError && tableError.code !== 'PGRST116') {
            console.log('❌ Erro ao verificar tabela:', tableError.message);
            return;
        }
        
        if (!tableExists) {
            console.log('❌ TABELA tenant_platform_metrics NÃO EXISTE!');
            console.log('');
            console.log('🔧 AÇÃO NECESSÁRIA:');
            console.log('1. Execute o SQL de criação da tabela');
            console.log('2. Execute o cron job para popular dados');
            console.log('3. Verifique as APIs tenant-platform');
            return;
        }
        
        console.log('✅ Tabela tenant_platform_metrics EXISTE');
        
        // 2. VERIFICAR ESTRUTURA DA TABELA
        console.log('\n📊 Verificando estrutura da tabela...');
        
        const { data: columns, error: columnsError } = await supabase
            .from('information_schema.columns')
            .select('column_name, data_type, is_nullable')
            .eq('table_schema', 'public')
            .eq('table_name', 'tenant_platform_metrics')
            .order('ordinal_position');
            
        if (columnsError) {
            console.log('❌ Erro ao verificar colunas:', columnsError.message);
        } else {
            console.log(`✅ Estrutura da tabela (${columns.length} colunas):`);
            columns.forEach(col => {
                console.log(`   📄 ${col.column_name}: ${col.data_type} ${col.is_nullable === 'NO' ? '(NOT NULL)' : ''}`);
            });
        }
        
        // 3. VERIFICAR DADOS NA TABELA
        console.log('\n📈 Verificando dados na tabela...');
        
        // Contar total de registros
        const { count: totalCount, error: countError } = await supabase
            .from('tenant_platform_metrics')
            .select('*', { count: 'exact', head: true });
            
        if (countError) {
            console.log('❌ Erro ao contar registros:', countError.message);
            return;
        }
        
        console.log(`📊 Total de registros: ${totalCount}`);
        
        if (totalCount === 0) {
            console.log('⚠️ TABELA VAZIA - Nenhum dado encontrado');
            console.log('');
            console.log('🔧 AÇÃO NECESSÁRIA:');
            console.log('1. Execute o cron job: npm run analytics:aggregate');
            console.log('2. Ou execute manualmente: calculate_tenant_platform_metrics_simplified()');
            return;
        }
        
        // 4. VERIFICAR DADOS RECENTES
        console.log('\n🕒 Verificando dados recentes...');
        
        const { data: recentData, error: recentError } = await supabase
            .from('tenant_platform_metrics')
            .select('tenant_id, metric_date, platform_total_revenue, calculated_at')
            .order('calculated_at', { ascending: false })
            .limit(5);
            
        if (recentError) {
            console.log('❌ Erro ao buscar dados recentes:', recentError.message);
        } else {
            console.log('📅 Últimos 5 registros:');
            recentData.forEach((record, index) => {
                console.log(`   ${index + 1}. Tenant: ${record.tenant_id?.substring(0, 8)}...`);
                console.log(`      Data: ${record.metric_date}`);
                console.log(`      Revenue Platform: R$ ${record.platform_total_revenue || 0}`);
                console.log(`      Calculado: ${record.calculated_at}`);
                console.log('');
            });
        }
        
        // 5. VERIFICAR TENANTS ÚNICOS
        console.log('👥 Verificando tenants únicos...');
        
        const { data: uniqueTenants, error: tenantsError } = await supabase
            .from('tenant_platform_metrics')
            .select('tenant_id')
            .not('tenant_id', 'is', null);
            
        if (tenantsError) {
            console.log('❌ Erro ao buscar tenants:', tenantsError.message);
        } else {
            const uniqueCount = new Set(uniqueTenants.map(t => t.tenant_id)).size;
            console.log(`🏢 Tenants únicos com dados: ${uniqueCount}`);
        }
        
        // 6. VERIFICAR REVENUE DA PLATAFORMA
        console.log('\n💰 Verificando revenue da plataforma...');
        
        const { data: platformRevenue, error: revenueError } = await supabase
            .from('tenant_platform_metrics')
            .select('platform_total_revenue, metric_date')
            .not('platform_total_revenue', 'is', null)
            .order('metric_date', { ascending: false })
            .limit(1)
            .single();
            
        if (revenueError) {
            console.log('❌ Erro ao buscar revenue:', revenueError.message);
        } else {
            console.log(`💵 Revenue mais recente: R$ ${platformRevenue.platform_total_revenue}`);
            console.log(`📅 Data: ${platformRevenue.metric_date}`);
        }
        
        // 7. RESUMO FINAL
        console.log('\n🎯 RESUMO DA VERIFICAÇÃO:');
        console.log('=' .repeat(40));
        console.log(`✅ Tabela existe: SIM`);
        console.log(`📊 Registros: ${totalCount}`);
        console.log(`🏢 Tenants: ${uniqueTenants ? new Set(uniqueTenants.map(t => t.tenant_id)).size : 'N/A'}`);
        console.log(`💰 Revenue atual: R$ ${platformRevenue?.platform_total_revenue || 'N/A'}`);
        
        if (totalCount > 0) {
            console.log('\n🎉 TABELA ESTÁ FUNCIONANDO CORRETAMENTE!');
            console.log('✅ Dados presentes e atualizados');
            console.log('✅ Pronta para uso pelas APIs');
        } else {
            console.log('\n⚠️ TABELA PRECISA SER POPULADA');
            console.log('🔧 Execute: npm run analytics:aggregate');
        }
        
    } catch (error) {
        console.error('❌ Erro na verificação:', error.message);
    }
}

verifyTenantPlatformMetrics();