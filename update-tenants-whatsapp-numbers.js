#!/usr/bin/env node

/**
 * SCRIPT: Atualizar números WhatsApp dos 10 tenants existentes com números fake para testes
 * OBJETIVO: Permitir testes internos da página demo por diferentes segmentos
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Configuração Supabase
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Mapeamento de números WhatsApp fictícios por domínio/segmento
const FAKE_WHATSAPP_NUMBERS = {
    beauty: {
        whatsapp: '5511940011001',
        display: '+55 11 94001-1001',
        businessName: 'Salão Bella Vista'
    },
    healthcare: {
        whatsapp: '5511940012002', 
        display: '+55 11 94001-2002',
        businessName: 'Clínica Saúde Plena'
    },
    legal: {
        whatsapp: '5511940013003',
        display: '+55 11 94001-3003', 
        businessName: 'Escritório Silva & Advogados'
    },
    education: {
        whatsapp: '5511940014004',
        display: '+55 11 94001-4004',
        businessName: 'Centro Educacional Saber'
    },
    sports: {
        whatsapp: '5511940015005',
        display: '+55 11 94001-5005',
        businessName: 'Academia Força Total'
    },
    consulting: {
        whatsapp: '5511940016006',
        display: '+55 11 94001-6006',
        businessName: 'Consultoria Estratégica Plus'
    },
    general1: {
        whatsapp: '5511940017007',
        display: '+55 11 94001-7007',
        businessName: 'Serviços Gerais Alpha'
    },
    general2: {
        whatsapp: '5511940018008',
        display: '+55 11 94001-8008', 
        businessName: 'Empresa Beta Ltda'
    },
    general3: {
        whatsapp: '5511940019009',
        display: '+55 11 94001-9009',
        businessName: 'Negócios Gamma'
    },
    general4: {
        whatsapp: '5511940010010',
        display: '+55 11 94001-0010',
        businessName: 'Companhia Delta'
    }
};

async function updateTenantsWhatsAppNumbers() {
    try {
        console.log('🚀 Iniciando atualização dos números WhatsApp dos tenants...');
        
        // 1. Buscar os 10 tenants existentes
        const { data: tenants, error: fetchError } = await supabase
            .from('tenants')
            .select('id, business_name, domain, phone')
            .limit(10)
            .order('created_at', { ascending: true });
            
        if (fetchError) {
            console.error('❌ Erro ao buscar tenants:', fetchError);
            return;
        }
        
        if (!tenants || tenants.length === 0) {
            console.log('⚠️ Nenhum tenant encontrado');
            return;
        }
        
        console.log(`📊 Encontrados ${tenants.length} tenants para atualização`);
        
        // 2. Mapear números por ordem ou domínio existente
        const domainKeys = Object.keys(FAKE_WHATSAPP_NUMBERS);
        const updates = [];
        
        for (let i = 0; i < tenants.length && i < domainKeys.length; i++) {
            const tenant = tenants[i];
            const domainKey = domainKeys[i];
            const numberConfig = FAKE_WHATSAPP_NUMBERS[domainKey];
            
            updates.push({
                tenantId: tenant.id,
                currentName: tenant.business_name,
                currentNumber: tenant.phone,
                newNumber: numberConfig.whatsapp,
                newDisplayNumber: numberConfig.display,
                suggestedName: numberConfig.businessName,
                domain: tenant.domain || domainKey.replace(/\d+$/, '') // Remove números do final
            });
        }
        
        // 3. Mostrar preview das mudanças
        console.log('\n📋 PREVIEW DAS MUDANÇAS:');
        console.log('===============================================');
        updates.forEach((update, index) => {
            console.log(`${index + 1}. Tenant: ${update.tenantId.substring(0, 8)}...`);
            console.log(`   Nome Atual: ${update.currentName}`);
            console.log(`   Nome Sugerido: ${update.suggestedName}`);
            console.log(`   WhatsApp Atual: ${update.currentNumber || 'Não definido'}`);
            console.log(`   WhatsApp Novo: ${update.newDisplayNumber}`);
            console.log(`   Domínio: ${update.domain}`);
            console.log('   ---');
        });
        
        // 4. Confirmar antes de executar (remover para execução automática)
        console.log('\n⚠️ ATENÇÃO: Esta é apenas uma simulação!');
        console.log('Para executar as mudanças reais, descomente a seção de UPDATE abaixo.\n');
        
        
        // 5. EXECUTAR AS MUDANÇAS REAIS:
        
        console.log('🔄 Executando atualizações...');
        
        for (const update of updates) {
            const { error: updateError } = await supabase
                .from('tenants')
                .update({
                    phone: update.newNumber,
                    // Opcionalmente atualizar nome do negócio também:
                    // business_name: update.suggestedName,
                    // domain: update.domain,
                    updated_at: new Date().toISOString()
                })
                .eq('id', update.tenantId);
                
            if (updateError) {
                console.error(`❌ Erro ao atualizar tenant ${update.tenantId}:`, updateError);
            } else {
                console.log(`✅ Tenant ${update.tenantId.substring(0, 8)}... atualizado com sucesso!`);
            }
        }
        
        console.log('\n🎯 PRÓXIMOS PASSOS:');
        console.log('1. Revisar os números propostos acima');
        console.log('2. Descoamentar a seção de UPDATE se aprovar');  
        console.log('3. Executar novamente: node update-tenants-whatsapp-numbers.js');
        console.log('4. Testar a página demo com os novos números');
        
        console.log('\n📱 NÚMEROS PARA TESTES NA DEMO:');
        Object.entries(FAKE_WHATSAPP_NUMBERS).forEach(([domain, config]) => {
            console.log(`${domain}: ${config.display} (${config.businessName})`);
        });
        
    } catch (error) {
        console.error('💥 Erro inesperado:', error);
    }
}

// Executar script
updateTenantsWhatsAppNumbers();