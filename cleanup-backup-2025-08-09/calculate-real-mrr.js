/**
 * Calcular MRR Real da Plataforma
 * MRR = Monthly Recurring Revenue (receita recorrente mensal)
 * Baseado em assinaturas/planos dos tenants, não appointments pontuais
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Erro: Variáveis SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Explorar tabelas relacionadas a billing/subscriptions
 */
async function exploreSubscriptionTables() {
    console.log('🔍 Explorando tabelas de assinaturas e billing...');
    
    const potentialTables = [
        'subscriptions',
        'tenant_subscriptions', 
        'billing',
        'tenant_billing',
        'plans',
        'subscription_plans',
        'payments',
        'invoices',
        'tenant_plans',
        'platform_billing'
    ];
    
    const foundTables = [];
    
    for (const tableName of potentialTables) {
        try {
            const { data, error, count } = await supabase
                .from(tableName)
                .select('*', { count: 'exact' })
                .limit(1);
                
            if (!error && data !== null) {
                console.log(`✅ Tabela ${tableName} encontrada: ${count} registros`);
                if (data.length > 0) {
                    console.log(`   Campos: ${Object.keys(data[0]).join(', ')}`);
                    console.log(`   Exemplo: ${JSON.stringify(data[0], null, 2)}`);
                }
                foundTables.push({ name: tableName, count, fields: data.length > 0 ? Object.keys(data[0]) : [] });
            } else {
                console.log(`❌ Tabela ${tableName}: ${error?.message || 'não encontrada'}`);
            }
        } catch (e) {
            console.log(`❌ Tabela ${tableName}: erro ao acessar`);
        }
    }
    
    return foundTables;
}

/**
 * Analisar tabela de tenants para entender modelo de cobrança
 */
async function analyzeTenantBilling() {
    console.log('\n🔍 Analisando modelo de billing dos tenants...');
    
    try {
        const { data: tenants, error } = await supabase
            .from('tenants')
            .select('*')
            .limit(5);
            
        if (error) throw error;
        
        if (tenants && tenants.length > 0) {
            console.log(`✅ Tabela tenants encontrada com ${tenants.length} registros de amostra`);
            console.log(`   Campos: ${Object.keys(tenants[0]).join(', ')}`);
            
            // Verificar se há campos relacionados a billing
            const billingFields = Object.keys(tenants[0]).filter(field => 
                field.toLowerCase().includes('plan') ||
                field.toLowerCase().includes('subscription') ||
                field.toLowerCase().includes('billing') ||
                field.toLowerCase().includes('price') ||
                field.toLowerCase().includes('mrr') ||
                field.toLowerCase().includes('payment')
            );
            
            if (billingFields.length > 0) {
                console.log(`   Campos de billing encontrados: ${billingFields.join(', ')}`);
                
                tenants.forEach((tenant, index) => {
                    console.log(`\n   Tenant ${index + 1} (${tenant.name}):`);
                    billingFields.forEach(field => {
                        console.log(`     ${field}: ${JSON.stringify(tenant[field])}`);
                    });
                });
            } else {
                console.log('   ⚠️ Nenhum campo de billing encontrado na tabela tenants');
            }
        }
        
        return tenants;
        
    } catch (error) {
        console.error('❌ Erro ao analisar tenants:', error.message);
        return null;
    }
}

/**
 * Calcular MRR baseado em conversation billing (se disponível)
 */
async function calculateConversationBasedMRR() {
    console.log('\n💰 Tentando calcular MRR baseado em usage/conversations...');
    
    try {
        // Verificar se existe sistema de cobrança por conversa/uso
        const tables = ['conversation_billing', 'usage_billing', 'tenant_usage', 'billing_records'];
        
        for (const tableName of tables) {
            try {
                const { data, error, count } = await supabase
                    .from(tableName)
                    .select('*', { count: 'exact' })
                    .limit(5);
                    
                if (!error && data && count > 0) {
                    console.log(`✅ Encontrada tabela ${tableName} com ${count} registros`);
                    console.log(`   Campos: ${Object.keys(data[0]).join(', ')}`);
                    
                    // Se encontrar dados de billing, tentar calcular MRR
                    return await calculateMRRFromBillingData(tableName, data);
                }
            } catch (e) {
                // Continuar para próxima tabela
            }
        }
        
        console.log('⚠️ Nenhuma tabela de billing/usage encontrada');
        return null;
        
    } catch (error) {
        console.error('❌ Erro no cálculo de MRR:', error.message);
        return null;
    }
}

