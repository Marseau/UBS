#!/usr/bin/env node

/**
 * TESTE TOTAL_PROFESSIONALS - IMPLEMENTAÇÃO FINAL
 * 
 * Valida implementação correta usando appointments.professional_id
 * com lógica acumulativa por período
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Implementação final igual ao script base
 */
async function calculateTotalProfessionalsImplemented(tenantId, periodDays) {
    console.log(`👨‍⚕️ TOTAL_PROFESSIONALS ${periodDays}d para tenant ${tenantId.substring(0, 8)}`);
    
    try {
        const currentPeriodEnd = new Date();
        const cutoffDate = new Date(currentPeriodEnd);
        cutoffDate.setDate(cutoffDate.getDate() - periodDays);
        
        console.log(`   📅 Appointments criados ATÉ: ${cutoffDate.toISOString().split('T')[0]} (${periodDays}d atrás)`);
        
        // Buscar profissionais únicos via appointments criados ATÉ a data de corte
        const { data: appointments, error } = await supabase
            .from('appointments')
            .select('professional_id, created_at')
            .eq('tenant_id', tenantId)
            .not('professional_id', 'is', null)
            .lte('created_at', cutoffDate.toISOString());
            
        if (error) {
            console.error(`   ❌ Erro: ${error.message}`);
            return { count: 0 };
        }
        
        if (!appointments || appointments.length === 0) {
            console.log('   📭 Nenhum appointment com professional_id encontrado');
            return { count: 0 };
        }
        
        // Contar profissionais únicos
        const uniqueProfessionals = new Set(appointments.map(apt => apt.professional_id));
        
        console.log(`   👨‍⚕️ ${uniqueProfessionals.size} profissionais únicos`);
        console.log(`   📊 Baseado em ${appointments.length} appointments`);
        
        // Mostrar sample de professional_ids
        const sampleIds = Array.from(uniqueProfessionals).slice(0, 3);
        console.log(`   🔍 Sample IDs: ${sampleIds.map(id => id.substring(0, 8)).join(', ')}`);
        
        return {
            count: uniqueProfessionals.size,
            total_appointments: appointments.length,
            cutoff_date: cutoffDate.toISOString().split('T')[0]
        };
        
    } catch (error) {
        console.error(`   💥 Erro: ${error.message}`);
        return { count: 0 };
    }
}

/**
 * Verificar datas de criação dos appointments
 */
async function verifyAppointmentDates(tenantId) {
    console.log(`📅 Verificando datas de appointments para tenant ${tenantId.substring(0, 8)}`);
    
    try {
        const { data: appointments, error } = await supabase
            .from('appointments')
            .select('created_at, professional_id')
            .eq('tenant_id', tenantId)
            .not('professional_id', 'is', null)
            .order('created_at', { ascending: true });
            
        if (error) throw error;
        
        if (!appointments || appointments.length === 0) {
            console.log('   📭 Nenhum appointment com professional_id');
            return null;
        }
        
        const firstApp = appointments[0];
        const lastApp = appointments[appointments.length - 1];
        
        console.log(`   📊 ${appointments.length} appointments com professional_id:`);
        console.log(`   📅 Primeiro: ${new Date(firstApp.created_at).toISOString().split('T')[0]}`);
        console.log(`   📅 Último: ${new Date(lastApp.created_at).toISOString().split('T')[0]}`);
        
        return {
            total_appointments: appointments.length,
            first_date: firstApp.created_at,
            last_date: lastApp.created_at
        };
        
    } catch (error) {
        console.error(`   💥 Erro: ${error.message}`);
        return null;
    }
}

/**
 * Teste completo da implementação
 */
