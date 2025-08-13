#!/usr/bin/env node
/**
 * Test validation framework with proper UUID tenant
 */

const { ValidationEngineService } = require('./dist/services/validation/core/validation-engine.service.js');

async function testValidation() {
    const engine = new ValidationEngineService();
    
    // Use real tenant UUID instead of demo-tenant
    const tenantId = process.argv[2] || 'c3aa73f8-db80-40db-a9c4-73718a0fee34';
    
    console.log(`Testing validation framework with tenant: ${tenantId}`);
    
    try {
        const result = await engine.validateTenantMetrics(tenantId);
        console.log('✅ VALIDATION SUCCESS');
        console.log(JSON.stringify(result, null, 2));
    } catch (error) {
        console.error('❌ VALIDATION FAILED:', error.message);
        console.error('Stack:', error.stack);
    }
}

testValidation();