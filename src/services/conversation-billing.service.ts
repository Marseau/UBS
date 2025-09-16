import { supabaseAdmin } from "@/config/database";
import { conversationLogger } from "@/utils/logger";
import { stripeService } from "./stripe.service";

export interface ConversationUsage {
  tenantId: string;
  periodStart: Date;
  periodEnd: Date;
  conversationsUsed: number;
  conversationsIncluded: number;
  conversationsOverage: number;
  baseAmount: number;
  overageAmount: number;
  totalAmount: number;
  currentPlan: string;
}

export interface BillingResult {
  success: boolean;
  usage: ConversationUsage;
  upgradePerformed?: boolean;
  newPlan?: string;
  error?: string;
}

export class ConversationBillingService {
  private logger = conversationLogger('conversation-billing');
  /**
   * Conta conversas únicas do mês atual para um tenant
   * CORRIGIDO: Agora conta session_ids únicos, não mensagens individuais
   */
  async countMonthlyConversations(
    tenantId: string,
    month?: Date,
  ): Promise<number> {
    try {
      const now = month || new Date();
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const periodEnd = new Date(
        now.getFullYear(),
        now.getMonth() + 1,
        0,
        23,
        59,
        59,
      );

      // Buscar todas as mensagens do período com session_id
      const { data, error } = await supabaseAdmin
        .from("conversation_history")
        .select("conversation_context")
        .eq("tenant_id", tenantId)
        .eq("is_from_user", true) // Apenas mensagens recebidas
        .gte("created_at", periodStart.toISOString())
        .lte("created_at", periodEnd.toISOString())
        .not("conversation_context->session_id", "is", null);

      if (error) {
        this.logger.conversationError(new Error(error.message), {
          service: 'conversation-billing',
          method: 'countMonthlyConversations',
          tenantId,
          operationType: 'count_conversations'
        });
        throw error;
      }

      // Contar session_ids únicos (conversas reais)
      const uniqueSessionIds = new Set();
      data?.forEach((row) => {
        const context = row.conversation_context as any;
        const sessionId = context?.session_id;
        if (sessionId) {
          uniqueSessionIds.add(sessionId);
        }
      });

      const conversationCount = uniqueSessionIds.size;

      this.logger.conversation("Monthly conversations counted (UNIQUE sessions)", {
        service: 'conversation-billing',
        method: 'countMonthlyConversations',
        tenantId,
        conversationCount,
        totalMessages: data?.length || 0,
        operationType: 'count_conversations',
        timestamp: new Date().toISOString()
      });

      return conversationCount;
    } catch (error) {
      this.logger.conversationError(error as Error, {
        service: 'conversation-billing',
        method: 'countMonthlyConversations',
        tenantId,
        operationType: 'count_conversations'
      });
      throw error;
    }
  }

