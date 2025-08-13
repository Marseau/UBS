#!/usr/bin/env node

/**
 * Script de Validação Completa das Métricas da Tabela platform_metrics
 * Compara valores calculados diretamente vs valores armazenados na tabela
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias no .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Períodos para validação
const PERIODS = [7, 30, 90];

class PlatformMetricsValidator {
    
    async validateAllMetrics() {
        console.log('🔍 INICIANDO VALIDAÇÃO COMPLETA DAS MÉTRICAS DA PLATAFORMA\n');
        
        const results = {};
        
        for (const period of PERIODS) {
            console.log(`📊 Validando métricas para período de ${period} dias`);
            results[period] = await this.validateMetricsForPeriod(period);
        }
        
        // Gerar relatório consolidado
        await this.generateValidationReport(results);
        
        return results;
    }
    
    async validateMetricsForPeriod(periodDays) {
        const results = {
            period: periodDays,
            calculations: {},
            stored_values: {},
            discrepancies: {},
            validation_status: {}
        };
        
        // 1. Obter valores armazenados na tabela
        const storedData = await this.getStoredPlatformMetrics(periodDays);
        results.stored_values = storedData;
        
        if (!storedData) {
            console.log(`⚠️ Nenhum dado encontrado para período ${periodDays}d`);
            return results;
        }
        
        // 2. Calcular cada métrica independentemente
        console.log(`  📈 Calculando Platform MRR...`);
        results.calculations.platform_mrr = await this.calculatePlatformMRR(periodDays);
        
        console.log(`  💰 Calculando Total Revenue...`);
        results.calculations.total_revenue = await this.calculateTotalRevenue(periodDays);
        
        console.log(`  🏢 Calculando Active Tenants...`);
        results.calculations.active_tenants = await this.calculateActiveTenants(periodDays);
        
        console.log(`  📅 Calculando Total Appointments...`);
        results.calculations.total_appointments = await this.calculateTotalAppointments(periodDays);
        
        console.log(`  💬 Calculando Total Conversations...`);
        results.calculations.total_conversations = await this.calculateTotalConversations(periodDays);
        
        console.log(`  👥 Calculando Total Customers...`);
        results.calculations.total_customers = await this.calculateTotalCustomers(periodDays);
        
        console.log(`  ⚡ Calculando Operational Efficiency...`);
        results.calculations.operational_efficiency = await this.calculateOperationalEfficiency(periodDays);
        
        console.log(`  📊 Calculando Revenue Usage Ratio...`);
        results.calculations.revenue_usage_ratio = await this.calculateRevenueUsageRatio(periodDays);
        
        // 3. Comparar valores calculados vs armazenados
        results.discrepancies = this.compareValues(results.calculations, results.stored_values);
        results.validation_status = this.generateValidationStatus(results.discrepancies);
        
        return results;
    }
    
    async getStoredPlatformMetrics(periodDays) {
        try {
            const { data, error } = await supabase
                .from('platform_metrics')
                .select('*')
                .eq('period_days', periodDays)
                .order('created_at', { ascending: false })
                .limit(1);
                
            if (error) {
                console.error(`❌ Erro ao buscar dados armazenados:`, error);
                return null;
            }
            
            return data && data.length > 0 ? data[0] : null;
        } catch (error) {
            console.error(`❌ Erro ao buscar platform_metrics:`, error);
            return null;
        }
    }
    
    async calculatePlatformMRR(periodDays) {
        try {
            const endDate = new Date();
            const startDate = new Date(endDate - periodDays * 24 * 60 * 60 * 1000);
            
            // Soma do custo_plataforma de todos tenants ativos no período
            const { data, error } = await supabase
                .from('tenant_metrics')
                .select('custo_plataforma')
                .eq('period_days', periodDays)
                .gte('created_at', startDate.toISOString())
                .lte('created_at', endDate.toISOString());
                
            if (error) throw error;
            
            const platformMRR = data.reduce((sum, item) => {
                return sum + (parseFloat(item.custo_plataforma) || 0);
            }, 0);
            
            return {
                calculated_value: platformMRR,
                calculation_method: 'SUM(tenant_metrics.custo_plataforma)',
                data_points: data.length
            };
        } catch (error) {
            return { error: error.message };
        }
    }
    
    async calculateTotalRevenue(periodDays) {
        try {
            const endDate = new Date();
            const startDate = new Date(endDate - periodDays * 24 * 60 * 60 * 1000);
            
            // Soma da receita de todos tenants
            const { data, error } = await supabase
                .from('tenant_metrics')
                .select('revenue_tenant')
                .eq('period_days', periodDays)
                .gte('created_at', startDate.toISOString())
                .lte('created_at', endDate.toISOString());
                
            if (error) throw error;
            
            const totalRevenue = data.reduce((sum, item) => {
                return sum + (parseFloat(item.revenue_tenant) || 0);
            }, 0);
            
            return {
                calculated_value: totalRevenue,
                calculation_method: 'SUM(tenant_metrics.revenue_tenant)',
                data_points: data.length
            };
        } catch (error) {
            return { error: error.message };
        }
    }
    
    async calculateActiveTenants(periodDays) {
        try {
            const endDate = new Date();
            const startDate = new Date(endDate - periodDays * 24 * 60 * 60 * 1000);
            
            // Contar tenants únicos com atividade no período
            const { data, error } = await supabase
                .from('tenant_metrics')
                .select('tenant_id')
                .eq('period_days', periodDays)
                .gte('created_at', startDate.toISOString())
                .lte('created_at', endDate.toISOString());
                
            if (error) throw error;
            
            const uniqueTenants = new Set(data.map(item => item.tenant_id));
            
            return {
                calculated_value: uniqueTenants.size,
                calculation_method: 'COUNT(DISTINCT tenant_metrics.tenant_id)',
                data_points: data.length
            };
        } catch (error) {
            return { error: error.message };
        }
    }
    
    async calculateTotalAppointments(periodDays) {
        try {
            const endDate = new Date();
            const startDate = new Date(endDate - periodDays * 24 * 60 * 60 * 1000);
            
            // Contar appointments direto da tabela appointments
            const { data, error } = await supabase
                .from('appointments')
                .select('id', { count: 'exact' })
                .gte('created_at', startDate.toISOString())
                .lte('created_at', endDate.toISOString());
                
            if (error) throw error;
            
            return {
                calculated_value: data?.length || 0,
                calculation_method: 'COUNT(appointments) in period',
                data_points: data?.length || 0
            };
        } catch (error) {
            return { error: error.message };
        }
    }
    
    async calculateTotalConversations(periodDays) {
        try {
            const endDate = new Date();
            const startDate = new Date(endDate - periodDays * 24 * 60 * 60 * 1000);
            
            // Contar conversas da tabela conversation_history
            const { data, error } = await supabase
                .from('conversation_history')
                .select('id', { count: 'exact' })
                .gte('created_at', startDate.toISOString())
                .lte('created_at', endDate.toISOString());
                
            if (error) throw error;
            
            return {
                calculated_value: data?.length || 0,
                calculation_method: 'COUNT(conversation_history) in period',
                data_points: data?.length || 0
            };
        } catch (error) {
            return { error: error.message };
        }
    }
    
    async calculateTotalCustomers(periodDays) {
        try {
            const endDate = new Date();
            const startDate = new Date(endDate - periodDays * 24 * 60 * 60 * 1000);
            
            // Contar usuários únicos que interagiram no período
            const { data, error } = await supabase
                .from('user_tenants')
                .select('user_id')
                .gte('first_interaction', startDate.toISOString())
                .lte('last_interaction', endDate.toISOString());
                
            if (error) throw error;
            
            const uniqueCustomers = new Set(data.map(item => item.user_id));
            
            return {
                calculated_value: uniqueCustomers.size,
                calculation_method: 'COUNT(DISTINCT user_tenants.user_id) in period',
                data_points: data.length
            };
        } catch (error) {
            return { error: error.message };
        }
    }
    
    async calculateOperationalEfficiency(periodDays) {
        try {
            const endDate = new Date();
            const startDate = new Date(endDate - periodDays * 24 * 60 * 60 * 1000);
            
            // Média da operational efficiency dos tenants
            const { data, error } = await supabase
                .from('tenant_metrics')
                .select('comprehensive->operational_efficiency_pct')
                .eq('period_days', periodDays)
                .gte('created_at', startDate.toISOString())
                .lte('created_at', endDate.toISOString());
                
            if (error) throw error;
            
            const validEfficiencies = data
                .map(item => parseFloat(item.comprehensive?.operational_efficiency_pct || 0))
                .filter(val => !isNaN(val) && val > 0);
                
            const avgEfficiency = validEfficiencies.length > 0 ? 
                validEfficiencies.reduce((a, b) => a + b, 0) / validEfficiencies.length : 0;
            
            return {
                calculated_value: Math.round(avgEfficiency * 100) / 100,
                calculation_method: 'AVG(tenant_metrics.comprehensive.operational_efficiency_pct)',
                data_points: validEfficiencies.length
            };
        } catch (error) {
            return { error: error.message };
        }
    }
    
    async calculateRevenueUsageRatio(periodDays) {
        try {
            // Calcular proporção entre receita dos negócios e custo da plataforma
            const totalRevenue = await this.calculateTotalRevenue(periodDays);
            const platformMRR = await this.calculatePlatformMRR(periodDays);
            
            if (totalRevenue.error || platformMRR.error) {
                return { error: 'Erro ao calcular componentes do ratio' };
            }
            
            const ratio = platformMRR.calculated_value > 0 ? 
                (totalRevenue.calculated_value / platformMRR.calculated_value) * 100 : 0;
            
            return {
                calculated_value: Math.round(ratio * 100) / 100,
                calculation_method: '(total_revenue / platform_mrr) * 100',
                components: {
                    total_revenue: totalRevenue.calculated_value,
                    platform_mrr: platformMRR.calculated_value
                }
            };
        } catch (error) {
            return { error: error.message };
        }
    }
    
    compareValues(calculated, stored) {
        const discrepancies = {};
        
        // Mapear campos calculados para campos da tabela
        const fieldMapping = {
            platform_mrr: 'platform_mrr',
            total_revenue: 'total_revenue', 
            active_tenants: 'active_tenants',
            total_appointments: 'total_appointments',
            total_conversations: 'total_conversations',
            total_customers: 'total_customers',
            operational_efficiency: 'operational_efficiency_pct',
            revenue_usage_ratio: 'receita_uso_ratio'
        };
        
        for (const [calcField, dbField] of Object.entries(fieldMapping)) {
            const calcValue = calculated[calcField]?.calculated_value;
            const storedValue = parseFloat(stored[dbField]);
            
            if (calcValue !== undefined && !isNaN(storedValue)) {
                const difference = Math.abs(calcValue - storedValue);
                const percentageDiff = storedValue > 0 ? (difference / storedValue) * 100 : 100;
                
                discrepancies[calcField] = {
                    calculated: calcValue,
                    stored: storedValue,
                    difference: difference,
                    percentage_diff: Math.round(percentageDiff * 100) / 100,
                    status: percentageDiff < 5 ? 'OK' : (percentageDiff < 15 ? 'WARNING' : 'ERROR')
                };
            }
        }
        
        return discrepancies;
    }
    
    generateValidationStatus(discrepancies) {
        const status = {};
        let totalChecks = 0;
        let passedChecks = 0;
        let warnings = 0;
        let errors = 0;
        
        for (const [field, data] of Object.entries(discrepancies)) {
            totalChecks++;
            status[field] = data.status;
            
            if (data.status === 'OK') passedChecks++;
            else if (data.status === 'WARNING') warnings++;
            else if (data.status === 'ERROR') errors++;
        }
        
        return {
            total_checks: totalChecks,
            passed: passedChecks,
            warnings: warnings,
            errors: errors,
            overall_status: errors > 0 ? 'FAIL' : (warnings > 0 ? 'WARNING' : 'PASS'),
            success_rate: Math.round((passedChecks / totalChecks) * 100)
        };
    }
    
    async generateValidationReport(results) {
        const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
        const reportFile = `platform-metrics-validation-${timestamp}.json`;
        
        // Salvar relatório completo em JSON
        fs.writeFileSync(reportFile, JSON.stringify(results, null, 2));
        
        // Gerar relatório resumido em texto
        const summaryFile = `platform-metrics-summary-${timestamp}.txt`;
        let summary = `RELATÓRIO DE VALIDAÇÃO DAS MÉTRICAS DA PLATAFORMA\n`;
        summary += `Gerado em: ${new Date().toISOString()}\n`;
        summary += `${'='.repeat(60)}\n\n`;
        
        for (const [period, data] of Object.entries(results)) {
            if (!data.validation_status) continue;
            
            summary += `PERÍODO: ${period} dias\n`;
            summary += `-`.repeat(30) + '\n';
            summary += `Status Geral: ${data.validation_status.overall_status}\n`;
            summary += `Taxa de Sucesso: ${data.validation_status.success_rate}%\n`;
            summary += `Checks: ${data.validation_status.passed}/${data.validation_status.total_checks}\n`;
            summary += `Warnings: ${data.validation_status.warnings}\n`;
            summary += `Errors: ${data.validation_status.errors}\n\n`;
            
            summary += `DISCREPÂNCIAS DETALHADAS:\n`;
            for (const [field, disc] of Object.entries(data.discrepancies)) {
                summary += `  ${field}: ${disc.status}\n`;
                summary += `    Calculado: ${disc.calculated}\n`;
                summary += `    Armazenado: ${disc.stored}\n`;
                summary += `    Diferença: ${disc.difference} (${disc.percentage_diff}%)\n`;
            }
            summary += '\n';
        }
        
        fs.writeFileSync(summaryFile, summary);
        
        console.log(`\n📄 Relatório detalhado salvo em: ${reportFile}`);
        console.log(`📋 Resumo salvo em: ${summaryFile}`);
        
        return { reportFile, summaryFile };
    }
}

// Executar validação
async function main() {
    const validator = new PlatformMetricsValidator();
    
    try {
        await validator.validateAllMetrics();
        console.log('\n✅ Validação completa finalizada!');
    } catch (error) {
        console.error('\n❌ Erro durante validação:', error);
    }
}

if (require.main === module) {
    main();
}

module.exports = PlatformMetricsValidator;