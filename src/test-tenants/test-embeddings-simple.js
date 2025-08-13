#!/usr/bin/env node

/**
 * Simple Embedding Test Script
 * Tests the embedding processor with a small batch
 */

require('dotenv').config();

const OpenAI = require('openai');
const { createClient } = require('@supabase/supabase-js');

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || ''
});

const supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_ANON_KEY || ''
);

async function testEmbeddings() {
    console.log('🧪 Testing Embedding Processing');
    
    try {
        // Health checks
        console.log('🔍 Checking OpenAI connection...');
        if (!process.env.OPENAI_API_KEY) {
            throw new Error('OPENAI_API_KEY not configured');
        }
        
        // Test OpenAI with available model
        const testEmbedding = await openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: 'test embedding',
        });
        console.log('✅ OpenAI connection successful');
        console.log('📏 Embedding dimension:', testEmbedding.data[0].embedding.length);
        
        // Test Supabase
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
        
        // Get sample records for testing
        console.log('🎯 Getting 3 sample records for testing...');
        const { data: samples, error: sampleError } = await supabase
            .from('crawled_pages')
            .select('id, content, url, chunk_number')
            .is('embedding', null)
            .limit(3);
            
        if (sampleError) throw sampleError;
        
        console.log('📋 Sample records:');
        samples.forEach((record, i) => {
            console.log(`  ${i+1}. ${record.url} (chunk ${record.chunk_number})`);
            console.log(`     Content length: ${record.content.length} chars`);
        });
        
        // Process sample records
        console.log('\n🚀 Processing sample embeddings...');
        let processed = 0;
        let errors = 0;
        
        for (const record of samples) {
            try {
                console.log(`⚡ Processing: ${record.url} (chunk ${record.chunk_number})`);
                
                // Truncate content if too long
                const maxLength = 8000;
                const content = record.content.length > maxLength 
                    ? record.content.substring(0, maxLength) + '...'
                    : record.content;
                
                // Generate embedding
                const embeddingResponse = await openai.embeddings.create({
                    model: 'text-embedding-3-small',
                    input: content,
                });
                
                const embedding = embeddingResponse.data[0].embedding;
                
                // Update database
                const { error: updateError } = await supabase
                    .from('crawled_pages')
                    .update({ embedding })
                    .eq('id', record.id);
                
                if (updateError) throw updateError;
                
                console.log(`✅ Successfully processed ${record.id}`);
                processed++;
                
                // Small delay to avoid rate limits
                await new Promise(resolve => setTimeout(resolve, 100));
                
            } catch (error) {
                console.error(`❌ Error processing ${record.id}:`, error.message);
                errors++;
            }
        }
        
        console.log('\n🏁 Test completed!');
        console.log(`✅ Processed: ${processed}`);
        console.log(`❌ Errors: ${errors}`);
        
        if (processed > 0) {
            // Verify embeddings were stored correctly
            console.log('🔍 Verifying stored embeddings...');
            const { data: verification, error: verifyError } = await supabase
                .from('crawled_pages')
                .select('id, url, chunk_number')
                .not('embedding', 'is', null)
                .limit(5);
                
            if (verifyError) throw verifyError;
            
            console.log('✅ Verification successful!');
            console.log(`📊 Total records with embeddings: ${verification.length}`);
            
            verification.forEach((record, i) => {
                console.log(`  ${i+1}. ${record.url} (chunk ${record.chunk_number})`);
            });
        }
        
    } catch (error) {
        console.error('💥 Test failed:', error.message);
        process.exit(1);
    }
}

// Run the test
testEmbeddings().catch(error => {
    console.error('💥 Unhandled error:', error);
    process.exit(1);
});