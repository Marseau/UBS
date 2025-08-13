/**
 * TIPOS DEFINITIVOS PARA CONVERSATION BILLING CRON
 * Extensão completa dos tipos de database para incluir todas as tabelas necessárias
 */

import { Database } from "./database.types";
import { SupabaseClient } from "@supabase/supabase-js";

// ====================================================
// INTERFACES DE DADOS DE COBRANÇA
// ====================================================

export interface BillingPlan {
  name: string;
  usd_price: number;
  brl_price: number;
  conversation_limit: number;
  description?: string;
}

export interface TenantBilling {
  base_charge: number;
  excess_conversations: number;
  excess_charge: number;
  total_monthly_charge: number;
}

export interface ConversationOutcomeDistribution {
  [outcome: string]: number;
}

export interface TenantMetricData {
  period_days: number;
  total_conversations: number;
  billable_conversations: number;

  // Modelo de planos
  suggested_plan: string;
  plan_price_brl: number;
  conversation_limit: number;

  // Cobrança
  base_monthly_charge: number;
  excess_conversations: number;
  excess_charge: number;
  total_monthly_charge: number;

  // Métricas derivadas
  conversations_within_plan: number;
  plan_utilization_pct: number;

  // Distribuição de outcomes
  outcome_distribution: ConversationOutcomeDistribution;

  // Metadados
  billing_model: string;
  calculated_at: string;
}

export interface PlatformMetricData {
  calculation_date: string;
  period_days: number;
  data_source: string;

  active_tenants: number;
  total_conversations: number;
  total_valid_conversations: number;
  total_appointments: number;
  total_customers: number;
  total_ai_interactions: number;
  platform_mrr: number;
  total_revenue: number;
  total_chat_minutes: number;
  total_spam_conversations: number;
  receita_uso_ratio: number;
  operational_efficiency_pct: number;
  spam_rate_pct: number;
  cancellation_rate_pct: number;
  revenue_usage_distortion_index: number;
  platform_health_score: number;
  tenants_above_usage: number;
  tenants_below_usage: number;
}

// ====================================================
// EXTENSÕES DE TABELA PARA TYPES MISSING
// ====================================================

export interface ConversationHistoryExtended {
  id: string;
  tenant_id: string | null;
  user_id: string | null;
  content: string | null;
  is_from_user: boolean | null;
  message_type: string | null;
  intent_detected: string | null;
  confidence_score: number | null;
  conversation_context: any | null;
  created_at: string | null;
  tokens_used: number | null;
  api_cost_usd: number | null;
  model_used: string | null;
  message_source: string | null;
  processing_cost_usd: number | null;
  conversation_outcome: string | null; // Campo que faltava
}

export interface TenantMetricsExtended {
  id: string;
  tenant_id: string | null;
  tenant_name: string | null;
  metrics_data: any; // JSON data
  aggregated_data?: any | null;
  period_days: number | null;
  created_at: string | null;
  updated_at: string | null;
  metric_type: string; // Campo que estava faltando
  metric_data: TenantMetricData; // Dados estruturados
  period: string; // '30d', '7d', etc
  calculated_at: string;
}

export interface PlatformMetricsTable {
  id: string;
  calculation_date: string;
  period_days: number;
  data_source: string;
  active_tenants: number;
  total_conversations: number;
  total_valid_conversations: number;
  total_appointments: number;
  total_customers: number;
  total_ai_interactions: number;
  platform_mrr: number;
  total_revenue: number;
  total_chat_minutes: number;
  total_spam_conversations: number;
  receita_uso_ratio: number;
  operational_efficiency_pct: number;
  spam_rate_pct: number;
  cancellation_rate_pct: number;
  revenue_usage_distortion_index: number;
  platform_health_score: number;
  tenants_above_usage: number;
  tenants_below_usage: number;
  created_at: string | null;
}

// ====================================================
// EXTENSÃO COMPLETA DO DATABASE TYPE
// ====================================================

