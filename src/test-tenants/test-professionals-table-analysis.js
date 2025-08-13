#!/usr/bin/env node

/**
 * ANÁLISE DA TABELA PROFESSIONALS - FONTE CORRETA
 * 
 * Investiga a tabela professionals que deve ser a fonte verdadeira
 * ao invés de usar appointments.professional_id
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Analisar tabela professionals por tenant
 */
async function analyzeProfessionalsTable() {
    console.log('🔍 ANÁLISE COMPLETA DA TABELA PROFESSIONALS');
    console.log('='.repeat(70));
    
    try {
        // Buscar todos os profissionais
        const { data: allProfessionals, error } = await supabase
            .from('professionals')
            .select('*')
            .order('tenant_id, created_at');
            
        if (error) {
            console.error(`❌ Erro: ${error.message}`);
            return;
        }
        
        if (!allProfessionals || allProfessionals.length === 0) {
            console.log('📭 Nenhum profissional encontrado na tabela');
            return;
        }
        
        console.log(`📊 Total de ${allProfessionals.length} profissionais encontrados`);
        
        // Agrupar por tenant
        const byTenant = {};
        allProfessionals.forEach(prof => {
            if (!byTenant[prof.tenant_id]) {
                byTenant[prof.tenant_id] = [];
            }
            byTenant[prof.tenant_id].push(prof);
        });
        
        // Buscar nomes dos tenants
        const tenantIds = Object.keys(byTenant);
        const { data: tenants, error: tenantsError } = await supabase
            .from('tenants')
            .select('id, name')
            .in('id', tenantIds);
            
        const tenantNames = {};
        if (!tenantsError && tenants) {
            tenants.forEach(t => tenantNames[t.id] = t.name);
        }
        
        console.log(`\n📋 PROFISSIONAIS POR TENANT:`);
        console.log('-'.repeat(70));
        
        Object.entries(byTenant).forEach(([tenantId, professionals]) => {
            const tenantName = tenantNames[tenantId] || 'Unknown';
            const active = professionals.filter(p => p.is_active);
            const inactive = professionals.filter(p => !p.is_active);
            
            console.log(`\n🏢 ${tenantName} (${tenantId.substring(0, 8)}):`);
            console.log(`   📊 Total: ${professionals.length} | Ativos: ${active.length} | Inativos: ${inactive.length}`);
            
            // Mostrar profissionais ativos
            if (active.length > 0) {
                console.log('   👨‍⚕️ Profissionais ATIVOS:');
                active.forEach((prof, index) => {
                    const createdDate = new Date(prof.created_at).toISOString().split('T')[0];
                    console.log(`      ${index + 1}. ${prof.name} (criado: ${createdDate})`);
                });
            }
            
            // Mostrar profissionais inativos
            if (inactive.length > 0) {
                console.log('   ❌ Profissionais INATIVOS:');
                inactive.forEach((prof, index) => {
                    const createdDate = new Date(prof.created_at).toISOString().split('T')[0];
                    console.log(`      ${index + 1}. ${prof.name} (criado: ${createdDate})`);
                });
            }
        });
        
        // Análise temporal
        console.log(`\n📅 ANÁLISE TEMPORAL:`);
        console.log('-'.repeat(70));
        
        const dates = allProfessionals.map(p => new Date(p.created_at));
        const minDate = new Date(Math.min(...dates));
        const maxDate = new Date(Math.max(...dates));
        
        console.log(`   📅 Primeiro profissional criado: ${minDate.toISOString().split('T')[0]}`);
        console.log(`   📅 Último profissional criado: ${maxDate.toISOString().split('T')[0]}`);
        
        // Contagem por período para hoje (6/8/2025)
        const hoje = new Date('2025-08-06');
        const date7d = new Date(hoje); date7d.setDate(hoje.getDate() - 7);
        const date30d = new Date(hoje); date30d.setDate(hoje.getDate() - 30);
        const date90d = new Date(hoje); date90d.setDate(hoje.getDate() - 90);
        
        console.log(`\n📊 CONTAGEM POR PERÍODO (até as datas de corte):`);
        console.log(`   7d  (até ${date7d.toISOString().split('T')[0]}): ${allProfessionals.filter(p => new Date(p.created_at) <= date7d).length} profissionais`);
        console.log(`   30d (até ${date30d.toISOString().split('T')[0]}): ${allProfessionals.filter(p => new Date(p.created_at) <= date30d).length} profissionais`);
        console.log(`   90d (até ${date90d.toISOString().split('T')[0]}): ${allProfessionals.filter(p => new Date(p.created_at) <= date90d).length} profissionais`);
        
        return byTenant;
        
    } catch (error) {
        console.error('💥 Erro na análise:', error);
    }
}

