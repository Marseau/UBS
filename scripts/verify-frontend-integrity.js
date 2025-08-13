// =====================================================
// SCRIPT DE VERIFICAÇÃO DE INTEGRIDADE DO FRONTEND
// Verifica checksums, detecta modificações e garante integridade
// =====================================================

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

class FrontendIntegrityVerifier {
    constructor() {
        this.checksumsFile = 'FRONTEND_INTEGRITY_CHECKSUMS.json';
        this.checksums = this.loadChecksums();
        this.projectRoot = process.cwd();
    }

    // =====================================================
    // CARREGAMENTO E PERSISTÊNCIA
    // =====================================================

    loadChecksums() {
        try {
            if (fs.existsSync(this.checksumsFile)) {
                const data = fs.readFileSync(this.checksumsFile, 'utf8');
                return JSON.parse(data);
            } else {
                console.log('⚠️  Arquivo de checksums não encontrado. Criando novo...');
                return this.createInitialChecksums();
            }
        } catch (error) {
            console.error('❌ Erro ao carregar checksums:', error.message);
            return this.createInitialChecksums();
        }
    }

    createInitialChecksums() {
        return {
            version: "1.0.0",
            generated_at: new Date().toISOString(),
            purpose: "Garante integridade e imutabilidade da documentação e código frontend",
            checksums: {
                documentation: {},
                frontend_files: {},
                test_files: {},
                config_files: {}
            },
            integrity_rules: {
                CRITICAL: {
                    description: "Arquivos críticos que NÃO podem ser modificados sem aprovação",
                    approval_required: true,
                    automated_testing: true,
                    rollback_on_failure: true
                },
                HIGH: {
                    description: "Arquivos importantes que requerem testes após modificação",
                    approval_required: false,
                    automated_testing: true,
                    rollback_on_failure: false
                },
                MEDIUM: {
                    description: "Arquivos que devem ser monitorados",
                    approval_required: false,
                    automated_testing: false,
                    rollback_on_failure: false
                }
            }
        };
    }

    saveChecksums() {
        try {
            this.checksums.generated_at = new Date().toISOString();
            fs.writeFileSync(this.checksumsFile, JSON.stringify(this.checksums, null, 2));
            console.log('💾 Checksums salvos com sucesso!');
        } catch (error) {
            console.error('❌ Erro ao salvar checksums:', error.message);
        }
    }

    // =====================================================
    // CÁLCULO DE CHECKSUMS
    // =====================================================

    calculateFileChecksum(filePath) {
        try {
            const absolutePath = path.resolve(this.projectRoot, filePath);
            if (!fs.existsSync(absolutePath)) {
                return null;
            }
            
            const fileBuffer = fs.readFileSync(absolutePath);
            const hashSum = crypto.createHash('sha256');
            hashSum.update(fileBuffer);
            return hashSum.digest('hex');
        } catch (error) {
            console.error(`❌ Erro ao calcular checksum para ${filePath}:`, error.message);
            return null;
        }
    }

    getFileStats(filePath) {
        try {
            const absolutePath = path.resolve(this.projectRoot, filePath);
            if (!fs.existsSync(absolutePath)) {
                return null;
            }
            
            const stats = fs.statSync(absolutePath);
            return {
                size_bytes: stats.size,
                last_modified: stats.mtime.toISOString()
            };
        } catch (error) {
            console.error(`❌ Erro ao obter stats para ${filePath}:`, error.message);
            return null;
        }
    }

    // =====================================================
    // REGISTRAR ARQUIVOS PARA MONITORAMENTO
    // =====================================================

    getFilesToMonitor() {
        return {
            documentation: {
                'MASTER_INTEGRATION_DASHBOARD_TENANT_PLATAFORMA.md': 'CRITICAL',
                'FRONTEND_INTEGRITY_ASSURANCE_SYSTEM.md': 'CRITICAL',
                'DYNAMIC_TENANT_SELECTOR_GUIDE.md': 'HIGH',
                'README.md': 'MEDIUM'
            },
            frontend_files: {
                'src/frontend/tenant-business-analytics.html': 'CRITICAL',
                'src/frontend/js/utils/component-versioning.js': 'HIGH',
                'src/frontend/css/dashboard-widgets.css': 'HIGH',
                'src/frontend/js/widgets/dashboard-widget-system.js': 'MEDIUM'
            },
            test_files: {
                'tests/visual-regression/tenant-platform.spec.js': 'HIGH',
                'tests/contract/api-contract.spec.js': 'HIGH',
                'tests/accessibility/a11y.spec.js': 'HIGH',
                'tests/performance/performance.spec.js': 'MEDIUM'
            },
            config_files: {
                'playwright.config.js': 'HIGH',
                'package.json': 'MEDIUM',
                'FRONTEND_INTEGRITY_CHECKSUMS.json': 'CRITICAL'
            }
        };
    }

