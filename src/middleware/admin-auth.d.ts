import { Request, Response, NextFunction } from "express";
declare global {
  namespace Express {
    interface Request {
      admin?: AdminUser;
      tenantId?: string;
    }
  }
}
interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: "super_admin" | "tenant_admin" | "support";
  tenantId?: string;
  permissions: string[];
}
interface LoginCredentials {
  email: string;
  password: string;
}
export declare class AdminAuthMiddleware {
  private jwtSecret;
  constructor();
  login(credentials: LoginCredentials): Promise<AuthResult>;
  verifyToken: (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => Promise<any>;
  requireSuperAdmin: (req: Request, res: Response, next: NextFunction) => any;
  requirePermission: (
    permission: string,
  ) => (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => void | Response<any, Record<string, any>>;
  requireTenantAccess: (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => void | Response<any, Record<string, any>>;
  createAdminUser(userData: CreateAdminUserData): Promise<AdminUser | null>;
  changePassword(
    adminId: string,
    oldPassword: string,
    newPassword: string,
  ): Promise<boolean>;
  getAdminProfile(adminId: string): Promise<AdminUser | null>;
  listAdminUsers(): Promise<AdminUser[]>;
  deactivateAdminUser(adminId: string): Promise<boolean>;
}
interface AuthResult {
  success: boolean;
  token?: string;
  user?: AdminUser;
  message?: string;
}
interface CreateAdminUserData {
  email: string;
  password: string;
  name: string;
  role: "super_admin" | "tenant_admin" | "support";
  tenantId?: string;
  permissions?: string[];
}
export declare const ADMIN_PERMISSIONS: {
  readonly MANAGE_TENANTS: "manage_tenants";
  readonly VIEW_TENANTS: "view_tenants";
  readonly MANAGE_USERS: "manage_users";
  readonly VIEW_USERS: "view_users";
  readonly VIEW_ANALYTICS: "view_analytics";
  readonly EXPORT_DATA: "export_data";
  readonly MANAGE_SYSTEM: "manage_system";
  readonly VIEW_LOGS: "view_logs";
  readonly MANAGE_AI_SETTINGS: "manage_ai_settings";
  readonly VIEW_CONVERSATIONS: "view_conversations";
  readonly MANAGE_BILLING: "manage_billing";
  readonly PROVIDE_SUPPORT: "provide_support";
};
export default AdminAuthMiddleware;
//# sourceMappingURL=admin-auth.d.ts.map
