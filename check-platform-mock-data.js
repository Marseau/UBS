#!/usr/bin/env node

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * ANÁLISE DE MOCK DATA NA TABELA PLATFORM_METRICS
 * 
 * Este script verifica se existem dados mock, hardcoded ou suspeitos
 * na tabela platform_metrics
 */

async function analyzeForMockData() {
  console.log('🔍 ANÁLISE DE MOCK DATA - PLATFORM_METRICS');
  console.log('='.repeat(70));
  console.log('📅 ' + new Date().toLocaleString('pt-BR'));
  console.log('');

  try {
    // 1. VERIFICAR ACESSO À TABELA
    console.log('🔐 Verificando acesso à tabela platform_metrics...');
    
    const { data: allRecords, error: accessError } = await supabase
      .from('platform_metrics')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
      
    if (accessError) {
      console.error('❌ ERRO DE ACESSO:', accessError.message);
      console.log('');
      console.log('🔧 POSSÍVEIS CAUSAS:');
      console.log('   • Chaves de API incorretas');
      console.log('   • Tabela não existe');
      console.log('   • Problemas de permissão RLS');
      return { hasAccess: false, error: accessError.message };
    }
    
    if (!allRecords || allRecords.length === 0) {
      console.log('✅ TABELA PLATFORM_METRICS ESTÁ COMPLETAMENTE VAZIA');
      console.log('   ✓ Não há dados mock');
      console.log('   ✓ Não há dados reais');
      console.log('   ✓ Sistema limpo e pronto para population');
      return {
        hasAccess: true,
        isEmpty: true,
        totalRecords: 0,
        mockDataFound: false
      };
    }

    // 2. ANÁLISE DETALHADA DOS REGISTROS
    console.log(`📊 ENCONTRADOS ${allRecords.length} REGISTROS`);
    console.log('🔍 Analisando indicadores de mock data...');
    console.log('');

    const analysis = {
      hasAccess: true,
      isEmpty: false,
      totalRecords: allRecords.length,
      mockDataFound: false,
      suspiciousRecords: [],
      realDataRecords: [],
      analysisDetails: {
        dataSources: new Set(),
        calculationMethods: new Set(),
        suspiciousPatterns: {
          roundNumbers: 0,
          testSources: 0,
          mockMethods: 0,
          impossibleValues: 0
        }
      }
    };

    allRecords.forEach((record, index) => {
      const suspicious = [];
      const recordInfo = {
        id: record.id,
        date: record.calculation_date,
        period: record.period_days,
        source: record.data_source,
        method: record.calculation_method,
        revenue: record.total_revenue,
        mrr: record.platform_mrr,
        tenants: record.active_tenants,
        created: record.created_at
      };

      // Coletar metadados
      if (record.data_source) analysis.analysisDetails.dataSources.add(record.data_source);
      if (record.calculation_method) analysis.analysisDetails.calculationMethods.add(record.calculation_method);

      // INDICADOR 1: Data source suspeita
      if (record.data_source) {
        const source = record.data_source.toLowerCase();
        if (source.includes('mock') || source.includes('test') || source.includes('fake')) {
          suspicious.push('Data source contém palavras suspeitas');
          analysis.analysisDetails.suspiciousPatterns.testSources++;
        }
      }

      // INDICADOR 2: Calculation method suspeito
      if (record.calculation_method) {
        const method = record.calculation_method.toLowerCase();
        if (method.includes('mock') || method.includes('test') || method.includes('fake') || method.includes('hardcoded')) {
          suspicious.push('Calculation method suspeito');
          analysis.analysisDetails.suspiciousPatterns.mockMethods++;
        }
      }

      // INDICADOR 3: Números redondos demais (possível hardcode)
      if (record.total_revenue && record.total_revenue % 100 === 0 && record.total_revenue > 0) {
        suspicious.push(`Revenue muito redondo: R$ ${record.total_revenue}`);
        analysis.analysisDetails.suspiciousPatterns.roundNumbers++;
      }

      if (record.platform_mrr && record.platform_mrr % 100 === 0 && record.platform_mrr > 0) {
        suspicious.push(`MRR muito redondo: R$ ${record.platform_mrr}`);
        analysis.analysisDetails.suspiciousPatterns.roundNumbers++;
      }

      // INDICADOR 4: Valores impossíveis ou irreais
      if (record.total_revenue && record.total_revenue > 1000000) {
        suspicious.push('Revenue muito alto para teste');
        analysis.analysisDetails.suspiciousPatterns.impossibleValues++;
      }

      if (record.active_tenants && record.active_tenants > 100) {
        suspicious.push('Muitos tenants para ambiente de teste');
        analysis.analysisDetails.suspiciousPatterns.impossibleValues++;
      }

      // Classificar registro
      if (suspicious.length > 0) {
        analysis.mockDataFound = true;
        analysis.suspiciousRecords.push({
          ...recordInfo,
          suspiciousReasons: suspicious
        });
      } else {
        analysis.realDataRecords.push(recordInfo);
      }
    });

    // 3. RELATÓRIO DETALHADO
    console.log('📋 RELATÓRIO DE ANÁLISE:');
    console.log('='.repeat(50));
    
    if (analysis.mockDataFound) {
      console.log('🚨 MOCK DATA ENCONTRADO!');
      console.log(`   📊 Total de registros: ${analysis.totalRecords}`);
      console.log(`   ⚠️  Registros suspeitos: ${analysis.suspiciousRecords.length}`);
      console.log(`   ✅ Registros aparentemente reais: ${analysis.realDataRecords.length}`);
      console.log('');
      
      console.log('🔍 PADRÕES SUSPEITOS DETECTADOS:');
      console.log(`   • Números redondos: ${analysis.analysisDetails.suspiciousPatterns.roundNumbers}`);
      console.log(`   • Sources de teste: ${analysis.analysisDetails.suspiciousPatterns.testSources}`);
      console.log(`   • Methods suspeitos: ${analysis.analysisDetails.suspiciousPatterns.mockMethods}`);
      console.log(`   • Valores impossíveis: ${analysis.analysisDetails.suspiciousPatterns.impossibleValues}`);
      console.log('');

      console.log('📋 DATA SOURCES ENCONTRADAS:');
      [...analysis.analysisDetails.dataSources].forEach(source => {
        const indicator = (source && (source.includes('mock') || source.includes('test'))) ? '🚨' : '✅';
        console.log(`   ${indicator} ${source || 'N/A'}`);
      });
      console.log('');

      console.log('📋 CALCULATION METHODS ENCONTRADOS:');
      [...analysis.analysisDetails.calculationMethods].forEach(method => {
        const indicator = (method && (method.includes('mock') || method.includes('test'))) ? '🚨' : '✅';
        console.log(`   ${indicator} ${method || 'N/A'}`);
      });
      console.log('');

      console.log('🚨 REGISTROS SUSPEITOS DETALHADOS:');
      analysis.suspiciousRecords.slice(0, 10).forEach((record, i) => {
        console.log(`   ${i + 1}. ${record.date} | ${record.source || 'N/A'}`);
        console.log(`      Motivos: ${record.suspiciousReasons.join(', ')}`);
        console.log(`      Revenue: R$ ${record.revenue || 0} | Tenants: ${record.tenants || 0}`);
        console.log('');
      });

    } else {
      console.log('✅ NENHUM MOCK DATA DETECTADO!');
      console.log(`   📊 Total de registros: ${analysis.totalRecords}`);
      console.log('   🎯 Todos os registros parecem ser dados reais');
      console.log('');
      
      console.log('📋 SOURCES REAIS ENCONTRADAS:');
      [...analysis.analysisDetails.dataSources].forEach(source => {
        console.log(`   ✅ ${source || 'N/A'}`);
      });
      console.log('');

      console.log('📋 ÚLTIMOS REGISTROS (AMOSTRA):');
      analysis.realDataRecords.slice(0, 5).forEach((record, i) => {
        console.log(`   ${i + 1}. ${record.date} | ${record.source || 'N/A'}`);
        console.log(`      Revenue: R$ ${record.revenue || 0} | MRR: R$ ${record.mrr || 0} | Tenants: ${record.tenants || 0}`);
        console.log('');
      });
    }

    // 4. RECOMENDAÇÕES
    console.log('💡 RECOMENDAÇÕES:');
    console.log('='.repeat(40));
    
    if (analysis.mockDataFound) {
      console.log('🧹 LIMPEZA NECESSÁRIA:');
      console.log('   1. Executar script clean-all-mock-data.js');
      console.log('   2. Verificar scripts de população');
      console.log('   3. Re-executar jobs com dados reais');
      console.log('   4. Validar fontes de dados');
    } else {
      console.log('✅ SISTEMA LIMPO:');
      console.log('   • Nenhum mock data detectado');
      console.log('   • Dados parecem consistentes');
      console.log('   • Sistema pronto para produção');
    }

    return analysis;

  } catch (error) {
    console.error('💥 ERRO CRÍTICO:', error.message);
    return {
      hasAccess: false,
      error: error.message,
      criticalError: true
    };
  }
}

// Executar análise
if (require.main === module) {
  analyzeForMockData()
    .then(result => {
      console.log('');
      console.log('🏁 ANÁLISE CONCLUÍDA');
      
      if (result.criticalError) {
        console.log('💥 Erro crítico durante análise');
        process.exit(1);
      } else if (result.mockDataFound) {
        console.log('⚠️  Mock data detectado - limpeza recomendada');
        process.exit(2);
      } else {
        console.log('✅ Sistema limpo e validado');
        process.exit(0);
      }
    })
    .catch(error => {
      console.error('💥 ERRO FATAL:', error.message);
      process.exit(1);
    });
}

module.exports = { analyzeForMockData };