    registerFilesForMonitoring() {
        console.log('📝 Registrando arquivos para monitoramento...');
        
        const filesToMonitor = this.getFilesToMonitor();
        let registeredCount = 0;
        
        Object.entries(filesToMonitor).forEach(([category, files]) => {
            if (!this.checksums.checksums[category]) {
                this.checksums.checksums[category] = {};
            }
            
            Object.entries(files).forEach(([filePath, integrityLevel]) => {
                const checksum = this.calculateFileChecksum(filePath);
                const stats = this.getFileStats(filePath);
                
                if (checksum && stats) {
                    this.checksums.checksums[category][filePath] = {
                        sha256: checksum,
                        size_bytes: stats.size_bytes,
                        last_modified: stats.last_modified,
                        integrity_level: integrityLevel,
                        registered_at: new Date().toISOString()
                    };
                    registeredCount++;
                    console.log(`✅ ${filePath} (${integrityLevel})`);
                } else {
                    console.log(`⚠️  Arquivo não encontrado: ${filePath}`);
                }
            });
        });
        
        console.log(`📊 Total de arquivos registrados: ${registeredCount}`);
        this.saveChecksums();
    }

    // =====================================================
    // VERIFICAÇÃO DE INTEGRIDADE
    // =====================================================

    verifyFileIntegrity(category, fileName, expectedData) {
        const currentChecksum = this.calculateFileChecksum(fileName);
        const currentStats = this.getFileStats(fileName);
        
        if (!currentChecksum || !currentStats) {
            return {
                status: 'MISSING',
                message: `Arquivo não encontrado: ${fileName}`,
                severity: expectedData.integrity_level
            };
        }

        if (currentChecksum !== expectedData.sha256) {
            return {
                status: 'MODIFIED',
                message: `Checksum não confere para ${fileName}`,
                expected: expectedData.sha256,
                actual: currentChecksum,
                severity: expectedData.integrity_level,
                size_change: currentStats.size_bytes - expectedData.size_bytes
            };
        }

        if (currentStats.size_bytes !== expectedData.size_bytes) {
            return {
                status: 'SIZE_CHANGED',
                message: `Tamanho do arquivo mudou para ${fileName}`,
                expected: expectedData.size_bytes,
                actual: currentStats.size_bytes,
                severity: expectedData.integrity_level
            };
        }

        return {
            status: 'OK',
            message: `Integridade verificada para ${fileName}`,
            severity: expectedData.integrity_level
        };
    }

    runFullVerification() {
        console.log('🔍 Iniciando verificação completa de integridade...\n');
        
        const results = {
            ok: [],
            warnings: [],
            critical: [],
            missing: []
        };

        const startTime = Date.now();

        // Verificar cada categoria de arquivos
        Object.entries(this.checksums.checksums).forEach(([category, files]) => {
            if (Object.keys(files).length === 0) {
                console.log(`📁 Categoria ${category}: Nenhum arquivo registrado`);
                return;
            }
            
            console.log(`📁 Verificando categoria: ${category}`);
            
            Object.entries(files).forEach(([fileName, fileData]) => {
                const result = this.verifyFileIntegrity(category, fileName, fileData);
                result.fileName = fileName;
                result.category = category;
                
                console.log(`  ${this.getStatusIcon(result.status)} ${fileName}: ${result.message}`);
                
                if (result.status === 'OK') {
                    results.ok.push(result);
                } else if (result.status === 'MISSING') {
                    results.missing.push(result);
                } else if (fileData.integrity_level === 'CRITICAL') {
                    results.critical.push(result);
                } else {
                    results.warnings.push(result);
                }
            });
            
            console.log('');
        });

        const executionTime = Date.now() - startTime;
        this.generateDetailedReport(results, executionTime);
        return results;
    }

    getStatusIcon(status) {
        const icons = {
            'OK': '✅',
            'MODIFIED': '⚠️',
            'MISSING': '❌',
            'SIZE_CHANGED': '📏'
        };
        return icons[status] || '❓';
    }

    // =====================================================
    // RELATÓRIOS DETALHADOS
    // =====================================================

