#!/usr/bin/env node

/**
 * SIMPLE MINIFICATION SCRIPT
 * Minificação direta dos arquivos JavaScript e CSS
 * Target: 965KB → <300KB (70% reduction)
 */

const fs = require('fs');
const path = require('path');
const { minify } = require('terser');
const CleanCSS = require('clean-css');
const zlib = require('zlib');

class SimpleMinifier {
    constructor() {
        this.frontendPath = path.join(process.cwd(), 'src/frontend');
        this.distPath = path.join(process.cwd(), 'src/frontend/dist');
        this.stats = {
            before: { js: 0, css: 0, total: 0 },
            after: { js: 0, css: 0, total: 0, compressed: 0 },
            reduction: { percentage: 0, bytes: 0 }
        };
    }

    /**
     * Executar minificação simples
     */
    async optimize() {
        console.log('🚀 SIMPLE MINIFICATION PIPELINE');
        console.log('='.repeat(50));
        
        try {
            // 1. Criar diretório dist
            this.ensureDistDirectory();
            
            // 2. Medir estado atual
            await this.measureCurrentState();
            
            // 3. Minificar JavaScript
            await this.minifyJavaScript();
            
            // 4. Minificar CSS
            await this.minifyCSS();
            
            // 5. Medir estado otimizado
            await this.measureOptimizedState();
            
            // 6. Analisar compressão
            await this.analyzeCompression();
            
            // 7. Relatório final
            this.generateReport();
            
            return this.stats;
            
        } catch (error) {
            console.error('❌ Erro na minificação:', error);
            throw error;
        }
    }

    /**
     * Garantir que diretório dist existe
     */
    ensureDistDirectory() {
        if (fs.existsSync(this.distPath)) {
            fs.rmSync(this.distPath, { recursive: true });
        }
        fs.mkdirSync(this.distPath, { recursive: true });
        fs.mkdirSync(path.join(this.distPath, 'js'), { recursive: true });
        fs.mkdirSync(path.join(this.distPath, 'css'), { recursive: true });
    }

    /**
     * Medir estado atual dos arquivos
     */
    async measureCurrentState() {
        console.log('📊 1. MEDINDO ESTADO ATUAL...');
        
        const jsFiles = this.findFiles(path.join(this.frontendPath, 'js'), '.js');
        const cssFiles = this.findFiles(path.join(this.frontendPath, 'css'), '.css');
        
        jsFiles.forEach(file => {
            this.stats.before.js += fs.statSync(file).size;
        });
        
        cssFiles.forEach(file => {
            this.stats.before.css += fs.statSync(file).size;
        });
        
        this.stats.before.total = this.stats.before.js + this.stats.before.css;
        
        console.log(`   JavaScript: ${this.formatSize(this.stats.before.js)} (${jsFiles.length} arquivos)`);
        console.log(`   CSS: ${this.formatSize(this.stats.before.css)} (${cssFiles.length} arquivos)`);
        console.log(`   TOTAL: ${this.formatSize(this.stats.before.total)}`);
    }

    /**
     * Minificar todos os arquivos JavaScript
     */
    async minifyJavaScript() {
        console.log('\n🔧 2. MINIFICANDO JAVASCRIPT...');
        
        const jsFiles = this.findFiles(path.join(this.frontendPath, 'js'), '.js');
        
        // Agrupar arquivos por categoria para bundling
        const bundles = {
            'dashboard-bundle': [
                'dashboard.js',
                'dashboard-main.js'
            ],
            'analytics-bundle': [
                'tenant-business-analytics.js',
                'strategic-appointments.js',
                'strategic-customers-analytics.js',
                'strategic-services-analytics.js'
            ],
            'widgets-bundle': [
                'widgets/dashboard-widget-system.js',
                'widgets/doughnut-chart-widget.js',
                'widgets/stat-card-widget.js',
                'widgets/heatmap-widget.js',
                'widgets/conversations-panel-widget.js'
            ],
            'utils-bundle': [
                'utils/common-utils.js',
                'utils/component-versioning.js',
                'utils/keyboard-navigation.js',
                'utils/secure-auth.js'
            ],
            'admin-bundle': [
                'super-admin-dashboard.js',
                'settings.js',
                'register.js'
            ]
        };

        for (const [bundleName, fileNames] of Object.entries(bundles)) {
            await this.createBundle(bundleName, fileNames);
        }
        
        // Minificar arquivos individuais importantes
        const individualFiles = [
            'appointments.js',
            'customers.js',
            'services.js',
            'login.js',
            'error-handler.js',
            'auth-guard.js'
        ];
        
        for (const fileName of individualFiles) {
            await this.minifyIndividualFile(fileName);
        }
    }