/**
 * Calcular MRR a partir de dados de billing
 */
async function calculateMRRFromBillingData(tableName, sampleData) {
    console.log(`\n📊 Calculando MRR da tabela ${tableName}...`);
    
    try {
        // Buscar todos os dados de billing dos últimos 90 dias
        const { data: billingData, error } = await supabase
            .from(tableName)
            .select('*')
            .gte('created_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())
            .order('created_at', { ascending: false });
            
        if (error) throw error;
        
        if (!billingData || billingData.length === 0) {
            console.log('⚠️ Nenhum dado de billing encontrado nos últimos 90 dias');
            return null;
        }
        
        console.log(`📊 Encontrados ${billingData.length} registros de billing`);
        
        // Agrupar por tenant e período
        const periods = [7, 30, 90];
        const mrrByPeriod = {};
        
        periods.forEach(days => {
            const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
            const periodData = billingData.filter(record => new Date(record.created_at) >= cutoffDate);
            
            // Calcular MRR baseado nos campos disponíveis
            let totalMRR = 0;
            const tenantMRR = {};
            
            periodData.forEach(record => {
                const tenantId = record.tenant_id;
                
                // Tentar identificar valor de MRR nos campos disponíveis
                const possibleMRRFields = ['mrr', 'monthly_revenue', 'subscription_value', 'monthly_cost', 'total_cost'];
                let recordMRR = 0;
                
                for (const field of possibleMRRFields) {
                    if (record[field] && !isNaN(parseFloat(record[field]))) {
                        recordMRR = parseFloat(record[field]);
                        break;
                    }
                }
                
                if (recordMRR > 0) {
                    if (!tenantMRR[tenantId]) {
                        tenantMRR[tenantId] = 0;
                    }
                    tenantMRR[tenantId] += recordMRR;
                }
            });
            
            totalMRR = Object.values(tenantMRR).reduce((sum, mrr) => sum + mrr, 0);
            
            mrrByPeriod[`${days}d`] = {
                period_days: days,
                total_mrr: totalMRR,
                tenant_count: Object.keys(tenantMRR).length,
                tenant_mrr: tenantMRR,
                records_count: periodData.length
            };
            
            console.log(`📅 ${days} dias: MRR Total = R$ ${totalMRR.toFixed(2)} (${Object.keys(tenantMRR).length} tenants)`);
        });
        
        return mrrByPeriod;
        
    } catch (error) {
        console.error('❌ Erro no cálculo de MRR:', error.message);
        return null;
    }
}

/**
 * Formatar valor em Real brasileiro
 */
function formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(value);
}

async function main() {
    try {
        console.log('💰 CÁLCULO DE MRR REAL DA PLATAFORMA');
        console.log('='.repeat(50));
        
        // 1. Explorar estrutura de billing
        const subscriptionTables = await exploreSubscriptionTables();
        
        // 2. Analisar tenants
        const tenantData = await analyzeTenantBilling();
        
        // 3. Calcular MRR baseado em dados disponíveis
        const mrrData = await calculateConversationBasedMRR();
        
        console.log('\n📋 RESUMO FINAL');
        console.log('='.repeat(30));
        
        if (mrrData) {
            console.log('✅ MRR da Plataforma calculado:');
            Object.keys(mrrData).forEach(period => {
                const data = mrrData[period];
                console.log(`📅 ${period}: ${formatCurrency(data.total_mrr)} (${data.tenant_count} tenants ativos)`);
            });
            
            // Salvar relatório
            const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
            const filename = `platform-mrr-${timestamp}.json`;
            
            const report = {
                calculation_date: new Date().toISOString(),
                mrr_by_period: mrrData,
                subscription_tables_found: subscriptionTables,
                methodology: 'Based on billing/usage data from available tables'
            };
            
            fs.writeFileSync(filename, JSON.stringify(report, null, 2), 'utf8');
            console.log(`📄 Relatório salvo: ${filename}`);
        } else {
            console.log('⚠️ MRR não pôde ser calculado com os dados disponíveis');
            console.log('💡 Motivos possíveis:');
            console.log('   - Sistema pode ser baseado em revenue por appointment, não SaaS recorrente');
            console.log('   - Tabelas de assinatura/billing não identificadas');
            console.log('   - Modelo de cobrança diferente do tradicional MRR');
        }
        
    } catch (error) {
        console.error('\n💥 ERRO:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = { exploreSubscriptionTables, calculateConversationBasedMRR };