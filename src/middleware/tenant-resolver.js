"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.optionalTenant = exports.resolveTenant = void 0;
const database_1 = require("../config/database");
const resolveTenant = async (req, res, next) => {
    try {
        let tenantSlug = null;
        tenantSlug = req.headers['x-tenant-slug'] || null;
        if (!tenantSlug) {
            const host = req.headers.host;
            if (host && host.includes('.')) {
                const parts = host.split('.');
                if (parts.length > 2) {
                    tenantSlug = parts[0] || null;
                }
            }
        }
        if (!tenantSlug) {
            tenantSlug = req.query.tenant || null;
        }
        if (!tenantSlug) {
            const pathMatch = req.path.match(/^\/tenants\/([^\/]+)/);
            if (pathMatch) {
                tenantSlug = pathMatch[1] || null;
            }
        }
        if (!tenantSlug) {
            res.status(400).json({
                error: 'Tenant not specified',
                message: 'Please provide tenant via header X-Tenant-Slug, subdomain, query param, or URL path'
            });
            return;
        }
        const { data: tenant, error } = await database_1.supabase
            .from('tenants')
            .select('id, slug, domain, business_name, status')
            .eq('slug', tenantSlug)
            .eq('status', 'active')
            .single();
        if (error || !tenant) {
            res.status(404).json({
                error: 'Tenant not found',
                tenant_slug: tenantSlug
            });
            return;
        }
        req.tenant = {
            id: tenant.id,
            slug: tenant.slug,
            domain: tenant.domain,
            business_name: tenant.business_name
        };
        next();
    }
    catch (error) {
        console.error('Error resolving tenant:', error);
        res.status(500).json({
            error: 'Failed to resolve tenant',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
};
exports.resolveTenant = resolveTenant;
const optionalTenant = async (req, res, next) => {
    try {
        await (0, exports.resolveTenant)(req, res, () => {
            next();
        });
    }
    catch (error) {
        next();
    }
};
exports.optionalTenant = optionalTenant;
exports.default = exports.resolveTenant;
//# sourceMappingURL=tenant-resolver.js.map