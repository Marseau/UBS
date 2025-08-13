#!/usr/bin/env node

/**
 * BUILD OPTIMIZATION SCRIPT
 * Comprehensive frontend optimization pipeline
 * Target: 965KB → <300KB (70% reduction)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const zlib = require('zlib');

class BuildOptimizer {
    constructor() {
        this.frontendPath = path.join(process.cwd(), 'src/frontend');
        this.distPath = path.join(process.cwd(), 'src/frontend/dist');
        this.stats = {
            before: { js: 0, css: 0, html: 0, total: 0 },
            after: { js: 0, css: 0, html: 0, total: 0, compressed: 0 },
            reduction: { percentage: 0, bytes: 0 }
        };
    }

    /**
     * Executar pipeline completo de otimização
     */
    async optimize() {
        console.log('🚀 BUILD OPTIMIZATION PIPELINE');
        console.log('='.repeat(50));
        
        try {
            // 1. Medir estado atual
            await this.measureCurrentState();
            
            // 2. Executar build webpack
            await this.runWebpackBuild();
            
            // 3. Medir estado otimizado
            await this.measureOptimizedState();
            
            // 4. Análise de compressão
            await this.analyzeCompression();
            
            // 5. Relatório final
            this.generateReport();
            
            // 6. Validar targets
            this.validateTargets();
            
            return this.stats;
            
        } catch (error) {
            console.error('❌ Erro na otimização:', error);
            throw error;
        }
    }

    /**
     * Medir estado atual dos arquivos
     */
    async measureCurrentState() {
        console.log('📊 1. MEDINDO ESTADO ATUAL...');
        
        this.stats.before = await this.measureDirectory(this.frontendPath, {
            js: ['**/*.js'],
            css: ['**/*.css'],
            html: ['**/*.html']
        });
        
        console.log(`   JavaScript: ${this.formatSize(this.stats.before.js)}`);
        console.log(`   CSS: ${this.formatSize(this.stats.before.css)}`);
        console.log(`   HTML: ${this.formatSize(this.stats.before.html)}`);
        console.log(`   TOTAL: ${this.formatSize(this.stats.before.total)}`);
    }

    /**
     * Executar build webpack com otimizações
     */
    async runWebpackBuild() {
        console.log('\n🛠️ 2. EXECUTANDO WEBPACK BUILD...');
        
        try {
            // Limpar diretório dist
            if (fs.existsSync(this.distPath)) {
                execSync(`rm -rf ${this.distPath}`);
            }
            
            // Executar webpack production build
            console.log('   📦 Running webpack...');
            const webpackOutput = execSync('npm run build:frontend', { 
                encoding: 'utf8',
                cwd: process.cwd()
            });
            
            console.log('   ✅ Webpack build concluído');
            
            // Verificar se bundle analyzer deve ser executado
            if (process.env.ANALYZE === 'true') {
                console.log('   📈 Executando bundle analyzer...');
                execSync('npm run build:frontend:analyze', { 
                    encoding: 'utf8',
                    cwd: process.cwd()
                });
                console.log('   📊 Bundle analysis disponível em: src/frontend/dist/bundle-analysis.html');
            }
            
        } catch (error) {
            console.error('❌ Erro no webpack build:', error.message);
            throw error;
        }
    }

    /**
     * Medir estado otimizado
     */
    async measureOptimizedState() {
        console.log('\n📊 3. MEDINDO ESTADO OTIMIZADO...');
        
        if (!fs.existsSync(this.distPath)) {
            throw new Error('Diretório dist não encontrado. Build falhou?');
        }
        
        this.stats.after = await this.measureDirectory(this.distPath, {
            js: ['**/*.js'],
            css: ['**/*.css'],
            html: ['**/*.html']
        });
        
        console.log(`   JavaScript: ${this.formatSize(this.stats.after.js)}`);
        console.log(`   CSS: ${this.formatSize(this.stats.after.css)}`);
        console.log(`   HTML: ${this.formatSize(this.stats.after.html)}`);
        console.log(`   TOTAL: ${this.formatSize(this.stats.after.total)}`);
        
        // Calcular redução
        this.stats.reduction.bytes = this.stats.before.total - this.stats.after.total;
        this.stats.reduction.percentage = ((this.stats.reduction.bytes / this.stats.before.total) * 100);
        
        console.log(`   REDUÇÃO: ${this.formatSize(this.stats.reduction.bytes)} (${this.stats.reduction.percentage.toFixed(1)}%)`);
    }

    /**
     * Analisar compressão gzip/brotli
     */
    async analyzeCompression() {
        console.log('\n🗜️ 4. ANALISANDO COMPRESSÃO...');
        
        let totalCompressed = 0;
        const compressibleFiles = ['.js', '.css', '.html'];
        
        const analyzeFile = (filePath) => {
            const ext = path.extname(filePath);
            if (!compressibleFiles.includes(ext)) return;
            
            try {
                const content = fs.readFileSync(filePath);
                const gzipSize = zlib.gzipSync(content).length;
                const brotliSize = zlib.brotliCompressSync(content).length;
                
                totalCompressed += Math.min(gzipSize, brotliSize);
                
                const filename = path.basename(filePath);
                const originalSize = content.length;
                const compressionRatio = ((originalSize - brotliSize) / originalSize * 100).toFixed(1);
                
                console.log(`   ${filename}: ${this.formatSize(originalSize)} → ${this.formatSize(brotliSize)} (${compressionRatio}% redução)`);
                
            } catch (error) {
                console.warn(`   ⚠️ Erro ao comprimir ${filePath}:`, error.message);
            }
        };
        
        this.walkDirectory(this.distPath, analyzeFile);
        
        this.stats.after.compressed = totalCompressed;
        
        console.log(`   TOTAL COMPRIMIDO: ${this.formatSize(totalCompressed)}`);
        
        const totalCompressionRatio = ((this.stats.before.total - totalCompressed) / this.stats.before.total * 100);
        console.log(`   COMPRESSÃO TOTAL: ${totalCompressionRatio.toFixed(1)}% redução vs original`);
    }

    /**
     * Gerar relatório final
     */
    generateReport() {
        console.log('\n📋 5. RELATÓRIO FINAL');
        console.log('='.repeat(50));
        
        const report = {
            timestamp: new Date().toISOString(),
            optimization: {
                before: this.stats.before,
                after: this.stats.after,
                reduction: this.stats.reduction
            },
            targets: {
                size_target: 300000, // 300KB
                achieved: this.stats.after.total,
                compressed_achieved: this.stats.after.compressed,
                target_met: this.stats.after.total <= 300000,
                compressed_target_met: this.stats.after.compressed <= 300000
            },
            performance: {
                original_size: this.formatSize(this.stats.before.total),
                optimized_size: this.formatSize(this.stats.after.total),
                compressed_size: this.formatSize(this.stats.after.compressed),
                reduction_percentage: this.stats.reduction.percentage.toFixed(1) + '%',
                target_percentage: '70%',
                target_achieved: this.stats.reduction.percentage >= 70
            }
        };
        
        // Salvar relatório
        const reportPath = path.join(this.distPath, 'optimization-report.json');
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
        
        console.log('📊 RESULTADOS:');
        console.log(`   Tamanho Original: ${report.performance.original_size}`);
        console.log(`   Tamanho Otimizado: ${report.performance.optimized_size}`);
        console.log(`   Tamanho Comprimido: ${report.performance.compressed_size}`);
        console.log(`   Redução Alcançada: ${report.performance.reduction_percentage}`);
        console.log(`   Target (70%): ${report.performance.target_achieved ? '✅ ATINGIDO' : '❌ NÃO ATINGIDO'}`);
        console.log(`   Size Target (<300KB): ${report.targets.compressed_target_met ? '✅ ATINGIDO' : '❌ NÃO ATINGIDO'}`);
        
        console.log(`\n💾 Relatório salvo em: ${reportPath}`);
        
        return report;
    }

    /**
     * Validar se targets foram atingidos
     */
    validateTargets() {
        console.log('\n🎯 6. VALIDAÇÃO DE TARGETS...');
        
        const targets = [
            {
                name: '70% Redução de Tamanho',
                target: 70,
                actual: this.stats.reduction.percentage,
                passed: this.stats.reduction.percentage >= 70,
                unit: '%'
            },
            {
                name: 'Tamanho Total <300KB',
                target: 300000,
                actual: this.stats.after.total,
                passed: this.stats.after.total <= 300000,
                unit: 'bytes'
            },
            {
                name: 'Tamanho Comprimido <300KB',
                target: 300000,
                actual: this.stats.after.compressed,
                passed: this.stats.after.compressed <= 300000,
                unit: 'bytes'
            }
        ];
        
        let allPassed = true;
        
        targets.forEach(target => {
            const status = target.passed ? '✅' : '❌';
            const actualDisplay = target.unit === 'bytes' ? 
                this.formatSize(target.actual) : 
                `${target.actual.toFixed(1)}${target.unit}`;
            const targetDisplay = target.unit === 'bytes' ? 
                this.formatSize(target.target) : 
                `${target.target}${target.unit}`;
                
            console.log(`   ${status} ${target.name}: ${actualDisplay} (target: ${targetDisplay})`);
            
            if (!target.passed) allPassed = false;
        });
        
        console.log(`\n🎯 RESULTADO FINAL: ${allPassed ? '✅ TODOS OS TARGETS ATINGIDOS' : '⚠️ ALGUNS TARGETS NÃO ATINGIDOS'}`);
        
        return allPassed;
    }

    /**
     * Medir tamanho de arquivos em diretório
     */
    async measureDirectory(dirPath, patterns) {
        const glob = require('glob');
        const sizes = { js: 0, css: 0, html: 0, total: 0 };
        
        for (const [type, filePatterns] of Object.entries(patterns)) {
            for (const pattern of filePatterns) {
                const files = glob.sync(pattern, { cwd: dirPath });
                
                files.forEach(file => {
                    const filePath = path.join(dirPath, file);
                    if (fs.existsSync(filePath)) {
                        const stat = fs.statSync(filePath);
                        sizes[type] += stat.size;
                        sizes.total += stat.size;
                    }
                });
            }
        }
        
        return sizes;
    }

    /**
     * Percorrer diretório recursivamente
     */
    walkDirectory(dirPath, callback) {
        if (!fs.existsSync(dirPath)) return;
        
        const items = fs.readdirSync(dirPath);
        
        items.forEach(item => {
            const itemPath = path.join(dirPath, item);
            const stat = fs.statSync(itemPath);
            
            if (stat.isDirectory()) {
                this.walkDirectory(itemPath, callback);
            } else {
                callback(itemPath);
            }
        });
    }

    /**
     * Formatar tamanho em bytes para formato legível
     */
    formatSize(bytes) {
        if (bytes === 0) return '0 B';
        
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }
}

// Executar otimização se chamado diretamente
if (require.main === module) {
    const optimizer = new BuildOptimizer();
    
    optimizer.optimize()
        .then(() => {
            console.log('\n🎉 BUILD OPTIMIZATION CONCLUÍDA!');
            process.exit(0);
        })
        .catch(error => {
            console.error('\n💥 BUILD OPTIMIZATION FALHOU:', error);
            process.exit(1);
        });
}

module.exports = BuildOptimizer;