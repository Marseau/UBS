require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * MÉTRICAS DE NEGÓCIO PARA TENANT (6 MESES)
 * 
 * 1. Taxa de Conversão: Agendamentos / Conversas
 * 2. Quality Score: Problemas de contato
 * 3. Volume de Interações IA: Total de mensagens processadas
 * 4. Canal de Agendamentos: Google Calendar vs WhatsApp
 */

function generateLast6Months() {
    // Focar nos meses com dados: Mai, Jun, Jul, Ago
    const months = [
        {
            name: 'mai. de 2025',
            start_date: new Date('2025-05-01'),
            end_date: new Date('2025-05-31T23:59:59')
        },
        {
            name: 'jun. de 2025', 
            start_date: new Date('2025-06-01'),
            end_date: new Date('2025-06-30T23:59:59')
        },
        {
            name: 'jul. de 2025',
            start_date: new Date('2025-07-01'),
            end_date: new Date('2025-07-31T23:59:59')
        },
        {
            name: 'ago. de 2025',
            start_date: new Date('2025-08-01'),
            end_date: new Date('2025-08-31T23:59:59')
        }
    ];
    
    return months;
}

async function calculateTenantBusinessMetrics() {
    console.log('📊 MÉTRICAS DE NEGÓCIO PARA TENANT (6 MESES)');
    console.log('='.repeat(70));
    
    try {
        // Buscar um tenant ativo para exemplo
        const { data: tenants } = await supabase
            .from('tenants')
            .select('id, name')
            .limit(1);
        
        const tenant = tenants[0];
        const months = generateLast6Months();
        
        console.log(`🏢 ANÁLISE: ${tenant.name.toUpperCase()}`);
        console.log('='.repeat(70));
        
        let totalConversions = 0;
        let totalConversations = 0;
        let totalAppointments = 0;
        let totalInteractions = 0;
        let totalGoogleAppointments = 0;
        let totalWhatsappAppointments = 0;
        let totalProblematicOutcomes = 0;
        
        for (const month of months) {
            console.log(`\n📅 ${month.name.toUpperCase()}`);
            console.log('─'.repeat(50));
            
            // 1. TAXA DE CONVERSÃO: Agendamentos / Conversas
            const { data: conversations } = await supabase
                .from('conversation_history')
                .select('id, conversation_outcome')
                .eq('tenant_id', tenant.id)
                .eq('is_from_user', true)
                .gte('created_at', month.start_date.toISOString())
                .lte('created_at', month.end_date.toISOString());
            
            const { data: appointments } = await supabase
                .from('appointments')
                .select('id, status, source')
                .eq('tenant_id', tenant.id)
                .in('status', ['completed', 'confirmed'])
                .gte('created_at', month.start_date.toISOString())
                .lte('created_at', month.end_date.toISOString());
            
            const conversationsCount = conversations ? conversations.length : 0;
            const appointmentsCount = appointments ? appointments.length : 0;
            const conversionRate = conversationsCount > 0 ? (appointmentsCount / conversationsCount) * 100 : 0;
            
            console.log(`📈 Taxa de Conversão: ${appointmentsCount} agend. ÷ ${conversationsCount} conv. = ${conversionRate.toFixed(1)}%`);
            
            // 2. QUALITY SCORE: Problemas de contato
            const problematicOutcomes = ['wrong_number', 'spam_detected', 'test_message'];
            const problematicCount = conversations ? 
                conversations.filter(c => problematicOutcomes.includes(c.conversation_outcome)).length : 0;
            
            const qualityScore = conversationsCount > 0 ? 
                ((conversationsCount - problematicCount) / conversationsCount) * 100 : 100;
            
            console.log(`🎯 Quality Score: ${qualityScore.toFixed(1)}% (${problematicCount} problemas de ${conversationsCount} conversas)`);
            
            // 3. VOLUME DE INTERAÇÕES IA: Total de mensagens
            const { data: allInteractions } = await supabase
                .from('conversation_history')
                .select('id')
                .eq('tenant_id', tenant.id)
                .gte('created_at', month.start_date.toISOString())
                .lte('created_at', month.end_date.toISOString());
            
            const interactionsCount = allInteractions ? allInteractions.length : 0;
            console.log(`🤖 Volume IA: ${interactionsCount} interações processadas`);
            
            // 4. CANAL DE AGENDAMENTOS: Google vs WhatsApp
            const googleAppointments = appointments ? 
                appointments.filter(a => a.source === 'google' || a.source === 'calendar').length : 0;
            const whatsappAppointments = appointments ? 
                appointments.filter(a => a.source === 'whatsapp' || !a.source).length : 0;
            
            const googlePercent = appointmentsCount > 0 ? (googleAppointments / appointmentsCount) * 100 : 0;
            const whatsappPercent = appointmentsCount > 0 ? (whatsappAppointments / appointmentsCount) * 100 : 0;
            
            console.log(`📱 Canais: ${whatsappAppointments} WhatsApp (${whatsappPercent.toFixed(1)}%) | ${googleAppointments} Google (${googlePercent.toFixed(1)}%)`);
            
            // Acumular totais
            totalConversations += conversationsCount;
            totalAppointments += appointmentsCount;
            totalInteractions += interactionsCount;
            totalGoogleAppointments += googleAppointments;
            totalWhatsappAppointments += whatsappAppointments;
            totalProblematicOutcomes += problematicCount;
        }
        
        // RESUMO GERAL
        console.log('\n' + '='.repeat(70));
        console.log('📊 RESUMO 6 MESES');
        console.log('='.repeat(70));
        
        const overallConversionRate = totalConversations > 0 ? (totalAppointments / totalConversations) * 100 : 0;
        const overallQualityScore = totalConversations > 0 ? 
            ((totalConversations - totalProblematicOutcomes) / totalConversations) * 100 : 100;
        const overallGooglePercent = totalAppointments > 0 ? (totalGoogleAppointments / totalAppointments) * 100 : 0;
        const overallWhatsappPercent = totalAppointments > 0 ? (totalWhatsappAppointments / totalAppointments) * 100 : 0;
        
        console.log(`📈 Taxa Conversão Geral: ${overallConversionRate.toFixed(1)}% (${totalAppointments} agend. de ${totalConversations} conv.)`);
        console.log(`🎯 Quality Score Geral: ${overallQualityScore.toFixed(1)}% (${totalProblematicOutcomes} problemas)`);
        console.log(`🤖 Total Interações IA: ${totalInteractions.toLocaleString()} mensagens processadas`);
        console.log(`📱 Distribuição Canais:`);
        console.log(`   • WhatsApp: ${totalWhatsappAppointments} agend. (${overallWhatsappPercent.toFixed(1)}%)`);
        console.log(`   • Google Calendar: ${totalGoogleAppointments} agend. (${overallGooglePercent.toFixed(1)}%)`);
        
        // INSIGHTS
        console.log('\n💡 INSIGHTS PARA O TENANT:');
        console.log('─'.repeat(50));
        
        if (overallConversionRate >= 15) {
            console.log('✅ Excelente taxa de conversão - IA está muito eficiente');
        } else if (overallConversionRate >= 8) {
            console.log('⚠️ Taxa de conversão média - há espaço para otimização');
        } else {
            console.log('🚨 Taxa de conversão baixa - revisar fluxo de IA');
        }
        
        if (overallQualityScore >= 85) {
            console.log('✅ Ótima qualidade dos contatos - poucos problemas');
        } else {
            console.log('⚠️ Qualidade dos contatos pode melhorar - revisar fonte de leads');
        }
        
        if (overallWhatsappPercent >= 70) {
            console.log('✅ IA WhatsApp é o canal principal - boa automação');
        } else {
            console.log('📞 Muitos agendamentos diretos - IA pode capturar mais');
        }
        
        console.log('='.repeat(70));
        
    } catch (error) {
        console.error('❌ Erro:', error);
    }
}

calculateTenantBusinessMetrics().catch(console.error);