    generateDetailedReport(results, executionTime) {
        console.log('📊 RELATÓRIO DETALHADO DE INTEGRIDADE');
        console.log('='.repeat(50));
        console.log(`⏱️  Tempo de execução: ${executionTime}ms`);
        console.log(`📁 Total de arquivos verificados: ${results.ok.length + results.warnings.length + results.critical.length + results.missing.length}`);
        console.log(`✅ Arquivos OK: ${results.ok.length}`);
        console.log(`⚠️  Avisos: ${results.warnings.length}`);
        console.log(`❌ Críticos: ${results.critical.length}`);
        console.log(`🔍 Ausentes: ${results.missing.length}`);
        console.log('');

        // Detalhes das violações críticas
        if (results.critical.length > 0) {
            console.log('🚨 VIOLAÇÕES CRÍTICAS:');
            results.critical.forEach(issue => {
                console.log(`  ❌ ${issue.fileName}:`);
                console.log(`     Status: ${issue.status}`);
                console.log(`     Categoria: ${issue.category}`);
                if (issue.expected && issue.actual) {
                    console.log(`     Esperado: ${issue.expected.substring(0, 16)}...`);
                    console.log(`     Atual: ${issue.actual.substring(0, 16)}...`);
                }
                if (issue.size_change) {
                    console.log(`     Mudança de tamanho: ${issue.size_change > 0 ? '+' : ''}${issue.size_change} bytes`);
                }
                console.log('');
            });
        }

        // Detalhes dos avisos
        if (results.warnings.length > 0) {
            console.log('⚠️  AVISOS:');
            results.warnings.forEach(issue => {
                console.log(`  ⚠️  ${issue.fileName}: ${issue.message}`);
                if (issue.size_change) {
                    console.log(`     Mudança de tamanho: ${issue.size_change > 0 ? '+' : ''}${issue.size_change} bytes`);
                }
            });
            console.log('');
        }

        // Arquivos ausentes
        if (results.missing.length > 0) {
            console.log('🔍 ARQUIVOS AUSENTES:');
            results.missing.forEach(issue => {
                console.log(`  🔍 ${issue.fileName}: ${issue.message}`);
            });
            console.log('');
        }

        // Salvar relatório em arquivo
        this.saveReportToFile(results, executionTime);

        // Determinar código de saída
        this.determineExitCode(results);
    }

    saveReportToFile(results, executionTime) {
        const report = {
            timestamp: new Date().toISOString(),
            execution_time_ms: executionTime,
            summary: {
                total_files: results.ok.length + results.warnings.length + results.critical.length + results.missing.length,
                ok: results.ok.length,
                warnings: results.warnings.length,
                critical: results.critical.length,
                missing: results.missing.length
            },
            details: {
                critical_violations: results.critical,
                warnings: results.warnings,
                missing_files: results.missing
            }
        };

        try {
            fs.writeFileSync('frontend-integrity-report.json', JSON.stringify(report, null, 2));
            console.log('📄 Relatório salvo em: frontend-integrity-report.json');
        } catch (error) {
            console.error('❌ Erro ao salvar relatório:', error.message);
        }
    }

    determineExitCode(results) {
        if (results.critical.length > 0) {
            console.log('❌ VERIFICAÇÃO FALHOU: Violações críticas detectadas!');
            console.log('💡 Para aprovar mudanças críticas, use: --approve-critical');
            process.exit(1);
        } else if (results.missing.length > 0) {
            console.log('⚠️  VERIFICAÇÃO COM AVISOS: Arquivos ausentes detectados.');
            console.log('💡 Para registrar novos arquivos, use: --update');
            process.exit(1);
        } else if (results.warnings.length > 0) {
            console.log('⚠️  VERIFICAÇÃO COMPLETADA COM AVISOS.');
            console.log('💡 Para aprovar mudanças, use: --approve-warnings');
            process.exit(0);
        } else {
            console.log('✅ TODOS OS ARQUIVOS PASSARAM NA VERIFICAÇÃO DE INTEGRIDADE!');
            process.exit(0);
        }
    }

    // =====================================================
    // ATUALIZAÇÃO DE CHECKSUMS
    // =====================================================

