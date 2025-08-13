/**
 * VERIFICAÇÃO DADOS REAIS DA BASE
 * Para confirmar se estamos vendo os mesmos dados
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

async function checkRealData() {
    console.log('🔍 VERIFICANDO DADOS REAIS DA BASE:');
    console.log('='.repeat(50));
    
    try {
        // Mensagens totais
        const { count: mensagens, error: errorMsg } = await supabase
            .from('conversation_history')
            .select('*', { count: 'exact', head: true });
        
        if (errorMsg) console.error('Erro mensagens:', errorMsg);
        
        // Agendamentos totais
        const { count: agendamentos, error: errorApp } = await supabase
            .from('appointments')
            .select('*', { count: 'exact', head: true });
            
        if (errorApp) console.error('Erro agendamentos:', errorApp);
        
        // Conversas únicas (por session_id)
        const { data: conversas, error: errorConv } = await supabase
            .from('conversation_history')
            .select('session_id')
            .not('session_id', 'is', null);
        
        if (errorConv) console.error('Erro conversas:', errorConv);
        
        const conversasUnicas = new Set(conversas?.map(c => c.session_id) || []).size;
        
        // Tenants ativos
        const { count: tenants, error: errorTen } = await supabase
            .from('tenants')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'active');
            
        if (errorTen) console.error('Erro tenants:', errorTen);
        
        console.log('📊 CONTAGENS REAIS:');
        console.log(`💬 Mensagens totais: ${mensagens || 'ERRO'}`);
        console.log(`🔄 Conversas únicas: ${conversasUnicas || 'ERRO'}`);
        console.log(`📅 Agendamentos totais: ${agendamentos || 'ERRO'}`);
        console.log(`🏢 Tenants ativos: ${tenants || 'ERRO'}`);
        
        // Verificar últimos 90 dias
        const startDate90 = new Date();
        startDate90.setDate(startDate90.getDate() - 90);
        
        const { count: agendamentos90 } = await supabase
            .from('appointments')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', startDate90.toISOString());
        
        console.log(`📅 Agendamentos (90 dias): ${agendamentos90 || 'ERRO'}`);
        
        // Amostra de dados para validar
        console.log('\n📋 AMOSTRA DE DADOS:');
        
        const { data: sampleAppts } = await supabase
            .from('appointments')
            .select('id, status, created_at, tenant_id')
            .limit(5);
            
        const { data: sampleMsgs } = await supabase
            .from('conversation_history')
            .select('id, session_id, created_at, tenant_id')
            .limit(5);
            
        console.log('Appointments sample:', sampleAppts?.length || 0);
        console.log('Messages sample:', sampleMsgs?.length || 0);
        
        if (sampleAppts?.length > 0) {
            console.log('Primeiro appointment:', sampleAppts[0]);
        }
        
        if (sampleMsgs?.length > 0) {
            console.log('Primeira mensagem:', sampleMsgs[0]);
        }
        
    } catch (error) {
        console.error('💥 Erro na verificação:', error);
    }
}

checkRealData().catch(console.error);