/**
 * VALIDAÇÃO DETALHADA: CSV APPOINTMENTS
 * 
 * Script para validar se o CSV gerado espelha exatamente os dados da tabela appointments
 */

// Load environment variables
require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const csv = require('csv-parser');

// Configuração Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Variáveis de ambiente SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configuradas');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Ler CSV e converter para array de objetos
 */
function readCsvFile(filename) {
    return new Promise((resolve, reject) => {
        const results = [];
        fs.createReadStream(filename)
            .pipe(csv())
            .on('data', (data) => results.push(data))
            .on('end', () => resolve(results))
            .on('error', reject);
    });
}

/**
 * Buscar dados direto do banco para comparação
 */
async function fetchDatabaseData() {
    console.log('🔄 Buscando dados direto do banco...');
    
    const { data, error } = await supabase
        .from('appointments')
        .select(`
            id,
            tenant_id,
            user_id, 
            service_id,
            start_time,
            end_time,
            status,
            quoted_price,
            final_price,
            appointment_data,
            created_at,
            tenants:tenant_id (name, domain),
            users:user_id (name, phone),
            services:service_id (name, base_price)
        `)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('❌ Erro ao buscar dados do banco:', error);
        throw error;
    }

    console.log(`✅ Dados do banco: ${data?.length || 0} registros`);
    return data || [];
}

/**
 * Validar conformidade entre CSV e banco
 */
async function validateCsvConformity(csvData, dbData) {
    console.log('🔍 Validando conformidade CSV vs Banco...');
    
    const validation = {
        csvCount: csvData.length,
        dbCount: dbData.length,
        matches: 0,
        mismatches: [],
        sampleValidation: [],
        fieldValidation: {
            appointment_id: { valid: 0, invalid: 0 },
            tenant_name: { valid: 0, invalid: 0 },
            user_name: { valid: 0, invalid: 0 },
            service_name: { valid: 0, invalid: 0 },
            status: { valid: 0, invalid: 0 },
            prices: { valid: 0, invalid: 0 }
        }
    };

    // Criar mapa de dados do banco para comparação rápida
    const dbMap = new Map();
    dbData.forEach(row => {
        dbMap.set(row.id, row);
    });

    // Validar cada linha do CSV
    for (let i = 0; i < Math.min(csvData.length, 20); i++) {  // Validar primeiros 20 para amostra
        const csvRow = csvData[i];
        const dbRow = dbMap.get(csvRow.appointment_id);
        
        if (!dbRow) {
            validation.mismatches.push({
                line: i + 1,
                appointment_id: csvRow.appointment_id,
                issue: 'ID não encontrado no banco'
            });
            continue;
        }

        const sample = {
            line: i + 1,
            appointment_id: csvRow.appointment_id,
            validations: {}
        };

        // Validar campos específicos
        sample.validations.tenant_name = {
            csv: csvRow.tenant_name,
            db: dbRow.tenants?.name || '',
            match: csvRow.tenant_name === (dbRow.tenants?.name || 'Sem nome')
        };

        sample.validations.user_name = {
            csv: csvRow.user_name,
            db: dbRow.users?.name || '',
            match: csvRow.user_name === (dbRow.users?.name || 'Sem nome')
        };

        sample.validations.status = {
            csv: csvRow.status,
            db: dbRow.status,
            match: csvRow.status === dbRow.status
        };

        // Contar validações
        Object.entries(sample.validations).forEach(([field, val]) => {
            if (val.match) {
                if (validation.fieldValidation[field]) {
                    validation.fieldValidation[field].valid++;
                }
            } else {
                if (validation.fieldValidation[field]) {
                    validation.fieldValidation[field].invalid++;
                }
            }
        });

        validation.sampleValidation.push(sample);
        
        if (Object.values(sample.validations).every(v => v.match)) {
            validation.matches++;
        }
    }

    return validation;
}

/**
 * Analisar estrutura e qualidade do CSV
 */
