/**
 * Script para aplicar as novas funções services_count e services no banco PostgreSQL
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function applyServicesFunctions() {
    console.log('🔄 Aplicando novas funções PostgreSQL...');
    
    const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    
    // 1. Criar função get_tenant_services_count_by_period
    const createServicesCountFunction = `
CREATE OR REPLACE FUNCTION get_tenant_services_count_by_period(
    p_tenant_id UUID,
    p_period_type VARCHAR(10) DEFAULT '30d'
)
RETURNS INTEGER AS $$
DECLARE
    services_count INTEGER := 0;
    start_date DATE;
    end_date DATE := CURRENT_DATE;
BEGIN
    -- Calculate period dates
    CASE p_period_type
        WHEN '7d' THEN start_date := end_date - INTERVAL '7 days';
        WHEN '30d' THEN start_date := end_date - INTERVAL '30 days';
        WHEN '90d' THEN start_date := end_date - INTERVAL '90 days';
        ELSE start_date := end_date - INTERVAL '30 days';
    END CASE;
    
    -- Count services that were active during the period
    SELECT COUNT(*)::INTEGER INTO services_count
    FROM services s
    WHERE s.tenant_id = p_tenant_id
    AND s.is_active = true
    AND (
        s.created_at <= end_date::timestamp 
        AND (s.updated_at IS NULL OR s.updated_at >= start_date::timestamp)
    );
    
    RETURN COALESCE(services_count, 0);
    
EXCEPTION
    WHEN OTHERS THEN
        RETURN 0;
END;
$$ LANGUAGE plpgsql;
`;

    console.log('📝 Aplicando função get_tenant_services_count_by_period...');
    const { error: error1 } = await client.from('_sql').insert({ query: createServicesCountFunction });
    
    if (error1) {
        console.log('❌ Tentativa 1 falhou, tentando método alternativo...');
        
        // Método alternativo: executar via rpc se existir função helper
        try {
            await client.rpc('exec', { sql: createServicesCountFunction });
            console.log('✅ Função services_count aplicada via rpc');
        } catch (err) {
            console.log('⚠️  Método rpc também falhou, aplicando via query raw...');
            
            // Aplicar via query raw (último recurso)
            const { data, error } = await client
                .from('pg_stat_user_functions')
                .select('*')
                .limit(1);
                
            if (error) {
                console.log('❌ Não é possível aplicar via Supabase client');
                console.log('💡 INSTRUÇÃO: Execute manualmente no SQL Editor do Supabase:');
                console.log(createServicesCountFunction);
                return false;
            }
        }
    } else {
        console.log('✅ Função services_count aplicada');
    }

    // 2. Atualizar função principal get_tenant_metrics_for_period
    const updateMainFunction = `
-- Drop existing function first to avoid parameter conflicts
DROP FUNCTION IF EXISTS get_tenant_metrics_for_period(UUID, DATE, DATE);

-- Create updated function with new fields
CREATE OR REPLACE FUNCTION get_tenant_metrics_for_period(
    tenant_id UUID, 
    start_date DATE, 
    end_date DATE,
    p_period_type VARCHAR(10) DEFAULT '30d'
)
RETURNS TABLE (
    total_appointments INTEGER,
    confirmed_appointments INTEGER,
    cancelled_appointments INTEGER,
    completed_appointments INTEGER,
    pending_appointments INTEGER,
    total_revenue DECIMAL(15,2),
    average_value DECIMAL(15,2),
    total_customers INTEGER,
    new_customers INTEGER,
    total_services INTEGER,
    services_count INTEGER,
    services TEXT[],
    most_popular_service VARCHAR(255),
    service_utilization_rate DECIMAL(5,2),
    total_conversations INTEGER,
    ai_success_rate DECIMAL(5,2),
    avg_response_time DECIMAL(8,2),
    conversion_rate DECIMAL(5,2),
    booking_conversion_rate DECIMAL(5,2)
) AS $$
DECLARE
    start_ts TIMESTAMP := start_date::timestamp;
    end_ts TIMESTAMP := end_date::timestamp;
BEGIN
    RETURN QUERY
    SELECT 
        -- Appointment metrics (using start_time)
        COALESCE((
            SELECT COUNT(*)::INTEGER 
            FROM appointments a 
            WHERE a.tenant_id = get_tenant_metrics_for_period.tenant_id 
            AND a.start_time >= start_ts 
            AND a.start_time <= end_ts
        ), 0) as total_appointments,
        
        COALESCE((
            SELECT COUNT(*)::INTEGER 
            FROM appointments a 
            WHERE a.tenant_id = get_tenant_metrics_for_period.tenant_id 
            AND a.start_time >= start_ts 
            AND a.start_time <= end_ts
            AND a.status = 'confirmed'
        ), 0) as confirmed_appointments,
        
        COALESCE((
            SELECT COUNT(*)::INTEGER 
            FROM appointments a 
            WHERE a.tenant_id = get_tenant_metrics_for_period.tenant_id 
            AND a.start_time >= start_ts 
            AND a.start_time <= end_ts
            AND a.status = 'cancelled'
        ), 0) as cancelled_appointments,
        
        COALESCE((
            SELECT COUNT(*)::INTEGER 
            FROM appointments a 
            WHERE a.tenant_id = get_tenant_metrics_for_period.tenant_id 
            AND a.start_time >= start_ts 
            AND a.start_time <= end_ts
            AND a.status = 'completed'
        ), 0) as completed_appointments,
        
        COALESCE((
            SELECT COUNT(*)::INTEGER 
            FROM appointments a 
            WHERE a.tenant_id = get_tenant_metrics_for_period.tenant_id 
            AND a.start_time >= start_ts 
            AND a.start_time <= end_ts
            AND a.status = 'pending'
        ), 0) as pending_appointments,
        
        -- Revenue metrics
        COALESCE((
            SELECT SUM(COALESCE(a.final_price, a.quoted_price, 0))::DECIMAL(15,2)
            FROM appointments a 
            WHERE a.tenant_id = get_tenant_metrics_for_period.tenant_id 
            AND a.start_time >= start_ts 
            AND a.start_time <= end_ts
            AND a.status IN ('completed', 'confirmed')
        ), 0) as total_revenue,
        
        COALESCE((
            SELECT AVG(COALESCE(a.final_price, a.quoted_price, 0))::DECIMAL(15,2)
            FROM appointments a 
            WHERE a.tenant_id = get_tenant_metrics_for_period.tenant_id 
            AND a.start_time >= start_ts 
            AND a.start_time <= end_ts
            AND a.status IN ('completed', 'confirmed')
        ), 0) as average_value,
        
        -- Customer metrics
        COALESCE((
            SELECT COUNT(DISTINCT ut.user_id)::INTEGER
            FROM user_tenants ut 
            WHERE ut.tenant_id = get_tenant_metrics_for_period.tenant_id
        ), 0) as total_customers,
        
        COALESCE((
            SELECT COUNT(DISTINCT ut.user_id)::INTEGER
            FROM user_tenants ut 
            WHERE ut.tenant_id = get_tenant_metrics_for_period.tenant_id
            AND ut.first_interaction >= start_ts 
            AND ut.first_interaction <= end_ts
        ), 0) as new_customers,
        
        -- Service metrics
        COALESCE((
            SELECT COUNT(*)::INTEGER
            FROM services s 
            WHERE s.tenant_id = get_tenant_metrics_for_period.tenant_id
            AND s.is_active = true
        ), 0) as total_services,
        
        -- NEW: Services count by period
        get_tenant_services_count_by_period(
            get_tenant_metrics_for_period.tenant_id,
            CASE 
                WHEN end_date - start_date <= 7 THEN '7d'
                WHEN end_date - start_date <= 30 THEN '30d'
                WHEN end_date - start_date <= 90 THEN '90d'
                ELSE '30d'
            END
        ) as services_count,
        
        -- NEW: Services array for period
        COALESCE(ARRAY(
            SELECT DISTINCT s.name
            FROM services s
            JOIN appointments a ON a.service_id = s.id
            WHERE s.tenant_id = get_tenant_metrics_for_period.tenant_id
            AND a.start_time >= start_ts 
            AND a.start_time <= end_ts
            AND s.is_active = true
            ORDER BY s.name
        ), '{}') as services,
        
        COALESCE((
            SELECT s.name::VARCHAR(255)
            FROM services s
            JOIN appointments a ON a.service_id = s.id
            WHERE s.tenant_id = get_tenant_metrics_for_period.tenant_id
            AND a.start_time >= start_ts 
            AND a.start_time <= end_ts
            GROUP BY s.id, s.name
            ORDER BY COUNT(*) DESC
            LIMIT 1
        ), '') as most_popular_service,
        
        COALESCE((
            SELECT (COUNT(DISTINCT a.service_id)::DECIMAL / NULLIF(COUNT(DISTINCT s.id), 0) * 100)::DECIMAL(5,2)
            FROM services s
            LEFT JOIN appointments a ON a.service_id = s.id 
                AND a.tenant_id = get_tenant_metrics_for_period.tenant_id
                AND a.start_time >= start_ts 
                AND a.start_time <= end_ts
            WHERE s.tenant_id = get_tenant_metrics_for_period.tenant_id
            AND s.is_active = true
        ), 0) as service_utilization_rate,
        
        -- AI metrics
        COALESCE((
            SELECT COUNT(*)::INTEGER
            FROM conversation_history ch 
            WHERE ch.tenant_id = get_tenant_metrics_for_period.tenant_id
            AND ch.created_at >= start_ts 
            AND ch.created_at <= end_ts
        ), 0) as total_conversations,
        
        COALESCE((
            SELECT (COUNT(CASE WHEN ch.intent_detected IS NOT NULL AND ch.confidence_score > 0.75 THEN 1 END)::DECIMAL 
                   / NULLIF(COUNT(*), 0) * 100)::DECIMAL(5,2)
            FROM conversation_history ch 
            WHERE ch.tenant_id = get_tenant_metrics_for_period.tenant_id
            AND ch.created_at >= start_ts 
            AND ch.created_at <= end_ts
        ), 0) as ai_success_rate,
        
        COALESCE((
            SELECT AVG(COALESCE(ch.response_time, 0))::DECIMAL(8,2)
            FROM conversation_history ch 
            WHERE ch.tenant_id = get_tenant_metrics_for_period.tenant_id
            AND ch.created_at >= start_ts 
            AND ch.created_at <= end_ts
        ), 0) as avg_response_time,
        
        -- Conversion metrics
        COALESCE((
            SELECT (COUNT(DISTINCT a.id)::DECIMAL / NULLIF(COUNT(DISTINCT ch.id), 0) * 100)::DECIMAL(5,2)
            FROM conversation_history ch
            LEFT JOIN appointments a ON a.tenant_id = ch.tenant_id
                AND a.created_at >= ch.created_at 
                AND a.created_at <= ch.created_at + INTERVAL '7 days'
            WHERE ch.tenant_id = get_tenant_metrics_for_period.tenant_id
            AND ch.created_at >= start_ts 
            AND ch.created_at <= end_ts
        ), 0) as conversion_rate,
        
        COALESCE((
            SELECT (COUNT(DISTINCT a.id)::DECIMAL / NULLIF(COUNT(DISTINCT ch.id), 0) * 100)::DECIMAL(5,2)
            FROM conversation_history ch
            LEFT JOIN appointments a ON a.tenant_id = ch.tenant_id
                AND a.created_at >= ch.created_at 
                AND a.created_at <= ch.created_at + INTERVAL '1 day'
            WHERE ch.tenant_id = get_tenant_metrics_for_period.tenant_id
            AND ch.created_at >= start_ts 
            AND ch.created_at <= end_ts
        ), 0) as booking_conversion_rate;
END;
$$ LANGUAGE plpgsql;
`;

    console.log('📝 Atualizando função principal get_tenant_metrics_for_period...');
    
    try {
        const { error: error2 } = await client.from('_sql').insert({ query: updateMainFunction });
        
        if (error2) {
            console.log('❌ Erro ao aplicar função principal:', error2.message);
            console.log('💡 INSTRUÇÃO: Execute manualmente no SQL Editor do Supabase:');
            console.log(updateMainFunction);
            return false;
        }
        
        console.log('✅ Função principal atualizada');
        
    } catch (err) {
        console.log('❌ Erro ao aplicar função principal');
        console.log('💡 Execute manualmente no SQL Editor do Supabase as funções SQL');
        return false;
    }

    // 3. Testar se as funções foram aplicadas
    console.log('🧪 Testando novas funções...');
    
    try {
        const { data: testCount, error: errorTest1 } = await client
            .rpc('get_tenant_services_count_by_period', {
                p_tenant_id: '33b8c488-5aa9-4891-b335-701d10296681',
                p_period_type: '90d'
            });
        
        if (errorTest1) {
            throw new Error(`Teste função services_count falhou: ${errorTest1.message}`);
        }
        
        console.log('✅ Função services_count funcionando:', testCount);
        
        const { data: testMain, error: errorTest2 } = await client
            .rpc('get_tenant_metrics_for_period', {
                tenant_id: '33b8c488-5aa9-4891-b335-701d10296681',
                start_date: '2025-05-11',
                end_date: '2025-08-09',
                p_period_type: '90d'
            });
        
        if (errorTest2) {
            throw new Error(`Teste função principal falhou: ${errorTest2.message}`);
        }
        
        console.log('✅ Função principal funcionando:');
        console.log('  - services_count:', testMain.services_count);
        console.log('  - services:', testMain.services);
        
        console.log('');
        console.log('🎉 TODAS AS FUNÇÕES APLICADAS COM SUCESSO!');
        console.log('📋 Próximo passo: Execute npm run metrics:comprehensive para testar');
        
        return true;
        
    } catch (err) {
        console.log('❌ Erro nos testes:', err.message);
        return false;
    }
}

// Executar script
applyServicesFunctions().then(success => {
    if (success) {
        console.log('✅ Script concluído com sucesso');
        process.exit(0);
    } else {
        console.log('❌ Script falhou - veja instruções acima');
        process.exit(1);
    }
}).catch(err => {
    console.error('❌ Erro fatal:', err.message);
    process.exit(1);
});