import { Request, Response, NextFunction } from "express";
declare global {
  namespace Express {
    interface Request {
      tenant?: {
        id: string;
        slug: string;
        domain: string;
        business_name: string;
      };
    }
  }
}
export declare const resolveTenant: (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<void>;
export declare const optionalTenant: (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<void>;
export default resolveTenant;
//# sourceMappingURL=tenant-resolver.d.ts.map
