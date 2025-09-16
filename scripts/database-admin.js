/**
 * Comandos administrativos de banco de dados
 * Para executar: node scripts/database-admin.js <comando>
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const commands = {
    'remove-default': async (supabase) => {
        console.log('🔧 Removendo DEFAULT de model_used...');
        
        // Usando query SQL direta via Supabase REST API
        const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/exec`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                query: 'ALTER TABLE conversation_history ALTER COLUMN model_used DROP DEFAULT;'
            })
        });

        if (!response.ok) {
            console.log('⚠️ Não foi possível alterar via API. Execute manualmente:');
            console.log('ALTER TABLE conversation_history ALTER COLUMN model_used DROP DEFAULT;');
        } else {
            console.log('✅ DEFAULT removido com sucesso!');
        }
    },

    'analyze': async (supabase) => {
        console.log('📊 Analisando estado atual do model_used...');
        
        // Distribuição geral
        const { data: all, error } = await supabase
            .from('conversation_history')
            .select('model_used, created_at')
            .gte('created_at', new Date(Date.now() - 7*24*60*60*1000).toISOString()) // Últimos 7 dias
            .order('created_at', { ascending: false });

        if (error) {
            console.error('❌ Erro:', error.message);
            return;
        }

        const distribution = {};
        const byDay = {};
        
        all.forEach(record => {
            const model = record.model_used || 'NULL';
            const day = record.created_at.split('T')[0];
            
            distribution[model] = (distribution[model] || 0) + 1;
            
            if (!byDay[day]) byDay[day] = {};
            byDay[day][model] = (byDay[day][model] || 0) + 1;
        });

        console.log('\n📊 Distribuição total (últimos 7 dias):');
        Object.entries(distribution)
            .sort(([,a], [,b]) => b - a)
            .forEach(([model, count]) => {
                console.log(`   ${model}: ${count}`);
            });

        console.log('\n📅 Por dia:');
        Object.entries(byDay)
            .sort()
            .slice(-3) // Últimos 3 dias
            .forEach(([day, models]) => {
                console.log(`   ${day}:`);
                Object.entries(models).forEach(([model, count]) => {
                    console.log(`      ${model}: ${count}`);
                });
            });
    },

    'help': () => {
        console.log('📋 Comandos disponíveis:');
        console.log('   analyze        - Analisar distribuição de model_used');
        console.log('   remove-default - Remover DEFAULT da coluna model_used');
        console.log('   help          - Mostrar esta ajuda');
    }
};

async function main() {
    const command = process.argv[2] || 'help';
    
    if (!commands[command]) {
        console.error(`❌ Comando desconhecido: ${command}`);
        commands.help();
        process.exit(1);
    }

    if (command === 'help') {
        commands.help();
        return;
    }

    const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    try {
        await commands[command](supabase);
    } catch (error) {
        console.error('❌ Erro:', error.message);
        process.exit(1);
    }
}

main();