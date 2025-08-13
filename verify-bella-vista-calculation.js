/**
 * VERIFICAÇÃO DETALHADA: Como cheguei a 184 appointments
 * Vou analisar passo a passo a query
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function verifyBellaVistaCalculation() {
    const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    
    console.log('🔍 VERIFICAÇÃO: Cálculo detalhado Bella Vista');
    console.log('===========================================\n');
    
    try {
        const bellaVistaId = '33b8c488-5aa9-4891-b335-701d10296681';
        
        // 1. QUERY EXATA que usei
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - 30);
        
        console.log('📅 PERÍODO ANALISADO (30d):');
        console.log(`   Start: ${startDate.toISOString()}`);
        console.log(`   End: ${endDate.toISOString()}`);
        console.log(`   Start (apenas data): ${startDate.toISOString().split('T')[0]}`);
        console.log(`   End (apenas data): ${endDate.toISOString().split('T')[0]}`);
        
        // 2. QUERY STEP BY STEP
        console.log('\n🔍 PASSO 1: Query completa');
        const { data: allAppointments, error } = await client
            .from('appointments')
            .select('id, tenant_id, status, created_at, start_time')
            .eq('tenant_id', bellaVistaId)
            .gte('created_at', startDate.toISOString())
            .lte('created_at', endDate.toISOString());
            
        if (error) {
            console.log(`❌ Erro: ${error.message}`);
            return;
        }
        
        console.log(`✅ Total encontrado: ${allAppointments?.length || 0}`);
        
        // 3. VERIFICAR CADA REGISTRO
        if (allAppointments && allAppointments.length > 0) {
            console.log('\n📋 TODOS OS APPOINTMENTS ENCONTRADOS:');
            console.log('====================================');
            
            allAppointments.forEach((apt, i) => {
                const createdDate = new Date(apt.created_at);
                console.log(`${i+1}. ID: ${apt.id.substring(0,8)}...`);
                console.log(`   Status: ${apt.status}`);
                console.log(`   Created: ${createdDate.toISOString()}`);
                console.log(`   Created (BR): ${createdDate.toLocaleString('pt-BR')}`);
                console.log(`   Start Time: ${apt.start_time}`);
                console.log('');
            });
            
            // 4. VERIFICAR DISTRIBUIÇÃO POR DATA
            console.log('📊 DISTRIBUIÇÃO POR DATA:');
            console.log('========================');
            
            const dateDistribution = {};
            allAppointments.forEach(apt => {
                const date = new Date(apt.created_at).toISOString().split('T')[0];
                dateDistribution[date] = (dateDistribution[date] || 0) + 1;
            });
            
            Object.entries(dateDistribution).sort().forEach(([date, count]) => {
                console.log(`   ${date}: ${count} appointments`);
            });
            
            // 5. VERIFICAR SE ESTÁ DENTRO DO PERÍODO
            console.log('\n✅ VERIFICAÇÃO DE PERÍODO:');
            console.log('=========================');
            
            const withinPeriod = allAppointments.filter(apt => {
                const createdDate = new Date(apt.created_at);
                return createdDate >= startDate && createdDate <= endDate;
            });
            
            console.log(`   Appointments dentro do período: ${withinPeriod.length}`);
            console.log(`   Appointments fora do período: ${allAppointments.length - withinPeriod.length}`);
            
            // 6. VERIFICAR POR STATUS
            console.log('\n📊 BREAKDOWN POR STATUS:');
            console.log('========================');
            
            const statusCount = {};
            allAppointments.forEach(apt => {
                const status = apt.status || 'null';
                statusCount[status] = (statusCount[status] || 0) + 1;
            });
            
            Object.entries(statusCount).forEach(([status, count]) => {
                console.log(`   ${status}: ${count}`);
            });
        }
        
        // 7. QUERY SIMPLES DE CONTAGEM
        console.log('\n🔢 QUERY SIMPLES DE COUNT:');
        console.log('==========================');
        
        const { data: countResult } = await client
            .from('appointments')
            .select('count(*)')
            .eq('tenant_id', bellaVistaId)
            .gte('created_at', startDate.toISOString())
            .lte('created_at', endDate.toISOString());
            
        console.log(`   COUNT(*) result: ${countResult?.[0]?.count || 0}`);
        
        // 8. VERIFICAR TOTAL SEM FILTRO DE DATA
        console.log('\n📊 TOTAL DE APPOINTMENTS BELLA VISTA (SEM FILTRO DATA):');
        console.log('=====================================================');
        
        const { data: totalCount } = await client
            .from('appointments')
            .select('count(*)')
            .eq('tenant_id', bellaVistaId);
            
        console.log(`   Total geral: ${totalCount?.[0]?.count || 0}`);
        
    } catch (error) {
        console.log(`❌ Erro: ${error.message}`);
        console.log('Stack:', error.stack?.split('\n').slice(0,5).join('\n'));
    }
}

verifyBellaVistaCalculation().catch(console.error);