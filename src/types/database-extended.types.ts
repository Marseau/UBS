/**
 * Extended database types to include ubs_metric_system table
 * This extends the auto-generated database types
 */

import { Database } from "./database.types";
import { UBSMetricSystem } from "./ubs-metric-system.types";

// Extend the existing Database type to include ubs_metric_system
export interface DatabaseExtended extends Database {
  public: Database["public"] & {
    Tables: Database["public"]["Tables"] & {
      ubs_metric_system: {
        Row: UBSMetricSystem;
        Insert: Omit<UBSMetricSystem, "id" | "created_at" | "updated_at"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Omit<UBSMetricSystem, "id" | "created_at" | "updated_at">
        >;
        Relationships: [
          {
            foreignKeyName: "ubs_metric_system_tenant_id_fkey";
            columns: ["tenant_id"];
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
    };
  };
}

// Export a typed client creator
import { SupabaseClient } from "@supabase/supabase-js";

export type SupabaseClientExtended = SupabaseClient<DatabaseExtended>;