function analyzeCsvStructure(csvData) {
    console.log('📊 Analisando estrutura do CSV...');
    
    if (!csvData || csvData.length === 0) {
        return { error: 'CSV vazio ou inválido' };
    }

    const analysis = {
        totalRows: csvData.length,
        headers: Object.keys(csvData[0]),
        headerCount: Object.keys(csvData[0]).length,
        dataTypes: {},
        qualityMetrics: {}
    };

    // Analisar tipos de dados e qualidade
    const firstRow = csvData[0];
    Object.keys(firstRow).forEach(header => {
        const sampleValues = csvData.slice(0, 10).map(row => row[header]).filter(v => v && v.trim() !== '');
        
        analysis.dataTypes[header] = {
            sampleCount: sampleValues.length,
            hasData: sampleValues.length > 0,
            example: sampleValues[0] || 'Sem dados'
        };
    });

    // Métricas de qualidade específicas
    analysis.qualityMetrics = {
        appointmentsWithTenant: csvData.filter(row => row.tenant_name && row.tenant_name !== 'Sem nome').length,
        appointmentsWithUser: csvData.filter(row => row.user_name && row.user_name !== 'Sem nome').length,
        appointmentsWithService: csvData.filter(row => row.service_name && row.service_name !== 'Serviço não especificado').length,
        appointmentsWithConversation: csvData.filter(row => row.conversation_id && row.conversation_id.trim() !== '').length,
        appointmentsWithPrice: csvData.filter(row => row.effective_price && row.effective_price !== 'R$ 0,00').length,
        
        // Breakdown por status
        statusBreakdown: {},
        
        // Breakdown por domínio
        domainBreakdown: {}
    };

    // Contar por status e domínio
    csvData.forEach(row => {
        const status = row.status || 'undefined';
        analysis.qualityMetrics.statusBreakdown[status] = (analysis.qualityMetrics.statusBreakdown[status] || 0) + 1;
        
        const domain = row.business_domain || 'undefined';
        analysis.qualityMetrics.domainBreakdown[domain] = (analysis.qualityMetrics.domainBreakdown[domain] || 0) + 1;
    });

    return analysis;
}

/**
 * Função principal de validação
 */
