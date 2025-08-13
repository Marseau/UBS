/**
 * Fix Platform Aggregation Optimized - Critical Type Errors
 * Sistema UBS - Universal Booking System
 * 
 * Correção definitiva dos 16 erros TypeScript por acesso a propriedades
 * que estão estruturadas dentro do campo JSON comprehensive_metrics
 */

const fs = require('fs').promises;
const path = require('path');

async function fixPlatformAggregationOptimized() {
    console.log('🎯 Corrigindo erros críticos em platform-aggregation-optimized.service.ts...\n');
    
    const filePath = path.join(process.cwd(), 'src/services/tenant-metrics/platform-aggregation-optimized.service.ts');
    
    try {
        let content = await fs.readFile(filePath, 'utf8');
        
        console.log('🔍 Identificando seção problemática...');
        
        // Encontrar a seção que está causando os erros (linha ~600)
        const lines = content.split('\n');
        let startIndex = -1;
        let endIndex = -1;
        
        // Procurar pela construção problemática do objeto
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('const platformMetrics: PlatformMetrics = {')) {
                startIndex = i;
            }
            if (startIndex >= 0 && lines[i].includes('};') && !lines[i].includes('{')) {
                endIndex = i;
                break;
            }
        }
        
        if (startIndex === -1 || endIndex === -1) {
            console.log('❌ Não foi possível encontrar a construção problemática do objeto');
            return false;
        }
        
        console.log(`📍 Seção encontrada: linhas ${startIndex + 1} - ${endIndex + 1}`);
        
        // Substituir toda a seção problemática com acesso seguro
        const safeConstruction = `        const platformMetrics: PlatformMetrics = {
            id: data.id,
            calculation_date: (data.calculation_date || new Date().toISOString().split('T')[0]) as string,
            period_days: (data.comprehensive_metrics as any)?.period_days || 30,
            data_source: data.data_source || 'database',
            total_revenue: (data.comprehensive_metrics as any)?.total_revenue || 0,
            total_appointments: (data.comprehensive_metrics as any)?.total_appointments || 0,
            total_customers: (data.comprehensive_metrics as any)?.total_customers || 0,
            total_ai_interactions: (data.comprehensive_metrics as any)?.total_ai_interactions || 0,
            active_tenants: (data.comprehensive_metrics as any)?.active_tenants || 0,
            platform_mrr: (data.comprehensive_metrics as any)?.platform_mrr || 0,
            total_chat_minutes: (data.comprehensive_metrics as any)?.total_chat_minutes || 0,
            total_conversations: (data.comprehensive_metrics as any)?.total_conversations || 0,
            total_valid_conversations: (data.comprehensive_metrics as any)?.total_valid_conversations || 0,
            total_spam_conversations: (data.comprehensive_metrics as any)?.total_spam_conversations || 0,
            receita_uso_ratio: (data.comprehensive_metrics as any)?.receita_uso_ratio || 0,
            operational_efficiency_pct: (data.comprehensive_metrics as any)?.operational_efficiency_pct || 0,
            spam_rate_pct: (data.comprehensive_metrics as any)?.spam_rate_pct || 0,
            cancellation_rate_pct: (data.comprehensive_metrics as any)?.cancellation_rate_pct || 0,
            revenue_usage_distortion_index: (data.comprehensive_metrics as any)?.revenue_usage_distortion_index || 0,
            created_at: data.created_at || null,
            updated_at: data.updated_at || null
        }`;
        
        // Reconstruir o arquivo
        const newLines = [
            ...lines.slice(0, startIndex),
            safeConstruction,
            ...lines.slice(endIndex + 1)
        ];
        
        const newContent = newLines.join('\n');
        
        // Verificar se houve mudança
        if (newContent !== content) {
            await fs.writeFile(filePath, newContent, 'utf8');
            console.log('✅ Arquivo corrigido com acesso seguro a comprehensive_metrics');
            
            // Contar propriedades corrigidas
            const propertiesFixed = [
                'period_days', 'total_revenue', 'total_appointments', 'total_customers',
                'total_ai_interactions', 'active_tenants', 'platform_mrr', 'total_chat_minutes',
                'total_conversations', 'total_valid_conversations', 'total_spam_conversations',
                'receita_uso_ratio', 'operational_efficiency_pct', 'spam_rate_pct',
                'cancellation_rate_pct', 'revenue_usage_distortion_index'
            ];
            
            console.log(`📊 Propriedades corrigidas: ${propertiesFixed.length}`);
            propertiesFixed.forEach((prop, index) => {
                console.log(`   ${index + 1}. ${prop} → (data.comprehensive_metrics as any)?.${prop} || 0`);
            });
            
            return true;
        } else {
            console.log('⚠️ Nenhuma mudança aplicada');
            return false;
        }
        
    } catch (error) {
        console.error('❌ Erro ao corrigir arquivo:', error.message);
        return false;
    }
}

async function validateTypeScriptCompilation() {
    console.log('\n🧪 Validando compilação TypeScript...');
    
    const { spawn } = require('child_process');
    
    return new Promise((resolve) => {
        const tsc = spawn('npx', ['tsc', '--noEmit', '--project', 'tsconfig.deploy.json'], {
            stdio: 'pipe'
        });
        
        let output = '';
        let errorOutput = '';
        
        tsc.stdout.on('data', (data) => {
            output += data.toString();
        });
        
        tsc.stderr.on('data', (data) => {
            errorOutput += data.toString();
        });
        
        tsc.on('close', (code) => {
            if (code === 0) {
                console.log('✅ Compilação TypeScript bem-sucedida!');
                resolve({ success: true, errors: 0 });
            } else {
                const errorLines = errorOutput.split('\n').filter(line => line.includes('error TS'));
                console.log(`❌ Compilação com ${errorLines.length} erros restantes`);
                
                // Mostrar apenas os primeiros 5 erros
                errorLines.slice(0, 5).forEach((error, index) => {
                    console.log(`   ${index + 1}. ${error.trim()}`);
                });
                
                if (errorLines.length > 5) {
                    console.log(`   ... e mais ${errorLines.length - 5} erros`);
                }
                
                resolve({ success: false, errors: errorLines.length });
            }
        });
    });
}

if (require.main === module) {
    fixPlatformAggregationOptimized()
        .then(async (fixed) => {
            if (fixed) {
                console.log('\n🎯 Correções aplicadas, testando compilação...');
                const validation = await validateTypeScriptCompilation();
                
                console.log('\n📋 RESULTADO FINAL:');
                console.log(`   • Arquivo corrigido: ${fixed ? '✅' : '❌'}`);
                console.log(`   • Compilação: ${validation.success ? '✅ LIMPA' : '❌ COM ERROS'}`);
                console.log(`   • Erros restantes: ${validation.errors}`);
                
                if (validation.success) {
                    console.log('\n🎉 UNIFIED CRON SERVICE PRONTO PARA INICIALIZAÇÃO!');
                }
                
                process.exit(validation.success ? 0 : 1);
            } else {
                console.log('\n❌ Falha na correção do arquivo');
                process.exit(1);
            }
        })
        .catch((error) => {
            console.error('❌ Erro fatal:', error);
            process.exit(1);
        });
}

module.exports = { fixPlatformAggregationOptimized, validateTypeScriptCompilation };