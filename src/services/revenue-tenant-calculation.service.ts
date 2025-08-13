/**
 * REVENUE TENANT CALCULATION SERVICE
 *
 * Serviço responsável por calcular o revenue real dos tenants baseado em appointments
 * confirmados/completados, integrado ao sistema principal de métricas.
 *
 * @fileoverview Cálculo de revenue_tenant com dados reais de appointments
 * @author Claude Code Assistant
 * @version 1.0.0
 * @since 2025-08-05
 */

import { getAdminClient } from "../config/database";

export interface RevenueTenantMetrics {
  period_days: number;
  total_revenue: number;
  unique_customers: number;
  total_appointments: number;
  avg_appointment_value: number;
  calculated_at: string;
}

export class RevenueTenantCalculationService {
  private static instance: RevenueTenantCalculationService;
  private client = getAdminClient();

  public static getInstance(): RevenueTenantCalculationService {
    if (!RevenueTenantCalculationService.instance) {
      RevenueTenantCalculationService.instance =
        new RevenueTenantCalculationService();
    }
    return RevenueTenantCalculationService.instance;
  }

  /**
   * Calcular revenue_tenant baseado em dados reais de appointments
   */
  async calculateRevenueTenant(
    tenantId: string,
    periodDays: number,
  ): Promise<RevenueTenantMetrics> {
    console.log(
      `💰 Calculando revenue_tenant para ${tenantId.substring(0, 8)} (${periodDays}d)`,
    );

    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - periodDays);
      const now = new Date();

      // Query com dados reais: appointments confirmados/completados que já aconteceram
      const { data: appointments, error } = await this.client
        .from("appointments")
        .select("id, final_price, quoted_price, user_id, start_time")
        .eq("tenant_id", tenantId)
        .gte("start_time", startDate.toISOString())
        .lte("start_time", now.toISOString()) // ✅ EXCLUIR AGENDAMENTOS FUTUROS
        .in("status", ["completed", "confirmed"]);

      if (error) {
        console.error(`❌ Erro ao buscar appointments: ${error.message}`);
        throw error;
      }

      if (!appointments || appointments.length === 0) {
        console.log(`   📭 Nenhum appointment encontrado para o período`);
        return {
          period_days: periodDays,
          total_revenue: 0,
          unique_customers: 0,
          total_appointments: 0,
          avg_appointment_value: 0,
          calculated_at: new Date().toISOString(),
        };
      }

      // Cálculos com lógica corrigida: quoted_price se final_price for null/zero
      const totalRevenue = appointments.reduce((sum, apt) => {
        const price =
          apt.final_price && apt.final_price > 0
            ? parseFloat(String(apt.final_price))
            : parseFloat(String(apt.quoted_price || 0));
        return sum + price;
      }, 0);

      const uniqueCustomers = new Set(appointments.map((apt) => apt.user_id))
        .size;
      const totalAppointments = appointments.length;
      const avgAppointmentValue =
        totalAppointments > 0 ? totalRevenue / totalAppointments : 0;

      console.log(
        `   ✅ R$ ${totalRevenue.toFixed(2)} (${totalAppointments} appts, ${uniqueCustomers} customers)`,
      );

