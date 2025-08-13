"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ADMIN_PERMISSIONS = exports.AdminAuthMiddleware = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const database_1 = require("../config/database");
class AdminAuthMiddleware {
    constructor() {
        this.bypassLogged = false; // Track if bypass message was already logged
        this.verifyToken = async (req, res, next) => {
            // 🚨 DEVELOPMENT BYPASS - P1-002 Enhancement
            if (process.env.NODE_ENV === 'development' && process.env.BYPASS_SUPER_ADMIN_AUTH === 'true') {
                // Log only once on startup, not per request
                if (!this.bypassLogged) {
                    console.log('🚨 DEVELOPMENT BYPASS ATIVO - JWT verification disabled');
                    this.bypassLogged = true;
                }
                req.admin = { 
                    id: 'dev-admin', 
                    email: 'dev@admin.com', 
                    role: 'super_admin', 
                    tenantId: null 
                };
                req.user = req.admin;
                return next();
            }

            // Log para depuração
            console.log('Authorization header:', req.headers.authorization);

            // Extrai o token do header Authorization: Bearer <token>
            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return res.status(401).json({ error: 'Token ausente', code: 'TOKEN_MISSING' });
            }

            const token = authHeader.split(' ')[1];

            // Verificação adicional para token null ou undefined
            if (!token || token === 'null' || token === 'undefined') {
                return res.status(401).json({ error: 'Token inválido', code: 'TOKEN_INVALID' });
            }

            try {
                // Verifica o token
                const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET);
                console.log('Token decodificado:', decoded);

                // Injeta o payload no req.user E req.admin para compatibilidade
                req.user = decoded;
                req.admin = decoded;

                // Permissão total para super_admin
                if (req.user.role === 'super_admin') {
                    return next();
                }

                // Permissão para tenant_admin (precisa ter tenant_id)
                if (req.user.role === 'tenant_admin' && req.user.tenant_id) {
                    return next();
                }

                // Outros papéis: bloqueia
                return res.status(403).json({ error: 'Acesso negado', code: 'FORBIDDEN' });
            } catch (err) {
                console.error('Erro ao verificar token:', err);
                return res.status(401).json({ error: 'Invalid or expired token', code: 'TOKEN_VERIFICATION_FAILED' });
            }
        };
        this.requireSuperAdmin = (req, res, next) => {
            if (!req.admin || req.admin.role !== 'super_admin') {
                return res.status(403).json({
                    error: 'Super admin access required',
                    code: 'INSUFFICIENT_PERMISSIONS'
                });
            }
            next();
        };
        this.requirePermission = (permission) => {
            return (req, res, next) => {
                if (!req.admin) {
                    return res.status(401).json({
                        error: 'Authentication required',
                        code: 'NO_AUTH'
                    });
                }
                if (req.admin.role === 'super_admin') {
                    return next();
                }
                if (!req.admin.permissions || !req.admin.permissions.includes(permission)) {
                    return res.status(403).json({
                        error: `Permission required: ${permission}`,
                        code: 'INSUFFICIENT_PERMISSIONS'
                    });
                }
                next();
            };
        };
        this.requireTenantAccess = (req, res, next) => {
            const requestedTenantId = req.params.tenantId || req.body.tenantId || req.query.tenantId;
            if (!req.admin) {
                return res.status(401).json({
                    error: 'Authentication required',
                    code: 'NO_AUTH'
                });
            }
            if (req.admin.role === 'super_admin') {
                return next();
            }
            if (req.admin.role === 'tenant_admin') {
                if (!req.admin.tenant_id || req.admin.tenant_id !== requestedTenantId) {
                    return res.status(403).json({
                        error: 'Tenant access denied',
                        code: 'TENANT_ACCESS_DENIED'
                    });
                }
            }
            next();
        };
        this.jwtSecret = process.env.JWT_SECRET || 'your-super-secret-jwt-key';
    }
    async login(credentials) {
        try {
            const { email, password } = credentials;
            const adminClient = (0, database_1.getAdminClient)();
            
            const { data: admin, error } = await adminClient
                .from('admin_users')
                .select(`id, email, name, password_hash, role, tenant_id, is_active, permissions`)
                .eq('email', email.toLowerCase())
                .eq('is_active', true)
                .single();

            if (error || !admin) {
                return {
                    success: false,
                    message: 'Invalid credentials'
                };
            }

            const isValidPassword = await bcryptjs_1.default.compare(password, admin.password_hash);

            if (!isValidPassword) {
                return {
                    success: false,
                    message: 'Invalid credentials'
                };
            }

            const permissions = admin.permissions || [];

            const token = jsonwebtoken_1.default.sign({
                id: admin.id,
                email: admin.email,
                role: admin.role,
                tenantId: admin.tenant_id || undefined
            }, this.jwtSecret, { expiresIn: '24h' });

            await adminClient
                .from('admin_users')
                .update({ last_login_at: new Date().toISOString() })
                .eq('id', admin.id);
                
            return {
                success: true,
                token,
                user: {
                    id: admin.id,
                    email: admin.email,
                    name: admin.name,
                    role: admin.role,
                    tenantId: admin.tenant_id || undefined,
                    permissions
                }
            };
        }
        catch (error) {
            console.error('Login error:', error);
            return {
                success: false,
                message: 'Authentication failed'
            };
        }
    }
    async createAdminUser(userData) {
        try {
            const { email, password, name, role, tenantId, permissions } = userData;
            const passwordHash = await bcryptjs_1.default.hash(password, 12);
            const adminClient = (0, database_1.getAdminClient)();
            const { data: admin, error } = await adminClient
                .from('admin_users')
                .insert({
                email: email.toLowerCase(),
                password_hash: passwordHash,
                name,
                role,
                tenant_id: tenantId,
                is_active: true,
                created_at: new Date().toISOString()
            })
                .select()
                .single();
            if (error) {
                throw error;
            }
            if (permissions && permissions.length > 0) {
                const permissionInserts = permissions.map(permission => ({
                    admin_user_id: admin.id,
                    permission
                }));
                await adminClient
                    .from('admin_permissions')
                    .insert(permissionInserts);
            }
            return {
                id: admin.id,
                email: admin.email,
                name: admin.name,
                role: admin.role,
                tenantId: admin.tenant_id || undefined,
                permissions: permissions || []
            };
        }
        catch (error) {
            console.error('Failed to create admin user:', error);
            return null;
        }
    }
    async changePassword(adminId, oldPassword, newPassword) {
        try {
            const adminClient = (0, database_1.getAdminClient)();
            const { data: admin, error } = await adminClient
                .from('admin_users')
                .select('password_hash')
                .eq('id', adminId)
                .single();
            if (error || !admin) {
                return false;
            }
            const isValidOldPassword = await bcryptjs_1.default.compare(oldPassword, admin.password_hash);
            if (!isValidOldPassword) {
                return false;
            }
            const newPasswordHash = await bcryptjs_1.default.hash(newPassword, 12);
            const { error: updateError } = await adminClient
                .from('admin_users')
                .update({
                password_hash: newPasswordHash,
                updated_at: new Date().toISOString()
            })
                .eq('id', adminId);
            return !updateError;
        }
        catch (error) {
            console.error('Failed to change password:', error);
            return false;
        }
    }
    async getAdminProfile(adminId) {
        try {
            const adminClient = (0, database_1.getAdminClient)();
            const { data: admin, error } = await adminClient
                .from('admin_users')
                .select(`
          id, email, name, role, tenant_id, last_login_at, created_at,
          admin_permissions (permission)
        `)
                .eq('id', adminId)
                .eq('is_active', true)
                .single();
            if (error || !admin) {
                return null;
            }
            return {
                id: admin.id,
                email: admin.email,
                name: admin.name,
                role: admin.role,
                tenantId: admin.tenant_id || undefined,
                permissions: admin.admin_permissions?.map((p) => p.permission) || []
            };
        }
        catch (error) {
            console.error('Failed to get admin profile:', error);
            return null;
        }
    }
    async listAdminUsers() {
        try {
            const adminClient = (0, database_1.getAdminClient)();
            const { data: admins, error } = await adminClient
                .from('admin_users')
                .select(`
          id, email, name, role, tenant_id, last_login_at, created_at, is_active,
          admin_permissions (permission)
        `)
                .order('created_at', { ascending: false });
            if (error) {
                throw error;
            }
            return admins.map(admin => ({
                id: admin.id,
                email: admin.email,
                name: admin.name,
                role: admin.role,
                tenantId: admin.tenant_id || undefined,
                permissions: admin.admin_permissions?.map((p) => p.permission) || []
            }));
        }
        catch (error) {
            console.error('Failed to list admin users:', error);
            return [];
        }
    }
    async deactivateAdminUser(adminId) {
        try {
            const adminClient = (0, database_1.getAdminClient)();
            const { error } = await adminClient
                .from('admin_users')
                .update({
                is_active: false,
                updated_at: new Date().toISOString()
            })
                .eq('id', adminId);
            return !error;
        }
        catch (error) {
            console.error('Failed to deactivate admin user:', error);
            return false;
        }
    }
}
exports.AdminAuthMiddleware = AdminAuthMiddleware;
exports.ADMIN_PERMISSIONS = {
    MANAGE_TENANTS: 'manage_tenants',
    VIEW_TENANTS: 'view_tenants',
    MANAGE_USERS: 'manage_users',
    VIEW_USERS: 'view_users',
    VIEW_ANALYTICS: 'view_analytics',
    EXPORT_DATA: 'export_data',
    MANAGE_SYSTEM: 'manage_system',
    VIEW_LOGS: 'view_logs',
    MANAGE_AI_SETTINGS: 'manage_ai_settings',
    VIEW_CONVERSATIONS: 'view_conversations',
    MANAGE_BILLING: 'manage_billing',
    PROVIDE_SUPPORT: 'provide_support'
};
exports.default = AdminAuthMiddleware;
//# sourceMappingURL=admin-auth.js.map