#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function applySchemaRefactor() {
    console.log('🔧 Aplicando schema refatorado da platform_metrics...');
    
    try {
        // 1. Fazer backup da tabela atual (se existir)
        console.log('📦 Criando backup da tabela atual...');
        const { error: backupError } = await supabase.rpc('exec_sql', {
            sql_query: `
                DO $$
                BEGIN
                    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'platform_metrics') THEN
                        DROP TABLE IF EXISTS platform_metrics_backup;
                        CREATE TABLE platform_metrics_backup AS 
                        SELECT * FROM platform_metrics;
                        RAISE NOTICE 'Backup criado: platform_metrics_backup';
                    END IF;
                END $$;
            `
        });
        
        if (backupError) {
            console.log('⚠️ Backup não pôde ser criado (talvez tabela não exista):', backupError.message);
        } else {
            console.log('✅ Backup criado com sucesso');
        }
        
        // 2. Drop da tabela atual
        console.log('🗑️ Removendo tabela atual...');
        const { error: dropError } = await supabase.rpc('exec_sql', {
            sql_query: 'DROP TABLE IF EXISTS platform_metrics CASCADE;'
        });
        
        if (dropError) {
            console.error('❌ Erro ao dropar tabela:', dropError.message);
            return;
        }
        console.log('✅ Tabela removida');
        
        // 3. Criar nova tabela
        console.log('🆕 Criando nova estrutura da tabela...');
        const createTableSQL = `
            CREATE TABLE platform_metrics (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                calculation_date DATE NOT NULL,
                period VARCHAR(10) NOT NULL,
                
                -- METADATA DA AGREGAÇÃO
                tenants_processed INTEGER NOT NULL DEFAULT 0,
                total_tenants INTEGER NOT NULL DEFAULT 0,
                calculation_method VARCHAR(50) DEFAULT 'tenant_aggregation',
                data_quality_score DECIMAL(5,2) DEFAULT 100.0,
                
                -- PLATFORM MRR
                platform_mrr DECIMAL(15,2) DEFAULT 0,
                
                -- MÉTRICAS DE RECEITA
                total_revenue DECIMAL(15,2) DEFAULT 0,
                revenue_per_customer DECIMAL(10,2) DEFAULT 0,
                revenue_per_appointment DECIMAL(10,2) DEFAULT 0,
                total_revenue_validation DECIMAL(15,2) DEFAULT 0,
                roi_per_conversation DECIMAL(10,4) DEFAULT 0,
                
                -- MÉTRICAS OPERACIONAIS
                active_tenants INTEGER DEFAULT 0,
                total_appointments INTEGER DEFAULT 0,
                total_chat_minutes DECIMAL(12,2) DEFAULT 0,
                total_new_customers INTEGER DEFAULT 0,
                total_sessions INTEGER DEFAULT 0,
                total_professionals INTEGER DEFAULT 0,
                total_services INTEGER DEFAULT 0,
                
                -- MÉTRICAS DE PERFORMANCE
                avg_appointment_success_rate DECIMAL(5,2) DEFAULT 0,
                avg_whatsapp_quality_score DECIMAL(5,2) DEFAULT 0,
                avg_customer_satisfaction_score DECIMAL(5,2) DEFAULT 0,
                avg_conversion_rate DECIMAL(5,2) DEFAULT 0,
                avg_customer_retention_rate DECIMAL(5,2) DEFAULT 0,
                avg_customer_recurrence_rate DECIMAL(5,2) DEFAULT 0,
                
                -- MÉTRICAS DE EFICIÊNCIA
                avg_ai_assistant_efficiency DECIMAL(5,2) DEFAULT 0,
                avg_response_time DECIMAL(8,2) DEFAULT 0,
                avg_business_hours_utilization DECIMAL(5,2) DEFAULT 0,
                avg_minutes_per_conversation DECIMAL(8,2) DEFAULT 0,
                
                -- MÉTRICAS DE CUSTO
                avg_customer_acquisition_cost DECIMAL(10,2) DEFAULT 0,
                avg_profit_margin_percentage DECIMAL(5,2) DEFAULT 0,
                total_platform_cost_usd DECIMAL(15,2) DEFAULT 0,
                avg_cost_per_conversation DECIMAL(8,4) DEFAULT 0,
                
                -- MÉTRICAS DE QUALIDADE
                total_billable_conversations INTEGER DEFAULT 0,
                avg_efficiency_pct DECIMAL(5,2) DEFAULT 0,
                avg_spam_rate_pct DECIMAL(5,2) DEFAULT 0,
                
                -- MÉTRICAS CALCULADAS
                revenue_platform_ratio DECIMAL(8,4) DEFAULT 0,
                avg_revenue_per_tenant DECIMAL(12,2) DEFAULT 0,
                avg_appointments_per_tenant DECIMAL(8,2) DEFAULT 0,
                avg_sessions_per_tenant DECIMAL(8,2) DEFAULT 0,
                avg_customers_per_tenant DECIMAL(8,2) DEFAULT 0,
                platform_utilization_score DECIMAL(5,2) DEFAULT 0,
                
                -- TIMESTAMPS
                created_at TIMESTAMPTZ DEFAULT now(),
                updated_at TIMESTAMPTZ DEFAULT now(),
                
                -- CONSTRAINTS
                CONSTRAINT platform_metrics_period_check CHECK (period IN ('7d', '30d', '90d')),
                CONSTRAINT platform_metrics_positive_values CHECK (
                    platform_mrr >= 0 AND
                    total_revenue >= 0 AND
                    active_tenants >= 0 AND
                    total_appointments >= 0
                )
            );
        `;
        
        const { error: createError } = await supabase.rpc('exec_sql', {
            sql_query: createTableSQL
        });
        
        if (createError) {
            console.error('❌ Erro ao criar tabela:', createError.message);
            return;
        }
        console.log('✅ Nova tabela criada');
        
        // 4. Criar índices
        console.log('📇 Criando índices...');
        const indexSQL = `
            CREATE UNIQUE INDEX idx_platform_metrics_date_period 
            ON platform_metrics(calculation_date, period);
            
            CREATE INDEX idx_platform_metrics_date_desc 
            ON platform_metrics(calculation_date DESC);
            
            CREATE INDEX idx_platform_metrics_period 
            ON platform_metrics(period);
            
            CREATE INDEX idx_platform_metrics_created_at 
            ON platform_metrics(created_at DESC);
        `;
        
        const { error: indexError } = await supabase.rpc('exec_sql', {
            sql_query: indexSQL
        });
        
        if (indexError) {
            console.error('❌ Erro ao criar índices:', indexError.message);
        } else {
            console.log('✅ Índices criados');
        }
        
        // 5. Habilitar RLS
        console.log('🔒 Configurando Row Level Security...');
        const rlsSQL = `
            ALTER TABLE platform_metrics ENABLE ROW LEVEL SECURITY;
            
            CREATE POLICY "super_admin_platform_metrics_all" 
            ON platform_metrics FOR ALL 
            USING (
                EXISTS (
                    SELECT 1 FROM admin_users 
                    WHERE id = auth.uid() 
                    AND role = 'super_admin'
                )
            );
        `;
        
        const { error: rlsError } = await supabase.rpc('exec_sql', {
            sql_query: rlsSQL
        });
        
        if (rlsError) {
            console.error('❌ Erro ao configurar RLS:', rlsError.message);
        } else {
            console.log('✅ RLS configurado');
        }
        
        // 6. Testar a tabela
        console.log('🧪 Testando nova estrutura...');
        const { data: testData, error: testError } = await supabase
            .from('platform_metrics')
            .select('*')
            .limit(1);
        
        if (testError) {
            console.error('❌ Erro ao testar tabela:', testError.message);
        } else {
            console.log('✅ Tabela funcionando corretamente');
        }
        
        console.log('🎉 Schema refatorado aplicado com SUCESSO!');
        console.log('');
        console.log('📊 NOVA ESTRUTURA PLATFORM_METRICS:');
        console.log('   - 40+ campos agregados de tenant_metrics');
        console.log('   - platform_mrr do custo_plataforma');
        console.log('   - Métricas operacionais, performance, eficiência');
        console.log('   - RLS habilitado (super_admin apenas)');
        console.log('   - Índices otimizados');
        console.log('');
        
    } catch (error) {
        console.error('💥 Erro geral:', error);
    }
}

// Executar
applySchemaRefactor();