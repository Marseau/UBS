#!/usr/bin/env node

/**
 * Mock Embeddings Script
 * Creates mock embeddings for testing when OpenAI embeddings are not available
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_ANON_KEY || ''
);

// Generate a random vector of specified dimension
function generateMockEmbedding(dimension = 1536) {
    const embedding = [];
    for (let i = 0; i < dimension; i++) {
        // Generate random float between -1 and 1 (typical embedding range)
        embedding.push((Math.random() - 0.5) * 2);
    }
    return embedding;
}

// Generate embedding based on content hash (deterministic)
function generateDeterministicEmbedding(content, dimension = 1536) {
    // Simple hash function
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
        const char = content.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    
    // Use hash as seed for deterministic random generation
    const embedding = [];
    let seed = Math.abs(hash);
    
    for (let i = 0; i < dimension; i++) {
        // Linear congruential generator for deterministic random numbers
        seed = (seed * 9301 + 49297) % 233280;
        const random = seed / 233280.0;
        embedding.push((random - 0.5) * 2);
    }
    
    return embedding;
}

async function createMockEmbeddings() {
    console.log('🧪 Creating Mock Embeddings for Testing');
    
    try {
        // Check connection
        console.log('🔍 Checking Supabase connection...');
        const { count, error: countError } = await supabase
            .from('crawled_pages')
            .select('*', { count: 'exact', head: true })
            .is('embedding', null);
            
        if (countError) throw countError;
        console.log('✅ Supabase connection successful');
        console.log('📊 Pending embeddings:', count);
        
        if (count === 0) {
            console.log('🎉 No embeddings to process!');
            return;
        }
        
        // Confirm processing
        const readline = require('readline').createInterface({
            input: process.stdin,
            output: process.stdout
        });
        
        const answer = await new Promise(resolve => {
            readline.question(
                `Create mock embeddings for ${count} records? (y/N): `,
                resolve
            );
        });
        
        readline.close();
        
        if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
            console.log('❌ Processing cancelled');
            process.exit(0);
        }
        
        // Process in batches
        const batchSize = 50;
        let processed = 0;
        let errors = 0;
        
        console.log(`🚀 Creating mock embeddings (batch size: ${batchSize})...`);
        
        while (true) {
            // Get next batch
            const { data: batch, error: batchError } = await supabase
                .from('crawled_pages')
                .select('id, content, url, chunk_number')
                .is('embedding', null)
                .limit(batchSize);
                
            if (batchError) throw batchError;
            if (!batch || batch.length === 0) break;
            
            // Process batch
            for (const record of batch) {
                try {
                    // Generate deterministic mock embedding based on content
                    const embedding = generateDeterministicEmbedding(record.content);
                    
                    // Update database
                    const { error: updateError } = await supabase
                        .from('crawled_pages')
                        .update({ embedding })
                        .eq('id', record.id);
                    
                    if (updateError) throw updateError;
                    
                    processed++;
                    
                    if (processed % 10 === 0) {
                        console.log(`📈 Progress: ${processed} processed`);
                    }
                    
                } catch (error) {
                    console.error(`❌ Error processing ${record.id}:`, error.message);
                    errors++;
                }
            }
            
            // Small delay between batches
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        console.log('\n🎉 Mock embedding creation completed!');
        console.log(`✅ Processed: ${processed}`);
        console.log(`❌ Errors: ${errors}`);
        
        // Verify results
        console.log('🔍 Verifying created embeddings...');
        const { data: verification, error: verifyError } = await supabase
            .from('crawled_pages')
            .select('id, url, chunk_number')
            .not('embedding', 'is', null)
            .limit(10);
            
        if (verifyError) throw verifyError;
        
        console.log('✅ Verification successful!');
        console.log(`📊 Sample records with embeddings:`);
        verification.forEach((record, i) => {
            console.log(`  ${i+1}. ${record.url} (chunk ${record.chunk_number})`);
        });
        
        console.log('\n💡 Note: These are mock embeddings for testing purposes.');
        console.log('   Replace with real OpenAI embeddings when API access is available.');
        
    } catch (error) {
        console.error('💥 Error:', error.message);
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Received SIGINT, shutting down gracefully...');
    process.exit(0);
});

// Run the script
createMockEmbeddings().catch(error => {
    console.error('💥 Unhandled error:', error);
    process.exit(1);
});