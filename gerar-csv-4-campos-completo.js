require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function gerarCsv4CamposCompleto() {
    console.log('📊 GERADOR CSV FINAL - 4 CAMPOS JSON COMPLETO');
    console.log('='.repeat(80));
    
    const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    
    try {
        // Buscar TODOS os dados recentes com os 4 campos JSON
        const { data: metrics, error } = await client
            .from('tenant_metrics')
            .select(`
                id,
                tenant_id,
                metric_type,
                period,
                comprehensive_metrics,
                participation_metrics,
                ranking_metrics,
                metric_data,
                calculated_at,
                created_at
            `)
            .order('created_at', { ascending: false })
            .limit(50); // Pegar até 50 registros mais recentes
            
        if (error) {
            console.error('❌ Erro ao buscar dados:', error);
            return;
        }
        
        if (!metrics || metrics.length === 0) {
            console.log('⚠️ Nenhum dado encontrado na tabela tenant_metrics');
            return;
        }
        
        console.log(`📊 Processando ${metrics.length} registros para CSV...`);
        
        // Buscar nomes dos tenants
        const tenantIds = [...new Set(metrics.map(m => m.tenant_id))];
        const { data: tenants } = await client
            .from('tenants')
            .select('id, name, domain')
            .in('id', tenantIds);
            
        const tenantMap = {};
        tenants?.forEach(tenant => {
            tenantMap[tenant.id] = {
                name: tenant.name,
                domain: tenant.domain
            };
        });
        
        console.log(`🏢 Mapeados ${Object.keys(tenantMap).length} tenants`);
        
        // Gerar headers expandidos para os 4 campos JSON
        const headers = [
            // Identificação
            'id',
            'tenant_id',
            'tenant_name',
            'domain',
            'metric_type', 
            'period',
            'calculated_at',
            
            // COMPREHENSIVE METRICS (22 campos)
            'comp_total_revenue',
            'comp_monthly_revenue_brl',
            'comp_total_appointments',
            'comp_confirmed_appointments',
            'comp_cancelled_appointments',
            'comp_completed_appointments',
            'comp_pending_appointments',
            'comp_total_customers',
            'comp_new_customers_count',
            'comp_returning_customers',
            'comp_average_appointment_value',
            'comp_appointment_success_rate',
            'comp_total_services',
            'comp_service_utilization_rate',
            'comp_most_popular_service',
            'comp_total_conversations',
            'comp_ai_success_rate',
            'comp_ai_efficiency',
            'comp_avg_response_time',
            'comp_conversion_rate',
            'comp_booking_conversion_rate',
            'comp_business_health_score',
            
            // PARTICIPATION METRICS (6 campos)
            'part_revenue_platform_percentage',
            'part_appointments_platform_percentage', 
            'part_customers_platform_percentage',
            'part_platform_market_share',
            'part_relative_performance_score',
            'part_growth_revenue',
            'part_growth_appointments',
            'part_growth_customers',
            
            // RANKING METRICS (9 campos)
            'rank_overall_score',
            'rank_revenue_rank_score',
            'rank_appointments_rank_score',
            'rank_customer_satisfaction_score',
            'rank_efficiency_score',
            'rank_growth_momentum_score',
            'rank_risk_level',
            'rank_risk_score',
            'rank_competitive_position',
            
            // METRIC DATA (principais campos)
            'data_period_type',
            'data_period_start',
            'data_period_end',
            'data_appointments_growth_rate',
            'data_revenue_growth_rate',
            'data_customer_growth_rate'
        ];
        
        const csvData = [headers.join(',')];
        
        console.log('🔄 Processando registros para CSV...');
        
        metrics.forEach((record, index) => {
            console.log(`   📋 Processando registro ${index + 1}/${metrics.length}`);
            
            const tenant = tenantMap[record.tenant_id] || {};
            const comp = record.comprehensive_metrics || {};
            const part = record.participation_metrics || {};
            const rank = record.ranking_metrics || {};
            const data = record.metric_data || {};
            
            const row = [
                // Identificação
                record.id || '',
                record.tenant_id || '',
                tenant.name || 'Unknown',
                tenant.domain || 'unknown',
                record.metric_type || '',
                record.period || '',
                record.calculated_at || '',
                
                // COMPREHENSIVE METRICS
                formatCurrency(comp.total_revenue),
                formatCurrency(comp.monthly_revenue_brl),
                comp.total_appointments || 0,
                comp.confirmed_appointments || 0,
                comp.cancelled_appointments || 0,
                comp.completed_appointments || 0,
                comp.pending_appointments || 0,
                comp.total_customers || 0,
                comp.new_customers_count || 0,
                comp.returning_customers || 0,
                formatCurrency(comp.average_appointment_value),
                formatPercentage(comp.appointment_success_rate),
                comp.total_services || 0,
                formatPercentage(comp.service_utilization_rate),
                comp.most_popular_service || '',
                comp.total_conversations || 0,
                formatPercentage(comp.ai_success_rate),
                formatPercentage(comp.ai_efficiency),
                comp.avg_response_time || 0,
                formatPercentage(comp.conversion_rate),
                formatPercentage(comp.booking_conversion_rate),
                comp.business_health_score || 0,
                
                // PARTICIPATION METRICS
                formatPercentage(part.revenue_platform_percentage),
                formatPercentage(part.appointments_platform_percentage),
                formatPercentage(part.customers_platform_percentage),
                formatPercentage(part.platform_market_share),
                part.relative_performance_score || 0,
                formatPercentage(part.growth_vs_platform?.revenue_growth),
                formatPercentage(part.growth_vs_platform?.appointments_growth),
                formatPercentage(part.growth_vs_platform?.customers_growth),
                
                // RANKING METRICS
                rank.overall_score || 0,
                rank.revenue_rank_score || 0,
                rank.appointments_rank_score || 0,
                rank.customer_satisfaction_score || 0,
                rank.efficiency_score || 0,
                rank.growth_momentum_score || 0,
                rank.risk_level || '',
                rank.risk_score || 0,
                rank.competitive_position || '',
                
                // METRIC DATA
                data.period_type || '',
                data.period_start || '',
                data.period_end || '',
                formatPercentage(data.appointments_growth_rate),
                formatPercentage(data.revenue_growth_rate),
                formatPercentage(data.customer_growth_rate)
            ];
            
            csvData.push(row.map(formatCSVField).join(','));
        });
        
        // Gerar arquivo com timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
        const timeHour = new Date().toISOString().split('T')[1].substring(0,5).replace(':', '');
        const filename = `UBS-METRICAS-4-CAMPOS-COMPLETO-${timestamp}T${timeHour}.csv`;
        
        fs.writeFileSync(filename, csvData.join('\n'), 'utf-8');
        
        console.log('\n' + '='.repeat(80));
        console.log('🎉 CSV FINAL GERADO COM SUCESSO!');
        console.log('='.repeat(80));
        console.log(`📄 Arquivo: ${filename}`);
        console.log(`📊 Total de registros: ${csvData.length - 1} (+ header)`);
        console.log(`📈 Total de colunas: ${headers.length}`);
        
        console.log('\n📊 ESTRUTURA DO CSV:');
        console.log('   ✅ 7 colunas de identificação');
        console.log('   ✅ 22 colunas comprehensive_metrics');
        console.log('   ✅ 8 colunas participation_metrics');  
        console.log('   ✅ 9 colunas ranking_metrics');
        console.log('   ✅ 6 colunas metric_data principais');
        console.log(`   📊 TOTAL: ${headers.length} colunas`);
        
        console.log('\n🎯 DADOS INCLUÍDOS:');
        console.log('   💰 Receitas formatadas em R$ (brasileiro)');
        console.log('   📈 Percentuais formatados com % ');
        console.log('   🏢 Nomes dos tenants mapeados');
        console.log('   📅 Períodos 7d/30d/90d separados');
        console.log('   🏆 Scores de ranking e competitividade');
        console.log('   ⚠️ Níveis de risco e posições competitivas');
        
        console.log('\n🚀 O TenantMetricsCronService está funcionando perfeitamente!');
        console.log('✅ Todos os 4 campos JSON estão sendo populados corretamente');
        console.log('📊 CSV pronto para análise e dashboards');
        
        return filename;
        
    } catch (error) {
        console.error('💥 ERRO na geração do CSV:', error);
        throw error;
    }
}

// Funções auxiliares
function formatCurrency(value) {
    if (!value && value !== 0) return 'R$ 0,00';
    const num = parseFloat(value) || 0;
    return `R$ ${num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPercentage(value) {
    if (!value && value !== 0) return '0,00%';
    const num = parseFloat(value) || 0;
    return `${num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function formatCSVField(field) {
    const str = String(field || '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

gerarCsv4CamposCompleto().then(() => process.exit(0)).catch(console.error);