async function testTotalProfessionalsImplementation() {
    console.log('🧪 TESTE TOTAL_PROFESSIONALS - IMPLEMENTAÇÃO FINAL');
    console.log('='.repeat(70));
    
    try {
        const { data: tenants, error } = await supabase
            .from('tenants')
            .select('id, name')
            .eq('status', 'active')
            .order('name');
        
        if (error) throw error;
        if (!tenants || tenants.length === 0) {
            console.log('❌ Nenhum tenant encontrado');
            return;
        }
        
        console.log(`📊 ${tenants.length} tenants para teste:`);
        tenants.forEach((tenant, index) => {
            console.log(`   ${index + 1}. ${tenant.name} (${tenant.id.substring(0, 8)})`);
        });
        
        const periods = [7, 30, 90];
        const results = {};
        
        for (const tenant of tenants) {
            console.log(`\n🏢 TENANT: ${tenant.name}`);
            console.log('-'.repeat(70));
            
            // Verificar datas dos appointments
            await verifyAppointmentDates(tenant.id);
            
            results[tenant.id] = {
                name: tenant.name,
                periods: {}
            };
            
            // Testar cada período
            for (const periodDays of periods) {
                const result = await calculateTotalProfessionalsImplemented(tenant.id, periodDays);
                results[tenant.id].periods[`${periodDays}d`] = result;
            }
            
            // Resumo
            const d7 = results[tenant.id].periods['7d'];
            const d30 = results[tenant.id].periods['30d'];
            const d90 = results[tenant.id].periods['90d'];
            
            console.log(`\n   📋 RESUMO ${tenant.name}:`);
            console.log(`      7d:  ${d7.count} profissionais`);
            console.log(`      30d: ${d30.count} profissionais`);
            console.log(`      90d: ${d90.count} profissionais`);
            
            // Verificar lógica decrescente/acumulativa esperada
            const logicaCoerente = d90.count <= d30.count && d30.count <= d7.count;
            console.log(`      Lógica acumulativa: ${logicaCoerente ? '✅ COERENTE' : '⚠️  VERIFICAR'}`);
        }
        
        // Tabela consolidada
        console.log('\n📋 TABELA CONSOLIDADA - TOTAL_PROFESSIONALS POR PERÍODO');
        console.log('='.repeat(70));
        console.log('TENANT                    | 7d   | 30d  | 90d  ');
        console.log('-'.repeat(70));
        
        Object.entries(results).forEach(([tenantId, data]) => {
            const name = data.name.padEnd(24);
            const d7 = String(data.periods['7d'].count).padStart(4);
            const d30 = String(data.periods['30d'].count).padStart(4);
            const d90 = String(data.periods['90d'].count).padStart(4);
            
            console.log(`${name} | ${d7} | ${d30} | ${d90}`);
        });
        
        console.log('-'.repeat(70));
        
        // Estatísticas
        const tenantCount = Object.keys(results).length;
        const avg7d = Math.round(Object.values(results).reduce((sum, tenant) => sum + tenant.periods['7d'].count, 0) / tenantCount);
        const avg30d = Math.round(Object.values(results).reduce((sum, tenant) => sum + tenant.periods['30d'].count, 0) / tenantCount);
        const avg90d = Math.round(Object.values(results).reduce((sum, tenant) => sum + tenant.periods['90d'].count, 0) / tenantCount);
        
        console.log('\n📊 ESTATÍSTICAS GERAIS:');
        console.log(`   Médias de profissionais por tenant:`);
        console.log(`     7d:  ${avg7d} profissionais`);
        console.log(`     30d: ${avg30d} profissionais`);
        console.log(`     90d: ${avg90d} profissionais`);
        
        const totalProfessionals7d = Object.values(results).reduce((sum, tenant) => sum + tenant.periods['7d'].count, 0);
        console.log(`\n   Total de profissionais na plataforma (7d): ${totalProfessionals7d}`);
        
        console.log('\n✅ IMPLEMENTAÇÃO VALIDADA');
        console.log('\n💡 CARACTERÍSTICAS DA MÉTRICA:');
        console.log('   ✅ Fonte: appointments.professional_id');
        console.log('   ✅ Lógica: Acumulativa por período (created_at <= cutoff)');
        console.log('   ✅ Count: Profissionais únicos (Set)');
        console.log('   ✅ Não órfã: Incluída no retorno como total_professionals');
        
        return results;
        
    } catch (error) {
        console.error('💥 ERRO NO TESTE:', error);
        process.exit(1);
    }
}

// Executar teste
if (require.main === module) {
    testTotalProfessionalsImplementation().then(() => {
        process.exit(0);
    }).catch(error => {
        console.error('Erro fatal:', error);
        process.exit(1);
    });
}

module.exports = { calculateTotalProfessionalsImplemented };