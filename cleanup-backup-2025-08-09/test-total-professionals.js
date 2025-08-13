#!/usr/bin/env node

/**
 * TESTE DA MÉTRICA TOTAL_PROFESSIONALS
 * 
 * Verifica estrutura de dados de profissionais e valida
 * implementação correta da métrica
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Analisar fontes possíveis de dados de profissionais
 */
async function analyzeProfessionalsDataSources() {
    console.log('🔍 Analisando fontes de dados de profissionais');
    
    try {
        // 1. Verificar se existe tabela professionals
        const { data: professionalsTable, error: profError } = await supabase
            .from('professionals')
            .select('*')
            .limit(3);
            
        // 2. Verificar professional_id em appointments
        const { data: appointmentProfs, error: apptError } = await supabase
            .from('appointments')
            .select('professional_id, tenant_id')
            .not('professional_id', 'is', null)
            .limit(5);
            
        // 3. Verificar se existe tabela users com role professional
        const { data: userProfessionals, error: userError } = await supabase
            .from('users')
            .select('id, name')
            .limit(3);
            
        // 4. Verificar user_tenants com role professional
        const { data: userTenantProfs, error: utError } = await supabase
            .from('user_tenants')
            .select('user_id, tenant_id, role')
            .eq('role', 'professional')
            .limit(5);
            
        console.log('📊 ANÁLISE DAS FONTES:');
        
        console.log('\n1. TABELA PROFESSIONALS:');
        if (profError) {
            console.log(`   ❌ Erro: ${profError.message}`);
        } else if (professionalsTable && professionalsTable.length > 0) {
            console.log(`   ✅ Existe! ${professionalsTable.length} registros encontrados`);
            console.log(`   Campos: ${Object.keys(professionalsTable[0]).join(', ')}`);
            console.log(`   Sample: ${JSON.stringify(professionalsTable[0], null, 2)}`);
        } else {
            console.log('   📭 Tabela vazia ou não existe');
        }
        
        console.log('\n2. PROFESSIONAL_ID EM APPOINTMENTS:');
        if (apptError) {
            console.log(`   ❌ Erro: ${apptError.message}`);
        } else if (appointmentProfs && appointmentProfs.length > 0) {
            console.log(`   ✅ Existe! ${appointmentProfs.length} appointments com professional_id`);
            console.log(`   Sample: ${JSON.stringify(appointmentProfs[0], null, 2)}`);
            
            // Contar únicos por tenant
            const profsByTenant = {};
            appointmentProfs.forEach(apt => {
                if (!profsByTenant[apt.tenant_id]) {
                    profsByTenant[apt.tenant_id] = new Set();
                }
                profsByTenant[apt.tenant_id].add(apt.professional_id);
            });
            
            console.log('   Profissionais únicos por tenant (sample):');
            Object.entries(profsByTenant).forEach(([tenantId, profs]) => {
                console.log(`     ${tenantId.substring(0, 8)}: ${profs.size} profissionais`);
            });
        } else {
            console.log('   📭 Nenhum appointment com professional_id');
        }
        
        console.log('\n3. USER_TENANTS COM ROLE PROFESSIONAL:');
        if (utError) {
            console.log(`   ❌ Erro: ${utError.message}`);
        } else if (userTenantProfs && userTenantProfs.length > 0) {
            console.log(`   ✅ Existe! ${userTenantProfs.length} user_tenants com role professional`);
            console.log(`   Sample: ${JSON.stringify(userTenantProfs[0], null, 2)}`);
        } else {
            console.log('   📭 Nenhum user_tenant com role professional');
        }
        
        return {
            professionals_table: !profError && professionalsTable?.length > 0,
            appointment_professional_id: !apptError && appointmentProfs?.length > 0,
            user_tenant_professionals: !utError && userTenantProfs?.length > 0,
            recommended_source: null
        };
        
    } catch (error) {
        console.error('💥 Erro na análise:', error.message);
        return null;
    }
}

/**
 * Testar implementação via appointments.professional_id
 */
async function testProfessionalsViaAppointments(tenantId) {
    console.log(`👨‍⚕️ PROFESSIONALS via appointments para tenant ${tenantId.substring(0, 8)}`);
    
    try {
        const { data: appointments, error } = await supabase
            .from('appointments')
            .select('professional_id')
            .eq('tenant_id', tenantId)
            .not('professional_id', 'is', null);
            
        if (error) {
            console.error(`   ❌ Erro: ${error.message}`);
            return { count: 0, method: 'appointments_error' };
        }
        
        if (!appointments || appointments.length === 0) {
            console.log('   📭 Nenhum appointment com professional_id');
            return { count: 0, method: 'appointments_empty' };
        }
        
        // Contar profissionais únicos
        const uniqueProfessionals = new Set(appointments.map(apt => apt.professional_id));
        
        console.log(`   👨‍⚕️ ${uniqueProfessionals.size} profissionais únicos encontrados`);
        console.log(`   📊 Baseado em ${appointments.length} appointments`);
        
        return {
            count: uniqueProfessionals.size,
            total_appointments: appointments.length,
            method: 'appointments_professional_id'
        };
        
    } catch (error) {
        console.error(`   💥 Erro: ${error.message}`);
        return { count: 0, method: 'appointments_error' };
    }
}

/**
 * Testar implementação via user_tenants role professional
 */