    /**
     * Criar bundle minificado
     */
    async createBundle(bundleName, fileNames) {
        console.log(`   📦 Criando bundle: ${bundleName}`);
        
        let combinedCode = '';
        let filesProcessed = 0;
        
        for (const fileName of fileNames) {
            const filePath = path.join(this.frontendPath, 'js', fileName);
            
            if (fs.existsSync(filePath)) {
                const code = fs.readFileSync(filePath, 'utf8');
                combinedCode += `\n/* ${fileName} */\n${code}\n`;
                filesProcessed++;
            }
        }
        
        if (combinedCode) {
            try {
                const minified = await minify(combinedCode, {
                    compress: {
                        drop_console: true,
                        drop_debugger: true,
                        pure_funcs: ['console.log', 'console.info', 'console.debug']
                    },
                    mangle: true,
                    format: {
                        comments: false
                    }
                });
                
                if (minified.code) {
                    const outputPath = path.join(this.distPath, 'js', `${bundleName}.min.js`);
                    fs.writeFileSync(outputPath, minified.code);
                    
                    const originalSize = Buffer.byteLength(combinedCode, 'utf8');
                    const minifiedSize = Buffer.byteLength(minified.code, 'utf8');
                    const reduction = ((originalSize - minifiedSize) / originalSize * 100).toFixed(1);
                    
                    console.log(`     ✅ ${bundleName}: ${this.formatSize(originalSize)} → ${this.formatSize(minifiedSize)} (${reduction}% redução, ${filesProcessed} arquivos)`);
                }
            } catch (error) {
                console.warn(`     ⚠️ Erro ao minificar ${bundleName}:`, error.message);
            }
        }
    }

    /**
     * Minificar arquivo individual
     */
    async minifyIndividualFile(fileName) {
        const filePath = path.join(this.frontendPath, 'js', fileName);
        
        if (!fs.existsSync(filePath)) return;
        
        try {
            const code = fs.readFileSync(filePath, 'utf8');
            const minified = await minify(code, {
                compress: {
                    drop_console: true,
                    drop_debugger: true
                },
                mangle: true,
                format: {
                    comments: false
                }
            });
            
            if (minified.code) {
                const outputPath = path.join(this.distPath, 'js', fileName.replace('.js', '.min.js'));
                fs.writeFileSync(outputPath, minified.code);
                
                const originalSize = Buffer.byteLength(code, 'utf8');
                const minifiedSize = Buffer.byteLength(minified.code, 'utf8');
                const reduction = ((originalSize - minifiedSize) / originalSize * 100).toFixed(1);
                
                console.log(`     ✅ ${fileName}: ${this.formatSize(originalSize)} → ${this.formatSize(minifiedSize)} (${reduction}% redução)`);
            }
        } catch (error) {
            console.warn(`     ⚠️ Erro ao minificar ${fileName}:`, error.message);
        }
    }

    /**
     * Minificar CSS
     */
    async minifyCSS() {
        console.log('\n🎨 3. MINIFICANDO CSS...');
        
        const cssFiles = this.findFiles(path.join(this.frontendPath, 'css'), '.css');
        const cleanCSS = new CleanCSS({
            level: 2,
            returnPromise: false
        });
        
        // Criar bundle CSS principal
        let combinedCSS = '';
        cssFiles.forEach(file => {
            const content = fs.readFileSync(file, 'utf8');
            const fileName = path.basename(file);
            combinedCSS += `\n/* ${fileName} */\n${content}\n`;
        });
        
        try {
            const minified = cleanCSS.minify(combinedCSS);
            
            if (!minified.errors.length) {
                const outputPath = path.join(this.distPath, 'css', 'styles-bundle.min.css');
                fs.writeFileSync(outputPath, minified.styles);
                
                const originalSize = Buffer.byteLength(combinedCSS, 'utf8');
                const minifiedSize = Buffer.byteLength(minified.styles, 'utf8');
                const reduction = ((originalSize - minifiedSize) / originalSize * 100).toFixed(1);
                
                console.log(`   ✅ CSS Bundle: ${this.formatSize(originalSize)} → ${this.formatSize(minifiedSize)} (${reduction}% redução, ${cssFiles.length} arquivos)`);
            } else {
                console.error('   ❌ Erro na minificação CSS:', minified.errors);
            }
        } catch (error) {
            console.error('   ❌ Erro na minificação CSS:', error);
        }
    }

