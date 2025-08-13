#!/usr/bin/env node
/**
 * Inspect platform_metrics table structure
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function inspectPlatformMetrics() {
    console.log('🔍 Investigando estrutura da tabela platform_metrics...\n');
    
    try {
        // 1. Tentar buscar dados para verificar estrutura
        console.log('1. Tentando acessar platform_metrics...');
        const { data: platformData, error: platformError } = await supabase
            .from('platform_metrics')
            .select('*')
            .limit(3);
            
        if (platformError) {
            console.log('❌ Erro ao acessar platform_metrics:', platformError.message);
            console.log('   Code:', platformError.code);
            console.log('   Details:', platformError.details);
            
            // Tentar alternativas
            console.log('\n2. Tentando alternativas...');
            
            // Verificar se existe ubs_metric_system
            const { data: ubsData, error: ubsError } = await supabase
                .from('ubs_metric_system')
                .select('*')
                .limit(3);
                
            if (ubsError) {
                console.log('❌ ubs_metric_system também falhou:', ubsError.message);
            } else {
                console.log('✅ Encontrada tabela ubs_metric_system:');
                if (ubsData && ubsData.length > 0) {
                    console.log('   Colunas:', Object.keys(ubsData[0]));
                    console.log('   Registros:', ubsData.length);
                } else {
                    console.log('   Tabela existe mas está vazia');
                }
            }
            
            // Verificar se existe platform_analytics
            const { data: analyticsData, error: analyticsError } = await supabase
                .from('platform_analytics')
                .select('*')
                .limit(3);
                
            if (analyticsError) {
                console.log('❌ platform_analytics falhou:', analyticsError.message);
            } else {
                console.log('✅ Encontrada tabela platform_analytics:');
                if (analyticsData && analyticsData.length > 0) {
                    console.log('   Colunas:', Object.keys(analyticsData[0]));
                    console.log('   Registros:', analyticsData.length);
                }
            }
            
        } else {
            console.log('✅ Tabela platform_metrics acessível:');
            if (platformData && platformData.length > 0) {
                console.log('   Colunas:', Object.keys(platformData[0]));
                console.log('   Registros encontrados:', platformData.length);
                
                platformData.forEach((record, i) => {
                    console.log(`\n   Registro ${i + 1}:`);
                    Object.entries(record).forEach(([key, value]) => {
                        console.log(`     ${key}: ${typeof value === 'object' ? JSON.stringify(value).substring(0, 100) + '...' : value}`);
                    });
                });
            } else {
                console.log('   Tabela existe mas está vazia');
            }
        }
        
        // 3. Listar todas as tabelas que possam conter métricas de plataforma
        console.log('\n3. Buscando tabelas relacionadas a métricas...');
        
        const metricsTableNames = [
            'platform_metrics',
            'ubs_metric_system', 
            'platform_analytics',
            'aggregated_metrics',
            'system_metrics',
            'global_metrics'
        ];
        
        for (const tableName of metricsTableNames) {
            try {
                const { data, error } = await supabase
                    .from(tableName)
                    .select('*')
                    .limit(1);
                    
                if (!error && data !== null) {
                    console.log(`✅ ${tableName}: ${data.length > 0 ? 'COM DADOS' : 'VAZIA'}`);
                    if (data.length > 0) {
                        console.log(`   Colunas: ${Object.keys(data[0]).join(', ')}`);
                    }
                } else {
                    console.log(`❌ ${tableName}: ${error?.message || 'Não existe'}`);
                }
            } catch (err) {
                console.log(`❌ ${tableName}: Erro de acesso`);
            }
        }
        
    } catch (error) {
        console.error('💥 Erro geral:', error.message);
    }
}

inspectPlatformMetrics();