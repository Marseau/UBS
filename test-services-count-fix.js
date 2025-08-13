/**
 * TEST SCRIPT: Validate get_tenant_services_count_by_period Fix
 * 
 * OBJETIVO: Verificar se a correção resolve o problema do cron job
 * MÉTODO: Testar função antes/depois da correção
 */

const { getAdminClient } = require('./dist/config/database.js');

async function testServicesCountFunction() {
    console.log('🔍 TESTE: Validando correção da função get_tenant_services_count_by_period');
    
    const client = getAdminClient();
    
    try {
        // STEP 1: Get a sample tenant with services
        console.log('\n📋 STEP 1: Buscando tenant com serviços...');
        
        const { data: tenantWithServices } = await client
            .from('services')
            .select('tenant_id, tenants(business_name)')
            .not('tenant_id', 'is', null)
            .limit(1)
            .single();
        
        if (!tenantWithServices) {
            console.log('❌ ERRO: Nenhum tenant com serviços encontrado');
            return;
        }
        
        const tenantId = tenantWithServices.tenant_id;
        const businessName = tenantWithServices.tenants?.business_name || 'Desconhecido';
        
        console.log(`✅ Tenant selecionado: ${tenantId} (${businessName})`);
        
        // STEP 2: Apply the fix
        console.log('\n🔧 STEP 2: Aplicando correção da função...');
        
        const fixSQL = `
        -- Apply the corrected function
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
            tenant_exists BOOLEAN := false;
        BEGIN
            -- Validate tenant exists
            SELECT EXISTS(SELECT 1 FROM tenants WHERE id = p_tenant_id AND status = 'active') 
            INTO tenant_exists;
            
            IF NOT tenant_exists THEN
                RAISE WARNING 'TENANT_SERVICES_COUNT: Tenant % not found or inactive', p_tenant_id;
                RETURN 0;
            END IF;
            
            -- Calculate period dates
            CASE p_period_type
                WHEN '7d' THEN start_date := end_date - INTERVAL '7 days';
                WHEN '30d' THEN start_date := end_date - INTERVAL '30 days';
                WHEN '90d' THEN start_date := end_date - INTERVAL '90 days';
                ELSE start_date := end_date - INTERVAL '30 days';
            END CASE;
            
            -- FIXED LOGIC: Count services active during period
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
                RAISE WARNING 'TENANT_SERVICES_COUNT ERROR for tenant %: %', p_tenant_id, SQLERRM;
                RETURN 0;
        END;
        $$ LANGUAGE plpgsql;
        `;
        
        const { error: sqlError } = await client.rpc('exec', { query: fixSQL });
        
        if (sqlError) {
            console.log('❌ ERRO aplicando correção:', sqlError);
            return;
        }
        
        console.log('✅ Correção aplicada com sucesso');
        
        // STEP 3: Test the corrected function
        console.log('\n🧪 STEP 3: Testando função corrigida...');
        
        const periods = ['7d', '30d', '90d'];
        
        for (const period of periods) {
            try {
                const { data: result, error } = await client.rpc('get_tenant_services_count_by_period', {
                    p_tenant_id: tenantId,
                    p_period_type: period
                });
                
                if (error) {
                    console.log(`❌ ERRO (${period}):`, error);
                } else {
                    console.log(`✅ Resultado (${period}): ${result} serviços`);
                }
            } catch (funcError) {
                console.log(`❌ EXCEPTION (${period}):`, funcError.message);
            }
        }
        
        // STEP 4: Compare with direct query
        console.log('\n🔍 STEP 4: Comparando com query direta...');
        
        const { data: directCount } = await client
            .from('services')
            .select('*', { count: 'exact', head: true })
            .eq('tenant_id', tenantId)
            .eq('is_active', true);
        
        console.log(`📊 Total serviços ativos (query direta): ${directCount.length || directCount.count || 0}`);
        
        // STEP 5: Test tenant_metrics integration
        console.log('\n🔗 STEP 5: Testando integração com tenant_metrics...');
        
        try {
            const { data: metricsResult, error: metricsError } = await client.rpc('get_tenant_metrics_for_period', {
                tenant_id: tenantId,
                start_date: '2024-07-01',
                end_date: '2024-08-09'
            });
            
            if (metricsError) {
                console.log('❌ ERRO na integração:', metricsError);
            } else if (metricsResult?.[0]) {
                const metrics = metricsResult[0];
                console.log(`✅ Integração funcionando:`);
                console.log(`   - services_count: ${metrics.services_count}`);
                console.log(`   - total_services: ${metrics.total_services}`);
                console.log(`   - total_appointments: ${metrics.total_appointments}`);
            } else {
                console.log('⚠️  Nenhuma métrica retornada');
            }
        } catch (integrationError) {
            console.log('❌ ERRO na integração:', integrationError.message);
        }
        
        console.log('\n🎉 TESTE CONCLUÍDO');
        console.log('📋 PRÓXIMOS PASSOS:');
        console.log('   1. Execute o cron job de tenant_metrics');
        console.log('   2. Verifique se dados são populados na tabela');
        console.log('   3. Monitor logs para confirmar funcionamento');
        
    } catch (error) {
        console.error('❌ ERRO GERAL:', error);
    }
}

// Execute test
testServicesCountFunction().catch(console.error);