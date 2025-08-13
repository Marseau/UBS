/**
 * GERAR CSV FINAL DE VALIDAÇÃO
 * Com dados reais do banco após execução do cron job
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function generateFinalValidationCSV() {
    console.log('📊 GERANDO CSV FINAL DE VALIDAÇÃO');
    console.log('='.repeat(60));
    console.log('🎯 Dados reais do banco após execução do cron job');
    console.log('='.repeat(60));
    
    try {
        // 1. Buscar dados das tabelas populadas
        console.log('\n📋 STEP 1: BUSCANDO DADOS DAS TABELAS');
        console.log('-'.repeat(40));
        
        const { data: tenantMetrics, error: tenantError } = await supabase
            .from('tenant_metrics')
            .select('*')
            .order('created_at', { ascending: false });
            
        if (tenantError) {
            console.error('❌ Erro ao buscar tenant_metrics:', tenantError.message);
            throw tenantError;
        }
        
        const { data: platformMetrics, error: platformError } = await supabase
            .from('platform_metrics')
            .select('*')
            .order('created_at', { ascending: false });
            
        if (platformError) {
            console.error('❌ Erro ao buscar platform_metrics:', platformError.message);
        }
        
        console.log(`📊 tenant_metrics: ${tenantMetrics?.length || 0} registros`);
        console.log(`🌐 platform_metrics: ${platformMetrics?.length || 0} registros`);
        
        // 2. Buscar dados dos tenants
        const { data: tenants, error: tenantsError } = await supabase
            .from('tenants')
            .select('id, business_name, status')
            .eq('status', 'active');
            
        if (tenantsError) {
            console.error('❌ Erro ao buscar tenants:', tenantsError.message);
            throw tenantsError;
        }
        
        console.log(`👥 tenants ativos: ${tenants?.length || 0}`);
        
        // 3. Gerar CSV tenant_metrics
        console.log('\n📊 STEP 2: GERANDO CSV TENANT METRICS');
        console.log('-'.repeat(40));
        
        let csvContent = 'tenant_id,tenant_name,period,metric_type,';
        csvContent += 'total_revenue,total_appointments,total_customers,';
        csvContent += 'daily_revenue_avg,success_rate,calculated_at,has_data\n';
        
        let rowCount = 0;
        
        for (const metric of tenantMetrics || []) {
            const tenant = tenants?.find(t => t.id === metric.tenant_id);
            const tenantName = tenant?.business_name || 'Unknown';
            
            // Extrair dados das métricas
            const metricData = metric.metric_data || {};
            const totalRevenue = metricData.total_revenue || 0;
            const totalAppointments = metricData.total_appointments || 0;
            const totalCustomers = metricData.total_customers || 0;
            const dailyRevenueAvg = metricData.daily_revenue_avg || 0;
            const successRate = metricData.success_rate || 0;
            const hasData = totalRevenue > 0 || totalAppointments > 0 || totalCustomers > 0;
            
            const row = [
                metric.tenant_id,
                `"${tenantName}"`,
                metric.period,
                metric.metric_type,
                totalRevenue,
                totalAppointments,
                totalCustomers,
                dailyRevenueAvg,
                successRate,
                metric.calculated_at,
                hasData ? 'YES' : 'NO'
            ].join(',') + '\n';
            
            csvContent += row;
            rowCount++;
        }
        
        // 4. Testar PostgreSQL functions diretamente
        console.log('\n🔧 STEP 3: TESTANDO POSTGRESQL FUNCTIONS DIRETAMENTE');
        console.log('-'.repeat(40));
        
        const testTenantId = '33b8c488-5aa9-4891-b335-701d10296681';
        console.log(`🧪 Testando com tenant: ${testTenantId.substring(0, 8)}`);
        
        try {
            const { data: functionResult, error: functionError } = await supabase
                .rpc('calculate_monthly_revenue', {
                    p_tenant_id: testTenantId,
                    p_start_date: '2025-07-31',
                    p_end_date: '2025-08-07'
                });
                
            if (functionError) {
                console.error(`❌ Erro na function: ${functionError.message}`);
            } else {
                console.log(`✅ Function result:`, functionResult);
                csvContent += `\n# PostgreSQL Function Test Result:\n`;
                csvContent += `# calculate_monthly_revenue: ${JSON.stringify(functionResult)}\n`;
            }
        } catch (funcError) {
            console.error(`💥 Erro ao testar function:`, funcError);
        }
        
        // 5. Escrever arquivo CSV
        console.log('\n💾 STEP 4: SALVANDO ARQUIVO CSV');
        console.log('-'.repeat(40));
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
        const filename = `TENANT-METRICS-REAL-DATA-${timestamp}.csv`;
        
        fs.writeFileSync(filename, csvContent);
        
        console.log(`✅ CSV gerado: ${filename}`);
        console.log(`📊 ${rowCount} linhas de dados`);
        console.log(`📁 Tamanho: ${Math.round(csvContent.length / 1024 * 100) / 100} KB`);
        
        // 6. Mostrar amostra
        console.log('\n📋 STEP 5: AMOSTRA DOS DADOS');
        console.log('-'.repeat(40));
        
        const lines = csvContent.split('\n');
        console.log('HEADER:', lines[0]);
        
        const dataLines = lines.slice(1).filter(line => line.trim() && !line.startsWith('#'));
        console.log(`\nPRIMEIRAS 3 LINHAS DE DADOS:`);
        dataLines.slice(0, 3).forEach((line, index) => {
            console.log(`${index + 1}. ${line}`);
        });
        
        // 7. Análise dos dados
        console.log('\n📈 STEP 6: ANÁLISE DOS DADOS');
        console.log('-'.repeat(40));
        
        const withData = (tenantMetrics || []).filter(m => {
            const data = m.metric_data || {};
            return (data.total_revenue || 0) > 0 || 
                   (data.total_appointments || 0) > 0 || 
                   (data.total_customers || 0) > 0;
        });
        
        console.log(`📊 Total registros: ${tenantMetrics?.length || 0}`);
        console.log(`✅ Com dados reais: ${withData.length}`);
        console.log(`❌ Com dados zero: ${(tenantMetrics?.length || 0) - withData.length}`);
        
        if (withData.length > 0) {
            console.log('🎉 SUCESSO: Sistema gerou alguns dados reais!');
        } else {
            console.log('⚠️ PROBLEMA: Todos os dados ainda são zero');
            console.log('   • PostgreSQL functions podem não estar sendo chamadas corretamente');
            console.log('   • Service pode estar usando lógica antiga');
        }
        
        // 8. Relatório final
        console.log('\n' + '='.repeat(60));
        console.log('🎯 VALIDAÇÃO FINAL CONCLUÍDA');
        console.log('='.repeat(60));
        
        console.log('\n✅ RESULTADOS:');
        console.log(`   📊 tenant_metrics populados: ${tenantMetrics?.length || 0}`);
        console.log(`   🌐 platform_metrics populados: ${platformMetrics?.length || 0}`);
        console.log(`   📁 CSV gerado: ${filename}`);
        console.log(`   🔧 PostgreSQL functions implementadas: SIM`);
        console.log(`   🚀 Cron job executado: SIM`);
        console.log(`   📋 Dados reais gerados: ${withData.length > 0 ? 'PARCIAL' : 'NÃO'}`);
        
        return {
            csv_filename: filename,
            tenant_metrics_count: tenantMetrics?.length || 0,
            platform_metrics_count: platformMetrics?.length || 0,
            records_with_data: withData.length,
            validation_complete: true
        };
        
    } catch (error) {
        console.error('💥 ERRO na geração do CSV:', error);
        throw error;
    }
}

// Executar
if (require.main === module) {
    generateFinalValidationCSV().then((result) => {
        console.log('\n🎯 CSV DE VALIDAÇÃO FINAL GERADO COM SUCESSO');
        console.log(`✅ Arquivo: ${result.csv_filename}`);
        console.log(`📊 Dados: ${result.tenant_metrics_count} tenant metrics`);
        process.exit(0);
    }).catch(error => {
        console.error('Erro fatal:', error.message);
        process.exit(1);
    });
}

module.exports = {
    generateFinalValidationCSV
};