/**
 * Implementação CORRETA usando tabela professionals
 */
async function calculateProfessionalsCorrect(tenantId, periodDays) {
    console.log(`👨‍⚕️ PROFESSIONALS CORRETO ${periodDays}d para tenant ${tenantId.substring(0, 8)}`);
    
    try {
        const hoje = new Date('2025-08-06'); // Data atual
        const cutoffDate = new Date(hoje);
        cutoffDate.setDate(hoje.getDate() - periodDays);
        
        console.log(`   📅 Profissionais criados ATÉ: ${cutoffDate.toISOString().split('T')[0]}`);
        
        // Query na tabela professionals
        const { data: professionals, error } = await supabase
            .from('professionals')
            .select('id, name, created_at, is_active')
            .eq('tenant_id', tenantId)
            .eq('is_active', true)
            .lte('created_at', cutoffDate.toISOString())
            .order('created_at');
            
        if (error) {
            console.error(`   ❌ Erro: ${error.message}`);
            return { count: 0 };
        }
        
        if (!professionals || professionals.length === 0) {
            console.log('   📭 Nenhum profissional ativo encontrado');
            return { count: 0 };
        }
        
        console.log(`   👨‍⚕️ ${professionals.length} profissionais ativos:`);
        professionals.forEach((prof, index) => {
            const createdDate = new Date(prof.created_at).toISOString().split('T')[0];
            console.log(`      ${index + 1}. ${prof.name} (criado: ${createdDate})`);
        });
        
        return {
            count: professionals.length,
            professionals: professionals.map(p => p.name)
        };
        
    } catch (error) {
        console.error(`   💥 Erro: ${error.message}`);
        return { count: 0 };
    }
}

/**
 * Teste da implementação correta
 */
async function testProfessionalsCorrect() {
    console.log('\n🧪 TESTE DA IMPLEMENTAÇÃO CORRETA');
    console.log('='.repeat(70));
    
    try {
        // Análise geral primeiro
        await analyzeProfessionalsTable();
        
        // Buscar tenants para teste
        const { data: tenants, error } = await supabase
            .from('tenants')
            .select('id, name')
            .eq('status', 'active')
            .limit(5);
            
        if (error) throw error;
        
        console.log('\n🔬 TESTE POR TENANT COM IMPLEMENTAÇÃO CORRETA:');
        console.log('='.repeat(70));
        
        const periods = [7, 30, 90];
        
        for (const tenant of tenants) {
            console.log(`\n🏢 TENANT: ${tenant.name}`);
            console.log('-'.repeat(50));
            
            for (const periodDays of periods) {
                await calculateProfessionalsCorrect(tenant.id, periodDays);
            }
        }
        
        console.log('\n💡 CONCLUSÃO:');
        console.log('✅ Fonte CORRETA: tabela professionals');
        console.log('❌ Fonte INCORRETA: appointments.professional_id');
        console.log('🔧 Implementação deve usar professionals + is_active + created_at');
        
    } catch (error) {
        console.error('💥 Erro:', error);
    }
}

// Executar
if (require.main === module) {
    testProfessionalsCorrect().then(() => {
        process.exit(0);
    }).catch(error => {
        console.error('Erro fatal:', error);
        process.exit(1);
    });
}

module.exports = { analyzeProfessionalsTable, calculateProfessionalsCorrect };