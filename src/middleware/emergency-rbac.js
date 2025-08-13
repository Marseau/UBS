/**
 * Emergency RBAC Middleware - Immediate Security Fix
 * CRITICAL: Implements strict role-based access control
 */

const jwt = require('jsonwebtoken');

const emergencyRBAC = (req, res, next) => {
    try {
        // 1. Verificar se token existe
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ 
                error: 'Token de acesso requerido',
                code: 'UNAUTHORIZED' 
            });
        }

        const token = authHeader.substring(7);

        // 2. Verificar se token não é vazio ou malformado
        if (!token || token === 'null' || token === 'undefined') {
            return res.status(401).json({ 
                error: 'Token inválido',
                code: 'INVALID_TOKEN' 
            });
        }

        // 3. Decodificar JWT (sem verificar assinatura primeiro para debug)
        const decoded = jwt.decode(token, { complete: true });
        
        if (!decoded) {
            return res.status(401).json({ 
                error: 'Token malformado',
                code: 'MALFORMED_TOKEN' 
            });
        }

        // 4. CRÍTICO: Verificar algoritmo de assinatura
        if (!decoded.header.alg || decoded.header.alg === 'none') {
            return res.status(401).json({ 
                error: 'Token não assinado rejeitado',
                code: 'UNSIGNED_TOKEN_REJECTED' 
            });
        }

        // 5. Verificar assinatura JWT com secret
        const jwtSecret = process.env.JWT_SECRET || 'your-super-secret-jwt-key';
        let payload;
        
        try {
            payload = jwt.verify(token, jwtSecret);
        } catch (jwtError) {
            return res.status(401).json({ 
                error: 'Token inválido ou expirado',
                code: 'JWT_VERIFICATION_FAILED',
                details: jwtError.message 
            });
        }

        // 6. CRÍTICO: Verificar role para endpoints super-admin
        if (req.path.startsWith('/api/super-admin') || req.originalUrl.includes('/super-admin')) {
            if (!payload.role || payload.role !== 'super_admin') {
                console.log(`🚨 SECURITY BREACH ATTEMPT: ${payload.email} (${payload.role}) tried to access super-admin endpoint: ${req.path}`);
                return res.status(403).json({ 
                    error: 'Acesso negado. Super admin requerido.',
                    code: 'INSUFFICIENT_PRIVILEGES',
                    userRole: payload.role,
                    requiredRole: 'super_admin'
                });
            }
        }

        // 7. Verificar isolamento de tenant para tenant_admin
        if (payload.role === 'tenant_admin') {
            if (!payload.tenant_id) {
                return res.status(403).json({ 
                    error: 'Tenant ID requerido para tenant admin',
                    code: 'MISSING_TENANT_CONTEXT' 
                });
            }
            
            // Adicionar tenant_id ao contexto da requisição
            req.tenantId = payload.tenant_id;
        }

        // 8. Adicionar dados do usuário ao contexto
        req.admin = {
            id: payload.id,
            email: payload.email,
            role: payload.role,
            tenant_id: payload.tenant_id,
            permissions: payload.permissions || []
        };

        // 9. Log de auditoria
        console.log(`🔐 AUTH SUCCESS: ${payload.email} (${payload.role}) accessing ${req.method} ${req.path}`);

        next();

    } catch (error) {
        console.error('🚨 AUTH ERROR:', error);
        return res.status(500).json({ 
            error: 'Erro interno de autenticação',
            code: 'AUTH_INTERNAL_ERROR' 
        });
    }
};

module.exports = emergencyRBAC;