      return {
        period_days: periodDays,
        total_revenue: totalRevenue,
        unique_customers: uniqueCustomers,
        total_appointments: totalAppointments,
        avg_appointment_value: avgAppointmentValue,
        calculated_at: new Date().toISOString(),
      };
    } catch (error) {
      console.error(`❌ Erro no cálculo de revenue_tenant:`, error);
      throw error;
    }
  }

  /**
   * Salvar métrica revenue_tenant na tabela tenant_metrics
   */
  async saveRevenueTenantMetric(
    tenantId: string,
    period: "7d" | "30d" | "90d",
    metrics: RevenueTenantMetrics,
  ): Promise<void> {
    console.log(
      `💾 Salvando revenue_tenant para ${tenantId.substring(0, 8)} (${period})`,
    );

    try {
      // Deletar métrica existente do período
      await this.client
        .from("tenant_metrics")
        .delete()
        .eq("tenant_id", tenantId)
        .eq("metric_type", "revenue_tenant")
        .eq("period", period);

      // Inserir nova métrica
      const { error } = await this.client.from("tenant_metrics").insert({
        tenant_id: tenantId,
        metric_type: "revenue_tenant",
        period: period,
        metric_data: metrics as any,
        calculated_at: new Date().toISOString(),
      });

      if (error) {
        throw new Error(`Erro ao salvar métrica: ${error.message}`);
      }

      console.log(`   ✅ Métrica revenue_tenant salva com sucesso`);
    } catch (error) {
      console.error(`❌ Erro ao salvar revenue_tenant:`, error);
      throw error;
    }
  }

  /**
   * Calcular e salvar para todos os períodos de um tenant
   */
  async calculateAndSaveAllPeriods(tenantId: string): Promise<{
    "7d": RevenueTenantMetrics;
    "30d": RevenueTenantMetrics;
    "90d": RevenueTenantMetrics;
  }> {
    console.log(
      `🔄 Calculando revenue_tenant para todos os períodos: ${tenantId.substring(0, 8)}`,
    );

    const periods: { key: "7d" | "30d" | "90d"; days: number }[] = [
      { key: "7d", days: 7 },
      { key: "30d", days: 30 },
      { key: "90d", days: 90 },
    ];

    const results = {} as any;

    for (const period of periods) {
      try {
        const metrics = await this.calculateRevenueTenant(
          tenantId,
          period.days,
        );
        await this.saveRevenueTenantMetric(tenantId, period.key, metrics);
        results[period.key] = metrics;
      } catch (error) {
        console.error(`❌ Erro no período ${period.key}:`, error);
        results[period.key] = {
          period_days: period.days,
          total_revenue: 0,
          unique_customers: 0,
          total_appointments: 0,
          avg_appointment_value: 0,
          calculated_at: new Date().toISOString(),
        };
      }
    }

    return results;
  }

  /**
   * Calcular revenue agregado da plataforma baseado nos tenant_metrics
   */
  async calculatePlatformRevenueAggregation(
    period: "7d" | "30d" | "90d",
  ): Promise<{
    total_revenue_tenant: number;
    active_tenants: number;
    total_appointments: number;
    total_customers: number;
  }> {
    console.log(
      `🏢 Calculando agregação de revenue_tenant da plataforma (${period})`,
    );

    try {
      // Buscar todas as métricas revenue_tenant do período
      const { data: tenantMetrics, error } = await this.client
        .from("tenant_metrics")
        .select("tenant_id, metric_data")
        .eq("metric_type", "revenue_tenant")
        .eq("period", period);

      if (error) {
        throw new Error(`Erro ao buscar métricas: ${error.message}`);
      }

      if (!tenantMetrics || tenantMetrics.length === 0) {
        console.log(
          `   📭 Nenhuma métrica revenue_tenant encontrada para ${period}`,
        );
        return {
          total_revenue_tenant: 0,
          active_tenants: 0,
          total_appointments: 0,
          total_customers: 0,
        };
      }

      // Agregar totais
      let totalRevenue = 0;
      let totalAppointments = 0;
      let totalCustomers = 0;
      let activeTenants = 0;

      tenantMetrics.forEach((metric) => {
        const data = metric.metric_data as any;
        totalRevenue += data.total_revenue || 0;
        totalAppointments += data.total_appointments || 0;
        totalCustomers += data.unique_customers || 0;
        if ((data.total_revenue || 0) > 0) {
          activeTenants++;
        }
      });

      console.log(
        `   ✅ Agregação: R$ ${totalRevenue.toFixed(2)} (${activeTenants} tenants ativos)`,
      );

      return {
        total_revenue_tenant: totalRevenue,
        active_tenants: activeTenants,
        total_appointments: totalAppointments,
        total_customers: totalCustomers,
      };
    } catch (error) {
      console.error(`❌ Erro na agregação:`, error);
      throw error;
    }
  }
}

// Export singleton
export const revenueTenantCalculationService =
  RevenueTenantCalculationService.getInstance();