    updateChecksums(approveLevel = null) {
        console.log('📝 Atualizando checksums...');
        
        let updatedCount = 0;
        
        Object.entries(this.checksums.checksums).forEach(([category, files]) => {
            Object.entries(files).forEach(([fileName, fileData]) => {
                // Verificar se deve atualizar baseado no nível de aprovação
                if (approveLevel && fileData.integrity_level !== approveLevel && approveLevel !== 'ALL') {
                    return;
                }
                
                const newChecksum = this.calculateFileChecksum(fileName);
                const newStats = this.getFileStats(fileName);
                
                if (newChecksum && newStats) {
                    const changed = newChecksum !== fileData.sha256 || newStats.size_bytes !== fileData.size_bytes;
                    
                    this.checksums.checksums[category][fileName] = {
                        ...fileData,
                        sha256: newChecksum,
                        size_bytes: newStats.size_bytes,
                        last_modified: newStats.last_modified,
                        updated_at: new Date().toISOString()
                    };
                    
                    if (changed) {
                        console.log(`✅ Atualizado: ${fileName}`);
                        updatedCount++;
                    }
                } else {
                    console.log(`⚠️  Não foi possível atualizar: ${fileName}`);
                }
            });
        });

        if (updatedCount > 0) {
            this.saveChecksums();
            console.log(`💾 ${updatedCount} arquivos atualizados!`);
        } else {
            console.log('ℹ️  Nenhum arquivo precisou ser atualizado.');
        }
    }

    // =====================================================
    // APROVAÇÃO DE MUDANÇAS
    // =====================================================

    approveCriticalChanges() {
        console.log('🔓 Aprovando mudanças críticas...');
        this.updateChecksums('CRITICAL');
        console.log('✅ Mudanças críticas aprovadas!');
    }

    approveWarnings() {
        console.log('🔓 Aprovando avisos...');
        this.updateChecksums('HIGH');
        this.updateChecksums('MEDIUM');
        console.log('✅ Avisos aprovados!');
    }

    // =====================================================
    // UTILITÁRIOS
    // =====================================================

    showHelp() {
        console.log(`
📚 USO: node scripts/verify-frontend-integrity.js [OPÇÕES]

OPÇÕES:
  --help                    Mostra esta ajuda
  --update                  Registra todos os arquivos para monitoramento
  --verify                  Executa verificação completa (padrão)
  --approve-critical        Aprova mudanças em arquivos CRÍTICOS
  --approve-warnings        Aprova mudanças em arquivos HIGH/MEDIUM
  --approve-all             Aprova todas as mudanças
  --stats                   Mostra estatísticas dos arquivos monitorados

EXEMPLOS:
  node scripts/verify-frontend-integrity.js
  node scripts/verify-frontend-integrity.js --update
  node scripts/verify-frontend-integrity.js --approve-critical
        `);
    }

    showStats() {
        console.log('📊 ESTATÍSTICAS DE INTEGRIDADE');
        console.log('='.repeat(40));
        
        Object.entries(this.checksums.checksums).forEach(([category, files]) => {
            const fileCount = Object.keys(files).length;
            const criticalCount = Object.values(files).filter(f => f.integrity_level === 'CRITICAL').length;
            const highCount = Object.values(files).filter(f => f.integrity_level === 'HIGH').length;
            const mediumCount = Object.values(files).filter(f => f.integrity_level === 'MEDIUM').length;
            
            console.log(`\n📁 ${category.toUpperCase()}:`);
            console.log(`   Total: ${fileCount} arquivos`);
            console.log(`   🔴 Críticos: ${criticalCount}`);
            console.log(`   🟡 High: ${highCount}`);
            console.log(`   🟢 Medium: ${mediumCount}`);
        });
        
        const totalFiles = Object.values(this.checksums.checksums).reduce((sum, files) => sum + Object.keys(files).length, 0);
        console.log(`\n📊 TOTAL: ${totalFiles} arquivos monitorados`);
        console.log(`📅 Gerado em: ${this.checksums.generated_at}`);
    }
}

// =====================================================
// EXECUÇÃO PRINCIPAL
// =====================================================

function main() {
    const verifier = new FrontendIntegrityVerifier();
    const args = process.argv.slice(2);

    if (args.includes('--help')) {
        verifier.showHelp();
        return;
    }

    if (args.includes('--stats')) {
        verifier.showStats();
        return;
    }

    if (args.includes('--update')) {
        verifier.registerFilesForMonitoring();
        return;
    }

    if (args.includes('--approve-critical')) {
        verifier.approveCriticalChanges();
        return;
    }

    if (args.includes('--approve-warnings')) {
        verifier.approveWarnings();
        return;
    }

    if (args.includes('--approve-all')) {
        verifier.updateChecksums('ALL');
        return;
    }

    // Padrão: executar verificação
    verifier.runFullVerification();
}

// Executar apenas se for chamado diretamente
if (require.main === module) {
    main();
}

module.exports = FrontendIntegrityVerifier;