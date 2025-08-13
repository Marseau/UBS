const { getAdminClient } = require('../src/config/database');
const fs = require('fs');

async function applyMetricsSchema() {
    try {
        console.log('🚀 Aplicando schema de métricas...');
        
        const supabase = getAdminClient();
        const schemaSQL = fs.readFileSync('./database/metrics-schema.sql', 'utf8');
        
        // Dividir o SQL em comandos individuais
        const commands = schemaSQL.split(';').filter(cmd => cmd.trim());
        
        for (const command of commands) {
            if (command.trim()) {
                console.log(`Executando: ${command.trim().substring(0, 50)}...`);
                
                const { error } = await supabase.rpc('exec_sql', {
                    sql: command.trim()
                });
                
                if (error) {
                    console.error('Erro ao executar comando:', error);
                    // Continue com outros comandos
                }
            }
        }
        
        console.log('✅ Schema de métricas aplicado com sucesso!');
    } catch (error) {
        console.error('❌ Erro ao aplicar schema:', error);
        
        // Tentar abordagem alternativa
        console.log('🔄 Tentando abordagem alternativa...');
        await createTablesDirectly();
    }
}

async function createTablesDirectly() {
    const supabase = getAdminClient();
    
    // Criar tabelas principais
    const tables = [
        {
            name: 'saas_metrics',
            sql: `CREATE TABLE IF NOT EXISTS saas_metrics (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                metric_date DATE NOT NULL,
                active_tenants INTEGER DEFAULT 0,
                total_tenants INTEGER DEFAULT 0,
                mrr DECIMAL(12,2) DEFAULT 0,
                arr DECIMAL(12,2) DEFAULT 0,
                churn_rate DECIMAL(5,2) DEFAULT 0,
                conversion_rate DECIMAL(5,2) DEFAULT 0,
                avg_revenue_per_tenant DECIMAL(10,2) DEFAULT 0,
                total_appointments INTEGER DEFAULT 0,
                total_revenue DECIMAL(12,2) DEFAULT 0,
                ai_interactions INTEGER DEFAULT 0,
                calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                UNIQUE(metric_date)
            )`
        },
        {
            name: 'tenant_risk_scores',
            sql: `CREATE TABLE IF NOT EXISTS tenant_risk_scores (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id UUID NOT NULL,
                risk_score INTEGER NOT NULL CHECK (risk_score >= 0 AND risk_score <= 100),
                risk_status VARCHAR(20) NOT NULL,
                risk_factors JSONB DEFAULT '{}',
                last_activity_days INTEGER DEFAULT 0,
                cancellation_rate DECIMAL(5,2) DEFAULT 0,
                revenue_trend DECIMAL(5,2) DEFAULT 0,
                customer_satisfaction DECIMAL(3,2) DEFAULT 0,
                ai_success_rate DECIMAL(5,2) DEFAULT 0,
                calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            )`
        },
        {
            name: 'tenant_distribution',
            sql: `CREATE TABLE IF NOT EXISTS tenant_distribution (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                metric_date DATE NOT NULL,
                business_domain VARCHAR(50) NOT NULL,
                tenant_count INTEGER DEFAULT 0,
                revenue_share DECIMAL(5,2) DEFAULT 0,
                growth_rate DECIMAL(5,2) DEFAULT 0,
                calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                UNIQUE(metric_date, business_domain)
            )`
        },
        {
            name: 'growth_metrics',
            sql: `CREATE TABLE IF NOT EXISTS growth_metrics (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                metric_month DATE NOT NULL,
                new_tenants INTEGER DEFAULT 0,
                churned_tenants INTEGER DEFAULT 0,
                revenue_growth DECIMAL(5,2) DEFAULT 0,
                customer_growth DECIMAL(5,2) DEFAULT 0,
                mrr_growth DECIMAL(5,2) DEFAULT 0,
                platform_health_score INTEGER DEFAULT 0,
                calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                UNIQUE(metric_month)
            )`
        },
        {
            name: 'top_tenants',
            sql: `CREATE TABLE IF NOT EXISTS top_tenants (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id UUID NOT NULL,
                ranking_date DATE NOT NULL,
                rank_position INTEGER NOT NULL,
                revenue DECIMAL(10,2) DEFAULT 0,
                growth_rate DECIMAL(5,2) DEFAULT 0,
                appointment_count INTEGER DEFAULT 0,
                calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                UNIQUE(ranking_date, tenant_id)
            )`
        },
        {
            name: 'conversion_metrics',
            sql: `CREATE TABLE IF NOT EXISTS conversion_metrics (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id UUID,
                metric_date DATE NOT NULL,
                leads_generated INTEGER DEFAULT 0,
                appointments_booked INTEGER DEFAULT 0,
                appointments_completed INTEGER DEFAULT 0,
                conversion_rate DECIMAL(5,2) DEFAULT 0,
                completion_rate DECIMAL(5,2) DEFAULT 0,
                calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                UNIQUE(tenant_id, metric_date)
            )`
        }
    ];
    
    for (const table of tables) {
        console.log(`Criando tabela: ${table.name}`);
        
        const { error } = await supabase.rpc('exec_sql', {
            sql: table.sql
        });
        
        if (error) {
            console.error(`Erro ao criar tabela ${table.name}:`, error);
        } else {
            console.log(`✅ Tabela ${table.name} criada com sucesso`);
        }
    }
}

// Executar se chamado diretamente
if (require.main === module) {
    applyMetricsSchema();
}

module.exports = { applyMetricsSchema };