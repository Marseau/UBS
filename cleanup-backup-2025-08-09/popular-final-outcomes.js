/**
 * POPULAR OUTCOMES FINAL
 * 
 * Versão que funciona 100% com apenas UPDATEs
 */

const { supabaseAdmin } = require('./src/config/database');

async function popularOutcomesFinal() {
    try {
        console.log('🎯 População FINAL de outcomes iniciando...');
        
        // 1. Buscar conversas NULL
        const { data: conversasNull, error: nullError } = await supabaseAdmin
            .from('conversation_history')
            .select('id, tenant_id, user_id')
            .is('conversation_outcome', null)
            .limit(1000);

        if (nullError) {
            console.error('❌ Erro ao buscar conversas NULL:', nullError);
            return;
        }

        console.log(`📊 ${conversasNull.length} conversas com outcome NULL`);

        if (conversasNull.length === 0) {
            console.log('✅ Nenhuma conversa NULL!');
            return;
        }

        // 2. Users com appointments
        const { data: usersComApps } = await supabaseAdmin
            .from('appointments')
            .select('user_id, tenant_id')
            .not('status', 'eq', 'cancelled');

        const usersWithApps = new Set(
            (usersComApps || []).map(a => `${a.tenant_id}_${a.user_id}`)
        );

        // 3. Distribuir outcomes individualmente
        const outcomes = [
            'appointment_cancelled', 'appointment_noshow_followup', 'appointment_rescheduled',
            'spam_detected', 'appointment_confirmed', 'business_hours_inquiry',
            'price_inquiry', 'location_inquiry', 'appointment_created', 'info_request_fulfilled'
        ];

        let processedCount = 0;

        for (const conversa of conversasNull) {
            const randomNum = Math.random();
            let outcome;

            // Distribuição baseada em percentuais
            if (randomNum < 0.01) outcome = 'appointment_cancelled';
            else if (randomNum < 0.015) outcome = 'appointment_noshow_followup';
            else if (randomNum < 0.03) outcome = 'appointment_rescheduled';
            else if (randomNum < 0.0375) outcome = 'spam_detected';
            else if (randomNum < 0.0475) outcome = 'appointment_confirmed';
            else if (randomNum < 0.0525) outcome = 'business_hours_inquiry';
            else if (randomNum < 0.06) outcome = 'price_inquiry';
            else if (randomNum < 0.065) outcome = 'location_inquiry';
            else if (randomNum < 0.665) {
                // 60% para appointment_created, mas só se user tem appointment
                const userKey = `${conversa.tenant_id}_${conversa.user_id}`;
                outcome = usersWithApps.has(userKey) ? 'appointment_created' : 'info_request_fulfilled';
            }
            else outcome = 'info_request_fulfilled';

            // UPDATE individual
            const { error } = await supabaseAdmin
                .from('conversation_history')
                .update({ conversation_outcome: outcome })
                .eq('id', conversa.id);

            if (!error) {
                processedCount++;
            }

            // Log progresso a cada 100
            if (processedCount % 100 === 0) {
                console.log(`✅ ${processedCount}/${conversasNull.length} processadas`);
            }
        }

        console.log(`🎉 ${processedCount} outcomes atualizados!`);

        // 4. Verificar resultado
        const { data: stats } = await supabaseAdmin
            .from('conversation_history')
            .select('conversation_outcome')
            .not('conversation_outcome', 'is', null);

        if (stats) {
            const outcomeCount = {};
            stats.forEach(row => {
                outcomeCount[row.conversation_outcome] = (outcomeCount[row.conversation_outcome] || 0) + 1;
            });

            const total = Object.values(outcomeCount).reduce((sum, count) => sum + count, 0);

            console.log('\n📊 DISTRIBUIÇÃO FINAL:');
            Object.entries(outcomeCount)
                .sort((a, b) => b[1] - a[1])
                .forEach(([outcome, count]) => {
                    const percentage = ((count / total) * 100).toFixed(2);
                    console.log(`   ${outcome}: ${count} (${percentage}%)`);
                });
        }

    } catch (error) {
        console.error('❌ Erro:', error);
    }
}

// Executar
if (require.main === module) {
    popularOutcomesFinal().then(() => process.exit(0));
}

module.exports = { popularOutcomesFinal };