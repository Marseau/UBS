/**
 * Middleware de Autenticação Unificado para Dashboards
 * Padroniza autenticação e autorização nos 3 dashboards:
 * - dashboard-standardized.html (Super Admin)
 * - dashboard-tenant-analysis.html (Análise Tenant)
 * - dashboard-tenant-admin.html (Admin Tenant)
 */

import { Request, Response, NextFunction } from 'express';
import * as jwt from 'jsonwebtoken';

// Estender interface do Request para incluir dados do usuário
interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    tenant_id?: string;
    role: 'super_admin' | 'tenant_admin' | 'user';
    email?: string;
    name?: string;
  };
  tenant_id?: string;
}

/**
 * Middleware base de autenticação
 * Verifica token JWT e extrai informações do usuário
 */
export function authenticateUser(req: AuthenticatedRequest, res: Response, next: NextFunction): any {
  try {
    // 🚨 DEVELOPMENT BYPASS - Check environment bypass
    if (process.env.NODE_ENV === 'development' && process.env.BYPASS_SUPER_ADMIN_AUTH === 'true') {
      console.log('🚨 DEVELOPMENT BYPASS ATIVO - JWT verification disabled');
      req.user = { 
        id: 'dev-admin', 
        email: 'dev@admin.com', 
        role: 'super_admin', 
        tenant_id: undefined 
      };
      return next();
    }

    const authHeader = req.headers.authorization;
    
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false, 
        error: 'Token de autorização necessário',
        code: 'MISSING_TOKEN' 
      });
    }

    const token = authHeader.substring(7);
    
    // Verificar se token não é vazio ou malformado
    if (!token || token === 'null' || token === 'undefined') {
      return res.status(401).json({ 
        success: false, 
        error: 'Token inválido',
        code: 'INVALID_TOKEN' 
      });
    }
    
    // Verificar JWT com a biblioteca jsonwebtoken (PROPERLY)
    try {
      const jwtSecret = process.env.JWT_SECRET || 'ubs-universal-booking-system-jwt-secret-2025';
      const decoded = jwt.verify(token, jwtSecret) as any;
      
      console.log('🔐 Token decodificado:', {
        id: decoded.id || decoded.sub,
        role: decoded.role,
        email: decoded.email,
        tenant_id: decoded.tenant_id || decoded.tenantId
      });

      // Adicionar informações do usuário ao request
      req.user = {
        id: decoded.id || decoded.sub || decoded.user_id,
        tenant_id: decoded.tenant_id || decoded.tenantId,
        role: decoded.role || 'user',
        email: decoded.email,
        name: decoded.name
      };

      // Adicionar tenant_id diretamente ao request para compatibilidade
      req.tenant_id = decoded.tenant_id || decoded.tenantId;

      console.log(`🔐 Usuário autenticado: ${req.user.role} (tenant: ${req.user.tenant_id || 'N/A'})`);
      
      next();
    } catch (jwtError) {
      console.error('❌ Erro na verificação JWT:', jwtError);
      
      // Determinar tipo de erro JWT específico
      if (jwtError instanceof Error) {
        if (jwtError.name === 'TokenExpiredError') {
          return res.status(401).json({ 
            success: false, 
            error: 'Token expirado',
            code: 'TOKEN_EXPIRED' 
          });
        } else if (jwtError.name === 'JsonWebTokenError') {
          return res.status(401).json({ 
            success: false, 
            error: 'Token inválido',
            code: 'INVALID_TOKEN' 
          });
        }
      }
      
      return res.status(401).json({ 
        success: false, 
        error: 'Token inválido ou expirado',
        code: 'JWT_VERIFICATION_FAILED' 
      });
    }
  } catch (error) {
    console.error('❌ Erro no middleware de autenticação:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Erro interno de autenticação',
      code: 'AUTH_ERROR' 
    });
  }
}

/**
 * Middleware para Super Admin
 * Verifica se usuário tem role de super_admin
 */
