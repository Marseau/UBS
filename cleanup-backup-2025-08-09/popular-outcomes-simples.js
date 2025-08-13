/**
 * POPULAR OUTCOMES SIMPLES
 * 
 * Versão simplificada que funciona com Supabase
 */

const { supabaseAdmin } = require('./src/config/database');

async function popularOutcomesSimples() {
    try {
        console.log('🎯 População simples de outcomes iniciando...');
        
        // 1. Buscar todas conversas NULL (limitadas para performance)
        const { data: conversasNull, error: nullError } = await supabaseAdmin
            .from('conversation_history')
            .select('id, tenant_id, user_id')
            .is('conversation_outcome', null)
            .limit(3000); // Limitar para não travar

        if (nullError) {
            console.error('❌ Erro ao buscar conversas NULL:', nullError);
            return;
        }

        console.log(`📊 Encontradas ${conversasNull.length} conversas com outcome NULL`);

        if (conversasNull.length === 0) {
            console.log('✅ Nenhuma conversa NULL encontrada!');
            return;
        }

        // 2. Buscar users com appointments
        const { data: usersComApps, error: appError } = await supabaseAdmin
            .from('appointments')
            .select('user_id, tenant_id')
            .not('status', 'eq', 'cancelled');

        if (appError) {
            console.error('❌ Erro ao buscar appointments:', appError);
            return;
        }

        const usersWithApps = new Set(
            usersComApps.map(a => `${a.tenant_id}_${a.user_id}`)
        );

        console.log(`👥 ${usersWithApps.size} users com appointments`);

        // 3. Distribuir outcomes por lotes
        const BATCH_SIZE = 100;
        let processedCount = 0;
        
        // Definir percentuais acumulados para distribuição
        const distributions = [
            { outcome: 'appointment_cancelled', limit: 0.01 }, // 1%
            { outcome: 'appointment_noshow_followup', limit: 0.015 }, // 0.5%
            { outcome: 'appointment_rescheduled', limit: 0.03 }, // 1.5%
            { outcome: 'spam_detected', limit: 0.0375 }, // 0.75%
            { outcome: 'appointment_confirmed', limit: 0.0475 }, // 1%
            { outcome: 'business_hours_inquiry', limit: 0.0525 }, // 0.5%
            { outcome: 'price_inquiry', limit: 0.06 }, // 0.75%
            { outcome: 'location_inquiry', limit: 0.065 }, // 0.5%
            { outcome: 'appointment_created', limit: 0.665 }, // 60%
            { outcome: 'info_request_fulfilled', limit: 1.0 } // Restante
        ];

        // Shuffle conversas para distribuição aleatória
        const shuffledConversas = [...conversasNull].sort(() => Math.random() - 0.5);

        for (let i = 0; i < shuffledConversas.length; i += BATCH_SIZE) {
            const batch = shuffledConversas.slice(i, i + BATCH_SIZE);
            const updates = [];

            for (const conversa of batch) {
                const randomNum = Math.random();
                let outcome = 'info_request_fulfilled'; // default

                // Encontrar outcome baseado na distribuição
                for (const dist of distributions) {
                    if (randomNum <= dist.limit) {
                        outcome = dist.outcome;
                        break;
                    }
                }

                // Lógica especial para appointment_created
                if (outcome === 'appointment_created') {
                    const userKey = `${conversa.tenant_id}_${conversa.user_id}`;
                    if (!usersWithApps.has(userKey)) {
                        outcome = 'info_request_fulfilled';
                    }
                }

                updates.push({
                    id: conversa.id,
                    conversation_outcome: outcome
                });
            }

            // Executar batch update usando upsert
            const { error: batchError } = await supabaseAdmin
                .from('conversation_history')
                .upsert(
                    updates.map(u => ({ 
                        id: u.id, 
                        conversation_outcome: u.conversation_outcome 
                    })),
                    { 
                        onConflict: 'id',
                        ignoreDuplicates: false 
                    }
                );

            if (batchError) {
                console.error(`❌ Erro no batch ${i}:`, batchError);
                // Tentar individual
                for (const update of updates) {
                    const { error } = await supabaseAdmin
                        .from('conversation_history')
                        .update({ conversation_outcome: update.conversation_outcome })
                        .eq('id', update.id);
                    
                    if (!error) processedCount++;
                }
            } else {
                processedCount += updates.length;
            }

            console.log(`✅ Processadas ${Math.min(i + BATCH_SIZE, shuffledConversas.length)}/${shuffledConversas.length} conversas`);
        }

        console.log(`🎉 ${processedCount} outcomes atualizados!`);

        // 4. Verificar distribuição final
        const { data: verificacao } = await supabaseAdmin
            .from('conversation_history')
            .select('conversation_outcome')
            .not('conversation_outcome', 'is', null);

        if (verificacao) {
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

    } catch (error) {
        console.error('❌ Erro geral:', error);
    }
}

// Executar se chamado diretamente
if (require.main === module) {
    popularOutcomesSimples()
        .then(() => {
            console.log('✅ População simples concluída!');
            process.exit(0);
        })
        .catch(error => {
            console.error('❌ Erro fatal:', error);
            process.exit(1);
        });
}

module.exports = { popularOutcomesSimples };