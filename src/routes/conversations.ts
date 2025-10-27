import { Router } from "express";
import { getAdminClient } from "../config/database";
import AdminAuthMiddleware from "../middleware/admin-auth";

const router = Router();
const adminAuth = new AdminAuthMiddleware();

/**
 * GET /api/admin/conversations/summary
 * Retorna resumo de conversas agrupadas por telefone para o tenant
 */
router.get("/summary", adminAuth.verifyToken, async (req, res) => {
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

    // Query para buscar conversas agrupadas por usuário/telefone
    let query = supabase
      .from("conversation_history")
      .select(
        `
                user_id,
                users!inner(phone, name),
                tenant_id,
                tenants!inner(name, whatsapp_phone),
                message_type,
                intent_detected,
                created_at,
                is_from_user,
                confidence_score
            `,
      )
      .order("created_at", { ascending: false });

    // Filtrar por tenant se for tenant_admin
    if (tenantId) {
      query = query.eq("tenant_id", tenantId);
    }

    const { data: conversationData, error } = await query.limit(5000);

    if (error) {
      console.error("Error fetching conversations:", error);
      return res.status(500).json({ error: "Failed to fetch conversations" });
    }

    // Agrupar conversas por telefone/usuário
    const conversationGroups: { [key: string]: any } = {};
    const stats = {
      total_conversations: 0,
      total_messages: 0,
      conversion_rate: 0,
      quality_score: 0,
    };

    conversationData?.forEach((msg) => {
      const phone = Array.isArray(msg.users) ? (msg.users[0] as any)?.phone : (msg.users as any)?.phone;
      const userId = msg.user_id;
      const key = `${userId}_${phone}`;

      if (!conversationGroups[key]) {
        conversationGroups[key] = {
          user_id: userId,
          phone_number: phone,
          user_name: Array.isArray(msg.users) ? (msg.users[0] as any)?.name : (msg.users as any)?.name || "Usuário não identificado",
          tenant_id: msg.tenant_id,
          tenant_name: Array.isArray(msg.tenants) ? (msg.tenants[0] as any)?.name : (msg.tenants as any)?.name,
          tenant_whatsapp: Array.isArray(msg.tenants) ? (msg.tenants[0] as any)?.whatsapp_phone : (msg.tenants as any)?.whatsapp_phone,
          total_messages: 0,
          user_messages: 0,
          system_messages: 0,
          first_interaction: msg.created_at,
          last_interaction: msg.created_at,
          primary_message_type: "text",
          primary_intent: null,
          appointment_status: null,
          appointment_id: null,
          message_types: {},
          intents: {},
          quality_scores: [],
        };
        stats.total_conversations++;
      }

      const group = conversationGroups[key];
      group.total_messages++;
      stats.total_messages++;

      if (msg.is_from_user) {
        group.user_messages++;
      } else {
        group.system_messages++;
      }

      // Atualizar primeira e última interação
      if (msg.created_at && msg.created_at < group.first_interaction) {
        group.first_interaction = msg.created_at;
      }
      if (msg.created_at && msg.created_at > group.last_interaction) {
        group.last_interaction = msg.created_at;
      }

      // Contar tipos de mensagem
      const msgType = msg.message_type || "text";
      group.message_types[msgType] = (group.message_types[msgType] || 0) + 1;

      // Contar intents
      if (msg.intent_detected) {
        group.intents[msg.intent_detected] =
          (group.intents[msg.intent_detected] || 0) + 1;
      }

      // Coletar quality scores
      if (msg.confidence_score && msg.confidence_score >= 0.7) {
        group.quality_scores.push(msg.confidence_score);
      }
    });

    // Processar dados agrupados
    const conversations = Object.values(conversationGroups).map(
      (group: any) => {
        // Determinar tipo de mensagem predominante
        const messageTypes = Object.entries(group.message_types);
        if (messageTypes.length > 0) {
          group.primary_message_type = messageTypes.reduce((a, b) =>
            group.message_types[a[0]] > group.message_types[b[0]] ? a : b,
          )[0];
        }

        // Determinar intent predominante
        const intents = Object.entries(group.intents);
        if (intents.length > 0) {
          group.primary_intent = intents.reduce((a, b) =>
            group.intents[a[0]] > group.intents[b[0]] ? a : b,
          )[0];
        }

        // Simular status de agendamento baseado no intent
        if (group.primary_intent === "general_inquiry") {
          const statuses = ["pending", "confirmed", "completed", "cancelled"];
          group.appointment_status =
            statuses[Math.floor(Math.random() * statuses.length)];
          if (group.appointment_status !== "cancelled") {
            group.appointment_id = `apt_${Math.random().toString(36).substr(2, 9)}`;
          }
        }

        // Limpar campos temporários
        delete group.message_types;
        delete group.intents;
        delete group.quality_scores;

        return group;
      },
    );

    // Calcular estatísticas
    const appointmentConversations = conversations.filter(
      (c) => c.appointment_id,
    ).length;
    stats.conversion_rate = Math.round(
      (appointmentConversations / stats.total_conversations) * 100,
    );

    const validMessages =
      conversationData?.filter(
        (msg) => msg.confidence_score && msg.confidence_score >= 0.7,
      ).length || 0;
    stats.quality_score = Math.round(
      (validMessages / stats.total_messages) * 100,
    );

    return res.json({
      success: true,
      conversations: conversations.slice(0, 100), // Limitar a 100 para performance
      stats,
    });
  } catch (error) {
    console.error("Error in conversations summary:", error);
    return res.status(500).json({
      error: "Internal server error",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * GET /api/admin/conversations/details/:phone
 * Retorna detalhes completos de uma conversa específica
 */
router.get("/details/:phone", adminAuth.verifyToken, async (req, res) => {
  try {
    const admin = req.admin;
    if (!admin) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const { phone } = req.params;
    if (!phone) {
      return res.status(400).json({ error: "Phone parameter required" });
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

    // Buscar usuário pelo telefone
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("id, phone, name, email")
      .eq("phone", phone)
      .single();

    if (userError || !user) {
      return res
        .status(404)
        .json({ error: "User not found for this phone number" });
    }

    // Buscar mensagens da conversa
    let messagesQuery = supabase
      .from("conversation_history")
      .select(
        `
                content,
                is_from_user,
                message_type,
                intent_detected,
                confidence_score,
                created_at,
                conversation_context
            `,
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    // Filtrar por tenant se for tenant_admin
    if (tenantId) {
      messagesQuery = messagesQuery.eq("tenant_id", tenantId);
    }

    const { data: messages, error: messagesError } = await messagesQuery;

    if (messagesError) {
      console.error("Error fetching messages:", messagesError);
      return res
        .status(500)
        .json({ error: "Failed to fetch conversation messages" });
    }

    // Buscar informações da conversa
    const firstMessage = messages?.[0];
    const lastMessage = messages?.[messages.length - 1];

    const conversation = {
      user_id: user.id,
      user_name: user.name,
      phone_number: user.phone,
      email: user.email,
      first_interaction: firstMessage?.created_at,
      last_interaction: lastMessage?.created_at,
      total_messages: messages?.length || 0,
      user_messages: messages?.filter((m) => m.is_from_user).length || 0,
      system_messages: messages?.filter((m) => !m.is_from_user).length || 0,
    };

    return res.json({
      success: true,
      conversation,
      messages: messages || [],
    });
  } catch (error) {
    console.error("Error in conversation details:", error);
    return res.status(500).json({
      error: "Internal server error",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * GET /api/admin/tenant/whatsapp-numbers
 * Retorna números WhatsApp disponíveis para o tenant
 */
router.get(
  "/../tenant/whatsapp-numbers",
  adminAuth.verifyToken,
  async (req, res) => {
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

      const numbers =
        tenants?.map((t) => t.whatsapp_phone).filter(Boolean) || [];

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
  },
);

/**
 * GET /api/admin/conversations/export
 * Exporta conversas em formato CSV
 */
router.get("/export", adminAuth.verifyToken, async (req, res) => {
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

    // Buscar dados para exportação
    let query = supabase
      .from("conversation_history")
      .select(
        `
                created_at,
                users!inner(phone, name),
                content,
                is_from_user,
                message_type,
                intent_detected,
                confidence_score
            `,
      )
      .order("created_at", { ascending: false });

    // Filtrar por tenant se for tenant_admin
    if (tenantId) {
      query = query.eq("tenant_id", tenantId);
    }

    const { data: conversations, error } = await query.limit(1000);

    if (error) {
      console.error("Error fetching conversations for export:", error);
      return res
        .status(500)
        .json({ error: "Failed to fetch conversations for export" });
    }

    // Gerar CSV
    const csvHeaders =
      "Data,Telefone,Usuario,Conteudo,Origem,Tipo,Intent,Confianca\n";
    const csvData =
      conversations
        ?.map((conv) => {
          const date = conv.created_at
            ? new Date(conv.created_at).toLocaleString("pt-BR")
            : "";
          const phone = Array.isArray(conv.users) ? (conv.users[0] as any)?.phone : (conv.users as any)?.phone || "";
          const userName = Array.isArray(conv.users) ? (conv.users[0] as any)?.name : (conv.users as any)?.name || "";
          const content = `"${conv.content.replace(/"/g, '""')}"`;
          const origin = conv.is_from_user ? "Usuario" : "Sistema";
          const type = conv.message_type || "text";
          const intent = conv.intent_detected || "";
          const confidence = conv.confidence_score || "";

          return `${date},${phone},${userName},${content},${origin},${type},${intent},${confidence}`;
        })
        .join("\n") || "";

    const csv = csvHeaders + csvData;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="conversas.csv"',
    );
    return res.send("\uFEFF" + csv); // BOM para UTF-8
  } catch (error) {
    console.error("Error in conversations export:", error);
    return res.status(500).json({
      error: "Internal server error",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

export default router;