export function requireSuperAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): any {
  if (!req.user) {
    return res.status(401).json({ 
      success: false, 
      error: 'Usuário não autenticado',
      code: 'NOT_AUTHENTICATED' 
    });
  }

  if (req.user.role !== 'super_admin') {
    return res.status(403).json({ 
      success: false, 
      error: 'Acesso negado - requer permissões de Super Admin',
      code: 'INSUFFICIENT_PERMISSIONS',
      required_role: 'super_admin',
      user_role: req.user.role
    });
  }

  console.log(`✅ Super Admin autorizado: ${req.user.email || req.user.id}`);
  next();
}

/**
 * Middleware para Tenant Admin
 * Verifica se usuário é admin do tenant
 */
export function requireTenantAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): any {
  if (!req.user) {
    return res.status(401).json({ 
      success: false, 
      error: 'Usuário não autenticado',
      code: 'NOT_AUTHENTICATED' 
    });
  }

  if (!req.user.tenant_id) {
    return res.status(403).json({ 
      success: false, 
      error: 'Usuário não associado a um tenant',
      code: 'NO_TENANT_ASSOCIATION' 
    });
  }

  if (req.user.role !== 'tenant_admin' && req.user.role !== 'super_admin') {
    return res.status(403).json({ 
      success: false, 
      error: 'Acesso negado - requer permissões de Tenant Admin',
      code: 'INSUFFICIENT_PERMISSIONS',
      required_role: 'tenant_admin',
      user_role: req.user.role
    });
  }

  console.log(`✅ Tenant Admin autorizado: ${req.user.email || req.user.id} (tenant: ${req.user.tenant_id})`);
  next();
}

/**
 * Middleware para Tenant Access Control
 * Verifica se usuário pode acessar dados do tenant especificado
 */
export function requireTenantAccess(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ 
      success: false, 
      error: 'Usuário não autenticado',
      code: 'NOT_AUTHENTICATED' 
    });
  }

  // Super admin pode acessar qualquer tenant
  if (req.user.role === 'super_admin') {
    console.log(`✅ Super Admin autorizado para qualquer tenant`);
    return next();
  }

  // Extrair tenant_id da URL (params ou query)
  const requestedTenantId = req.params.tenantId || req.query.tenant_id;
  
  if (!requestedTenantId) {
    return res.status(400).json({ 
      success: false, 
      error: 'Tenant ID não especificado na requisição',
      code: 'MISSING_TENANT_ID' 
    });
  }

  // Verificar se usuário pertence ao tenant solicitado
  if (req.user.tenant_id !== requestedTenantId) {
    return res.status(403).json({ 
      success: false, 
      error: 'Acesso negado - dados de outro tenant',
      code: 'TENANT_ACCESS_DENIED',
      user_tenant: req.user.tenant_id,
      requested_tenant: requestedTenantId
    });
  }

  console.log(`✅ Acesso ao tenant autorizado: ${req.user.tenant_id}`);
  next();
}

/**
 * Middleware para debug de autenticação
 * Log detalhado das informações de auth (apenas desenvolvimento)
 */
export function debugAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (process.env.NODE_ENV !== 'development') {
    return next();
  }

  console.log('🔍 DEBUG AUTH:', {
    method: req.method,
    path: req.path,
    user: req.user ? {
      id: req.user.id,
      role: req.user.role,
      tenant_id: req.user.tenant_id,
      email: req.user.email
    } : null,
    headers: {
      authorization: req.headers.authorization ? '[PRESENT]' : '[MISSING]',
      'user-agent': req.headers['user-agent']
    }
  });

  next();
}

/**
 * Middleware de tratamento de erros de autenticação
 */
export function handleAuthErrors(error: any, req: AuthenticatedRequest, res: Response, next: NextFunction) {
  console.error('❌ Erro de autenticação:', error);

  // Verificar tipos específicos de erro
  if (error.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      error: 'Token expirado',
      code: 'TOKEN_EXPIRED'
    });
  }

  if (error.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      error: 'Token inválido',
      code: 'INVALID_TOKEN'
    });
  }

  // Erro genérico de autenticação
  return res.status(500).json({
    success: false,
    error: 'Erro interno de autenticação',
    code: 'AUTH_ERROR'
  });
}

export default {
  authenticateUser,
  requireSuperAdmin,
  requireTenantAdmin,
  requireTenantAccess,
  debugAuth,
  handleAuthErrors
};