  /**
   * Calcula fatura mensal baseada no uso
   */
  async calculateMonthlyBill(
    tenantId: string,
    month?: Date,
  ): Promise<BillingResult> {
    try {
      // Buscar dados do tenant
      const { data: tenant, error: tenantError } = await supabaseAdmin
        .from("tenants")
        .select("subscription_plan")
        .eq("id", tenantId)
        .single();

      if (tenantError || !tenant) {
        throw new Error(`Tenant not found: ${tenantId}`);
      }

      const currentPlan = tenant.subscription_plan || "basico";
      const planDetails = stripeService.getPlan(currentPlan);

      if (!planDetails) {
        throw new Error(`Invalid plan: ${currentPlan}`);
      }

      // Contar conversas do mês
      const conversationsUsed = await this.countMonthlyConversations(
        tenantId,
        month,
      );
      const conversationsIncluded = planDetails.maxConversations;
      const conversationsOverage = Math.max(
        0,
        conversationsUsed - conversationsIncluded,
      );

      // Calcular valores
      const baseAmount = planDetails.price; // Em centavos
      const overageAmount = planDetails.overagePrice
        ? conversationsOverage * planDetails.overagePrice
        : 0;
      const totalAmount = baseAmount + overageAmount;

      const now = month || new Date();
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      const usage: ConversationUsage = {
        tenantId,
        periodStart,
        periodEnd,
        conversationsUsed,
        conversationsIncluded,
        conversationsOverage,
        baseAmount: baseAmount / 100, // Converter para reais
        overageAmount: overageAmount / 100,
        totalAmount: totalAmount / 100,
        currentPlan,
      };

      this.logger.conversation("Monthly bill calculated", {
        service: 'conversation-billing',
        method: 'calculateMonthlyBill',
        tenantId: usage.tenantId,
        operationType: 'calculate_bill',
        conversationsUsed: usage.conversationsUsed,
        totalAmount: usage.totalAmount
      });

      return {
        success: true,
        usage,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      this.logger.conversationError(error as Error, {
        service: 'conversation-billing',
        method: 'calculateMonthlyBill',
        tenantId,
        operationType: 'calculate_bill'
      });
      return {
        success: false,
        usage: null as any,
        error: errorMessage,
      };
    }
  }

  /**
   * Processa excedentes e upgrades automáticos
   */
  async processConversationOverage(tenantId: string): Promise<BillingResult> {
    try {
      const billResult = await this.calculateMonthlyBill(tenantId);

      if (!billResult.success) {
        return billResult;
      }

      const { usage } = billResult;

      // Se não há excedente, retorna normalmente
      if (usage.conversationsOverage === 0) {
        return billResult;
      }

      // Lógica de upgrade automático ou cobrança
      if (usage.currentPlan === "basico") {
        // Upgrade automático para profissional
        await this.upgradeToNextPlan(tenantId, "profissional");
        return {
          ...billResult,
          upgradePerformed: true,
          newPlan: "profissional",
        };
      } else if (usage.currentPlan === "profissional") {
        // Upgrade automático para enterprise
        await this.upgradeToNextPlan(tenantId, "enterprise");
        return {
          ...billResult,
          upgradePerformed: true,
          newPlan: "enterprise",
        };
      } else if (usage.currentPlan === "enterprise") {
        // Cobrança de excedentes no Enterprise
        await this.reportUsageToStripe(tenantId, usage.conversationsOverage);
        return billResult;
      }

      return billResult;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      this.logger.conversationError(error as Error, {
        service: 'conversation-billing',
        method: 'processConversationOverage',
        tenantId,
        operationType: 'process_overage'
      });
      return {
        success: false,
        usage: null as any,
        error: errorMessage,
      };
    }
  }

  /**
   * Upgrade automático para próximo plano
   */
  private async upgradeToNextPlan(
    tenantId: string,
    newPlan: string,
  ): Promise<void> {
    try {
      // TODO: Implementar quando subscription_id estiver disponível na tabela tenants
      this.logger.conversation("Mock upgrade plan", {
        service: 'conversation-billing',
        method: 'upgradeToNextPlan',
        tenantId,
        operationType: 'upgrade_plan'
      });

      // Atualizar tenant no database
      await supabaseAdmin
        .from("tenants")
        .update({
          subscription_plan: newPlan,
          updated_at: new Date().toISOString(),
        })
        .eq("id", tenantId);

      this.logger.conversation("Plan upgraded successfully", {
        service: 'conversation-billing',
        method: 'upgradeToNextPlan',
        tenantId,
        operationType: 'upgrade_plan'
      });
    } catch (error) {
      this.logger.conversationError(error as Error, {
        service: 'conversation-billing',
        method: 'upgradeToNextPlan',
        tenantId,
        operationType: 'upgrade_plan'
      });
      throw error;
    }
  }

  /**
   * Reporta uso ao Stripe para cobrança de excedentes
   */
  private async reportUsageToStripe(
    tenantId: string,
    overageConversations: number,
  ): Promise<void> {
    try {
      // TODO: Implementar quando stripe_subscription_item_id estiver disponível
      this.logger.conversation("Mock Stripe usage report", {
        service: 'conversation-billing',
        method: 'reportUsageToStripe',
        tenantId,
        operationType: 'report_usage'
      });

      this.logger.conversation("Usage reported to Stripe", {
        service: 'conversation-billing',
        method: 'reportUsageToStripe',
        tenantId,
        operationType: 'report_usage'
      });
    } catch (error) {
      this.logger.conversationError(error as Error, {
        service: 'conversation-billing',
        method: 'reportUsageToStripe',
        tenantId,
        operationType: 'report_usage'
      });
      throw error;
    }
  }

  /**
   * Gera relatório de uso mensal
   */
  async generateUsageReport(tenantId: string, month?: Date): Promise<any> {
    try {
      const billResult = await this.calculateMonthlyBill(tenantId, month);

      if (!billResult.success) {
        throw new Error(billResult.error);
      }

      const { usage } = billResult;

      // Buscar tenant info
      const { data: tenant, error: tenantError } = await supabaseAdmin
        .from("tenants")
        .select("name, domain")
        .eq("id", tenantId)
        .single();

      if (tenantError) {
        throw tenantError;
      }

      return {
        tenant: {
          id: tenantId,
          name: tenant.name,
          domain: tenant.domain,
        },
        period: {
          start: usage.periodStart.toISOString().split("T")[0],
          end: usage.periodEnd.toISOString().split("T")[0],
        },
        plan: {
          name: usage.currentPlan,
          conversationsIncluded: usage.conversationsIncluded,
        },
        usage: {
          conversationsUsed: usage.conversationsUsed,
          conversationsOverage: usage.conversationsOverage,
          utilizationPercentage: Math.round(
            (usage.conversationsUsed / usage.conversationsIncluded) * 100,
          ),
        },
        billing: {
          baseAmount: usage.baseAmount,
          overageAmount: usage.overageAmount,
          totalAmount: usage.totalAmount,
          currency: "BRL",
        },
        generatedAt: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.conversationError(error as Error, {
        service: 'conversation-billing',
        method: 'generateUsageReport',
        tenantId,
        operationType: 'generate_report'
      });
      throw error;
    }
  }

  /**
   * Salva billing record no database
   */
  async saveBillingRecord(usage: ConversationUsage): Promise<void> {
    try {
      // TODO: Criar tabela conversation_billing ou usar tenant_metrics
      this.logger.conversation("Mock billing record save", {
        service: 'conversation-billing',
        method: 'saveBillingRecord',
        tenantId: usage.tenantId,
        operationType: 'save_billing_record'
      });

      this.logger.conversation("Billing record saved", {
        service: 'conversation-billing',
        method: 'saveBillingRecord',
        tenantId: usage.tenantId,
        operationType: 'save_billing_record'
      });
    } catch (error) {
      this.logger.conversationError(error as Error, {
        service: 'conversation-billing',
        method: 'saveBillingRecord',
        tenantId: usage.tenantId,
        operationType: 'save_billing_record'
      });
      throw error;
    }
  }
}

export const conversationBillingService = new ConversationBillingService();
