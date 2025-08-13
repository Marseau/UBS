/**
 * Analyze Tenant Segments Evolution - Real data for last 6 months
 * Creates stacked bar chart data showing tenant growth by business domain
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
);

async function analyzeTenantSegmentsEvolution() {
    try {
        console.log('📊 ANÁLISE EVOLUÇÃO TENANTS POR SEGMENTO - ÚLTIMOS 6 MESES');
        console.log('═'.repeat(70));
        
        // Calculate 6 months back
        const endDate = new Date();
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - 6);
        
        console.log(`📅 Período: ${startDate.toISOString().split('T')[0]} até ${endDate.toISOString().split('T')[0]}`);
        
        // Get all tenants with creation date and domain
        const { data: tenants, error } = await supabase
            .from('tenants')
            .select('id, business_name, domain, created_at, status')
            .gte('created_at', startDate.toISOString())
            .order('created_at', { ascending: true });
        
        if (error) {
            throw error;
        }
        
        console.log(`\n🏢 Total tenants criados no período: ${tenants?.length || 0}`);
        
        if (!tenants || tenants.length === 0) {
            console.log('❌ Nenhum tenant encontrado no período');
            return;
        }
        
        // Group tenants by month and domain
        const monthlyData = {};
        const domains = new Set();
        
        tenants.forEach(tenant => {
            const createdDate = new Date(tenant.created_at);
            const monthKey = createdDate.toISOString().substr(0, 7); // YYYY-MM
            const domain = tenant.domain || 'outros';
            
            domains.add(domain);
            
            if (!monthlyData[monthKey]) {
                monthlyData[monthKey] = {};
            }
            
            if (!monthlyData[monthKey][domain]) {
                monthlyData[monthKey][domain] = 0;
            }
            
            monthlyData[monthKey][domain]++;
        });
        
        // Sort months chronologically
        const sortedMonths = Object.keys(monthlyData).sort();
        const sortedDomains = Array.from(domains).sort();
        
        console.log(`\n📈 Segmentos identificados: ${sortedDomains.join(', ')}`);
        console.log(`📆 Meses com dados: ${sortedMonths.join(', ')}`);
        
        // Create stacked bar chart data structure
        const chartData = {
            labels: sortedMonths.map(month => {
                const date = new Date(month + '-01');
                return date.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
            }),
            datasets: []
        };
        
        // Color palette for different domains
        const colors = [
            '#2D5A9B', // Azul
            '#28a745', // Verde
            '#ffc107', // Amarelo
            '#dc3545', // Vermelho
            '#17a2b8', // Ciano
            '#6f42c1', // Roxo
            '#fd7e14', // Laranja
            '#20c997'  // Verde claro
        ];
        
        // Create dataset for each domain
        sortedDomains.forEach((domain, index) => {
            const data = sortedMonths.map(month => monthlyData[month][domain] || 0);
            
            chartData.datasets.push({
                label: domain,
                data: data,
                backgroundColor: colors[index % colors.length],
                borderColor: colors[index % colors.length],
                borderWidth: 1
            });
        });
        
        // Display data in table format
        console.log('\n📊 DADOS PARA GRÁFICO STACKED BAR:');
        console.log('═'.repeat(70));
        console.log('Mês'.padEnd(15) + sortedDomains.map(d => d.padEnd(12)).join('') + 'Total');
        console.log('─'.repeat(70));
        
        sortedMonths.forEach(month => {
            const monthLabel = new Date(month + '-01').toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
            let total = 0;
            let row = monthLabel.padEnd(15);
            
            sortedDomains.forEach(domain => {
                const count = monthlyData[month][domain] || 0;
                total += count;
                row += count.toString().padEnd(12);
            });
            
            row += total.toString();
            console.log(row);
        });
        
        // Calculate totals by domain
        console.log('\n📈 TOTAIS POR SEGMENTO:');
        console.log('─'.repeat(40));
        const domainTotals = {};
        let grandTotal = 0;
        
        sortedDomains.forEach(domain => {
            let domainTotal = 0;
            sortedMonths.forEach(month => {
                domainTotal += monthlyData[month][domain] || 0;
            });
            domainTotals[domain] = domainTotal;
            grandTotal += domainTotal;
            console.log(`${domain}: ${domainTotal} tenants`);
        });
        
        console.log(`\nTotal Geral: ${grandTotal} tenants`);
        
        // Growth analysis
        console.log('\n📊 ANÁLISE DE CRESCIMENTO:');
        console.log('─'.repeat(50));
        
        if (sortedMonths.length >= 2) {
            const firstMonth = sortedMonths[0];
            const lastMonth = sortedMonths[sortedMonths.length - 1];
            
            const firstTotal = Object.values(monthlyData[firstMonth]).reduce((sum, count) => sum + count, 0);
            const lastTotal = Object.values(monthlyData[lastMonth]).reduce((sum, count) => sum + count, 0);
            
            const growthRate = firstTotal > 0 ? ((lastTotal - firstTotal) / firstTotal * 100).toFixed(1) : 'N/A';
            
            console.log(`Crescimento total: ${firstTotal} → ${lastTotal} tenants (${growthRate}%)`);
            
            // Growth by domain
            sortedDomains.forEach(domain => {
                const firstCount = monthlyData[firstMonth][domain] || 0;
                const lastCount = monthlyData[lastMonth][domain] || 0;
                const domainGrowth = firstCount > 0 ? ((lastCount - firstCount) / firstCount * 100).toFixed(1) : 'N/A';
                console.log(`${domain}: ${firstCount} → ${lastCount} (${domainGrowth}%)`);
            });
        }
        
        // Return chart data for implementation
        return {
            chartData,
            monthlyData,
            domains: sortedDomains,
            months: sortedMonths,
            totals: domainTotals,
            grandTotal
        };
        
    } catch (error) {
        console.error('❌ Erro na análise:', error);
        throw error;
    }
}

// Execute analysis
if (require.main === module) {
    analyzeTenantSegmentsEvolution()
        .then((result) => {
            console.log('\n✅ Análise de evolução por segmento concluída!');
            console.log('📊 Dados prontos para implementação do gráfico stacked bar');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n💥 Análise falhou:', error);
            process.exit(1);
        });
}

module.exports = { analyzeTenantSegmentsEvolution };