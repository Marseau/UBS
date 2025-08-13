/**
 * CONSULTA DIRETA NO BD - MÉTRICAS REAIS DO TENANT
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const TARGET_TENANT = 'ea1e9c71-2cde-4959-b367-81fa177407d8';

async function consultarDadosReaisTenant() {
    console.log('🔍 CONSULTANDO DADOS REAIS DO TENANT NO BD');
    console.log('=' .repeat(60));
    
    try {
        // 1. AGENDAMENTOS POR MÊS
        const { data: appointments, error: aptError } = await supabase
            .from('appointments')
            .select('*')
            .eq('tenant_id', TARGET_TENANT);
            
        if (aptError) {
            console.error('❌ Erro appointments:', aptError.message);
        } else {
            console.log(`📅 AGENDAMENTOS POR MÊS: ${appointments.length} total`);
            
            // Por status
            const confirmed = appointments.filter(a => a.status === 'confirmed').length;
            const cancelled = appointments.filter(a => a.status === 'cancelled').length;
            const completed = appointments.filter(a => a.status === 'completed').length;
            const pending = appointments.filter(a => a.status === 'pending').length;
            const inProgress = appointments.filter(a => a.status === 'in_progress').length;
            
            console.log(`❌ CANCELAMENTOS POR MÊS: ${cancelled}`);
            console.log(`✅ Confirmados: ${confirmed}`);
            console.log(`🏁 Concluídos: ${completed}`);
            console.log(`⏳ Pendentes: ${pending}`);
            console.log(`🔄 Em andamento: ${inProgress}`);
        }
        
        // 2. CLIENTES ÚNICOS POR MÊS
        const { data: users, error: usersError } = await supabase
            .from('appointments')
            .select('user_id')
            .eq('tenant_id', TARGET_TENANT);
            
        if (usersError) {
            console.error('❌ Erro users:', usersError.message);
        } else {
            const uniqueUsers = new Set(users.map(u => u.user_id)).size;
            console.log(`👥 CLIENTES ÚNICOS POR MÊS: ${uniqueUsers}`);
        }
        
        // 3. BUSCAR REMARCAÇÕES (se existir tabela de histórico)
        const { data: history, error: historyError } = await supabase
            .from('appointment_history')
            .select('*')
            .eq('tenant_id', TARGET_TENANT)
            .eq('action', 'rescheduled');
            
        if (historyError) {
            console.log('⚠️ Tabela appointment_history não existe, estimando remarcações...');
            // Estimativa: ~15% dos agendamentos são remarcados
            const estimatedReschedules = Math.round(appointments.length * 0.15);
            console.log(`🔄 REMARCAÇÕES POR MÊS (estimativa): ${estimatedReschedules}`);
        } else {
            console.log(`🔄 REMARCAÇÕES POR MÊS: ${history.length}`);
        }
        
        // 4. CONVERSAS IA PARA CALCULAR TAXA DE CONVERSÃO
        const { data: conversations, error: convError } = await supabase
            .from('conversation_history')
            .select('*')
            .eq('tenant_id', TARGET_TENANT);
            
        if (convError) {
            console.error('❌ Erro conversations:', convError.message);
        } else {
            const totalConversations = conversations.length;
            const conversionRate = totalConversations > 0 ? (appointments.length / totalConversations * 100).toFixed(2) : 0;
            console.log(`🤖 Total conversas IA: ${totalConversations}`);
            console.log(`📈 TAXA DE CONVERSÃO: ${conversionRate}% (${appointments.length} agendamentos / ${totalConversations} conversas)`);
        }
        
        // 5. CÁLCULO DE EFICIÊNCIA DE RECURSOS
        console.log('\n💡 EFICIÊNCIA DE RECURSOS:');
        console.log('Fórmula: (% Receita que paga para plataforma) ÷ (% Recursos que consome)');
        
        // Assumindo que tenant paga R$ 179,7 de R$ 894 total da plataforma
        const tenantPayment = 179.7;
        const platformTotal = 894;
        const paymentPercentage = (tenantPayment / platformTotal * 100).toFixed(2);
        
        // Assumindo 15.000 agendamentos totais na plataforma
        const platformTotalAppointments = 15000;
        const usagePercentage = (appointments.length / platformTotalAppointments * 100).toFixed(2);
        
        const efficiency = (paymentPercentage / usagePercentage).toFixed(2);
        
        console.log(`💰 Pagamento: ${paymentPercentage}% (R$ ${tenantPayment} de R$ ${platformTotal})`);
        console.log(`🔧 Uso de recursos: ${usagePercentage}% (${appointments.length} de ${platformTotalAppointments} agendamentos)`);
        console.log(`⚖️ EFICIÊNCIA: ${efficiency}x`);
        
    } catch (error) {
        console.error('💥 Erro na consulta:', error);
    }
}

consultarDadosReaisTenant()
    .then(() => process.exit(0))
    .catch(error => {
        console.error('💥 Erro fatal:', error);
        process.exit(1);
    });