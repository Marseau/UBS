import { supabase } from "../config/database";
import { logger } from "../utils/logger";

interface TenantMetricData {
  appointments_total: number;
  appointments_confirmed: number;
  appointments_cancelled: number;
  total_revenue: number;
  conversations_total: number; // CONVERSAS (não mensagens!)
  conversations_with_outcome: number;
  total_ai_cost: number;
  success_rate: number;
}

export class MetricsAnalysisCorrectedService {
  /**
   * Analisa dados reais das tabelas fonte para um período específico
   * CORREÇÃO: Usa session_id para contar conversas, não mensagens individuais
   */
  async analyzeRealData(days: number): Promise<{
    tenantMetrics: Map<string, TenantMetricData>;
    platformTotals: TenantMetricData;
  }> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    logger.info(
      `Analisando dados CORRETOS para período de ${days} dias desde ${cutoffDate.toISOString()}`,
    );

    try {
      // 1. Buscar appointments usando START_TIME (correção já feita)
      const { data: appointments, error: appointmentsError } = await supabase
        .from("appointments")
        .select(
          "id, tenant_id, status, quoted_price, final_price, start_time, created_at",
        )
        .gte("start_time", cutoffDate.toISOString())
        .limit(2000);

      if (appointmentsError) {
        throw new Error(
          `Erro ao buscar appointments: ${appointmentsError.message}`,
        );
      }

      // 2. Buscar CONVERSAS (não mensagens!) agrupadas por session_id
      const { data: conversationSessions, error: conversationsError } = await (
        supabase as any
      ).rpc("get_conversation_sessions_by_period", {
        period_days: days,
      });

      // Se a função RPC não existir, fazer query manual
      let conversations: any[] = [];
      if (conversationsError || !conversationSessions) {
        logger.warn("RPC não disponível, usando query manual para conversas");

        // Query manual para agrupar mensagens em conversas por session_id
        const { data: rawMessages, error: messagesError } = await supabase
          .from("conversation_history")
          .select(
            "tenant_id, user_id, conversation_context, api_cost_usd, processing_cost_usd, conversation_outcome, created_at",
          )
          .gte("created_at", cutoffDate.toISOString())
          .limit(5000);

        if (messagesError) {
          throw new Error(`Erro ao buscar messages: ${messagesError.message}`);
        }

        // Agrupar mensagens por session_id para formar conversas
        const sessionMap = new Map();

        if (rawMessages) {
          for (const message of rawMessages) {
            const sessionId = (message as any).conversation_context?.session_id;
            if (!sessionId) continue;

            if (!sessionMap.has(sessionId)) {
              sessionMap.set(sessionId, {
                tenant_id: (message as any).tenant_id,
                user_id: (message as any).user_id,
                session_id: sessionId,
                total_api_cost: 0,
                total_processing_cost: 0,
                has_outcome: false,
                created_at: (message as any).created_at,
              });
            }

            const session = sessionMap.get(sessionId);
            session.total_api_cost += parseFloat(
              (message as any).api_cost_usd || 0,
            );
            session.total_processing_cost += parseFloat(
              (message as any).processing_cost_usd || 0,
            );

            if ((message as any).conversation_outcome) {
              session.has_outcome = true;
            }
          }
        }

        conversations = Array.from(sessionMap.values());
      } else {
        conversations = conversationSessions;
      }

      logger.info(
        `📊 Dados encontrados: ${appointments?.length || 0} appointments, ${conversations?.length || 0} conversas (não mensagens!)`,
      );

      // Processar dados por tenant
      const tenantMetrics = new Map<string, TenantMetricData>();

      // Processar appointments por tenant
      if (appointments) {
        for (const appointment of appointments) {
          if (!tenantMetrics.has(appointment.tenant_id!)) {
            tenantMetrics.set(appointment.tenant_id!, {
              appointments_total: 0,
              appointments_confirmed: 0,
              appointments_cancelled: 0,
              total_revenue: 0,
              conversations_total: 0,
              conversations_with_outcome: 0,
              total_ai_cost: 0,
              success_rate: 0,
            });
          }

          const metrics = tenantMetrics.get(appointment.tenant_id!)!;
          metrics.appointments_total++;

          if (appointment.status === "confirmed") {
            metrics.appointments_confirmed++;
          } else if (appointment.status === "cancelled") {
            metrics.appointments_cancelled++;
          }

          // Usar final_price se disponível, senão quoted_price
          const price = appointment.final_price || appointment.quoted_price;
          if (price) {
            metrics.total_revenue += parseFloat(price.toString());
          }
        }
      }

      // Processar CONVERSAS (não mensagens!) por tenant
      if (conversations) {
        for (const conversation of conversations) {
          if (!tenantMetrics.has(conversation.tenant_id)) {
            tenantMetrics.set(conversation.tenant_id, {
              appointments_total: 0,
              appointments_confirmed: 0,
              appointments_cancelled: 0,
              total_revenue: 0,
              conversations_total: 0,
              conversations_with_outcome: 0,
              total_ai_cost: 0,
              success_rate: 0,
            });
          }

          const metrics = tenantMetrics.get(conversation.tenant_id)!;
          metrics.conversations_total++; // Contar CONVERSA, não mensagem

          if (conversation.has_outcome || conversation.conversation_outcome) {
            metrics.conversations_with_outcome++;
          }

          // Somar custos de IA por CONVERSA
          const apiCost = parseFloat(
            conversation.total_api_cost || conversation.api_cost_usd || 0,
          );
          const processingCost = parseFloat(
            conversation.total_processing_cost ||
              conversation.processing_cost_usd ||
              0,
          );
          metrics.total_ai_cost += apiCost + processingCost;
        }
      }

      // Calcular success rates
      for (const [tenantId, metrics] of tenantMetrics) {
        if (metrics.appointments_total > 0) {
          metrics.success_rate =
            (metrics.appointments_confirmed / metrics.appointments_total) * 100;
        }
      }

      // Calcular totais da plataforma
      const platformTotals: TenantMetricData = {
        appointments_total: 0,
        appointments_confirmed: 0,
        appointments_cancelled: 0,
        total_revenue: 0,
        conversations_total: 0,
        conversations_with_outcome: 0,
        total_ai_cost: 0,
        success_rate: 0,
      };

      for (const metrics of tenantMetrics.values()) {
        platformTotals.appointments_total += metrics.appointments_total;
        platformTotals.appointments_confirmed += metrics.appointments_confirmed;
        platformTotals.appointments_cancelled += metrics.appointments_cancelled;
        platformTotals.total_revenue += metrics.total_revenue;
        platformTotals.conversations_total += metrics.conversations_total;
        platformTotals.conversations_with_outcome +=
          metrics.conversations_with_outcome;
        platformTotals.total_ai_cost += metrics.total_ai_cost;
      }

      if (platformTotals.appointments_total > 0) {
        platformTotals.success_rate =
          (platformTotals.appointments_confirmed /
            platformTotals.appointments_total) *
          100;
      }

      logger.info(
        `✅ Análise CORRETA concluída: ${tenantMetrics.size} tenants, ${platformTotals.appointments_total} appointments, ${platformTotals.conversations_total} conversas reais`,
      );

      return { tenantMetrics, platformTotals };
    } catch (error) {
      logger.error("Erro na análise de dados reais:", error);
      throw error;
    }
  }

  /**
   * Valida consistência dos dados analisados
   */
  async validateDataConsistency(analysis: {
    tenantMetrics: Map<string, TenantMetricData>;
    platformTotals: TenantMetricData;
  }): Promise<boolean> {
    // Somar tenant metrics manualmente para validar platform totals
    const calculatedTotals = {
      appointments_total: 0,
      appointments_confirmed: 0,
      appointments_cancelled: 0,
      total_revenue: 0,
      conversations_total: 0,
      conversations_with_outcome: 0,
      total_ai_cost: 0,
    };

    for (const metrics of analysis.tenantMetrics.values()) {
      calculatedTotals.appointments_total += metrics.appointments_total;
      calculatedTotals.appointments_confirmed += metrics.appointments_confirmed;
      calculatedTotals.appointments_cancelled += metrics.appointments_cancelled;
      calculatedTotals.total_revenue += metrics.total_revenue;
      calculatedTotals.conversations_total += metrics.conversations_total;
      calculatedTotals.conversations_with_outcome +=
        metrics.conversations_with_outcome;
      calculatedTotals.total_ai_cost += metrics.total_ai_cost;
    }

    // Validar com tolerância de 0.01 para pontos flutuantes
    const tolerance = 0.01;
    const isValid =
      calculatedTotals.appointments_total ===
        analysis.platformTotals.appointments_total &&
      calculatedTotals.appointments_confirmed ===
        analysis.platformTotals.appointments_confirmed &&
      calculatedTotals.appointments_cancelled ===
        analysis.platformTotals.appointments_cancelled &&
      Math.abs(
        calculatedTotals.total_revenue - analysis.platformTotals.total_revenue,
      ) < tolerance &&
      calculatedTotals.conversations_total ===
        analysis.platformTotals.conversations_total &&
      calculatedTotals.conversations_with_outcome ===
        analysis.platformTotals.conversations_with_outcome &&
      Math.abs(
        calculatedTotals.total_ai_cost - analysis.platformTotals.total_ai_cost,
      ) < tolerance;

    if (!isValid) {
      logger.error("Inconsistência detectada nos totais da plataforma", {
        calculated: calculatedTotals,
        platform: analysis.platformTotals,
      });
    } else {
      logger.info(
        "✅ Dados consistentes: soma dos tenants = totais da plataforma",
      );
    }

    return isValid;
  }
}
