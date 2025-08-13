/**
 * NEW TENANT METRICS JOB SERVICE
 * Job limpo que lê a tabela tenants e popula métricas corretamente
 */

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
);

export class NewTenantMetricsJobService {
  async runTenantMetricsJob(
    periodDays: number = 30,
  ): Promise<{ success: boolean; message: string; processed: number }> {
    try {
      console.log(`🚀 INICIANDO NOVO JOB TENANT METRICS (${periodDays} dias)`);

      // 1. BUSCAR TODOS OS TENANTS ATIVOS
      const { data: tenants, error: tenantsError } = await supabase
        .from("tenants")
        .select("id, business_name, business_domain, status")
        .eq("status", "active");

      if (tenantsError) {
        throw new Error(`Erro ao buscar tenants: ${tenantsError.message}`);
      }

      if (!tenants || tenants.length === 0) {
        return {
          success: false,
          message: "Nenhum tenant ativo encontrado",
          processed: 0,
        };
      }

      console.log(`✅ Encontrados ${tenants.length} tenants ativos`);

      // 2. LIMPAR REGISTROS ANTIGOS (billing_analysis)
      const { error: deleteError } = await supabase
        .from("tenant_metrics")
        .delete()
        .eq("metric_type", "billing_analysis");

      if (deleteError) {
        console.log(
          `⚠️ Aviso ao limpar registros antigos: ${deleteError.message}`,
        );
      } else {
        console.log("🧹 Registros antigos removidos");
      }

      // 3. PROCESSAR CADA TENANT
      let processedCount = 0;
      const calculatedAt = new Date();
      const startDate = new Date(calculatedAt);
      startDate.setDate(startDate.getDate() - periodDays);

      for (const tenant of tenants) {
        console.log(`\n🏢 Processando: ${tenant.business_name} (${tenant.id})`);

        try {
          // Calcular métricas para este tenant
          const metrics = await this.calculateTenantMetrics(
            tenant.id,
            startDate,
            calculatedAt,
          );

          // Salvar na tenant_metrics
          const { error: insertError } = await supabase
            .from("tenant_metrics")
            .insert({
              tenant_id: tenant.id,
              metric_type: "billing_analysis",
              period: `${periodDays}d`,
              calculated_at: calculatedAt.toISOString(),
              metric_data: {
                ...metrics,
                business_name: tenant.business_name,
                business_domain: tenant.business_domain,
                period_days: periodDays,
                calculated_at: calculatedAt.toISOString(),
              },
            });

          if (insertError) {
            console.log(
              `❌ Erro ao salvar ${tenant.business_name}: ${insertError.message}`,
            );
          } else {
            console.log(
              `✅ ${tenant.business_name}: ${metrics.total_conversations} conversas, ${metrics.total_appointments} agendamentos`,
            );
            processedCount++;
          }
        } catch (tenantError) {
          console.log(
            `❌ Erro ao processar ${tenant.business_name}: ${tenantError}`,
          );
        }
      }

      console.log(
        `\n🎯 JOB CONCLUÍDO: ${processedCount}/${tenants.length} tenants processados`,
      );

      return {
        success: true,
        message: `Job executado com sucesso. ${processedCount} tenants processados.`,
        processed: processedCount,
      };
    } catch (error) {
      console.error("❌ Erro no job:", error);
      return {
        success: false,
        message: `Erro no job: ${error}`,
        processed: 0,
      };
    }
  }

  private async calculateTenantMetrics(
    tenantId: string,
    startDate: Date,
    endDate: Date,
  ) {
    // 1. CONVERSAS (sessions únicas com conversation_outcome)
    const { data: conversationData, error: convError } = await supabase
      .from("conversation_history")
      .select("conversation_context, conversation_outcome")
      .eq("tenant_id", tenantId)
      .not("conversation_outcome", "is", null)
      .gte("created_at", startDate.toISOString())
      .lt("created_at", endDate.toISOString());

    if (convError) {
      throw new Error(`Erro ao buscar conversas: ${convError.message}`);
    }

    // Contar sessions únicas
    const uniqueSessions = new Set();
    const outcomeDistribution: Record<string, number> = {};

    conversationData?.forEach((record) => {
      const sessionId = record.conversation_context?.session_id;
      if (sessionId) {
        uniqueSessions.add(sessionId);
      }

      const outcome = record.conversation_outcome;
      if (outcome) {
        outcomeDistribution[outcome] = (outcomeDistribution[outcome] || 0) + 1;
      }
    });

    const totalConversations = uniqueSessions.size;

    // 2. AGENDAMENTOS
    const { data: appointmentData, error: apptError } = await supabase
      .from("appointments")
      .select("id, status")
      .eq("tenant_id", tenantId)
      .gte("created_at", startDate.toISOString())
      .lt("created_at", endDate.toISOString());

    if (apptError) {
      throw new Error(`Erro ao buscar agendamentos: ${apptError.message}`);
    }

    const totalAppointments = appointmentData?.length || 0;
    const confirmedAppointments =
      appointmentData?.filter((a) => a.status === "confirmed").length || 0;
    const cancelledAppointments =
      appointmentData?.filter((a) => a.status === "cancelled").length || 0;

    // 3. CÁLCULO DO PLANO E MRR
    const planPrice = this.calculatePlanPrice(totalConversations);
    const mrr = planPrice;

    // 4. SPAM SCORE
    const validMessages =
      conversationData?.filter(
        (record) => record.conversation_context?.confidence_score >= 0.7,
      ).length || 0;
    const totalMessages = conversationData?.length || 0;
    const spamScore =
      totalMessages > 0 ? (validMessages / totalMessages) * 100 : 100;

    // 5. EFICIÊNCIA
    const efficiency =
      totalConversations > 0
        ? (totalAppointments / totalConversations) * 100
        : 0;

    return {
      total_conversations: totalConversations,
      total_appointments: totalAppointments,
      confirmed_appointments: confirmedAppointments,
      cancelled_appointments: cancelledAppointments,
      plan_price_brl: planPrice,
      mrr_brl: mrr,
      spam_score: Math.round(spamScore * 100) / 100,
      efficiency_pct: Math.round(efficiency * 100) / 100,
      outcome_distribution: outcomeDistribution,
      valid_messages: validMessages,
      total_messages: totalMessages,
    };
  }

  private calculatePlanPrice(conversations: number): number {
    // Modelo de preços baseado em conversas
    if (conversations <= 200) return 58; // Básico
    if (conversations <= 400) return 116; // Profissional
    return 290; // Enterprise
  }
}
