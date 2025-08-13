import { Router, Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import * as bcrypt from "bcrypt";
import * as jwt from "jsonwebtoken";

const router = Router();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Login simples
router.post("/login", async (req: Request, res: Response): Promise<any> => {
  try {
    const { email, password } = req.body;
    console.log("🔐 Simple login attempt:", email);

    if (!email || !password) {
      return res.status(400).json({ error: "Email e senha são obrigatórios" });
    }

    // Buscar usuário
    const { data: user, error } = await supabase
      .from("admin_users")
      .select("id, email, name, password_hash, role, is_active, tenant_id")
      .eq("email", email)
      .eq("is_active", true)
      .single();

    if (error || !user) {
      console.log("❌ User not found:", error?.message);
      return res.status(401).json({ error: "Credenciais inválidas" });
    }

    console.log("👤 User found:", user.email, user.role);

    // Verificar senha
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    console.log("🔑 Password valid:", isValidPassword);

    if (!isValidPassword) {
      return res.status(401).json({ error: "Credenciais inválidas" });
    }

    // Gerar token
    const tokenPayload = {
      id: user.id,
      email: user.email,
      role: user.role,
      tenant_id: user.tenant_id,
      permissions:
        user.role === "super_admin"
          ? [
              "view_analytics",
              "manage_tenants",
              "manage_users",
              "view_system_data",
            ]
          : ["view_analytics"],
    };

    const token = jwt.sign(
      tokenPayload,
      process.env.JWT_SECRET || "default-secret",
      { expiresIn: "24h" },
    );

    console.log("✅ Login successful for:", user.email);

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tenant_id: user.tenant_id,
      },
    });
  } catch (err) {
    console.error("❌ Erro no login:", err);
    res.status(500).json({ error: "Erro interno do servidor" });
  }
});

export default router;
