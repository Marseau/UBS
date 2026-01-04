/**
 * AIC Auth Middleware
 *
 * Middleware de autenticacao para endpoints AIC.
 * Valida token JWT do Supabase e adiciona informacoes do usuario ao request.
 */

import { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Interface para request autenticado
 */
export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role?: string;
    tipo_user?: string;
    user_app?: string;
  };
  userId?: string;
  isAdmin?: boolean;
}

/**
 * Middleware de autenticacao AIC
 *
 * Extrai e valida token JWT do Supabase Auth.
 * Adiciona user info e userId ao request para uso nos handlers.
 *
 * Header: Authorization: Bearer <token>
 */
export async function authenticateAIC(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Verificar header Authorization
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: 'Autenticacao requerida',
        message: 'Forneca um token valido no header Authorization: Bearer <token>'
      });
      return;
    }

    // Extrair token
    const token = authHeader.substring(7);

    // Validar token com Supabase Auth
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      console.error('[AIC-AUTH] Token invalido:', error?.message);
      res.status(401).json({
        success: false,
        error: 'Token invalido ou expirado',
        message: 'Faca login novamente'
      });
      return;
    }

    // Buscar perfil do usuario
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('id, email, name, tipo_user, user_app')
      .eq('id', user.id)
      .single();

    // Determinar se e admin
    const isAdmin = profile?.tipo_user === 'admin' || profile?.tipo_user === 'super_admin';

    // Adicionar informacoes ao request
    req.user = {
      id: user.id,
      email: user.email || '',
      role: profile?.tipo_user || 'normal',
      tipo_user: profile?.tipo_user || 'normal',
      user_app: profile?.user_app || 'aic'
    };
    req.userId = user.id;
    req.isAdmin = isAdmin;

    console.log(`[AIC-AUTH] Usuario ${user.email} autenticado (admin: ${isAdmin})`);

    next();
  } catch (error: any) {
    console.error('[AIC-AUTH] Erro no middleware:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno de autenticacao',
      message: error.message
    });
  }
}

/**
 * Middleware opcional de autenticacao
 *
 * Tenta autenticar, mas permite acesso anonimo.
 * Util para endpoints que precisam funcionar com ou sem auth.
 */
export async function optionalAuthAIC(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // Sem token - continuar sem autenticacao
      req.user = undefined;
      req.userId = undefined;
      req.isAdmin = false;
      return next();
    }

    const token = authHeader.substring(7);

    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      // Token invalido - continuar sem autenticacao
      req.user = undefined;
      req.userId = undefined;
      req.isAdmin = false;
      return next();
    }

    // Buscar perfil
    const { data: profile } = await supabase
      .from('users')
      .select('id, email, name, tipo_user, user_app')
      .eq('id', user.id)
      .single();

    const isAdmin = profile?.tipo_user === 'admin' || profile?.tipo_user === 'super_admin';

    req.user = {
      id: user.id,
      email: user.email || '',
      role: profile?.tipo_user || 'normal',
      tipo_user: profile?.tipo_user || 'normal',
      user_app: profile?.user_app || 'aic'
    };
    req.userId = user.id;
    req.isAdmin = isAdmin;

    next();
  } catch (error: any) {
    // Em caso de erro, continuar sem autenticacao
    req.user = undefined;
    req.userId = undefined;
    req.isAdmin = false;
    next();
  }
}

/**
 * Verifica se usuario tem acesso a uma campanha
 * Admin tem acesso a todas; usuarios normais apenas as suas
 */
export async function checkCampaignAccess(
  campaignId: string,
  userId: string | undefined,
  isAdmin: boolean
): Promise<{ hasAccess: boolean; campaign: any | null }> {
  // Admin tem acesso a tudo
  if (isAdmin) {
    const { data: campaign } = await supabase
      .from('cluster_campaigns')
      .select('*')
      .eq('id', campaignId)
      .single();

    return { hasAccess: !!campaign, campaign };
  }

  // Usuario normal - verificar ownership
  if (!userId) {
    return { hasAccess: false, campaign: null };
  }

  const { data: campaign } = await supabase
    .from('cluster_campaigns')
    .select('*')
    .eq('id', campaignId)
    .eq('user_id', userId)
    .single();

  return { hasAccess: !!campaign, campaign };
}

/**
 * Middleware que verifica acesso a campanha
 * Espera campaignId em req.params.campaignId
 */
export function requireCampaignAccess(paramName: string = 'campaignId') {
  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const campaignId = req.params[paramName];

      if (!campaignId) {
        res.status(400).json({
          success: false,
          error: `${paramName} is required`
        });
        return;
      }

      const { hasAccess, campaign } = await checkCampaignAccess(
        campaignId,
        req.userId,
        req.isAdmin || false
      );

      if (!hasAccess) {
        res.status(404).json({
          success: false,
          error: 'Campanha nao encontrada'
        });
        return;
      }

      // Adicionar campanha ao request para uso nos handlers
      (req as any).campaign = campaign;

      next();
    } catch (error: any) {
      console.error('[AIC-AUTH] Erro ao verificar acesso:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno',
        message: error.message
      });
    }
  };
}
