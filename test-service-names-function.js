/**
 * TEST: Verificar se existe função para retornar nomes de serviços
 * 
 * PROBLEMA IDENTIFICADO:
 * 1. calculate_services_available() retorna apenas count, não lista de nomes (linha 103 comentário)
 * 2. get_tenant_metrics_for_period() deveria retornar services TEXT[] mas pode estar quebrada
 * 3. Inconsistência entre start_time vs created_at em filtros
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function testServiceNamesFunctions() {
    console.log('🔍 TESTANDO FUNÇÕES DE NOMES DE SERVIÇOS');
    
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
        // STEP 1: Get a tenant with services
        console.log('\n📋 STEP 1: Buscando tenant com serviços...');
        const { data: tenants, error: tenantsError } = await supabase
            .from('tenants')
            .select('id, name')
            .eq('status', 'active')
            .limit(1);

        if (tenantsError) throw tenantsError;
        if (!tenants || tenants.length === 0) {
            console.log('❌ Nenhum tenant ativo encontrado');
            return;
        }

        const testTenant = tenants[0];
        console.log(`✅ Tenant selecionado: ${testTenant.name} (${testTenant.id})`);

        // STEP 2: Check what services exist for this tenant
        console.log('\n📋 STEP 2: Verificando serviços do tenant...');
        const { data: services, error: servicesError } = await supabase
            .from('services')
            .select('id, name, is_active, created_at')
            .eq('tenant_id', testTenant.id)
            .order('created_at', { ascending: false });

        if (servicesError) throw servicesError;
        
        console.log(`📊 Serviços encontrados: ${services?.length || 0}`);
        if (services && services.length > 0) {
            console.log('   Serviços:');
            services.forEach((service, index) => {
                console.log(`   ${index + 1}. ${service.name} (${service.is_active ? 'ativo' : 'inativo'})`);
            });
        }

        // STEP 3: Test calculate_services_available function
        console.log('\n📋 STEP 3: Testando calculate_services_available...');
        const { data: servicesAvailable, error: servicesAvailableError } = await supabase
            .rpc('calculate_services_available', {
                p_tenant_id: testTenant.id,
                p_start_date: '2024-01-01',
                p_end_date: '2025-12-31'
            });

        if (servicesAvailableError) {
            console.log('❌ Erro em calculate_services_available:', servicesAvailableError);
        } else {
            console.log('✅ calculate_services_available resultado:', servicesAvailable);
            if (servicesAvailable && servicesAvailable[0]) {
                console.log('   - services array:', servicesAvailable[0].services);
                console.log('   - count:', servicesAvailable[0].count);
                
                if (servicesAvailable[0].services.length === 0 && servicesAvailable[0].count > 0) {
                    console.log('🚨 PROBLEMA: count > 0 mas services array vazio!');
                }
            }
        }

        // STEP 4: Test get_tenant_metrics_for_period function for services array
        console.log('\n📋 STEP 4: Testando get_tenant_metrics_for_period para services...');
        const { data: metricsData, error: metricsError } = await supabase
            .rpc('get_tenant_metrics_for_period', {
                tenant_id: testTenant.id,
                start_date: '2024-01-01',
                end_date: '2025-12-31'
            });

        if (metricsError) {
            console.log('❌ Erro em get_tenant_metrics_for_period:', metricsError);
        } else {
            console.log('✅ get_tenant_metrics_for_period resultado parcial:');
            if (metricsData && metricsData[0]) {
                console.log('   - services_count:', metricsData[0].services_count);
                console.log('   - services array:', metricsData[0].services);
                console.log('   - total_services:', metricsData[0].total_services);
                console.log('   - most_popular_service:', metricsData[0].most_popular_service);
                
                if (!metricsData[0].services || metricsData[0].services.length === 0) {
                    if (metricsData[0].services_count > 0 || metricsData[0].total_services > 0) {
                        console.log('🚨 PROBLEMA: services array vazio mas count > 0!');
                        console.log('🔧 POSSÍVEL CAUSA: Inconsistência entre start_time vs created_at');
                    }
                }
            }
        }

        // STEP 5: Test direct query to see what service names should be returned
        console.log('\n📋 STEP 5: Query direta para verificar nomes de serviços...');
        const { data: directServices, error: directError } = await supabase
            .from('services')
            .select('name')
            .eq('tenant_id', testTenant.id)
            .eq('is_active', true);

        if (directError) {
            console.log('❌ Erro na query direta:', directError);
        } else {
            console.log('✅ Nomes de serviços (query direta):');
            const serviceNames = directServices?.map(s => s.name) || [];
            console.log('   Service names array:', serviceNames);
            
            if (serviceNames.length > 0) {
                console.log('\n💡 ESPERADO: As funções deveriam retornar estes nomes!');
            }
        }

        // STEP 6: Check if we need to create a missing function
        console.log('\n📋 STEP 6: Verificando se função get_tenant_services_names existe...');
        const { error: functionTestError } = await supabase
            .rpc('get_tenant_services_names', { p_tenant_id: testTenant.id });

        if (functionTestError) {
            console.log('❌ Função get_tenant_services_names NÃO EXISTE:', functionTestError.message);
            console.log('💡 SOLUÇÃO: Precisa criar função para retornar array de nomes!');
        } else {
            console.log('✅ Função get_tenant_services_names existe (inesperado)');
        }

    } catch (error) {
        console.error('❌ Erro durante teste:', error);
    }
}

testServiceNamesFunctions().catch(console.error);