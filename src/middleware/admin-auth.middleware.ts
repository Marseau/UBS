import { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Middleware de Autenticação Admin
 *
 * Protege endpoints críticos do Dynamic Intelligence System
 * Requer header Authorization: Bearer <token>
 *
 * Em desenvolvimento: permite bypass com ADMIN_SECRET_KEY
 */
export async function authenticateAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Bypass para desenvolvimento
    if (process.env.NODE_ENV === 'development' && process.env.ADMIN_SECRET_KEY) {
      const secretKey = req.headers['x-admin-secret'] as string;
      if (secretKey === process.env.ADMIN_SECRET_KEY) {
        console.log('✅ [AUTH] Bypass de desenvolvimento autorizado');
        return next();
      }
    }

    // Verificar header Authorization
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: 'Autenticação requerida',
        message: 'Forneça um token válido no header Authorization: Bearer <token>'
      });
      return;
    }

    // Extrair token
    const token = authHeader.substring(7);

    // Validar token com Supabase Auth
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      console.error('❌ [AUTH] Token inválido:', error?.message);
      res.status(401).json({
        success: false,
        error: 'Token inválido ou expirado',
        message: 'Faça login novamente'
      });
      return;
    }

    // Verificar se usuário é admin
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      console.error('❌ [AUTH] Erro ao buscar perfil do usuário:', profileError);
      res.status(403).json({
        success: false,
        error: 'Acesso negado',
        message: 'Perfil de usuário não encontrado'
      });
      return;
    }

    if (profile.role !== 'admin' && profile.role !== 'super_admin') {
      console.warn(`⚠️ [AUTH] Usuário ${user.email} tentou acessar endpoint admin sem permissão`);
      res.status(403).json({
        success: false,
        error: 'Acesso negado',
        message: 'Apenas administradores podem executar esta operação'
      });
      return;
    }

    // Usuário autenticado e autorizado
    console.log(`✅ [AUTH] Admin ${user.email} autenticado`);

    // Adicionar informações do usuário ao request
    (req as any).user = user;
    (req as any).userRole = profile.role;

    next();

  } catch (error: any) {
    console.error('❌ [AUTH] Erro no middleware de autenticação:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno de autenticação',
      message: error.message
    });
  }
}

/**
 * Middleware Simplificado para Desenvolvimento
 *
 * Permite acesso com secret key no header X-Admin-Secret
 * NUNCA usar em produção sem ADMIN_SECRET_KEY forte
 */
export function authenticateAdminSimple(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const secretKey = req.headers['x-admin-secret'] as string;
  const expectedKey = process.env.ADMIN_SECRET_KEY || 'default-secret-change-me';

  if (secretKey !== expectedKey) {
    console.warn('⚠️ [AUTH] Tentativa de acesso com secret key inválida');
    res.status(401).json({
      success: false,
      error: 'Autenticação requerida',
      message: 'Forneça X-Admin-Secret válido'
    });
    return;
  }

  console.log('✅ [AUTH] Acesso admin autorizado via secret key');
  next();
}

/**
 * Rate Limiter Simples (em memória)
 *
 * Limita chamadas a endpoints por IP
 * Para produção: usar Redis ou express-rate-limit
 */
const requestCounts = new Map<string, { count: number; resetAt: number }>();

export function rateLimiter(
  maxRequests: number = 10,
  windowMs: number = 15 * 60 * 1000 // 15 minutos
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();

    // Limpar dados antigos
    if (requestCounts.has(ip)) {
      const data = requestCounts.get(ip)!;
      if (now > data.resetAt) {
        requestCounts.delete(ip);
      }
    }

    // Verificar ou criar contador
    if (!requestCounts.has(ip)) {
      requestCounts.set(ip, {
        count: 1,
        resetAt: now + windowMs
      });
      return next();
    }

    const data = requestCounts.get(ip)!;
    data.count++;

    if (data.count > maxRequests) {
      const resetIn = Math.ceil((data.resetAt - now) / 1000 / 60);
      console.warn(`⚠️ [RATE LIMIT] IP ${ip} excedeu limite (${data.count}/${maxRequests})`);

      res.status(429).json({
        success: false,
        error: 'Limite de requisições excedido',
        message: `Aguarde ${resetIn} minutos antes de tentar novamente`,
        retryAfter: resetIn
      });
      return;
    }

    next();
  };
}
