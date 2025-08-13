import { Router } from "express";
import { getAdminClient } from "../config/database";
import AdminAuthMiddleware from "../middleware/admin-auth";

const router = Router();
const adminAuth = new AdminAuthMiddleware();

/**
 * GET /api/admin/tenant/whatsapp-numbers
 * Retorna números WhatsApp disponíveis para o tenant
 */
router.get("/whatsapp-numbers", adminAuth.verifyToken, async (req, res) => {
  try {
    const admin = req.admin;
    if (!admin) {
      return res.status(401).json({ error: "Authentication required" });
    }

    // Determinar tenant_id baseado no role do admin
    let tenantId: string | null = null;
    if (admin.role === "tenant_admin") {
      tenantId = admin.tenantId || (admin as any).tenant_id || null;
      if (!tenantId) {
        return res
          .status(400)
          .json({ error: "Tenant ID required for tenant admin" });
      }
    }

    const supabase = getAdminClient();

    let query = supabase
      .from("tenants")
      .select("whatsapp_phone")
      .not("whatsapp_phone", "is", null);

    // Filtrar por tenant se for tenant_admin
    if (tenantId) {
      query = query.eq("id", tenantId);
    }

    const { data: tenants, error } = await query;

    if (error) {
      console.error("Error fetching WhatsApp numbers:", error);
      return res
        .status(500)
        .json({ error: "Failed to fetch WhatsApp numbers" });
    }

    const numbers = tenants?.map((t) => t.whatsapp_phone).filter(Boolean) || [];

    return res.json({
      success: true,
      numbers,
    });
  } catch (error) {
    console.error("Error in WhatsApp numbers:", error);
    return res.status(500).json({
      error: "Internal server error",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

export default router;
