#!/usr/bin/env node
/**
 * Discover the real schema of platform_metrics table
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function discoverSchema() {
    console.log('🔍 Descobrindo schema real da tabela platform_metrics...\n');
    
    try {
        // Método 1: Tentar várias combinações de colunas comuns
        const commonColumns = [
            { period: '7d' },
            { period: '7d', metric_data: {} },
            { period: '7d', data: {} },
            { period: '7d', metrics: {} },
            { period: '7d', created_at: new Date().toISOString() },
            { period: '7d', updated_at: new Date().toISOString() },
            { period: '7d', timestamp: new Date().toISOString() }
        ];
        
        console.log('1. Testando combinações de colunas comuns...');
        
        for (let i = 0; i < commonColumns.length; i++) {
            const testData = commonColumns[i];
            console.log(`   Teste ${i + 1}: ${Object.keys(testData).join(', ')}`);
            
            const { data, error } = await supabase
                .from('platform_metrics')
                .insert(testData)
                .select();
                
            if (!error) {
                console.log(`   ✅ SUCESSO com: ${Object.keys(testData).join(', ')}`);
                console.log('   Colunas da tabela:', Object.keys(data[0]));
                
                // Limpar dados de teste
                await supabase
                    .from('platform_metrics')
                    .delete()
                    .eq('id', data[0].id);
                    
                return data[0]; // Retorna o primeiro registro bem-sucedido
            } else {
                console.log(`   ❌ ${error.message}`);
            }
        }
        
        // Método 2: Analisar o serviço que está tentando inserir dados
        console.log('\n2. Analisando código do platform-aggregation.service...');
        
        // Verificar o que o serviço está tentando inserir
        const fs = require('fs');
        const path = require('path');
        
        const servicePath = path.join(__dirname, 'src/services/platform-aggregation.service.ts');
        if (fs.existsSync(servicePath)) {
            const serviceContent = fs.readFileSync(servicePath, 'utf8');
            
            // Procurar por inserções na tabela platform_metrics
            const insertMatches = serviceContent.match(/\.from\(['"`]platform_metrics['"`]\)[\s\S]*?\.insert\([^)]+\)/g);
            if (insertMatches) {
                console.log('   Encontradas inserções no código:');
                insertMatches.forEach((match, i) => {
                    console.log(`   ${i + 1}. ${match.substring(0, 200)}...`);
                });
            } else {
                console.log('   Nenhuma inserção encontrada no código do serviço');
            }
        } else {
            console.log('   Arquivo do serviço não encontrado');
        }
        
        // Método 3: Verificar se há outros nomes de tabela sendo usados
        console.log('\n3. Verificando possíveis tabelas alternativas...');
        
        const alternativeNames = [
            'platform_metric',
            'metrics_platform', 
            'platform_data',
            'aggregated_platform_metrics',
            'system_platform_metrics'
        ];
        
        for (const tableName of alternativeNames) {
            try {
                const { data, error } = await supabase
                    .from(tableName)
                    .select('*')
                    .limit(1);
                    
                if (!error) {
                    console.log(`   ✅ Tabela ${tableName} existe`);
                    if (data && data.length > 0) {
                        console.log(`     Colunas: ${Object.keys(data[0]).join(', ')}`);
                    } else {
                        console.log('     Tabela vazia');
                    }
                }
            } catch (err) {
                // Ignora erros de tabela não existente
            }
        }
        
        // Método 4: Verificar logs ou mensagens do serviço
        console.log('\n4. Executando novamente o serviço com debug...');
        
        try {
            const { platformAggregationService } = require('./dist/services/platform-aggregation.service.js');
            
            // Executar apenas um período para debug
            console.log('   Executando agregação de 7d apenas...');
            const result = await platformAggregationService.aggregatePlatformMetrics('7d');
            
            console.log('   Resultado da agregação:', {
                success: result.success,
                errors: result.errors,
                hasData: !!result.platform_metrics
            });
            
            if (result.platform_metrics) {
                console.log('   Estrutura dos dados a serem inseridos:');
                console.log('   Colunas:', Object.keys(result.platform_metrics));
            }
            
        } catch (serviceError) {
            console.log('   ❌ Erro no serviço:', serviceError.message);
        }
        
        return null;
        
    } catch (error) {
        console.error('💥 Erro geral:', error.message);
        return null;
    }
}

discoverSchema()
    .then(result => {
        if (result) {
            console.log('\n🎯 SCHEMA DESCOBERTO:');
            console.log(JSON.stringify(result, null, 2));
        } else {
            console.log('\n❌ Não foi possível descobrir o schema da tabela');
        }
    })
    .catch(error => {
        console.error('Erro fatal:', error);
    });