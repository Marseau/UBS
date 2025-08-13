"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const database_1 = require("../config/database");
const tenant_resolver_1 = require("../middleware/tenant-resolver");
const router = express_1.default.Router();
router.get('/', async (req, res) => {
    try {
        const adminClient = (0, database_1.getAdminClient)();
        const { data: tenants, error } = await adminClient
            .from('tenants')
            .select(`
        id,
        slug, 
        business_name,
        domain,
        email,
        phone,
        status,
        subscription_plan,
        created_at
      `)
            .order('created_at', { ascending: false });
        if (error)
            throw error;
        res.json({
            tenants,
            total: tenants?.length || 0
        });
    }
    catch (error) {
        console.error('Error fetching tenants:', error);
        res.status(500).json({
            error: 'Failed to fetch tenants',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
router.get('/:slug', tenant_resolver_1.resolveTenant, async (req, res) => {
    try {
        const { data: tenant, error } = await database_1.supabase
            .from('tenants')
            .select('*')
            .eq('id', req.tenant.id)
            .single();
        if (error)
            throw error;
        res.json({ tenant });
    }
    catch (error) {
        console.error('Error fetching tenant:', error);
        res.status(500).json({
            error: 'Failed to fetch tenant',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
router.post('/', async (req, res) => {
    try {
        const { name, slug, domain, email, phone, whatsapp_phone, business_name, business_description, domain_config = {}, ai_settings = {}, business_rules = {} } = req.body;
        if (!name || !slug || !domain || !email || !phone || !business_name) {
            res.status(400).json({
                error: 'Missing required fields',
                required: ['name', 'slug', 'domain', 'email', 'phone', 'business_name']
            });
            return;
        }
        const validDomains = ['legal', 'healthcare', 'education', 'beauty', 'sports', 'consulting', 'other'];
        if (!validDomains.includes(domain)) {
            res.status(400).json({
                error: 'Invalid domain',
                valid_domains: validDomains
            });
            return;
        }
        const adminClient = (0, database_1.getAdminClient)();
        const { data: tenant, error } = await adminClient
            .from('tenants')
            .insert({
            name,
            slug,
            domain,
            email,
            phone,
            whatsapp_phone,
            business_name,
            business_description,
            domain_config,
            ai_settings,
            business_rules,
            status: 'active',
            subscription_plan: 'free'
        })
            .select()
            .single();
        if (error) {
            if (error.code === '23505') {
                res.status(409).json({
                    error: 'Tenant already exists',
                    message: 'Slug, email or phone already in use'
                });
                return;
            }
            throw error;
        }
        res.status(201).json({
            message: 'Tenant created successfully',
            tenant
        });
    }
    catch (error) {
        console.error('Error creating tenant:', error);
        res.status(500).json({
            error: 'Failed to create tenant',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
router.put('/:slug', tenant_resolver_1.resolveTenant, async (req, res) => {
    try {
        const { name, business_name, business_description, domain_config, ai_settings, business_rules, phone, whatsapp_phone } = req.body;
        const { data: tenant, error } = await database_1.supabase
            .from('tenants')
            .update({
            ...(name && { name }),
            ...(business_name && { business_name }),
            ...(business_description && { business_description }),
            ...(domain_config && { domain_config }),
            ...(ai_settings && { ai_settings }),
            ...(business_rules && { business_rules }),
            ...(phone && { phone }),
            ...(whatsapp_phone && { whatsapp_phone }),
            updated_at: new Date().toISOString()
        })
            .eq('id', req.tenant.id)
            .select()
            .single();
        if (error)
            throw error;
        res.json({
            message: 'Tenant updated successfully',
            tenant
        });
    }
    catch (error) {
        console.error('Error updating tenant:', error);
        res.status(500).json({
            error: 'Failed to update tenant',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
router.get('/:slug/services', tenant_resolver_1.resolveTenant, async (req, res) => {
    try {
        const { data: services, error } = await database_1.supabase
            .from('services')
            .select(`
        *,
        service_categories (
          id,
          name,
          description
        )
      `)
            .eq('tenant_id', req.tenant.id)
            .eq('is_active', true)
            .order('display_order', { ascending: true });
        if (error)
            throw error;
        res.json({
            services,
            tenant: req.tenant
        });
    }
    catch (error) {
        console.error('Error fetching services:', error);
        res.status(500).json({
            error: 'Failed to fetch services',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
exports.default = router;
//# sourceMappingURL=tenants.js.map