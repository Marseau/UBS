import { getAdminClient } from "./dist/config/database.js";

const client = getAdminClient();

async function debugPlatformMetrics() {
    console.log("🔍 DEBUG - PLATFORM METRICS");
    
    try {
        const { data: allData, error } = await client
            .from("platform_metrics")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(10);

        if (error) {
            console.error("❌ Erro:", error);
        } else {
            console.log(`
📊 TOTAL REGISTROS: ${allData.length}`);
            
            if (allData.length > 0) {
                const latest = allData[0];
                console.log("
📋 ÚLTIMO REGISTRO:");
                console.log("   • ID:", latest.id);
                console.log("   • Period:", latest.period);
                console.log("   • Data Source:", latest.data_source);
                console.log("   • Platform MRR:", latest.platform_mrr);
                console.log("   • Total Revenue:", latest.total_revenue);
                console.log("   • Active Tenants:", latest.active_tenants);
                console.log("   • Created:", latest.created_at);
            }
        }

    } catch (error) {
        console.error("❌ Erro geral:", error);
    }
}

debugPlatformMetrics().then(() => process.exit(0));
