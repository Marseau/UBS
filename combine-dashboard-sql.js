#!/usr/bin/env node

/**
 * Combine Dashboard SQL Files
 * This script combines all dashboard SQL files into a single file for easy execution
 */

const fs = require('fs').promises;
const path = require('path');

const SQL_FILES = [
    {
        name: 'Subscription Payments Schema',
        file: 'database/subscription-payments-schema.sql'
    },
    {
        name: 'Real Payment Functions',
        file: 'database/real-payment-functions-only.sql'
    },
    {
        name: 'Complete Dashboard Functions',
        file: 'database/complete-dashboard-functions.sql'
    }
];

async function combineSQL() {
    console.log('🔧 Combining Dashboard SQL Files...\n');
    
    let combinedSQL = `-- =====================================================
-- COMBINED DASHBOARD SQL - COMPLETE FUNCTIONAL VERSION
-- Generated: ${new Date().toISOString()}
-- =====================================================
-- 
-- This file contains all SQL needed for the 3 dashboards:
-- 1. Sistema Dashboard (Super Admin)
-- 2. Tenant Dashboard (Individual Tenant)
-- 3. Tenant-Platform Dashboard (Tenant Participation)
--
-- Execute this file in your Supabase SQL Editor
-- =====================================================\n\n`;
    
    for (const sqlFile of SQL_FILES) {
        try {
            console.log(`📄 Reading ${sqlFile.file}...`);
            const content = await fs.readFile(path.join(__dirname, sqlFile.file), 'utf8');
            
            combinedSQL += `\n-- =====================================================\n`;
            combinedSQL += `-- ${sqlFile.name.toUpperCase()}\n`;
            combinedSQL += `-- Source: ${sqlFile.file}\n`;
            combinedSQL += `-- =====================================================\n\n`;
            combinedSQL += content;
            combinedSQL += `\n\n`;
            
            console.log(`✅ Added ${sqlFile.name}`);
        } catch (error) {
            console.error(`❌ Error reading ${sqlFile.file}:`, error.message);
        }
    }
    
    // Write combined file
    const outputFile = 'EXECUTE-ALL-DASHBOARD-SQL.sql';
    await fs.writeFile(outputFile, combinedSQL);
    
    console.log(`\n✅ Combined SQL file created: ${outputFile}`);
    console.log('\n📝 Instructions:');
    console.log('1. Open your Supabase project dashboard');
    console.log('2. Go to SQL Editor');
    console.log('3. Create a new query');
    console.log(`4. Copy and paste the contents of ${outputFile}`);
    console.log('5. Click "Run" to execute all statements');
    console.log('\n⚠️  Note: Some CREATE IF NOT EXISTS statements may show warnings if objects already exist - this is normal.');
}

// Run the script
combineSQL().catch(console.error);