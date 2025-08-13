/**
 * POPULAR OUTCOMES REALÍSTICOS
 * 
 * Preenche conversation_outcome NULL com distribuição realista:
 * - 1% cancelamentos
 * - 0.5% no-show followups  
 * - 1.5% remarcações
 * - 0.75% spam
 * - 2% distribuído entre outros (info, horários, preços, etc)
 * - Restante: appointment_created ou info_request_fulfilled
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

async function popularOutcomesRealisticos() {
    try {
        console.log('🎯 Iniciando população de outcomes realísticos...');
        
        // 1. Buscar conversas com outcome NULL
        const { data: conversasNull, error: nullError } = await supabaseAdmin
            .from('conversation_history')
            .select('id, tenant_id, user_id, content, is_from_user')
            .is('conversation_outcome', null); // Remover filtro is_from_user temporariamente

        if (nullError) {
            console.error('❌ Erro ao buscar conversas NULL:', nullError);
            return;
        }

        console.log(`📊 Encontradas ${conversasNull.length} conversas com outcome NULL`);

        if (conversasNull.length === 0) {
            console.log('✅ Nenhuma conversa com outcome NULL encontrada!');
            return;
        }

        // 2. Buscar quais users têm appointments (para appointment_created)
        const { data: usersComAppointments, error: appError } = await supabaseAdmin
            .from('appointments')
            .select('user_id, tenant_id')
            .not('status', 'eq', 'cancelled');

        if (appError) {
            console.error('❌ Erro ao buscar appointments:', appError);
            return;
        }

        const usersComAppointmentsSet = new Set(
            usersComAppointments.map(a => `${a.tenant_id}_${a.user_id}`)
        );

        console.log(`👥 ${usersComAppointmentsSet.size} users únicos com appointments`);

        // 3. Aplicar distribuição de outcomes
        const updates = [];
        const totalConversas = conversasNull.length;

        // Calcular quantidades por outcome
        const outcomeQuantities = {};
        let totalAssigned = 0;

        for (const [outcome, percentage] of Object.entries(OUTCOME_DISTRIBUTION)) {
            const quantity = Math.floor((percentage / 100) * totalConversas);
            outcomeQuantities[outcome] = quantity;
            totalAssigned += quantity;
        }

        // Ajustar para cobrir todas as conversas
        const remaining = totalConversas - totalAssigned;
        if (remaining > 0) {
            outcomeQuantities['info_request_fulfilled'] += remaining;
        }

        console.log('📊 Distribuição calculada:');
        Object.entries(outcomeQuantities).forEach(([outcome, qty]) => {
            const perc = ((qty / totalConversas) * 100).toFixed(2);
            console.log(`   ${outcome}: ${qty} conversas (${perc}%)`);
        });

        // 4. Shufflear conversas para distribuição aleatória
        const conversasShuffled = [...conversasNull].sort(() => Math.random() - 0.5);
        let currentIndex = 0;

        // 5. Aplicar outcomes conforme distribuição
        for (const [outcome, quantity] of Object.entries(outcomeQuantities)) {
            for (let i = 0; i < quantity && currentIndex < conversasShuffled.length; i++) {
                const conversa = conversasShuffled[currentIndex];
                let finalOutcome = outcome;

                // Lógica especial para appointment_created
                if (outcome === 'appointment_created') {
                    const userKey = `${conversa.tenant_id}_${conversa.user_id}`;
                    if (!usersComAppointmentsSet.has(userKey)) {
                        // User não tem appointment, usar info_request_fulfilled
                        finalOutcome = 'info_request_fulfilled';
                    }
                }

                updates.push({
                    id: conversa.id,
                    conversation_outcome: finalOutcome
                });

                currentIndex++;
            }
        }

        console.log(`🔄 Preparadas ${updates.length} atualizações`);

        // 6. Executar updates em lotes
        const BATCH_SIZE = 100;
        let processedCount = 0;

        for (let i = 0; i < updates.length; i += BATCH_SIZE) {
            const batch = updates.slice(i, i + BATCH_SIZE);
            
            // Atualizar cada conversa individualmente (mais seguro)
            for (const update of batch) {
                const { error: updateError } = await supabaseAdmin
                    .from('conversation_history')
                    .update({ 
                        conversation_outcome: update.conversation_outcome
                    })
                    .eq('id', update.id);

                if (updateError) {
                    console.error(`❌ Erro ao atualizar conversa ${update.id}:`, updateError);
                } else {
                    processedCount++;
                }
            }

            console.log(`✅ Processadas ${Math.min(i + BATCH_SIZE, updates.length)}/${updates.length} conversas`);
        }

        // 7. Verificar resultado final
        const { data: verificacao, error: verifyError } = await supabaseAdmin
            .from('conversation_history')
            .select('conversation_outcome, count(*)')
            .not('conversation_outcome', 'is', null)
            .group('conversation_outcome');

        if (!verifyError && verificacao) {
            console.log('\n📊 DISTRIBUIÇÃO FINAL DE OUTCOMES:');
            const total = verificacao.reduce((sum, row) => sum + row.count, 0);
            
            verificacao
                .sort((a, b) => b.count - a.count)
                .forEach(row => {
                    const percentage = ((row.count / total) * 100).toFixed(2);
                    console.log(`   ${row.conversation_outcome}: ${row.count} (${percentage}%)`);
                });
        }

        console.log(`\n🎉 População concluída! ${processedCount} outcomes atualizados com sucesso!`);

    } catch (error) {
        console.error('❌ Erro geral na população:', error);
    }
}

// Executar se chamado diretamente
if (require.main === module) {
    popularOutcomesRealisticos()
        .then(() => {
            console.log('✅ Script finalizado!');
            process.exit(0);
        })
        .catch(error => {
            console.error('❌ Erro fatal:', error);
            process.exit(1);
        });
}

module.exports = { popularOutcomesRealisticos };