async function testProfessionalsViaUserTenants(tenantId) {
    console.log(`👨‍⚕️ PROFESSIONALS via user_tenants para tenant ${tenantId.substring(0, 8)}`);
    
    try {
        const { count: professionalCount, error } = await supabase
            .from('user_tenants')
            .select('*', { count: 'exact', head: true })
            .eq('tenant_id', tenantId)
            .eq('role', 'professional');
            
        if (error) {
            console.error(`   ❌ Erro: ${error.message}`);
            return { count: 0, method: 'user_tenants_error' };
        }
        
        console.log(`   👨‍⚕️ ${professionalCount || 0} profissionais encontrados (role)`);
        
        return {
            count: professionalCount || 0,
            method: 'user_tenants_role'
        };
        
    } catch (error) {
        console.error(`   💥 Erro: ${error.message}`);
        return { count: 0, method: 'user_tenants_error' };
    }
}

/**
 * Executar todos os testes
 */
async function runProfessionalsTests() {
    console.log('🧪 TESTE DA MÉTRICA TOTAL_PROFESSIONALS');
    console.log('='.repeat(70));
    
    try {
        // 1. Analisar fontes de dados
        console.log('ETAPA 1: Análise das fontes de dados');
        console.log('-'.repeat(50));
        const dataAnalysis = await analyzeProfessionalsDataSources();
        
        if (!dataAnalysis) {
            console.log('❌ Não foi possível analisar as fontes de dados');
            return;
        }
        
        // 2. Buscar tenants para teste
        console.log('\nETAPA 2: Busca de tenants ativos');
        console.log('-'.repeat(50));
        const { data: tenants, error: tenantsError } = await supabase
            .from('tenants')
            .select('id, name')
            .eq('status', 'active')
            .limit(3);
        
        if (tenantsError) throw tenantsError;
        if (!tenants || tenants.length === 0) {
            console.log('❌ Nenhum tenant ativo encontrado');
            return;
        }
        
        console.log(`📊 Testando com ${tenants.length} tenants:`);
        tenants.forEach((tenant, index) => {
            console.log(`   ${index + 1}. ${tenant.name} (${tenant.id.substring(0, 8)})`);
        });
        
        // 3. Testar cada método por tenant
        console.log('\nETAPA 3: Teste de diferentes métodos');
        console.log('-'.repeat(50));
        
        const results = {};
        
        for (const tenant of tenants) {
            console.log(`\n🏢 TENANT: ${tenant.name}`);
            console.log('-'.repeat(60));
            
            results[tenant.id] = {
                name: tenant.name,
                appointments_method: null,
                user_tenants_method: null
            };
            
            // Método 1: Via appointments
            const appointmentsResult = await testProfessionalsViaAppointments(tenant.id);
            results[tenant.id].appointments_method = appointmentsResult;
            
            // Método 2: Via user_tenants
            const userTenantsResult = await testProfessionalsViaUserTenants(tenant.id);
            results[tenant.id].user_tenants_method = userTenantsResult;
            
            // Comparação
            console.log(`\n   📋 RESUMO ${tenant.name}:`);
            console.log(`      Via appointments: ${appointmentsResult.count} profissionais`);
            console.log(`      Via user_tenants: ${userTenantsResult.count} profissionais`);
            
            // Recomendação
            if (appointmentsResult.count > 0 && userTenantsResult.count === 0) {
                console.log('   💡 Recomendação: Usar appointments.professional_id');
            } else if (userTenantsResult.count > 0 && appointmentsResult.count === 0) {
                console.log('   💡 Recomendação: Usar user_tenants.role');
            } else if (appointmentsResult.count > 0 && userTenantsResult.count > 0) {
                console.log('   💡 Recomendação: Comparar e validar qual é mais preciso');
            } else {
                console.log('   ⚠️  Nenhum método retornou profissionais');
            }
        }
        
        console.log('\n📈 ANÁLISE DA MÉTRICA:');
        console.log('='.repeat(60));
        console.log('❌ IMPLEMENTAÇÃO ATUAL:');
        console.log('   ❌ Retorna sempre { count: 0 } (placeholder)');
        console.log('   ❌ Comentário sugere usar professional_id de appointments');
        console.log('   ❌ Nunca foi implementada adequadamente');
        
        console.log('\n✅ OPÇÕES DE IMPLEMENTAÇÃO:');
        console.log('   1. Via appointments.professional_id (count distinct)');
        console.log('   2. Via user_tenants.role = "professional"');
        console.log('   3. Via tabela professionals (se existir)');
        
        // Determinar melhor método baseado nos resultados
        const appointmentsCounts = Object.values(results).map(r => r.appointments_method.count);
        const userTenantsCounts = Object.values(results).map(r => r.user_tenants_method.count);
        
        const appointmentsTotal = appointmentsCounts.reduce((sum, count) => sum + count, 0);
        const userTenantsTotal = userTenantsCounts.reduce((sum, count) => sum + count, 0);
        
        console.log('\n💡 RECOMENDAÇÃO FINAL:');
        if (appointmentsTotal > userTenantsTotal) {
            console.log('   ✅ Usar: appointments.professional_id (mais dados encontrados)');
        } else if (userTenantsTotal > appointmentsTotal) {
            console.log('   ✅ Usar: user_tenants.role = "professional" (mais dados encontrados)');
        } else if (appointmentsTotal === 0 && userTenantsTotal === 0) {
            console.log('   ⚠️  Nenhum método encontrou profissionais - manter placeholder');
        } else {
            console.log('   💡 Ambos os métodos encontraram dados - validar qual é mais preciso');
        }
        
        console.log('\n✅ TESTE CONCLUÍDO');
        
        return results;
        
    } catch (error) {
        console.error('💥 ERRO NO TESTE:', error);
        process.exit(1);
    }
}

// Executar teste
if (require.main === module) {
    runProfessionalsTests().then(() => {
        process.exit(0);
    }).catch(error => {
        console.error('Erro fatal:', error);
        process.exit(1);
    });
}

module.exports = { 
    testProfessionalsViaAppointments,
    testProfessionalsViaUserTenants,
    analyzeProfessionalsDataSources
};