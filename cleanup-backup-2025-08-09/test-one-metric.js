require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

/**
 * Testar uma métrica específica manualmente
 */
async function testAvgMinutesPerConversation() {
    const tenantId = '33b8c488-5aa9-4891-b335-701d10296681';
    const currentPeriodStart = new Date('2025-07-28');
    const currentPeriodEnd = new Date();
    
    console.log('🧪 TESTANDO calculateAvgMinutesPerConversation MANUALMENTE:');
    console.log(`⏱️ Calculando minutos médios por conversa para tenant ${tenantId}...`);
    
    const { data: conversations, error } = await supabase
        .from('conversation_history')
        .select(`
            conversation_context,
            created_at
        `)
        .eq('tenant_id', tenantId)
        .gte('created_at', currentPeriodStart.toISOString())
        .lte('created_at', currentPeriodEnd.toISOString())
        .not('conversation_context', 'is', null);
    
    if (error || !conversations || conversations.length === 0) {
        console.log('❌ Erro ou sem dados:', error?.message || 'Nenhuma conversa');
        return {
            minutes: 0,
            total_minutes: 0,
            total_conversations: 0
        };
    }
    
    console.log('📊 Conversas encontradas:', conversations.length);
    
    // Agregar por session_id
    const sessionMap = new Map();
    
    for (const conv of conversations) {
        const sessionId = conv.conversation_context?.session_id;
        const durationMinutes = conv.conversation_context?.duration_minutes || 0;
        
        if (!sessionId) continue;
        
        if (!sessionMap.has(sessionId)) {
            sessionMap.set(sessionId, {
                session_id: sessionId,
                conversation_start: conv.created_at,
                total_minutes: durationMinutes
            });
        } else {
            const session = sessionMap.get(sessionId);
            // Usar data de início da conversa
            if (new Date(conv.created_at) < new Date(session.conversation_start)) {
                session.conversation_start = conv.created_at;
            }
            // Somar duração total
            session.total_minutes += durationMinutes;
        }
    }
    
    console.log('🗂️ Sessões mapeadas:', sessionMap.size);
    
    // Filtrar sessões que iniciaram no período
    const validSessions = Array.from(sessionMap.values()).filter(session => {
        const sessionStart = new Date(session.conversation_start);
        return sessionStart >= currentPeriodStart && sessionStart <= currentPeriodEnd;
    });
    
    console.log('✅ Sessões válidas no período:', validSessions.length);
    
    const totalConversations = validSessions.length;
    const totalMinutes = validSessions.reduce((sum, session) => sum + session.total_minutes, 0);
    const avgMinutes = totalConversations > 0 ? totalMinutes / totalConversations : 0;
    
    const result = {
        minutes: Math.round(avgMinutes * 100) / 100,
        total_minutes: Math.round(totalMinutes * 100) / 100,
        total_conversations: totalConversations
    };
    
    console.log('📊 RESULTADO:', result);
    return result;
}

testAvgMinutesPerConversation();