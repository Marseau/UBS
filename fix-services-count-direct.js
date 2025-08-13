/**
 * FIX DIRETO: Aplica correção via conexão direta do sistema
 */

const { getAdminClient } = require('./dist/config/database.js');

async function applyDirectFix() {
    console.log('🔧 CORREÇÃO DIRETA: get_tenant_services_count_by_period');
    
    const client = getAdminClient();
    
    try {
        // STEP 1: Test current function with a real tenant
        console.log('\n📋 STEP 1: Testando função atual...');
        
        // Get a tenant with services
        const { data: servicesData } = await client
            .from('services')
            .select('tenant_id, tenants!inner(business_name)')
            .eq('is_active', true)
            .limit(1);
            
        if (!servicesData || servicesData.length === 0) {
            console.log('❌ Nenhum serviço ativo encontrado');
            return;
        }
        
        const testTenantId = servicesData[0].tenant_id;
        const businessName = servicesData[0].tenants.business_name;
        
        console.log(`🎯 Tenant teste: ${testTenantId} (${businessName})`);
        
        // Test current function
        console.log('\n🧪 STEP 2: Testando função ANTES da correção...');
        
        let beforeResult = 0;
        try {
            const { data: result, error: beforeError } = await client.rpc('get_tenant_services_count_by_period', {
                p_tenant_id: testTenantId,
                p_period_type: '30d'
            });
            
            beforeResult = result || 0;
            console.log(`📊 Resultado ANTES: ${beforeResult} (erro: ${beforeError ? beforeError.message : 'nenhum'})`);
        } catch (e) {
            console.log(`📊 Resultado ANTES: ERRO - ${e.message}`);
        }
        
        // Get actual count for comparison
        const { count: actualCount } = await client
            .from('services')
            .select('*', { count: 'exact', head: true })
            .eq('tenant_id', testTenantId)
            .eq('is_active', true);
            
        console.log(`📊 Contagem real de serviços ativos: ${actualCount || 0}`);
        
        // STEP 3: Manual fix - create corrected version
        console.log('\n🔧 STEP 3: Implementando correção manual...');
        
        // Test the corrected logic manually
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const { data: manualCount } = await client
            .from('services')
            .select('*')
            .eq('tenant_id', testTenantId)
            .eq('is_active', true)
            .lte('created_at', new Date().toISOString())
            .or(`updated_at.is.null,updated_at.gte.${thirtyDaysAgo.toISOString()}`);
            
        console.log(`📊 Resultado com lógica CORRIGIDA: ${manualCount?.length || 0}`);
        
        // STEP 4: Try to apply fix using raw SQL (if possible)
        console.log('\n🔧 STEP 4: Tentando aplicar correção SQL...');
        
        const fixSQL = `
        DROP FUNCTION IF EXISTS get_tenant_services_count_by_period(UUID, VARCHAR);
        
        CREATE OR REPLACE FUNCTION get_tenant_services_count_by_period(
            p_tenant_id UUID,
            p_period_type VARCHAR(10) DEFAULT '30d'
        )
        RETURNS INTEGER AS $$
        DECLARE
            start_date DATE;
            end_date DATE := CURRENT_DATE;
            services_count INTEGER := 0;
        BEGIN
            CASE p_period_type
                WHEN '7d' THEN start_date := end_date - INTERVAL '7 days';
                WHEN '30d' THEN start_date := end_date - INTERVAL '30 days';
                WHEN '90d' THEN start_date := end_date - INTERVAL '90 days';
                ELSE start_date := end_date - INTERVAL '30 days';
            END CASE;
            
            SELECT COUNT(*)::INTEGER INTO services_count
            FROM services s
            WHERE s.tenant_id = p_tenant_id
            AND s.is_active = true
            AND s.created_at <= end_date::timestamp
            AND (
                s.updated_at IS NULL 
                OR s.updated_at >= start_date::timestamp
            );
            
            RETURN COALESCE(services_count, 0);
            
        EXCEPTION
            WHEN OTHERS THEN
                RAISE WARNING 'get_tenant_services_count_by_period ERROR: %', SQLERRM;
                RETURN 0;
        END;
        $$ LANGUAGE plpgsql;
        `;
        
        // Write fix to file for manual execution
        require('fs').writeFileSync('./EXECUTE-THIS-FIX.sql', fixSQL);
        console.log('✅ SQL de correção salvo em: EXECUTE-THIS-FIX.sql');
        
        // STEP 5: Recommendations
        console.log('\n📋 RESULTADO DA ANÁLISE:');
        console.log(`   - Serviços ativos (função atual): ${beforeResult || 'ERRO'}`);
        console.log(`   - Serviços ativos (contagem real): ${actualCount || 0}`);  
        console.log(`   - Serviços ativos (lógica corrigida): ${manualCount?.length || 0}`);
        
        if ((beforeResult || 0) !== (manualCount?.length || 0)) {
            console.log('\n❌ CONFIRMADO: A função está retornando valor INCORRETO!');
            console.log('\n🔧 AÇÕES NECESSÁRIAS:');
            console.log('   1. Execute o SQL em EXECUTE-THIS-FIX.sql no Supabase Dashboard');
            console.log('   2. Ou aplique a correção via pgAdmin/psql');
            console.log('   3. Teste novamente para confirmar correção');
            console.log('   4. Execute cron job tenant_metrics para popular tabela');
        } else {
            console.log('\n✅ Função parece estar funcionando corretamente');
        }
        
    } catch (error) {
        console.error('❌ ERRO:', error);
    }
}

applyDirectFix().catch(console.error);