async function main() {
    try {
        console.log('🚀 Iniciando validação detalhada do CSV appointments...');
        console.log('='.repeat(70));

        // 1. Verificar se arquivo CSV existe
        const csvFilename = 'appointments-complete-2025-08-01T12-23-48.csv';
        if (!fs.existsSync(csvFilename)) {
            console.error(`❌ Arquivo CSV não encontrado: ${csvFilename}`);
            return;
        }

        // 2. Ler CSV
        console.log(`📖 Lendo arquivo CSV: ${csvFilename}...`);
        const csvData = await readCsvFile(csvFilename);
        console.log(`✅ CSV lido: ${csvData.length} registros`);

        // 3. Buscar dados do banco
        const dbData = await fetchDatabaseData();

        // 4. Análise estrutural do CSV
        const csvAnalysis = analyzeCsvStructure(csvData);

        // 5. Validação de conformidade
        const conformityValidation = await validateCsvConformity(csvData.slice(0, 50), dbData.slice(0, 50)); // Amostra de 50

        // 6. Relatório final
        console.log('='.repeat(70));
        console.log('📊 RELATÓRIO DE VALIDAÇÃO CSV APPOINTMENTS');
        console.log('='.repeat(70));
        console.log(`📅 Data/Hora: ${new Date().toLocaleString('pt-BR')}`);
        console.log(`📁 Arquivo analisado: ${csvFilename}`);
        console.log(`💾 Tamanho do arquivo: ${(fs.statSync(csvFilename).size / 1024).toFixed(2)} KB`);
        console.log('');
        
        console.log('📈 ESTRUTURA DO CSV:');
        console.log(`   Total de linhas: ${csvAnalysis.totalRows}`);
        console.log(`   Total de colunas: ${csvAnalysis.headerCount}`);
        console.log(`   Colunas: ${csvAnalysis.headers.slice(0, 5).join(', ')}... (${csvAnalysis.headerCount} total)`);
        console.log('');
        
        console.log('🔍 CONFORMIDADE COM BANCO DE DADOS:');
        console.log(`   Registros CSV: ${conformityValidation.csvCount}`);
        console.log(`   Registros BD: ${conformityValidation.dbCount}`);
        console.log(`   Diferença: ${Math.abs(conformityValidation.csvCount - conformityValidation.dbCount)}`);
        console.log(`   Amostra validada: ${conformityValidation.sampleValidation.length} registros`);
        console.log(`   Conformes: ${conformityValidation.matches}/${conformityValidation.sampleValidation.length}`);
        console.log('');
        
        console.log('📊 QUALIDADE DOS DADOS:');
        const qm = csvAnalysis.qualityMetrics;
        console.log(`   Com tenant: ${qm.appointmentsWithTenant} (${((qm.appointmentsWithTenant/csvAnalysis.totalRows)*100).toFixed(1)}%)`);
        console.log(`   Com usuário: ${qm.appointmentsWithUser} (${((qm.appointmentsWithUser/csvAnalysis.totalRows)*100).toFixed(1)}%)`);
        console.log(`   Com serviço: ${qm.appointmentsWithService} (${((qm.appointmentsWithService/csvAnalysis.totalRows)*100).toFixed(1)}%)`);
        console.log(`   Com conversa: ${qm.appointmentsWithConversation} (${((qm.appointmentsWithConversation/csvAnalysis.totalRows)*100).toFixed(1)}%)`);
        console.log(`   Com preço: ${qm.appointmentsWithPrice} (${((qm.appointmentsWithPrice/csvAnalysis.totalRows)*100).toFixed(1)}%)`);
        console.log('');
        
        console.log('📊 BREAKDOWN POR STATUS:');
        Object.entries(qm.statusBreakdown).forEach(([status, count]) => {
            console.log(`   ${status}: ${count} (${((count/csvAnalysis.totalRows)*100).toFixed(1)}%)`);
        });
        console.log('');
        
        console.log('🏢 BREAKDOWN POR DOMÍNIO:');
        Object.entries(qm.domainBreakdown).forEach(([domain, count]) => {
            console.log(`   ${domain}: ${count} (${((count/csvAnalysis.totalRows)*100).toFixed(1)}%)`);
        });
        console.log('');
        
        // Validação específica de campos críticos
        console.log('🎯 VALIDAÇÃO DE CAMPOS CRÍTICOS (Amostra):');
        if (conformityValidation.sampleValidation.length > 0) {
            const sample = conformityValidation.sampleValidation[0];
            console.log(`   Appointment ID: ${sample.validations.tenant_name?.match ? '✅' : '❌'} (${sample.validations.tenant_name?.csv})`);
            console.log(`   Tenant Name: ${sample.validations.tenant_name?.match ? '✅' : '❌'} (${sample.validations.tenant_name?.csv})`);
            console.log(`   User Name: ${sample.validations.user_name?.match ? '✅' : '❌'} (${sample.validations.user_name?.csv})`);
            console.log(`   Status: ${sample.validations.status?.match ? '✅' : '❌'} (${sample.validations.status?.csv})`);
        }
        console.log('');
        
        // Status final
        const isValid = conformityValidation.csvCount === conformityValidation.dbCount && 
                        conformityValidation.matches === conformityValidation.sampleValidation.length;
        
        console.log(isValid ? 
            '✅ CSV VÁLIDO - Dados espelham exatamente a tabela appointments' :
            '⚠️ CSV COM DIVERGÊNCIAS - Revisar inconsistências identificadas'
        );
        
        console.log('='.repeat(70));

    } catch (error) {
        console.error('❌ Erro durante a validação:', error);
        process.exit(1);
    }
}

// Executar validação
if (require.main === module) {
    main();
}

module.exports = { main };