    /**
     * Medir estado otimizado
     */
    async measureOptimizedState() {
        console.log('\n📊 4. MEDINDO ESTADO OTIMIZADO...');
        
        const jsFiles = this.findFiles(path.join(this.distPath, 'js'), '.js');
        const cssFiles = this.findFiles(path.join(this.distPath, 'css'), '.css');
        
        jsFiles.forEach(file => {
            this.stats.after.js += fs.statSync(file).size;
        });
        
        cssFiles.forEach(file => {
            this.stats.after.css += fs.statSync(file).size;
        });
        
        this.stats.after.total = this.stats.after.js + this.stats.after.css;
        
        // Calcular redução
        this.stats.reduction.bytes = this.stats.before.total - this.stats.after.total;
        this.stats.reduction.percentage = ((this.stats.reduction.bytes / this.stats.before.total) * 100);
        
        console.log(`   JavaScript: ${this.formatSize(this.stats.after.js)}`);
        console.log(`   CSS: ${this.formatSize(this.stats.after.css)}`);
        console.log(`   TOTAL: ${this.formatSize(this.stats.after.total)}`);
        console.log(`   REDUÇÃO: ${this.formatSize(this.stats.reduction.bytes)} (${this.stats.reduction.percentage.toFixed(1)}%)`);
    }

    /**
     * Analisar compressão gzip
     */
    async analyzeCompression() {
        console.log('\n🗜️ 5. ANALISANDO COMPRESSÃO...');
        
        const allFiles = [
            ...this.findFiles(path.join(this.distPath, 'js'), '.js'),
            ...this.findFiles(path.join(this.distPath, 'css'), '.css')
        ];
        
        let totalCompressed = 0;
        
        allFiles.forEach(file => {
            const content = fs.readFileSync(file);
            const gzipSize = zlib.gzipSync(content).length;
            totalCompressed += gzipSize;
            
            const fileName = path.basename(file);
            const originalSize = content.length;
            const compressionRatio = ((originalSize - gzipSize) / originalSize * 100).toFixed(1);
            
            console.log(`   ${fileName}: ${this.formatSize(originalSize)} → ${this.formatSize(gzipSize)} (${compressionRatio}% compressão)`);
        });
        
        this.stats.after.compressed = totalCompressed;
        
        console.log(`   TOTAL COMPRIMIDO: ${this.formatSize(totalCompressed)}`);
        
        const totalCompressionRatio = ((this.stats.before.total - totalCompressed) / this.stats.before.total * 100);
        console.log(`   COMPRESSÃO vs ORIGINAL: ${totalCompressionRatio.toFixed(1)}% redução`);
    }

    /**
     * Gerar relatório final
     */
    generateReport() {
        console.log('\n📋 6. RELATÓRIO FINAL');
        console.log('='.repeat(50));
        
        const report = {
            timestamp: new Date().toISOString(),
            original_size: this.stats.before.total,
            minified_size: this.stats.after.total,
            compressed_size: this.stats.after.compressed,
            reduction_percentage: this.stats.reduction.percentage,
            target_300kb: this.stats.after.compressed <= 300000,
            target_70_percent: this.stats.reduction.percentage >= 70
        };
        
        console.log('📊 RESULTADOS:');
        console.log(`   Tamanho Original: ${this.formatSize(this.stats.before.total)}`);
        console.log(`   Tamanho Minificado: ${this.formatSize(this.stats.after.total)}`);
        console.log(`   Tamanho Comprimido: ${this.formatSize(this.stats.after.compressed)}`);
        console.log(`   Redução: ${this.stats.reduction.percentage.toFixed(1)}%`);
        console.log(`   Target 70%: ${report.target_70_percent ? '✅ ATINGIDO' : '❌ NÃO ATINGIDO'}`);
        console.log(`   Target <300KB: ${report.target_300kb ? '✅ ATINGIDO' : '❌ NÃO ATINGIDO'}`);
        
        // Salvar relatório
        const reportPath = path.join(this.distPath, 'minification-report.json');
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
        
        return report;
    }

    /**
     * Encontrar arquivos por extensão
     */
    findFiles(directory, extension) {
        const files = [];
        
        if (!fs.existsSync(directory)) return files;
        
        const items = fs.readdirSync(directory);
        
        items.forEach(item => {
            const itemPath = path.join(directory, item);
            const stat = fs.statSync(itemPath);
            
            if (stat.isDirectory()) {
                files.push(...this.findFiles(itemPath, extension));
            } else if (item.endsWith(extension)) {
                files.push(itemPath);
            }
        });
        
        return files;
    }

    /**
     * Formatar tamanho em bytes
     */
    formatSize(bytes) {
        if (bytes === 0) return '0 B';
        
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }
}

// Executar se chamado diretamente
if (require.main === module) {
    const minifier = new SimpleMinifier();
    
    minifier.optimize()
        .then(stats => {
            console.log('\n🎉 MINIFICAÇÃO CONCLUÍDA!');
            process.exit(0);
        })
        .catch(error => {
            console.error('\n💥 MINIFICAÇÃO FALHOU:', error);
            process.exit(1);
        });
}

module.exports = SimpleMinifier;