export interface DatabaseBillingExtended extends Database {
  public: Database["public"] & {
    Tables: Database["public"]["Tables"] & {
      // Estender conversation_history com conversation_outcome
      conversation_history: {
        Row: ConversationHistoryExtended;
        Insert: Omit<ConversationHistoryExtended, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<ConversationHistoryExtended, "id">>;
        Relationships: Database["public"]["Tables"]["conversation_history"]["Relationships"];
      };

      // Estender tenant_metrics com campos corretos
      tenant_metrics: {
        Row: TenantMetricsExtended;
        Insert: Omit<
          TenantMetricsExtended,
          "id" | "created_at" | "updated_at"
        > & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<TenantMetricsExtended, "id">>;
        Relationships: [
          {
            foreignKeyName: "tenant_metrics_tenant_id_fkey";
            columns: ["tenant_id"];
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };

      // Adicionar tabela platform_metrics
      platform_metrics: {
        Row: PlatformMetricsTable;
        Insert: Omit<PlatformMetricsTable, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<PlatformMetricsTable, "id" | "created_at">>;
        Relationships: [];
      };
    };
  };
}

// ====================================================
// TIPO DE CLIENTE SUPABASE COMPLETO
// ====================================================

export type SupabaseBillingClient = SupabaseClient<DatabaseBillingExtended>;

// ====================================================
// VALIDAÇÃO DE CONVERSATION OUTCOMES
// ====================================================

export const VALID_CONVERSATION_OUTCOMES = [
  // OUTCOMES INICIAIS (primeira interação)
  "appointment_created", // Criou novo agendamento ✅
  "info_request_fulfilled", // Só queria informação 📋
  "business_hours_inquiry", // Perguntou horário funcionamento 🕐
  "price_inquiry", // Perguntou preços 💰
  "location_inquiry", // Perguntou endereço 📍
  "booking_abandoned", // Começou agendar mas desistiu 🔄
  "timeout_abandoned", // Não respondeu em 60s ⏰
  "wrong_number", // Número errado ❌
  "spam_detected", // Spam/bot 🚫
  "test_message", // Mensagem de teste 🧪

  // OUTCOMES PÓS-AGENDAMENTO (interações subsequentes)
  "appointment_rescheduled", // Remarcou agendamento existente 📅
  "appointment_cancelled", // Cancelou agendamento existente ❌
  "appointment_confirmed", // Confirmou agendamento existente ✅
  "appointment_inquiry", // Perguntou sobre agendamento existente ❓
  "appointment_modified", // Alterou detalhes do agendamento 🔧
  "appointment_noshow_followup", // Justificou/seguiu após no_show 📞
] as const;

export type ConversationOutcome = (typeof VALID_CONVERSATION_OUTCOMES)[number];

// ====================================================
// CONFIGURAÇÃO DE PLANOS DE COBRANÇA
// ====================================================

export const BILLING_PLANS = {
  basico: {
    name: "Plano Básico",
    usd_price: 8,
    brl_price: 44.48,
    conversation_limit: 200,
    description: "até 200 conversas",
  } as BillingPlan,
  profissional: {
    name: "Plano Profissional",
    usd_price: 20,
    brl_price: 111.2,
    conversation_limit: 400,
    description: "até 400 conversas",
  } as BillingPlan,
  enterprise: {
    name: "Plano Enterprise",
    usd_price: 50,
    brl_price: 278.0,
    conversation_limit: 1250,
    description: "até 1250 conversas",
  } as BillingPlan,
} as const;

export const EXCEDENTE_PRICE_BRL = 0.25;

// ====================================================
// STATUS DO SERVIÇO DE CRON
// ====================================================

export interface CronServiceStatus {
  initialized: boolean;
  running: boolean;
  environment: string;
  billing_model: string;
  plans: Record<string, BillingPlan>;
  excess_price_brl: number;
  last_execution?: {
    tenant_metrics?: string;
    platform_metrics?: string;
    cleanup?: string;
  };
  next_execution?: {
    tenant_metrics?: string;
    platform_metrics?: string;
    cleanup?: string;
  };
}

// ====================================================
// RESULTADO DE OPERAÇÕES
// ====================================================

export interface BillingOperationResult {
  success: boolean;
  message: string;
  data?: {
    tenants_processed?: number;
    total_records?: number;
    periods?: number[];
    total_mrr?: number;
    total_conversations?: number;
    execution_time_ms?: number;
  };
  error?: string;
}

export interface TenantAnalysisResult {
  tenant_id: string;
  business_name: string;
  usage: {
    total_conversations: number;
    billable_conversations: number;
    outcomes: ConversationOutcomeDistribution;
  };
  suggested_plan: BillingPlan;
  billing: TenantBilling;
}

export interface PlatformAnalysisResult {
  total_tenants: number;
  total_billable_conversations: number;
  total_basic_revenue: number;
  total_excess_revenue: number;
  total_monthly_revenue: number;
  plan_distribution: {
    basico: number;
    profissional: number;
    enterprise: number;
  };
  average_revenue_per_tenant: number;
}
