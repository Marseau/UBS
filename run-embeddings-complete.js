#!/usr/bin/env node

/**
 * Complete Embeddings Processing
 * Runs the embedding update script until all records are processed
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { spawn } = require('child_process');

const supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_ANON_KEY || ''
);

async function getRemainingCount() {
    const { count, error } = await supabase
        .from('crawled_pages')
        .select('*', { count: 'exact', head: true })
        .is('embedding', null);
        
    if (error) throw error;
    return count || 0;
}

async function runCompleteProcessing() {
    console.log('🚀 Complete Embeddings Processing');
    
    try {
        let remaining = await getRemainingCount();
        console.log(`📊 Total remaining: ${remaining}`);
        
        if (remaining === 0) {
            console.log('🎉 All embeddings already processed!');
            return;
        }
        
        let batchCount = 0;
        const startTime = Date.now();
        
        while (remaining > 0) {
            batchCount++;
            console.log(`\n📦 Processing batch ${batchCount}...`);
            
            // Run the update script
            const child = spawn('node', ['update-embeddings-only.js'], {
                stdio: 'inherit'
            });
            
            await new Promise((resolve, reject) => {
                child.on('close', (code) => {
                    if (code === 0) {
                        resolve();
                    } else {
                        reject(new Error(`Script exited with code ${code}`));
                    }
                });
            });
            
            // Check remaining
            const newRemaining = await getRemainingCount();
            const processed = remaining - newRemaining;
            
            console.log(`✅ Batch ${batchCount} completed: ${processed} processed`);
            
            remaining = newRemaining;
            
            if (remaining === 0) {
                break;
            }
            
            // Progress stats
            const elapsed = Date.now() - startTime;
            const rate = ((3053 - remaining) / (elapsed / 1000)).toFixed(2);
            const eta = remaining / rate;
            
            console.log(`📈 Progress: ${3053 - remaining}/3053 (${Math.round((3053 - remaining)/3053*100)}%)`);
            console.log(`⚡ Rate: ${rate} records/second`);
            console.log(`⏰ ETA: ${Math.round(eta/60)} minutes`);
            
            // Small delay between batches
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        const totalTime = (Date.now() - startTime) / 1000;
        console.log(`\n🎉 All embeddings processed!`);
        console.log(`⏱️  Total time: ${Math.round(totalTime/60)} minutes`);
        console.log(`⚡ Average rate: ${(3053 / totalTime).toFixed(2)} records/second`);
        
        // Final verification
        const { count: finalCount } = await supabase
            .from('crawled_pages')
            .select('*', { count: 'exact', head: true })
            .not('embedding', 'is', null);
            
        console.log(`✅ Final verification: ${finalCount} records with embeddings`);
        
    } catch (error) {
        console.error('💥 Error:', error.message);
        process.exit(1);
    }
}

runCompleteProcessing();