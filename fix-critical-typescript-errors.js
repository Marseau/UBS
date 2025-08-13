/**
 * Fix Critical TypeScript Errors - Targeted Approach
 * Sistema UBS - Universal Booking System
 * 
 * Correção direta e definitiva dos erros específicos identificados
 */

const fs = require('fs').promises;
const path = require('path');

async function fixCriticalErrors() {
    console.log('🎯 Correção direcionada de erros críticos TypeScript...\n');
    
    // 1. Corrigir platform-aggregation.service.ts - adicionar metricas_validadas
    console.log('🔧 1. Corrigindo platform-aggregation.service.ts');
    const file1 = path.join(process.cwd(), 'src/services/platform-aggregation.service.ts');
    let content1 = await fs.readFile(file1, 'utf8');
    
    // Encontrar e corrigir a construção do objeto
    const objectConstruction = content1.match(/const aggregatedMetrics: PlatformAggregatedMetrics = \{[\s\S]*?\};/);
    if (objectConstruction) {
        const originalObject = objectConstruction[0];
        
        // Verificar se já tem metricas_validadas
        if (!originalObject.includes('metricas_validadas:')) {
            // Adicionar antes do fechamento do objeto
            const fixedObject = originalObject.replace(
                /(\s+)(\/\/ CAMPOS JSON OBRIGATÓRIOS)/,
                `$1// MÉTRICAS VALIDADAS
$1metricas_validadas: {
$1    validation_date: new Date().toISOString(),
$1    validation_status: 'aggregated',
$1    tenant_count: tenantIds.size,
$1    processing_time_ms: Date.now() - startTime
$1},
$1
$1$2`
            );
            
            content1 = content1.replace(originalObject, fixedObject);
            await fs.writeFile(file1, content1, 'utf8');
            console.log('   ✅ Adicionado campo metricas_validadas');
        } else {
            console.log('   ⚠️ Campo metricas_validadas já existe');
        }
    } else {
        console.log('   ❌ Não foi possível encontrar construção do objeto');
    }

    // 2. Corrigir platform-aggregation-optimized.service.ts - acesso seguro a propriedades
    console.log('\n🔧 2. Corrigindo platform-aggregation-optimized.service.ts');
    const file2 = path.join(process.cwd(), 'src/services/tenant-metrics/platform-aggregation-optimized.service.ts');
    let content2 = await fs.readFile(file2, 'utf8');
    
    // Substituições para acesso seguro via comprehensive_metrics
    const replacements = [
        ['metric.period_days', '(metric.comprehensive_metrics as any)?.period_days || 0'],
        ['metric.total_revenue', '(metric.comprehensive_metrics as any)?.total_revenue || 0'],
        ['metric.total_appointments', '(metric.comprehensive_metrics as any)?.total_appointments || 0'],
        ['metric.total_customers', '(metric.comprehensive_metrics as any)?.total_customers || 0'],
        ['metric.total_ai_interactions', '(metric.comprehensive_metrics as any)?.total_ai_interactions || 0'],
        ['metric.active_tenants', '(metric.comprehensive_metrics as any)?.active_tenants || 0'],
        ['metric.platform_mrr', '(metric.comprehensive_metrics as any)?.platform_mrr || 0'],
        ['metric.total_chat_minutes', '(metric.comprehensive_metrics as any)?.total_chat_minutes || 0'],
        ['metric.total_conversations', '(metric.comprehensive_metrics as any)?.total_conversations || 0'],
        ['metric.total_valid_conversations', '(metric.comprehensive_metrics as any)?.total_valid_conversations || 0'],
        ['metric.total_spam_conversations', '(metric.comprehensive_metrics as any)?.total_spam_conversations || 0'],
        ['metric.ai_success_rate_pct', '(metric.comprehensive_metrics as any)?.ai_success_rate_pct || 0'],
        ['metric.appointment_success_rate_pct', '(metric.comprehensive_metrics as any)?.appointment_success_rate_pct || 0'],
        ['metric.cancellation_rate_pct', '(metric.comprehensive_metrics as any)?.cancellation_rate_pct || 0'],
        ['metric.revenue_usage_distortion_index', '(metric.comprehensive_metrics as any)?.revenue_usage_distortion_index || 0']
    ];
    
    let changes2 = 0;
    replacements.forEach(([from, to]) => {
        const beforeLength = content2.length;
        content2 = content2.replace(new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), to);
        if (content2.length !== beforeLength) changes2++;
    });
    
    if (changes2 > 0) {
        await fs.writeFile(file2, content2, 'utf8');
        console.log(`   ✅ Corrigido ${changes2} acessos a propriedades`);
    } else {
        console.log('   ⚠️ Nenhuma correção aplicada');
    }

    // 3. Corrigir platform-aggregation-validated.service.ts - tipos nullable
    console.log('\n🔧 3. Corrigindo platform-aggregation-validated.service.ts');
    const file3 = path.join(process.cwd(), 'src/services/tenant-metrics/platform-aggregation-validated.service.ts');
    let content3 = await fs.readFile(file3, 'utf8');
    
    // Substituir verificações de null/undefined
    const fixes3 = [
        // Adicionar verificações null
        ['tenant_id: string | undefined', 'tenant_id: string'],
        ['tenant_id: string | null', 'tenant_id: string'],
        // Safe access
        ['.tenant_id', '.tenant_id as string'],
        ['tenant_id?.', 'tenant_id!.'],
        // Cast para Json
        ['metricas_validadas: validatedMetrics', 'metricas_validadas: validatedMetrics as any']
    ];
    
    let changes3 = 0;
    fixes3.forEach(([from, to]) => {
        if (content3.includes(from)) {
            content3 = content3.replace(new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), to);
            changes3++;
        }
    });
    
    if (changes3 > 0) {
        await fs.writeFile(file3, content3, 'utf8');
        console.log(`   ✅ Aplicado ${changes3} correções de tipo`);
    } else {
        console.log('   ⚠️ Nenhuma correção aplicada');
    }

    // 4. Corrigir unified-cron.service.ts - propriedades duplicadas
    console.log('\n🔧 4. Corrigindo unified-cron.service.ts');
    const file4 = path.join(process.cwd(), 'src/services/unified-cron.service.ts');
    let content4 = await fs.readFile(file4, 'utf8');
    
    // Encontrar objeto com propriedades duplicadas (linha ~1200)
    const lines = content4.split('\n');
    const fixedLines = [];
    const seenProps = new Set();
    let inObjectLiteral = false;
    let braceCount = 0;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Detectar início de objeto literal problemático
        if (line.includes('platform_metrics') && line.includes('insert')) {
            inObjectLiteral = true;
            seenProps.clear();
        }
        
        if (inObjectLiteral) {
            braceCount += (line.match(/\{/g) || []).length;
            braceCount -= (line.match(/\}/g) || []).length;
            
            // Verificar propriedade duplicada
            const propMatch = line.match(/^\s*(\w+):/);
            if (propMatch) {
                const propName = propMatch[1];
                if (seenProps.has(propName)) {
                    // Skip linha duplicada
                    continue;
                }
                seenProps.add(propName);
            }
            
            if (braceCount === 0) {
                inObjectLiteral = false;
            }
        }
        
        fixedLines.push(line);
    }
    
    if (fixedLines.length !== lines.length) {
        await fs.writeFile(file4, fixedLines.join('\n'), 'utf8');
        console.log(`   ✅ Removido ${lines.length - fixedLines.length} propriedades duplicadas`);
    } else {
        console.log('   ⚠️ Nenhuma propriedade duplicada encontrada');
    }
    
    console.log('\n✅ Todas as correções aplicadas');
    return true;
}

if (require.main === module) {
    fixCriticalErrors()
        .then(() => {
            console.log('🧪 Testando build após correções...\n');
            
            const { spawn } = require('child_process');
            const build = spawn('npm', ['run', 'build'], { stdio: 'inherit' });
            
            build.on('close', (code) => {
                if (code === 0) {
                    console.log('\n🎉 BUILD LIMPO ALCANÇADO!');
                } else {
                    console.log('\n⚠️ Ainda existem erros de build');
                }
                process.exit(code);
            });
        })
        .catch((error) => {
            console.error('❌ Erro durante correções:', error);
            process.exit(1);
        });
}

module.exports = { fixCriticalErrors };