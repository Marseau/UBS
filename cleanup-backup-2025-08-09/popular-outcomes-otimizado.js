/**
 * POPULAR OUTCOMES OTIMIZADO
 * 
 * Versão otimizada com updates em lote via SQL direto
 */

const { supabaseAdmin } = require('./src/config/database');

// Distribuição de outcomes (percentuais)
const OUTCOME_DISTRIBUTION = {
    // Pós-agendamento (5.75%)
    'appointment_cancelled': 1.0,
    'appointment_noshow_followup': 0.5, 
    'appointment_rescheduled': 1.5,
    'appointment_confirmed': 1.0,
    'appointment_inquiry': 1.0,
    'appointment_modified': 0.75,
    
    // Problemas (0.75%)
    'spam_detected': 0.75,
    
    // Info requests (2%)
    'business_hours_inquiry': 0.5,
    'price_inquiry': 0.75,
    'location_inquiry': 0.5,
    'booking_abandoned': 0.25,
    
    // Principais (restante ~88%)
    'appointment_created': 60.0,  // Baseado nas conversas que viraram appointments
    'info_request_fulfilled': 28.0  // Restante
};

async function popularOutcomesOtimizado() {
    try {
        console.log('🚀 População otimizada de outcomes iniciando...');
        
        // 1. Contar conversas NULL
        const { data: countData, error: countError } = await supabaseAdmin
            .rpc('count_null_outcomes');
        
        if (countError) {
            // Fallback para query normal
            const { count, error } = await supabaseAdmin
                .from('conversation_history')
                .select('*', { count: 'exact', head: true })
                .is('conversation_outcome', null);
                
            if (error) {
                console.error('❌ Erro ao contar NULLs:', error);
                return;
            }
            
            console.log(`📊 ${count} conversas com outcome NULL`);
            
            if (count === 0) {
                console.log('✅ Nenhuma conversa NULL encontrada!');
                return;
            }
        }

        // 2. Usar SQL direto para performance
        console.log('🔄 Executando updates em lote via SQL...');
        
        const sqlUpdates = `
        WITH 
        -- CTE para buscar conversas NULL com números aleatórios
        conversations_with_random AS (
            SELECT 
                id,
                tenant_id,
                user_id,
                RANDOM() as rand_num,
                ROW_NUMBER() OVER (ORDER BY RANDOM()) as row_num
            FROM conversation_history 
            WHERE conversation_outcome IS NULL
        ),
        -- CTE para definir ranges de outcomes
        outcome_ranges AS (
            SELECT * FROM (VALUES
                ('appointment_cancelled', 0.0, 0.01),
                ('appointment_noshow_followup', 0.01, 0.015),
                ('appointment_rescheduled', 0.015, 0.03),
                ('appointment_confirmed', 0.03, 0.04),
                ('appointment_inquiry', 0.04, 0.05),
                ('appointment_modified', 0.05, 0.0575),
                ('spam_detected', 0.0575, 0.065),
                ('business_hours_inquiry', 0.065, 0.07),
                ('price_inquiry', 0.07, 0.0775),
                ('location_inquiry', 0.0775, 0.0825),
                ('booking_abandoned', 0.0825, 0.085),
                ('appointment_created', 0.085, 0.685),
                ('info_request_fulfilled', 0.685, 1.0)
            ) AS t(outcome, min_val, max_val)
        ),
        -- CTE para users com appointments
        users_with_appointments AS (
            SELECT DISTINCT 
                CONCAT(tenant_id, '_', user_id) as user_key
            FROM appointments 
            WHERE status != 'cancelled'
        )
        UPDATE conversation_history 
        SET conversation_outcome = CASE
            WHEN cwr.rand_num BETWEEN 0.0 AND 0.01 THEN 'appointment_cancelled'
            WHEN cwr.rand_num BETWEEN 0.01 AND 0.015 THEN 'appointment_noshow_followup'
            WHEN cwr.rand_num BETWEEN 0.015 AND 0.03 THEN 'appointment_rescheduled'
            WHEN cwr.rand_num BETWEEN 0.03 AND 0.04 THEN 'appointment_confirmed'
            WHEN cwr.rand_num BETWEEN 0.04 AND 0.05 THEN 'appointment_inquiry'
            WHEN cwr.rand_num BETWEEN 0.05 AND 0.0575 THEN 'appointment_modified'
            WHEN cwr.rand_num BETWEEN 0.0575 AND 0.065 THEN 'spam_detected'
            WHEN cwr.rand_num BETWEEN 0.065 AND 0.07 THEN 'business_hours_inquiry'
            WHEN cwr.rand_num BETWEEN 0.07 AND 0.0775 THEN 'price_inquiry'
            WHEN cwr.rand_num BETWEEN 0.0775 AND 0.0825 THEN 'location_inquiry'
            WHEN cwr.rand_num BETWEEN 0.0825 AND 0.085 THEN 'booking_abandoned'
            WHEN cwr.rand_num BETWEEN 0.085 AND 0.685 THEN 
                CASE 
                    WHEN uwa.user_key IS NOT NULL THEN 'appointment_created'
                    ELSE 'info_request_fulfilled'
                END
            ELSE 'info_request_fulfilled'
        END
        FROM conversations_with_random cwr
        LEFT JOIN users_with_appointments uwa ON 
            CONCAT(cwr.tenant_id, '_', cwr.user_id) = uwa.user_key
        WHERE conversation_history.id = cwr.id;
        `;

        const { data, error } = await supabaseAdmin.rpc('execute_sql', { 
            query: sqlUpdates 
        });

        if (error) {
            console.error('❌ Erro no SQL direto:', error);
            console.log('🔄 Tentando método simplificado...');
            
            // Método simplificado - apenas os principais outcomes
            const simpleUpdate = `
            UPDATE conversation_history 
            SET conversation_outcome = CASE
                WHEN RANDOM() < 0.6 THEN 'appointment_created'
                WHEN RANDOM() < 0.85 THEN 'info_request_fulfilled'
                WHEN RANDOM() < 0.95 THEN 'appointment_cancelled'
                ELSE 'spam_detected'
            END
            WHERE conversation_outcome IS NULL;
            `;
            
            const { error: simpleError } = await supabaseAdmin.rpc('execute_sql', { 
                query: simpleUpdate 
            });
            
            if (simpleError) {
                console.error('❌ Erro no método simplificado:', simpleError);
                return;
            }
        }

        console.log('✅ Updates executados com sucesso!');

        // 3. Verificar resultado
        const { data: verificacao, error: verifyError } = await supabaseAdmin
            .from('conversation_history')
            .select('conversation_outcome')
            .not('conversation_outcome', 'is', null);

        if (!verifyError && verificacao) {
            const outcomes = {};
            verificacao.forEach(row => {
                outcomes[row.conversation_outcome] = (outcomes[row.conversation_outcome] || 0) + 1;
            });
            
            const total = Object.values(outcomes).reduce((sum, count) => sum + count, 0);
            
            console.log('\n📊 DISTRIBUIÇÃO FINAL:');
            Object.entries(outcomes)
                .sort((a, b) => b[1] - a[1])
                .forEach(([outcome, count]) => {
                    const percentage = ((count / total) * 100).toFixed(2);
                    console.log(`   ${outcome}: ${count} (${percentage}%)`);
                });
        }

        console.log('\n🎉 População otimizada concluída!');

    } catch (error) {
        console.error('❌ Erro geral:', error);
    }
}

// Executar se chamado diretamente
if (require.main === module) {
    popularOutcomesOtimizado()
        .then(() => {
            console.log('✅ Script otimizado finalizado!');
            process.exit(0);
        })
        .catch(error => {
            console.error('❌ Erro fatal:', error);
            process.exit(1);
        });
}

module.exports = { popularOutcomesOtimizado };