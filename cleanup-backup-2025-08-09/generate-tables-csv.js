/**
 * GERAR CSVs DAS TABELAS TENANT_METRICS E PLATFORM_METRICS
 * Para conferência e validação dos dados
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

function escapeCSV(value) {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

function generateCSV(data, headers) {
    const csvLines = [];
    csvLines.push(headers.map(escapeCSV).join(','));
    
    data.forEach(row => {
        const csvRow = headers.map(header => {
            const value = row[header];
            if (typeof value === 'object' && value !== null) {
                return escapeCSV(JSON.stringify(value));
            }
            return escapeCSV(value);
        });
        csvLines.push(csvRow.join(','));
    });
    
    return csvLines.join('\n');
}

async function generateTablesCSV() {
    console.log('📊 GERANDO CSVs DAS TABELAS DE MÉTRICAS');
    console.log('='.repeat(60));
    
    const timestamp = new Date().toISOString().split('T')[0];
    
    try {
        // =====================================================
        // 1. GERAR CSV TENANT_METRICS
        // =====================================================
        
        console.log('1️⃣ Gerando CSV de TENANT_METRICS...');
        
        const { data: tenantMetrics, error: tenantError } = await supabase
            .from('tenant_metrics')
            .select('*')
            .eq('metric_type', 'conversation_billing')
            .eq('period', '30d')
            .order('created_at', { ascending: false });
            
        if (tenantError) {
            throw new Error(`Erro ao buscar tenant_metrics: ${tenantError.message}`);
        }
        
        console.log(`   📋 ${tenantMetrics.length} registros encontrados`);
        
        // Preparar dados expandidos para CSV
        const tenantCSVData = [];
        
        tenantMetrics.forEach(record => {
            const metrics = record.metric_data || {};
            
            tenantCSVData.push({
                // Campos da tabela
                id: record.id,
                tenant_id: record.tenant_id,
                metric_type: record.metric_type,
                period: record.period,
                calculated_at: record.calculated_at,
                created_at: record.created_at,
                updated_at: record.updated_at,
                
                // Campos do JSON metric_data expandidos
                business_name: metrics.business_name,
                period_days: metrics.period_days,
                total_conversations: metrics.total_conversations,
                billable_conversations: metrics.billable_conversations,
                valid_conversations: metrics.valid_conversations,
                spam_conversations: metrics.spam_conversations,
                total_appointments: metrics.total_appointments,
                total_minutes: metrics.total_minutes?.toFixed(2),
                avg_minutes_per_conversation: metrics.avg_minutes_per_conversation?.toFixed(2),
                total_cost_usd: metrics.total_cost_usd?.toFixed(4),
                avg_cost_per_conversation: metrics.avg_cost_per_conversation?.toFixed(4),
                suggested_plan: metrics.suggested_plan,
                plan_price_brl: metrics.plan_price_brl,
                conversation_limit: metrics.conversation_limit,
                excess_conversations: metrics.excess_conversations,
                spam_rate_pct: metrics.spam_rate_pct?.toFixed(2),
                efficiency_pct: metrics.efficiency_pct?.toFixed(2),
                billing_model: metrics.billing_model,
                
                // Outcomes como string JSON
                outcome_distribution: JSON.stringify(metrics.outcome_distribution || {})
            });
        });
        
        const tenantHeaders = [
            'id', 'tenant_id', 'metric_type', 'period', 'calculated_at', 'created_at', 'updated_at',
            'business_name', 'period_days', 'total_conversations', 'billable_conversations', 
            'valid_conversations', 'spam_conversations', 'total_appointments', 'total_minutes',
            'avg_minutes_per_conversation', 'total_cost_usd', 'avg_cost_per_conversation',
            'suggested_plan', 'plan_price_brl', 'conversation_limit', 'excess_conversations',
            'spam_rate_pct', 'efficiency_pct', 'billing_model', 'outcome_distribution'
        ];
        
        const tenantCSV = generateCSV(tenantCSVData, tenantHeaders);
        const tenantFilename = `tenant_metrics_${timestamp}.csv`;
        
        fs.writeFileSync(tenantFilename, tenantCSV, 'utf8');
        console.log(`   ✅ CSV salvo: ${tenantFilename}`);
        
        // =====================================================
        // 2. GERAR CSV PLATFORM_METRICS
        // =====================================================
        
        console.log('');
        console.log('2️⃣ Gerando CSV de PLATFORM_METRICS...');
        
        const { data: platformMetrics, error: platformError } = await supabase
            .from('platform_metrics')
            .select('*')
            .eq('data_source', 'conversation_outcome_corrected')
            .order('calculation_date', { ascending: false });
            
        if (platformError) {
            throw new Error(`Erro ao buscar platform_metrics: ${platformError.message}`);
        }
        
        console.log(`   📋 ${platformMetrics.length} registros encontrados`);
        
        // Preparar dados para CSV (todos os campos)
        const platformCSVData = platformMetrics.map(record => ({
            id: record.id,
            calculation_date: record.calculation_date,
            period_days: record.period_days,
            data_source: record.data_source,
            active_tenants: record.active_tenants,
            total_conversations: record.total_conversations,
            total_valid_conversations: record.total_valid_conversations,
            total_appointments: record.total_appointments,
            total_customers: record.total_customers,
            total_ai_interactions: record.total_ai_interactions,
            platform_mrr: record.platform_mrr?.toFixed(2),
            total_revenue: record.total_revenue?.toFixed(2),
            total_chat_minutes: record.total_chat_minutes,
            total_spam_conversations: record.total_spam_conversations,
            receita_uso_ratio: record.receita_uso_ratio?.toFixed(4),
            operational_efficiency_pct: record.operational_efficiency_pct?.toFixed(2),
            spam_rate_pct: record.spam_rate_pct?.toFixed(2),
            cancellation_rate_pct: record.cancellation_rate_pct?.toFixed(2),
            revenue_usage_distortion_index: record.revenue_usage_distortion_index?.toFixed(2),
            platform_health_score: record.platform_health_score,
            tenants_above_usage: record.tenants_above_usage,
            tenants_below_usage: record.tenants_below_usage,
            created_at: record.created_at,
            updated_at: record.updated_at
        }));
        
        const platformHeaders = [
            'id', 'calculation_date', 'period_days', 'data_source', 'active_tenants',
            'total_conversations', 'total_valid_conversations', 'total_appointments',
            'total_customers', 'total_ai_interactions', 'platform_mrr', 'total_revenue',
            'total_chat_minutes', 'total_spam_conversations', 'receita_uso_ratio',
            'operational_efficiency_pct', 'spam_rate_pct', 'cancellation_rate_pct',
            'revenue_usage_distortion_index', 'platform_health_score', 'tenants_above_usage',
            'tenants_below_usage', 'created_at', 'updated_at'
        ];
        
        const platformCSV = generateCSV(platformCSVData, platformHeaders);
        const platformFilename = `platform_metrics_${timestamp}.csv`;
        
        fs.writeFileSync(platformFilename, platformCSV, 'utf8');
        console.log(`   ✅ CSV salvo: ${platformFilename}`);
        
        // =====================================================
        // 3. GERAR RESUMO EXECUTIVO
        // =====================================================
        
        console.log('');
        console.log('3️⃣ Gerando RESUMO EXECUTIVO...');
        
        const resumoData = [];
        
        // Resumo por tenant
        tenantCSVData.forEach(tenant => {
            resumoData.push({
                tipo: 'TENANT',
                nome: tenant.business_name,
                conversas: tenant.total_conversations,
                appointments: tenant.total_appointments,
                eficiencia_pct: tenant.efficiency_pct,
                spam_pct: tenant.spam_rate_pct,
                plano: tenant.suggested_plan,
                preco_brl: tenant.plan_price_brl,
                excedentes: tenant.excess_conversations,
                minutos_total: tenant.total_minutes,
                custo_usd: tenant.total_cost_usd
            });
        });
        
        // Resumo da plataforma
        if (platformCSVData.length > 0) {
            const platform = platformCSVData[0];
            resumoData.push({
                tipo: 'PLATFORM',
                nome: 'TOTAL DA PLATAFORMA',
                conversas: platform.total_conversations,
                appointments: platform.total_appointments,
                eficiencia_pct: platform.operational_efficiency_pct,
                spam_pct: platform.spam_rate_pct,
                plano: 'N/A',
                preco_brl: platform.platform_mrr,
                excedentes: 'N/A',
                minutos_total: platform.total_chat_minutes,
                custo_usd: 'N/A'
            });
        }
        
        const resumoHeaders = [
            'tipo', 'nome', 'conversas', 'appointments', 'eficiencia_pct', 'spam_pct',
            'plano', 'preco_brl', 'excedentes', 'minutos_total', 'custo_usd'
        ];
        
        const resumoCSV = generateCSV(resumoData, resumoHeaders);
        const resumoFilename = `resumo_executivo_${timestamp}.csv`;
        
        fs.writeFileSync(resumoFilename, resumoCSV, 'utf8');
        console.log(`   ✅ CSV salvo: ${resumoFilename}`);
        
        // =====================================================
        // 4. RESULTADO FINAL
        // =====================================================
        
        console.log('');
        console.log('🎯 CSVS GERADOS COM SUCESSO:');
        console.log('='.repeat(60));
        console.log(`📋 ${tenantFilename} - ${tenantMetrics.length} tenant metrics`);
        console.log(`📋 ${platformFilename} - ${platformMetrics.length} platform metrics`);
        console.log(`📋 ${resumoFilename} - Resumo executivo consolidado`);
        
        console.log('');
        console.log('💡 COMO USAR:');
        console.log('1. Abra os CSVs no Excel/Google Sheets');
        console.log('2. Confira os valores calculados');
        console.log('3. Valide contra dados esperados');
        console.log('4. Use o resumo executivo para overview rápido');
        
        return {
            success: true,
            files: [tenantFilename, platformFilename, resumoFilename],
            tenant_records: tenantMetrics.length,
            platform_records: platformMetrics.length
        };
        
    } catch (error) {
        console.error('💥 ERRO NA GERAÇÃO DOS CSVs:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

// Executar se chamado diretamente
if (require.main === module) {
    generateTablesCSV()
        .then(result => {
            if (result.success) {
                console.log('\n🎉 CSVs gerados com sucesso!');
                process.exit(0);
            } else {
                console.log('\n💥 Erro na geração:', result.error);
                process.exit(1);
            }
        })
        .catch(error => {
            console.error('💥 Erro não tratado:', error);
            process.exit(1);
        });
}

module.exports = { generateTablesCSV };