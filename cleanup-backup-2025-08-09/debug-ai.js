const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

async function debugAI() {
    const dataInicio = new Date();
    dataInicio.setDate(dataInicio.getDate() - 30);
    const dataInicioStr = dataInicio.toISOString().split('T')[0];
    
    try {
        const { data: allConversations } = await supabase
            .from('conversation_history')
            .select('id, confidence_score')
            .gte('created_at', dataInicioStr);
            
        const validAI = allConversations.filter(c => c.confidence_score !== null && c.confidence_score >= 0.7);
        const spam = allConversations.filter(c => c.confidence_score !== null && c.confidence_score < 0.7);
        const nullScores = allConversations.filter(c => c.confidence_score === null);
        
        console.log('🔍 DEBUG AI INTERACTIONS:');
        console.log('Total conversas:', allConversations.length);
        console.log('Com score null:', nullScores.length);
        console.log('Com score válido (>=0.7):', validAI.length);
        console.log('Com score spam (<0.7):', spam.length);
        console.log('Soma check:', nullScores.length + validAI.length + spam.length, '=', allConversations.length);
        
    } catch (error) {
        console.error('Erro:', error);
    }
}

debugAI();