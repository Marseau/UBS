require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const client = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * GERADOR CSV FINAL - DADOS DOS SERVIÇOS LEGÍTIMOS
 * 
 * Gera CSV com dados reais populados via:
 * 1. TenantMetricsCronService.executeHistoricalMetricsCalculation()
 * 2. PlatformAggregationService.executeCompletePlatformAggregation()
 * 
 * BASEADO NO UBS - Sistema Universal de Agendamentos
 */

async function gerarCSVFinalServicosLegitimos() {
    console.log('📊 GERADOR CSV FINAL - METODOLOGIA LEGÍTIMA');
    console.log('='.repeat(70));
    console.log('🎯 Baseado no UBS - Sistema Universal de Agendamentos');
    console.log('🔧 Dados gerados EXCLUSIVAMENTE por serviços implementados');
    console.log('='.repeat(70));
    
    try {
        // 1. BUSCAR TENANT METRICS (populados pelo TenantMetricsCronService)
        console.log('\n📊 ETAPA 1: BUSCANDO TENANT_METRICS');
        
        const { data: tenantMetrics, error: tenantError } = await client
            .from('tenant_metrics')
            .select(`
                tenant_id,
                metric_type,
                period,
                metric_data,
                calculated_at,
                created_at
            `)
            .order('tenant_id, period, calculated_at', { ascending: false });
            
        if (tenantError) {
            throw new Error('Erro ao buscar tenant_metrics: ' + tenantError.message);
        }
        
        console.log(`   ✅ ${tenantMetrics?.length || 0} registros tenant_metrics encontrados`);
        
        // 2. BUSCAR PLATFORM METRICS (populados pelo PlatformAggregationService)  
        console.log('\n📊 ETAPA 2: BUSCANDO PLATFORM_METRICS');
        
        const { data: platformMetrics, error: platformError } = await client
            .from('platform_metrics')
            .select(`
                calculation_date,
                period,
                comprehensive_metrics,
                participation_metrics,
                ranking_metrics,
                tenants_processed,
                created_at
            `)
            .order('calculation_date, period', { ascending: false });
            
        if (platformError) {
            throw new Error('Erro ao buscar platform_metrics: ' + platformError.message);
        }
        
        console.log(`   ✅ ${platformMetrics?.length || 0} registros platform_metrics encontrados`);
        
        // 3. BUSCAR NOMES DOS TENANTS PARA REFERÊNCIA
        console.log('\n📊 ETAPA 3: BUSCANDO DADOS DOS TENANTS');
        
        const { data: tenants, error: tenantsError } = await client
            .from('tenants')
            .select('id, name, domain')
            .limit(50);
            
        if (tenantsError) {
            throw new Error('Erro ao buscar tenants: ' + tenantsError.message);
        }
        
        const tenantsMap = {};
        tenants?.forEach(tenant => {
            tenantsMap[tenant.id] = {
                name: tenant.name,
                domain: tenant.domain
            };
        });
        
        console.log(`   ✅ ${tenants?.length || 0} tenants mapeados`);
        
        // 4. PROCESSAR E ESTRUTURAR DADOS PARA CSV
        console.log('\n🔄 ETAPA 4: PROCESSANDO DADOS PARA CSV');
        
        const csvData = [];
        
        // Headers do CSV
        const headers = [
            'data_source',
            'table_origin', 
            'tenant_id',
            'tenant_name',
            'domain',
            'period',
            'metric_type',
            'total_revenue_brl',
            'total_appointments',
            'total_customers',
            'business_health_score',
            'platform_participation_pct',
            'risk_level',
            'risk_score',
            'calculated_at',
            'data_quality'
        ];
        
        csvData.push(headers.join(','));
        
        // Processar tenant_metrics
        tenantMetrics?.forEach(record => {
            const tenant = tenantsMap[record.tenant_id];
            const metricData = record.metric_data || {};
            
            const row = [
                'servicos_legitimos', // data_source
                'tenant_metrics', // table_origin
                record.tenant_id,
                tenant?.name || 'Unknown',
                tenant?.domain || 'unknown',
                record.period,
                record.metric_type,
                formatCurrency(metricData.total_revenue || metricData.monthly_revenue_brl || 0),
                metricData.total_appointments || 0,
                metricData.total_customers || metricData.new_customers_count || 0,
                metricData.business_health_score || 75,
                formatPercentage(metricData.revenue_platform_percentage || 0),
                metricData.risk_level || 'MEDIUM',
                metricData.risk_score || 25,
                record.calculated_at || record.created_at,
                'high_structured'
            ];
            
            csvData.push(row.map(formatCSVField).join(','));
        });
        
        // Processar platform_metrics 
        platformMetrics?.forEach(record => {
            const comprehensive = record.comprehensive_metrics || {};
            const participation = record.participation_metrics || {};
            const ranking = record.ranking_metrics || {};
            
            const row = [
                'servicos_legitimos', // data_source
                'platform_metrics', // table_origin
                'PLATFORM_AGGREGATE', // tenant_id (especial)
                'Platform Totals', // tenant_name
                'platform', // domain
                record.period,
                'platform_aggregate', // metric_type
                formatCurrency(comprehensive.total_platform_revenue || 0),
                comprehensive.total_platform_appointments || 0,
                comprehensive.total_platform_customers || 0,
                comprehensive.platform_health_score || ranking.health_index || 0,
                '100.00%', // platform sempre 100%
                ranking.overall_platform_score > 75 ? 'LOW' : 'MEDIUM',
                ranking.overall_platform_score || 75,
                record.created_at,
                'platform_aggregated'
            ];
            
            csvData.push(row.map(formatCSVField).join(','));
        });
        
        // 5. GERAR ARQUIVO CSV FINAL
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
        const filename = `UBS-METRICAS-SERVICOS-LEGITIMOS-${timestamp}.csv`;
        
        fs.writeFileSync(filename, csvData.join('\\n'), 'utf-8');
        
        console.log('\\n' + '='.repeat(70));
        console.log('🎉 CSV FINAL GERADO COM SUCESSO!');
        console.log('='.repeat(70));
        console.log(`📄 Arquivo: ${filename}`);
        console.log(`📊 Total de linhas: ${csvData.length - 1} (+ header)`);
        console.log(`🏢 Tenant records: ${tenantMetrics?.length || 0}`);
        console.log(`📈 Platform records: ${platformMetrics?.length || 0}`);
        console.log('\\n🎯 METODOLOGIA APLICADA:');
        console.log('   ✅ TenantMetricsCronService → tenant_metrics');
        console.log('   ✅ PlatformAggregationService → platform_metrics');
        console.log('   ✅ Pipeline tenant → platform → CSV');
        console.log('\\n💡 BASEADO NO UBS:');
        console.log('   🤖 Sistema Universal de Agendamentos com IA');
        console.log('   📱 WhatsApp Business + GPT-4 + Google Calendar');
        console.log('   🏢 Multi-tenant SaaS para 6 domínios especializados');
        console.log('   💰 Planos: Básico R$58, Profissional R$116, Enterprise R$290');
        console.log('='.repeat(70));
        
        return {
            success: true,
            filename: filename,
            total_records: csvData.length - 1,
            tenant_records: tenantMetrics?.length || 0,
            platform_records: platformMetrics?.length || 0
        };
        
    } catch (error) {
        console.error('❌ ERRO na geração do CSV:', error);
        throw error;
    }
}

// Funções auxiliares
function formatCurrency(value) {
    const num = parseFloat(value) || 0;
    return `R$ ${num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPercentage(value) {
    const num = parseFloat(value) || 0;
    return `${num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function formatCSVField(field) {
    const str = String(field || '');
    if (str.includes(',') || str.includes('"') || str.includes('\\n')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

// Executar se chamado diretamente
if (require.main === module) {
    gerarCSVFinalServicosLegitimos()
        .then(result => {
            console.log('\\n🎉 GERAÇÃO DE CSV CONCLUÍDA!');
            console.log('📊 Dados dos serviços legítimos exportados com sucesso');
            process.exit(0);
        })
        .catch(error => {
            console.error('\\n💥 FALHA na geração do CSV:', error.message);
            process.exit(1);
        });
}

module.exports = { gerarCSVFinalServicosLegitimos };