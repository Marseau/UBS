/**
 * CONVERSATION BILLING ROUTES
 * Routes para gerenciamento de cobrança baseada em conversas
 * Integra com o novo sistema de billing corrigido
 */

import { Router } from "express";
import { getAdminClient } from "../config/database";
import AdminAuthMiddleware from "../middleware/admin-auth";
import { BillingCalculationService } from "../services/billing-calculation.service";

const router = Router();
const adminAuth = new AdminAuthMiddleware();
const billingService = new BillingCalculationService();

/**
 * GET /api/conversation-billing/usage/:tenantId
 * Busca uso de conversas e valor calculado para um tenant
 */
router.get("/usage/:tenantId", adminAuth.verifyToken, async (req, res) => {
  try {
    const admin = req.admin;
    if (!admin) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const { tenantId } = req.params;
    if (!tenantId) {
      return res.status(400).json({ error: "Tenant ID required" });
    }

    // Verificar se super admin ou tenant admin do próprio tenant
    if (admin.role !== "super_admin" && admin.tenantId !== tenantId) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Calcular billing para o tenant
    const billingResult = await billingService.calculateTenantBilling(tenantId);

    return res.json({
      success: true,
      usage: {
        tenantId,
        conversationsUsed: billingResult.metrics.conversations_count,
        totalAmount: billingResult.metrics.billing_amount_brl,
        currentPlan: "billing_calculated",
        calculationMethod: "new_billing_model_correct",
      },
      calculation: billingResult,
    });
  } catch (error) {
    console.error("Error fetching billing usage:", error);
    return res.status(500).json({
      error: "Internal server error",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * GET /api/conversation-billing/summary
 * Retorna resumo de billing para todos os tenants (super admin apenas)
 */
router.get("/summary", adminAuth.verifyToken, async (req, res) => {
  try {
    const admin = req.admin;
    if (!admin || admin.role !== "super_admin") {
      return res.status(403).json({ error: "Super admin access required" });
    }

    const supabase = getAdminClient();

    // Buscar todos os tenants ativos
    const { data: tenants, error } = await supabase
      .from("tenants")
      .select("id, name, subscription_plan")
      .eq("status", "active");

    if (error) {
      throw new Error(`Failed to fetch tenants: ${error.message}`);
    }

    const billingSummary: any[] = [];

    // Calcular billing para cada tenant
    for (const tenant of tenants || []) {
      try {
        const billingResult = await billingService.calculateTenantBilling(
          tenant.id,
        );

        billingSummary.push({
          tenantId: tenant.id,
          tenantName: tenant.name,
          subscriptionPlan: tenant.subscription_plan,
          conversationsUsed: billingResult.metrics.conversations_count,
          totalAmount: billingResult.metrics.billing_amount_brl,
          currentPlan: "calculated",
          calculationSuccess: billingResult.success,
        });
      } catch (tenantError) {
        console.error(
          `Error calculating billing for tenant ${tenant.id}:`,
          tenantError,
        );
        billingSummary.push({
          tenantId: tenant.id,
          tenantName: tenant.name,
          error: "Calculation failed",
        });
      }
    }

    // Calcular totais
    const totalBilling = billingSummary
      .filter((t) => !t.error)
      .reduce((sum, t) => sum + (t.totalAmount || 0), 0);

    const totalConversations = billingSummary
      .filter((t) => !t.error)
      .reduce((sum, t) => sum + (t.conversationsUsed || 0), 0);

    return res.json({
      success: true,
      summary: {
        totalTenants: tenants?.length || 0,
        totalBilling,
        totalConversations,
        averageBillingPerTenant: tenants?.length
          ? totalBilling / tenants.length
          : 0,
      },
      tenants: billingSummary,
    });
  } catch (error) {
    console.error("Error fetching billing summary:", error);
    return res.status(500).json({
      error: "Internal server error",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * POST /api/conversation-billing/calculate/:tenantId
 * Força recálculo de billing para um tenant específico
 */
router.post("/calculate/:tenantId", adminAuth.verifyToken, async (req, res) => {
  try {
    const admin = req.admin;
    if (!admin || admin.role !== "super_admin") {
      return res.status(403).json({ error: "Super admin access required" });
    }

    const { tenantId } = req.params;
    if (!tenantId) {
      return res.status(400).json({ error: "Tenant ID required" });
    }

    // Recalcular billing
    const billingResult = await billingService.calculateTenantBilling(tenantId);

    return res.json({
      success: true,
      message: "Billing recalculated successfully",
      result: billingResult,
    });
  } catch (error) {
    console.error("Error recalculating billing:", error);
    return res.status(500).json({
      error: "Internal server error",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

export default router;
