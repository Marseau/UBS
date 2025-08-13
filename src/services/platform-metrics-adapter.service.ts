/**
 * PLATFORM METRICS ADAPTER SERVICE
 * 
 * 🎯 OBJETIVO: Apresentar platform_metrics com 4 campos JSON virtuais
 * para compatibilidade total com Super Admin Dashboard
 * 
 * ESTRUTURA REAL:
 * - comprehensive_metrics (com metric_data_virtual dentro)
 * - participation_metrics  
 * - ranking_metrics
 * 
 * ESTRUTURA APRESENTADA:
 * - comprehensive_metrics
 * - participation_metrics
 * - ranking_metrics
 * - metric_data (extraído de comprehensive_metrics.metric_data_virtual)
 */

import { getAdminClient } from "../config/database";

interface AdaptedPlatformMetrics {
  // Campos básicos
  id: string;
  calculation_date: string | null;
  period: string;
  tenants_processed: number | null;
  total_tenants: number | null;
  calculation_method: string | null;
  created_at: string | null;
  updated_at: string | null;
  
  // 4 campos JSON (com metric_data adaptado)
  comprehensive_metrics: any;
  participation_metrics: any;
  ranking_metrics: any;
  metric_data: any; // Extraído de comprehensive_metrics.metric_data_virtual
}

export class PlatformMetricsAdapterService {
  private client = getAdminClient();
  
  /**
   * BUSCAR MÉTRICAS COM 4 CAMPOS JSON VIRTUAIS
   */
  async getPlatformMetricsWithVirtual4thField(period?: string): Promise<AdaptedPlatformMetrics[]> {
    console.log(`🔍 Buscando platform_metrics com 4º campo JSON virtual${period ? ` (${period})` : ''}`);
    
    try {
      let query = this.client
        .from('platform_metrics')
        .select('*')
        .order('created_at', { ascending: false });
        
      if (period) {
        query = query.eq('period', period);
      }
      
      const { data: rawData, error } = await query;
      
      if (error) {
        throw new Error(`Erro ao buscar platform_metrics: ${error.message}`);
      }
      
      if (!rawData || rawData.length === 0) {
        console.log('📭 Nenhuma platform_metrics encontrada');
        return [];
      }
      
      // Adaptar cada registro para ter 4 campos JSON
      const adaptedData = rawData.map(record => {
        const comprehensive = record.comprehensive_metrics as any || {};
        const metricDataVirtual = comprehensive.metric_data_virtual || {};
        
        // Remover metric_data_virtual do comprehensive para não duplicar
        const cleanComprehensive = { ...comprehensive };
        delete cleanComprehensive.metric_data_virtual;
        
        const adapted: AdaptedPlatformMetrics = {
          // Campos básicos
          id: record.id,
          calculation_date: record.calculation_date,
          period: record.period,
          tenants_processed: (comprehensive as any).tenants_processed || 0,
          total_tenants: (comprehensive as any).total_tenants || 0,
          calculation_method: (comprehensive as any).calculation_method || "aggregated",
          created_at: record.created_at,
          updated_at: record.updated_at,
          
          // 4 campos JSON
          comprehensive_metrics: cleanComprehensive,
          participation_metrics: record.participation_metrics,
          ranking_metrics: record.ranking_metrics,
          metric_data: metricDataVirtual // 4º CAMPO EXTRAÍDO
        };
        
        return adapted;
      });
      
      console.log(`✅ ${adaptedData.length} registros adaptados com 4 campos JSON`);
      
      // Log detalhado do primeiro registro para verificação
      if (adaptedData.length > 0) {
        const firstRecord = adaptedData[0];
        console.log(`🔍 Primeiro registro (${firstRecord?.period}):`);
        console.log(`   • comprehensive_metrics: ${Object.keys(firstRecord?.comprehensive_metrics || {}).length} chaves`);
        console.log(`   • participation_metrics: ${Object.keys(firstRecord?.participation_metrics || {}).length} chaves`);
        console.log(`   • ranking_metrics: ${Object.keys(firstRecord?.ranking_metrics || {}).length} chaves`);
        console.log(`   • metric_data: ${Object.keys(firstRecord?.metric_data || {}).length} chaves`);
      }
      
      return adaptedData;
      
    } catch (error) {
      console.error('❌ Erro no adapter:', error);
      throw error;
    }
  }
  
  /**
   * BUSCAR MÉTRICAS PARA SUPER ADMIN DASHBOARD
   * Formato específico para compatibilidade com dashboard
   */
  async getDashboardMetrics(period: string = '30d'): Promise<AdaptedPlatformMetrics | null> {
    console.log(`📊 Buscando métricas para Super Admin Dashboard (${period})`);
    
    const metrics = await this.getPlatformMetricsWithVirtual4thField(period);
    
    if (metrics.length === 0) {
      return null;
    }
    
    const dashboardMetrics = metrics[0]; // Pegar o mais recente
    
    // Validar se todos os 4 campos JSON estão presentes
    const hasAll4Fields = !!(
      dashboardMetrics?.comprehensive_metrics &&
      dashboardMetrics?.participation_metrics &&
      dashboardMetrics?.ranking_metrics &&
      dashboardMetrics?.metric_data
    );
    
    if (hasAll4Fields) {
      console.log('✅ Métricas de dashboard validadas com 4 campos JSON');
      return dashboardMetrics || null;
    } else {
      console.log('❌ Métricas de dashboard incompletas');
      return null;
    }
  }
  
  /**
   * LISTAR PERÍODOS DISPONÍVEIS
   */
  async getAvailablePeriods(): Promise<string[]> {
    const { data, error } = await this.client
      .from('platform_metrics')
      .select('period')
      .order('created_at', { ascending: false });
    
    if (error) {
      throw new Error(`Erro ao buscar períodos: ${error.message}`);
    }
    
    const uniquePeriods = [...new Set(data.map(d => d.period))];
    console.log(`📅 Períodos disponíveis: ${uniquePeriods.join(', ')}`);
    
    return uniquePeriods;
  }
  
  /**
   * VALIDAR ESTRUTURA COMPLETA
   */
  async validateComplete4FieldStructure(): Promise<{
    valid: boolean;
    records: number;
    issues: string[];
  }> {
    console.log('🔍 Validando estrutura completa de 4 campos JSON...');
    
    const metrics = await this.getPlatformMetricsWithVirtual4thField();
    
    const issues: string[] = [];
    let validRecords = 0;
    
    metrics.forEach((record, i) => {
      const missing: string[] = [];
      
      if (!record.comprehensive_metrics || Object.keys(record.comprehensive_metrics).length === 0) {
        missing.push('comprehensive_metrics');
      }
      if (!record.participation_metrics || Object.keys(record.participation_metrics).length === 0) {
        missing.push('participation_metrics');
      }
      if (!record.ranking_metrics || Object.keys(record.ranking_metrics).length === 0) {
        missing.push('ranking_metrics');
      }
      if (!record.metric_data || Object.keys(record.metric_data).length === 0) {
        missing.push('metric_data');
      }
      
      if (missing.length === 0) {
        validRecords++;
      } else {
        issues.push(`Registro ${i+1} (${record.period}): faltando ${missing.join(', ')}`);
      }
    });
    
    const valid = issues.length === 0 && metrics.length > 0;
    
    console.log(`${valid ? '✅' : '❌'} Validação: ${validRecords}/${metrics.length} registros válidos`);
    
    return {
      valid,
      records: metrics.length,
      issues
    };
  }
}

// Export singleton instance
export const platformMetricsAdapter = new PlatformMetricsAdapterService();