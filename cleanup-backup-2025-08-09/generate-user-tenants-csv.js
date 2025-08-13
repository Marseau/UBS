#!/usr/bin/env node

/**
 * Script para gerar CSV da tabela user_tenants com dados relacionados
 * Campos: name (users), created_at (users), name (tenants)
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config();

// Configuração do Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias no .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function generateUserTenantsCsv() {
    try {
        console.log('🔍 Consultando dados user_tenants com relacionamentos...');
        
        // Query com JOIN para obter todos os dados solicitados
        const { data, error } = await supabase
            .from('user_tenants')
            .select(`
                users!user_tenants_user_id_fkey (
                    name,
                    created_at
                ),
                tenants!user_tenants_tenant_id_fkey (
                    name
                ),
                role,
                first_interaction,
                last_interaction
            `);

        if (error) {
            console.error('❌ Erro na consulta:', error);
            return;
        }

        if (!data || data.length === 0) {
            console.log('⚠️ Nenhum registro encontrado na tabela user_tenants');
            return;
        }

        console.log(`✅ ${data.length} registros encontrados`);

        // Gerar cabeçalho CSV
        const csvHeaders = [
            'user_name',
            'user_created_at', 
            'tenant_name',
            'role',
            'first_interaction',
            'last_interaction'
        ];

        // Gerar linhas CSV
        const csvRows = data.map(record => {
            const userName = record.users?.name || 'N/A';
            const userCreatedAt = record.users?.created_at || 'N/A';
            const tenantName = record.tenants?.name || 'N/A';
            
            return [
                `"${userName}"`,
                `"${userCreatedAt}"`,
                `"${tenantName}"`,
                `"${record.role || 'N/A'}"`,
                `"${record.first_interaction || 'N/A'}"`,
                `"${record.last_interaction || 'N/A'}"`
            ].join(',');
        });

        // Montar CSV completo
        const csvContent = [
            csvHeaders.join(','),
            ...csvRows
        ].join('\n');

        // Salvar arquivo
        const fileName = `user-tenants-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv`;
        fs.writeFileSync(fileName, csvContent, 'utf-8');

        console.log(`📄 CSV gerado com sucesso: ${fileName}`);
        console.log(`📊 Total de registros: ${data.length}`);
        
        // Mostrar preview dos primeiros 5 registros
        console.log('\n📋 Preview dos dados:');
        console.log(csvHeaders.join(' | '));
        console.log('-'.repeat(80));
        
        data.slice(0, 5).forEach(record => {
            console.log([
                record.users?.name || 'N/A',
                record.users?.created_at?.slice(0, 10) || 'N/A',
                record.tenants?.name || 'N/A',
                record.role || 'N/A'
            ].join(' | '));
        });

        if (data.length > 5) {
            console.log(`... e mais ${data.length - 5} registros`);
        }

    } catch (error) {
        console.error('❌ Erro geral:', error);
    }
}

// Executar script
generateUserTenantsCsv();