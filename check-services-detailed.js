/**
 * VERIFICAÇÃO DETALHADA: services_available nas métricas
 */

async function checkServicesDetailed() {
    console.log('🔍 VERIFICAÇÃO DETALHADA: services_available');
    
    const { getAdminClient } = require('./dist/config/database.js');
    const client = getAdminClient();
    
    try {
        // Get latest metrics
        const { data: latestMetric } = await client
            .from('tenant_metrics')
            .select('tenant_id, metric_data, calculated_at, tenants!inner(business_name)')
            .order('calculated_at', { ascending: false })
            .limit(1)
            .single();
            
        if (!latestMetric) {
            console.log('❌ Nenhuma métrica encontrada');
            return;
        }
        
        const businessName = latestMetric.tenants?.business_name || 'N/A';
        console.log(`🎯 Verificando: ${businessName}`);
        console.log(`   Data: ${new Date(latestMetric.calculated_at).toLocaleString('pt-BR')}`);
        
        // Check services_available in metric_data
        const servicesAvailable = latestMetric.metric_data?.services_available;
        
        console.log('\n📊 METRIC_DATA services_available:');
        console.log(JSON.stringify(servicesAvailable, null, 2));
        
        console.log('\n🔍 DETALHES:');
        console.log(`   Type: ${typeof servicesAvailable}`);
        console.log(`   services type: ${typeof servicesAvailable?.services}`);
        console.log(`   services length: ${servicesAvailable?.services?.length || 'N/A'}`);
        console.log(`   count: ${servicesAvailable?.count || 'N/A'}`);
        
        if (Array.isArray(servicesAvailable?.services)) {
            console.log('\n📋 ARRAY DE SERVIÇOS:');
            if (servicesAvailable.services.length > 0) {
                servicesAvailable.services.forEach((service, idx) => {
                    console.log(`   ${idx + 1}. ${service} (type: ${typeof service})`);
                });
            } else {
                console.log('   ⚠️ Array vazio');
            }
        } else {
            console.log('\n❌ services NÃO é um array válido');
        }
        
        // Compare with direct table query
        console.log('\n🔍 COMPARAÇÃO com tabela services:');
        const { data: directServices } = await client
            .from('services')
            .select('name')
            .eq('tenant_id', latestMetric.tenant_id)
            .eq('is_active', true);
            
        console.log(`   Tabela services: ${directServices?.length || 0} serviços`);
        directServices?.forEach((service, idx) => {
            console.log(`   ${idx + 1}. ${service.name}`);
        });
        
        // Check if correction was applied by looking at the file
        console.log('\n🔍 VERIFICAÇÃO DO CÓDIGO:');
        const fs = require('fs');
        try {
            const fileContent = fs.readFileSync('./src/services/tenant-metrics/validated-metrics-calculator.service.ts', 'utf8');
            const hasCorrection = fileContent.includes('.eq(\'is_active\', true)');
            console.log(`   Código corrigido: ${hasCorrection ? '✅ SIM' : '❌ NÃO'}`);
            
            if (hasCorrection) {
                console.log('   A correção está no código fonte');
            } else {
                console.log('   A correção NÃO está aplicada no código');
            }
        } catch (fileError) {
            console.log(`   Erro lendo arquivo: ${fileError.message}`);
        }
        
    } catch (error) {
        console.log('❌ Erro:', error.message);
    }
}

checkServicesDetailed().catch(console.error);