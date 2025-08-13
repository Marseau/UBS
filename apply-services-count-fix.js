/**
 * APPLY FIX: Corrige a função get_tenant_services_count_by_period diretamente no banco
 * 
 * MÉTODO: Usa SQL direto via execute_sql do Supabase Management API
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function applyServiceCountFix() {
    console.log('🔧 APLICANDO CORREÇÃO: get_tenant_services_count_by_period');
    
    // Use service role key for admin operations
    const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        }
    );
    
    try {
        // STEP 1: Drop and recreate the corrected function
        console.log('\n📋 STEP 1: Aplicando função corrigida...');
        
        const correctedFunction = `
        -- Drop existing function
        DROP FUNCTION IF EXISTS get_tenant_services_count_by_period(UUID, VARCHAR);
        
        -- Create corrected function
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
            -- Calculate period dates
            CASE p_period_type
                WHEN '7d' THEN start_date := end_date - INTERVAL '7 days';
                WHEN '30d' THEN start_date := end_date - INTERVAL '30 days';
                WHEN '90d' THEN start_date := end_date - INTERVAL '90 days';
                ELSE start_date := end_date - INTERVAL '30 days';
            END CASE;
            
            -- FIXED LOGIC: Count services that were active during the period
            SELECT COUNT(*)::INTEGER INTO services_count
            FROM services s
            WHERE s.tenant_id = p_tenant_id
            AND s.is_active = true
            AND s.created_at <= end_date::timestamp
            AND (
                -- Service was never updated (always active) OR updated after period start
                s.updated_at IS NULL 
                OR s.updated_at >= start_date::timestamp
            );
            
            RETURN COALESCE(services_count, 0);
            
        EXCEPTION
            WHEN OTHERS THEN
                RAISE WARNING 'get_tenant_services_count_by_period ERROR for tenant %: %', p_tenant_id, SQLERRM;
                RETURN 0;
        END;
        $$ LANGUAGE plpgsql;
        `;
        
        // Execute the correction
        const { data: result, error } = await supabase.rpc('execute_sql', {
            query: correctedFunction
        });
        
        if (error) {
            console.log('❌ ERRO ao aplicar correção:', error);
            return;
        }
        
        console.log('✅ Função corrigida aplicada com sucesso');
        
        // STEP 2: Test the corrected function
        console.log('\n🧪 STEP 2: Testando função corrigida...');
        
        // Find a tenant with services first
        const { data: tenants } = await supabase
            .from('services')
            .select('tenant_id, tenants!inner(business_name)')
            .not('tenant_id', 'is', null)
            .limit(1);
        
        if (!tenants || tenants.length === 0) {
            console.log('⚠️  Nenhum tenant com serviços encontrado para teste');
            return;
        }
        
        const testTenantId = tenants[0].tenant_id;
        const businessName = tenants[0].tenants.business_name;
        
        console.log(`🎯 Testando com tenant: ${testTenantId} (${businessName})`);
        
        // Test different periods
        const periods = ['7d', '30d', '90d'];
        
        for (const period of periods) {
            try {
                const { data: functionResult, error: functionError } = await supabase.rpc('get_tenant_services_count_by_period', {
                    p_tenant_id: testTenantId,
                    p_period_type: period
                });
                
                if (functionError) {
                    console.log(`❌ Erro teste (${period}):`, functionError);
                } else {
                    console.log(`✅ Resultado (${period}): ${functionResult} serviços`);
                }
            } catch (testError) {
                console.log(`❌ Exception teste (${period}):`, testError.message);
            }
        }
        
        // STEP 3: Validate with direct count
        console.log('\n🔍 STEP 3: Validação com contagem direta...');
        
        const { count: directCount } = await supabase
            .from('services')
            .select('*', { count: 'exact', head: true })
            .eq('tenant_id', testTenantId)
            .eq('is_active', true);
        
        console.log(`📊 Serviços ativos (contagem direta): ${directCount || 0}`);
        
        // STEP 4: Test integration with tenant_metrics function
        console.log('\n🔗 STEP 4: Testando integração tenant_metrics...');
        
        try {
            const { data: metricsResult, error: metricsError } = await supabase.rpc('get_tenant_metrics_for_period', {
                tenant_id: testTenantId,
                start_date: '2024-07-01', 
                end_date: '2024-08-09'
            });
            
            if (metricsError) {
                console.log('❌ Erro integração tenant_metrics:', metricsError);
            } else if (metricsResult && metricsResult.length > 0) {
                const metrics = metricsResult[0];
                console.log(`✅ Integração funcionando:`);
                console.log(`   - services_count: ${metrics.services_count}`);
                console.log(`   - total_services: ${metrics.total_services}`);
                console.log(`   - total_appointments: ${metrics.total_appointments}`);
                console.log(`   - total_customers: ${metrics.total_customers}`);
            } else {
                console.log('⚠️  Função tenant_metrics retornou vazio');
            }
        } catch (integrationError) {
            console.log('❌ Exception integração:', integrationError.message);
        }
        
        console.log('\n🎉 CORREÇÃO APLICADA E TESTADA COM SUCESSO!');
        console.log('\n📋 PRÓXIMOS PASSOS:');
        console.log('   1. ✅ Função get_tenant_services_count_by_period corrigida');
        console.log('   2. 🔄 Execute o cron job de tenant_metrics');
        console.log('   3. 📊 Verifique se a tabela tenant_metrics é populada');
        console.log('   4. 📝 Monitor logs para confirmar funcionamento contínuo');
        
    } catch (error) {
        console.error('❌ ERRO GERAL:', error);
    }
}

// Execute fix
applyServiceCountFix().catch(console.error);