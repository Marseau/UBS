/**
 * Extended database client configuration
 * Includes support for ubs_metric_system table
 */

import { createClient } from "@supabase/supabase-js";
import {
  DatabaseExtended,
  SupabaseClientExtended,
} from "../types/database-extended.types";
import * as dotenv from "dotenv";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Extended admin client with full type support
export const getAdminClientExtended = (): SupabaseClientExtended => {
  const key = serviceKey || supabaseKey;

  return createClient<DatabaseExtended>(supabaseUrl, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    db: {
      schema: "public",
    },
  });
};

// Helper function to get typed metrics data
export async function getLatestMetrics(
  client: SupabaseClientExtended,
  options: {
    tenantId?: string;
    periodDays: number;
    dataSource?: string;
  },
) {
  let query = client
    .from("ubs_metric_system")
    .select("*")
    .eq("period_days", options.periodDays)
    .eq("data_source", options.dataSource || "final_corrected_function")
    .order("calculation_date", { ascending: false })
    .limit(1);

  if (options.tenantId) {
    query = query.eq("tenant_id", options.tenantId);
  }

  return query.single();
}

// Helper function to get rankings with tenant info
export async function getTenantRankings(
  client: SupabaseClientExtended,
  options: {
    periodDays: number;
    limit?: number;
    dataSource?: string;
  },
) {
  const { data, error } = await client
    .from("ubs_metric_system")
    .select(
      `
            *,
            tenants!inner(business_name, domain)
        `,
    )
    .eq("period_days", options.periodDays)
    .eq("data_source", options.dataSource || "final_corrected_function")
    .order("tenant_revenue_value", { ascending: false })
    .limit(options.limit || 10);

  if (error) throw error;

  return data?.map((item, index) => ({
    ...item,
    position: index + 1,
  }));
}
