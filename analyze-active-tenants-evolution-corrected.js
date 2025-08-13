/**
 * Analyze Active Tenants Evolution - CORRECTED VERSION
 * Shows ACTIVE tenants accumulated by segment over last 6 months
 * Each month shows the total active tenants up to that point (cumulative)
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
);

async function analyzeActiveTenantsCumulativeEvolution() {
    try {
        console.log('📊 ANÁLISE CORRIGIDA - TENANTS ATIVOS ACUMULADOS POR SEGMENTO');
        console.log('═'.repeat(70));
        console.log('🔄 Lógica: Tenants ativos acumulados mês a mês (não apenas criados)');
        
        // Calculate 6 months back
        const endDate = new Date();
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - 6);
        
        console.log(`📅 Período: ${startDate.toISOString().split('T')[0]} até ${endDate.toISOString().split('T')[0]}`);
        
        // Get ALL tenants that were created before end date and are active
        const { data: allTenants, error } = await supabase
            .from('tenants')
            .select('id, business_name, domain, created_at, status')
            .eq('status', 'active')  // Only active tenants
            .lte('created_at', endDate.toISOString())
            .order('created_at', { ascending: true });
        
        if (error) {
            throw error;
        }
        
        console.log(`\n🏢 Total tenants ativos encontrados: ${allTenants?.length || 0}`);
        
        if (!allTenants || allTenants.length === 0) {
            console.log('❌ Nenhum tenant ativo encontrado');
            return;
        }
        
        // Generate monthly snapshots for the last 6 months
        const monthlySnapshots = [];
        const currentDate = new Date(startDate);
        
        while (currentDate <= endDate) {
            const monthKey = currentDate.toISOString().substr(0, 7); // YYYY-MM
            const monthEndDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0); // Last day of month
            
            // Get tenants that were active by the end of this month
            const activeByMonth = allTenants.filter(tenant => {
                const createdDate = new Date(tenant.created_at);
                return createdDate <= monthEndDate;
            });
            
            monthlySnapshots.push({
                monthKey,
                monthLabel: currentDate.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }),
                tenants: activeByMonth
            });
            
            // Move to next month
            currentDate.setMonth(currentDate.getMonth() + 1);
        }
        
        console.log(`\n📅 Snapshots gerados para ${monthlySnapshots.length} meses`);
        
        // Group tenants by month and domain (cumulative)
        const monthlyData = {};
        const domains = new Set();
        
        monthlySnapshots.forEach(snapshot => {
            const domainCounts = {};
            
            snapshot.tenants.forEach(tenant => {
                const domain = tenant.domain || 'outros';
                domains.add(domain);
                domainCounts[domain] = (domainCounts[domain] || 0) + 1;
            });
            
            monthlyData[snapshot.monthKey] = {
                label: snapshot.monthLabel,
                domains: domainCounts,
                total: snapshot.tenants.length
            };
        });
        
        const sortedMonths = Object.keys(monthlyData).sort();
        const sortedDomains = Array.from(domains).sort();
        
        console.log(`\n📈 Segmentos identificados: ${sortedDomains.join(', ')}`);
        
        // Display cumulative data in table format
        console.log('\n📊 TENANTS ATIVOS ACUMULADOS (CORRETO):');
        console.log('═'.repeat(70));
        console.log('Mês'.padEnd(15) + sortedDomains.map(d => d.padEnd(12)).join('') + 'Total');
        console.log('─'.repeat(70));
        
        sortedMonths.forEach(month => {
            const monthData = monthlyData[month];
            let row = monthData.label.padEnd(15);
            
            sortedDomains.forEach(domain => {
                const count = monthData.domains[domain] || 0;
                row += count.toString().padEnd(12);
            });
            
            row += monthData.total.toString();
            console.log(row);
        });
        
        // Create stacked bar chart data structure
        const chartData = {
            labels: sortedMonths.map(month => monthlyData[month].label),
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
            const data = sortedMonths.map(month => monthlyData[month].domains[domain] || 0);
            
            chartData.datasets.push({
                label: domain,
                data: data,
                backgroundColor: colors[index % colors.length],
                borderColor: colors[index % colors.length],
                borderWidth: 1
            });
        });
        
        // Calculate current totals by domain
        console.log('\n📈 TOTAIS ATUAIS POR SEGMENTO:');
        console.log('─'.repeat(40));
        const currentMonth = sortedMonths[sortedMonths.length - 1];
        const currentData = monthlyData[currentMonth];
        
        sortedDomains.forEach(domain => {
            const count = currentData.domains[domain] || 0;
            console.log(`${domain}: ${count} tenants ativos`);
        });
        
        console.log(`\nTotal Atual: ${currentData.total} tenants ativos`);
        
        // Growth analysis (corrected)
        console.log('\n📊 ANÁLISE DE CRESCIMENTO CORRETO:');
        console.log('─'.repeat(50));
        
        if (sortedMonths.length >= 2) {
            const firstMonth = sortedMonths[0];
            const lastMonth = sortedMonths[sortedMonths.length - 1];
            
            const firstTotal = monthlyData[firstMonth].total;
            const lastTotal = monthlyData[lastMonth].total;
            
            const growthRate = firstTotal > 0 ? ((lastTotal - firstTotal) / firstTotal * 100).toFixed(1) : 'N/A';
            
            console.log(`Crescimento total: ${firstTotal} → ${lastTotal} tenants (${growthRate}%)`);
            
            // Growth by domain
            sortedDomains.forEach(domain => {
                const firstCount = monthlyData[firstMonth].domains[domain] || 0;
                const lastCount = monthlyData[lastMonth].domains[domain] || 0;
                const domainGrowth = firstCount > 0 ? ((lastCount - firstCount) / firstCount * 100).toFixed(1) : 
                                   lastCount > 0 ? 'Novo segmento' : '0.0';
                console.log(`${domain}: ${firstCount} → ${lastCount} (${domainGrowth}%)`);
            });
        }
        
        // Return chart data for implementation
        return {
            chartData,
            monthlyData,
            domains: sortedDomains,
            months: sortedMonths,
            currentTotals: currentData.domains,
            grandTotal: currentData.total,
            growthRate: sortedMonths.length >= 2 ? 
                ((monthlyData[sortedMonths[sortedMonths.length - 1]].total - monthlyData[sortedMonths[0]].total) / 
                 monthlyData[sortedMonths[0]].total * 100) : 0
        };
        
    } catch (error) {
        console.error('❌ Erro na análise:', error);
        throw error;
    }
}

// Execute analysis
if (require.main === module) {
    analyzeActiveTenantsCumulativeEvolution()
        .then((result) => {
            console.log('\n✅ Análise CORRIGIDA de evolução por segmento concluída!');
            console.log('📊 Dados acumulados prontos para gráfico stacked bar');
            console.log(`🎯 Growth rate: ${result.growthRate.toFixed(1)}%`);
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n💥 Análise falhou:', error);
            process.exit(1);
        });
}

module.exports = { analyzeActiveTenantsCumulativeEvolution };