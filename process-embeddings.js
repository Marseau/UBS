#!/usr/bin/env node

/**
 * Embedding Processing Script
 * 
 * Standalone script to process embeddings for crawled_pages table
 * Usage: node process-embeddings.js [options]
 */

require('dotenv').config();
const { EmbeddingProcessorService } = require('./dist/services/embedding-processor.service.js');

async function main() {
    const args = process.argv.slice(2);
    const options = parseArgs(args);
    
    console.log('🚀 Starting Embedding Processing Script');
    console.log('📊 Options:', options);
    
    const embeddingProcessor = new EmbeddingProcessorService();
    
    try {
        // Health check first
        console.log('🔍 Performing health check...');
        const health = await embeddingProcessor.healthCheck();
        
        if (health.status !== 'ok') {
            console.error('❌ Health check failed:', health.details);
            process.exit(1);
        }
        
        console.log('✅ Health check passed');
        console.log('📈 Pending embeddings:', health.details.pending_embeddings);
        
        if (health.details.pending_embeddings === 0) {
            console.log('🎉 No embeddings to process!');
            process.exit(0);
        }
        
        // Confirm processing (unless --auto flag is used)
        if (!options.auto) {
            const readline = require('readline').createInterface({
                input: process.stdin,
                output: process.stdout
            });
            
            const answer = await new Promise(resolve => {
                readline.question(
                    `Process ${health.details.pending_embeddings} embeddings? (y/N): `,
                    resolve
                );
            });
            
            readline.close();
            
            if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
                console.log('❌ Processing cancelled');
                process.exit(0);
            }
        }
        
        // Start processing
        const startTime = Date.now();
        
        let stats;
        if (options.ids && options.ids.length > 0) {
            console.log(`🎯 Processing specific records:`, options.ids);
            stats = await embeddingProcessor.processSpecificRecords(options.ids);
        } else {
            console.log(`🔄 Processing all pending embeddings (batch size: ${options.batchSize})...`);
            stats = await embeddingProcessor.processEmbeddings(options.batchSize);
        }
        
        const duration = Date.now() - startTime;
        
        console.log('\n🎉 Processing completed!');
        console.log('📊 Final Statistics:');
        console.log(`  ✅ Processed: ${stats.processed}`);
        console.log(`  ❌ Errors: ${stats.errors}`);
        console.log(`  ⏱️  Duration: ${formatDuration(duration)}`);
        console.log(`  ⚡ Rate: ${(stats.processed / (duration / 1000)).toFixed(2)} records/second`);
        
        if (stats.errors > 0) {
            console.log(`\n⚠️  ${stats.errors} errors occurred during processing`);
            console.log('💡 Consider running the script again to retry failed records');
        }
        
    } catch (error) {
        console.error('💥 Fatal error:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

function parseArgs(args) {
    const options = {
        batchSize: 10,
        auto: false,
        ids: []
    };
    
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        
        switch (arg) {
            case '--batch-size':
            case '-b':
                options.batchSize = parseInt(args[++i]) || 10;
                break;
                
            case '--auto':
            case '-a':
                options.auto = true;
                break;
                
            case '--ids':
            case '-i':
                options.ids = args[++i]?.split(',') || [];
                break;
                
            case '--help':
            case '-h':
                printHelp();
                process.exit(0);
                
            default:
                if (arg.startsWith('-')) {
                    console.error(`Unknown option: ${arg}`);
                    printHelp();
                    process.exit(1);
                }
        }
    }
    
    return options;
}

function printHelp() {
    console.log(`
Embedding Processing Script

Usage: node process-embeddings.js [options]

Options:
  -b, --batch-size <size>   Batch size for processing (default: 10)
  -a, --auto               Run automatically without confirmation
  -i, --ids <ids>          Process specific record IDs (comma-separated)
  -h, --help               Show this help message

Examples:
  node process-embeddings.js                    # Process all with default settings
  node process-embeddings.js -b 20 -a          # Process all with batch size 20, no confirmation
  node process-embeddings.js -i id1,id2,id3    # Process specific records

Environment Variables:
  OPENAI_API_KEY           Required: OpenAI API key for embeddings
  SUPABASE_URL            Required: Supabase project URL
  SUPABASE_ANON_KEY       Required: Supabase anon key
`);
}

function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
        return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
        return `${minutes}m ${seconds % 60}s`;
    } else {
        return `${seconds}s`;
    }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Received SIGINT, shutting down gracefully...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
    process.exit(0);
});

// Run the script
if (require.main === module) {
    main().catch(error => {
        console.error('💥 Unhandled error:', error);
        process.exit(1);
    });
}

module.exports = { main, parseArgs, formatDuration };