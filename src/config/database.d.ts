import { Database } from "../types/database.types";
export declare const supabase: import("@supabase/supabase-js").SupabaseClient<
  Database,
  "public",
  {
    Tables: {
      admin_permissions: {
        Row: {
          id: string;
          admin_user_id: string | null;
          permission: string;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          admin_user_id?: string | null;
          permission: string;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          admin_user_id?: string | null;
          permission?: string;
          created_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "admin_permissions_admin_user_id_fkey";
            columns: ["admin_user_id"];
            isOneToOne: false;
            referencedRelation: "admin_users";
            referencedColumns: ["id"];
          },
        ];
      };
      admin_users: {
        Row: {
          id: string;
          email: string;
          password_hash: string;
          name: string;
          role: string;
          tenant_id: string | null;
          is_active: boolean | null;
          last_login_at: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          email: string;
          password_hash: string;
          name: string;
          role?: string;
          tenant_id?: string | null;
          is_active?: boolean | null;
          last_login_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          email?: string;
          password_hash?: string;
          name?: string;
          role?: string;
          tenant_id?: string | null;
          is_active?: boolean | null;
          last_login_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "admin_users_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      appointments: {
        Row: {
          appointment_data: import("../types/database.types").Json | null;
          cancellation_reason: string | null;
          cancelled_at: string | null;
          cancelled_by: string | null;
          created_at: string | null;
          currency: string | null;
          customer_notes: string | null;
          end_time: string;
          external_event_id: string | null;
          final_price: number | null;
          id: string;
          internal_notes: string | null;
          quoted_price: number | null;
          service_id: string | null;
          start_time: string;
          status: Database["public"]["Enums"]["appointment_status"] | null;
          tenant_id: string | null;
          timezone: string | null;
          updated_at: string | null;
          user_id: string | null;
        };
        Insert: {
          appointment_data?: import("../types/database.types").Json | null;
          cancellation_reason?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          created_at?: string | null;
          currency?: string | null;
          customer_notes?: string | null;
          end_time: string;
          external_event_id?: string | null;
          final_price?: number | null;
          id?: string;
          internal_notes?: string | null;
          quoted_price?: number | null;
          service_id?: string | null;
          start_time: string;
          status?: Database["public"]["Enums"]["appointment_status"] | null;
          tenant_id?: string | null;
          timezone?: string | null;
          updated_at?: string | null;
          user_id?: string | null;
        };
        Update: {
          appointment_data?: import("../types/database.types").Json | null;
          cancellation_reason?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          created_at?: string | null;
          currency?: string | null;
          customer_notes?: string | null;
          end_time?: string;
          external_event_id?: string | null;
          final_price?: number | null;
          id?: string;
          internal_notes?: string | null;
          quoted_price?: number | null;
          service_id?: string | null;
          start_time?: string;
          status?: Database["public"]["Enums"]["appointment_status"] | null;
          tenant_id?: string | null;
          timezone?: string | null;
          updated_at?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "appointments_service_id_fkey";
            columns: ["service_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointments_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointments_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      availability_templates: {
        Row: {
          created_at: string | null;
          friday_slots: import("../types/database.types").Json | null;
          id: string;
          is_default: boolean | null;
          monday_slots: import("../types/database.types").Json | null;
          name: string;
          saturday_slots: import("../types/database.types").Json | null;
          special_dates: import("../types/database.types").Json | null;
          sunday_slots: import("../types/database.types").Json | null;
          tenant_id: string | null;
          thursday_slots: import("../types/database.types").Json | null;
          tuesday_slots: import("../types/database.types").Json | null;
          updated_at: string | null;
          wednesday_slots: import("../types/database.types").Json | null;
        };
        Insert: {
          created_at?: string | null;
          friday_slots?: import("../types/database.types").Json | null;
          id?: string;
          is_default?: boolean | null;
          monday_slots?: import("../types/database.types").Json | null;
          name: string;
          saturday_slots?: import("../types/database.types").Json | null;
          special_dates?: import("../types/database.types").Json | null;
          sunday_slots?: import("../types/database.types").Json | null;
          tenant_id?: string | null;
          thursday_slots?: import("../types/database.types").Json | null;
          tuesday_slots?: import("../types/database.types").Json | null;
          updated_at?: string | null;
          wednesday_slots?: import("../types/database.types").Json | null;
        };
        Update: {
          created_at?: string | null;
          friday_slots?: import("../types/database.types").Json | null;
          id?: string;
          is_default?: boolean | null;
          monday_slots?: import("../types/database.types").Json | null;
          name?: string;
          saturday_slots?: import("../types/database.types").Json | null;
          special_dates?: import("../types/database.types").Json | null;
          sunday_slots?: import("../types/database.types").Json | null;
          tenant_id?: string | null;
          thursday_slots?: import("../types/database.types").Json | null;
          tuesday_slots?: import("../types/database.types").Json | null;
          updated_at?: string | null;
          wednesday_slots?: import("../types/database.types").Json | null;
        };
        Relationships: [
          {
            foreignKeyName: "availability_templates_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      conversation_history: {
        Row: {
          confidence_score: number | null;
          content: string;
          conversation_context: import("../types/database.types").Json | null;
          created_at: string | null;
          id: string;
          intent_detected: string | null;
          is_from_user: boolean;
          message_content: string | null;
          message_id: string | null;
          message_type: string;
          phone_number: string | null;
          raw_message: import("../types/database.types").Json | null;
          tenant_id: string;
          user_id: string | null;
          user_name: string | null;
        };
        Insert: {
          confidence_score?: number | null;
          content: string;
          conversation_context?: import("../types/database.types").Json | null;
          created_at?: string | null;
          id?: string;
          intent_detected?: string | null;
          is_from_user: boolean;
          message_content?: string | null;
          message_id?: string | null;
          message_type: string;
          phone_number?: string | null;
          raw_message?: import("../types/database.types").Json | null;
          tenant_id: string;
          user_id?: string | null;
          user_name?: string | null;
        };
        Update: {
          confidence_score?: number | null;
          content?: string;
          conversation_context?: import("../types/database.types").Json | null;
          created_at?: string | null;
          id?: string;
          intent_detected?: string | null;
          is_from_user?: boolean;
          message_content?: string | null;
          message_id?: string | null;
          message_type?: string;
          phone_number?: string | null;
          raw_message?: import("../types/database.types").Json | null;
          tenant_id?: string;
          user_id?: string | null;
          user_name?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "conversation_history_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversation_history_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      conversation_states: {
        Row: {
          context: import("../types/database.types").Json | null;
          created_at: string | null;
          current_step: string | null;
          id: string;
          last_message_at: string | null;
          phone_number: string;
          tenant_id: string;
          updated_at: string | null;
        };
        Insert: {
          context?: import("../types/database.types").Json | null;
          created_at?: string | null;
          current_step?: string | null;
          id?: string;
          last_message_at?: string | null;
          phone_number: string;
          tenant_id: string;
          updated_at?: string | null;
        };
        Update: {
          context?: import("../types/database.types").Json | null;
          created_at?: string | null;
          current_step?: string | null;
          id?: string;
          last_message_at?: string | null;
          phone_number?: string;
          tenant_id?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "conversation_states_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      service_categories: {
        Row: {
          created_at: string | null;
          description: string | null;
          display_order: number | null;
          id: string;
          name: string;
          tenant_id: string | null;
        };
        Insert: {
          created_at?: string | null;
          description?: string | null;
          display_order?: number | null;
          id?: string;
          name: string;
          tenant_id?: string | null;
        };
        Update: {
          created_at?: string | null;
          description?: string | null;
          display_order?: number | null;
          id?: string;
          name?: string;
          tenant_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "service_categories_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      services: {
        Row: {
          advance_booking_days: number | null;
          base_price: number | null;
          category_id: string | null;
          created_at: string | null;
          currency: string | null;
          description: string | null;
          display_order: number | null;
          duration_max: number | null;
          duration_min: number | null;
          duration_minutes: number | null;
          duration_type: Database["public"]["Enums"]["duration_type"];
          id: string;
          is_active: boolean | null;
          max_bookings_per_day: number | null;
          name: string;
          price_model: Database["public"]["Enums"]["price_model"];
          service_config: import("../types/database.types").Json | null;
          tenant_id: string | null;
          updated_at: string | null;
        };
        Insert: {
          advance_booking_days?: number | null;
          base_price?: number | null;
          category_id?: string | null;
          created_at?: string | null;
          currency?: string | null;
          description?: string | null;
          display_order?: number | null;
          duration_max?: number | null;
          duration_min?: number | null;
          duration_minutes?: number | null;
          duration_type?: Database["public"]["Enums"]["duration_type"];
          id?: string;
          is_active?: boolean | null;
          max_bookings_per_day?: number | null;
          name: string;
          price_model?: Database["public"]["Enums"]["price_model"];
          service_config?: import("../types/database.types").Json | null;
          tenant_id?: string | null;
          updated_at?: string | null;
        };
        Update: {
          advance_booking_days?: number | null;
          base_price?: number | null;
          category_id?: string | null;
          created_at?: string | null;
          currency?: string | null;
          description?: string | null;
          display_order?: number | null;
          duration_max?: number | null;
          duration_min?: number | null;
          duration_minutes?: number | null;
          duration_type?: Database["public"]["Enums"]["duration_type"];
          id?: string;
          is_active?: boolean | null;
          max_bookings_per_day?: number | null;
          name?: string;
          price_model?: Database["public"]["Enums"]["price_model"];
          service_config?: import("../types/database.types").Json | null;
          tenant_id?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "services_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "service_categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "services_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      tenants: {
        Row: {
          ai_settings: import("../types/database.types").Json;
          business_address: import("../types/database.types").Json | null;
          business_description: string | null;
          business_name: string;
          business_rules: import("../types/database.types").Json;
          created_at: string | null;
          domain: Database["public"]["Enums"]["business_domain"];
          domain_config: import("../types/database.types").Json;
          email: string;
          id: string;
          name: string;
          phone: string;
          slug: string;
          status: string | null;
          subscription_plan: string | null;
          updated_at: string | null;
          whatsapp_phone: string | null;
          whatsapp_settings: import("../types/database.types").Json | null;
        };
        Insert: {
          ai_settings?: import("../types/database.types").Json;
          business_address?: import("../types/database.types").Json | null;
          business_description?: string | null;
          business_name: string;
          business_rules?: import("../types/database.types").Json;
          created_at?: string | null;
          domain: Database["public"]["Enums"]["business_domain"];
          domain_config?: import("../types/database.types").Json;
          email: string;
          id?: string;
          name: string;
          phone: string;
          slug: string;
          status?: string | null;
          subscription_plan?: string | null;
          updated_at?: string | null;
          whatsapp_phone?: string | null;
          whatsapp_settings?: import("../types/database.types").Json | null;
        };
        Update: {
          ai_settings?: import("../types/database.types").Json;
          business_address?: import("../types/database.types").Json | null;
          business_description?: string | null;
          business_name?: string;
          business_rules?: import("../types/database.types").Json;
          created_at?: string | null;
          domain?: Database["public"]["Enums"]["business_domain"];
          domain_config?: import("../types/database.types").Json;
          email?: string;
          id?: string;
          name?: string;
          phone?: string;
          slug?: string;
          status?: string | null;
          subscription_plan?: string | null;
          updated_at?: string | null;
          whatsapp_phone?: string | null;
          whatsapp_settings?: import("../types/database.types").Json | null;
        };
        Relationships: [];
      };
      user_tenants: {
        Row: {
          first_interaction: string | null;
          last_interaction: string | null;
          role: string | null;
          tenant_id: string;
          tenant_preferences: import("../types/database.types").Json | null;
          total_bookings: number | null;
          user_id: string;
        };
        Insert: {
          first_interaction?: string | null;
          last_interaction?: string | null;
          role?: string | null;
          tenant_id: string;
          tenant_preferences?: import("../types/database.types").Json | null;
          total_bookings?: number | null;
          user_id: string;
        };
        Update: {
          first_interaction?: string | null;
          last_interaction?: string | null;
          role?: string | null;
          tenant_id?: string;
          tenant_preferences?: import("../types/database.types").Json | null;
          total_bookings?: number | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_tenants_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_tenants_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      users: {
        Row: {
          created_at: string | null;
          email: string | null;
          id: string;
          name: string | null;
          phone: string;
          preferences: import("../types/database.types").Json | null;
          updated_at: string | null;
        };
        Insert: {
          created_at?: string | null;
          email?: string | null;
          id?: string;
          name?: string | null;
          phone: string;
          preferences?: import("../types/database.types").Json | null;
          updated_at?: string | null;
        };
        Update: {
          created_at?: string | null;
          email?: string | null;
          id?: string;
          name?: string | null;
          phone?: string;
          preferences?: import("../types/database.types").Json | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      whatsapp_media: {
        Row: {
          caption: string | null;
          created_at: string | null;
          file_size: number | null;
          filename: string | null;
          id: string;
          local_path: string | null;
          media_id: string;
          media_type: string;
          media_url: string | null;
          message_id: string;
          mime_type: string | null;
          phone_number: string;
          tenant_id: string;
          updated_at: string | null;
        };
        Insert: {
          caption?: string | null;
          created_at?: string | null;
          file_size?: number | null;
          filename?: string | null;
          id?: string;
          local_path?: string | null;
          media_id: string;
          media_type: string;
          media_url?: string | null;
          message_id: string;
          mime_type?: string | null;
          phone_number: string;
          tenant_id: string;
          updated_at?: string | null;
        };
        Update: {
          caption?: string | null;
          created_at?: string | null;
          file_size?: number | null;
          filename?: string | null;
          id?: string;
          local_path?: string | null;
          media_id?: string;
          media_type?: string;
          media_url?: string | null;
          message_id?: string;
          mime_type?: string | null;
          phone_number?: string;
          tenant_id?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "whatsapp_media_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      whatsapp_templates: {
        Row: {
          category: string | null;
          components: import("../types/database.types").Json | null;
          created_at: string | null;
          id: string;
          is_active: boolean | null;
          language_code: string | null;
          name: string;
          status: string | null;
          template_name: string;
          tenant_id: string;
          updated_at: string | null;
        };
        Insert: {
          category?: string | null;
          components?: import("../types/database.types").Json | null;
          created_at?: string | null;
          id?: string;
          is_active?: boolean | null;
          language_code?: string | null;
          name: string;
          status?: string | null;
          template_name: string;
          tenant_id: string;
          updated_at?: string | null;
        };
        Update: {
          category?: string | null;
          components?: import("../types/database.types").Json | null;
          created_at?: string | null;
          id?: string;
          is_active?: boolean | null;
          language_code?: string | null;
          name?: string;
          status?: string | null;
          template_name?: string;
          tenant_id?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "whatsapp_templates_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      calendar_sync_tokens: {
        Row: {
          id: string;
          tenant_id: string | null;
          google_calendar_id: string | null;
          sync_token: string | null;
          last_sync_at: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          tenant_id?: string | null;
          google_calendar_id?: string | null;
          sync_token?: string | null;
          last_sync_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          tenant_id?: string | null;
          google_calendar_id?: string | null;
          sync_token?: string | null;
          last_sync_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "calendar_sync_tokens_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      email_logs: {
        Row: {
          id: string;
          tenant_id: string | null;
          recipient_email: string;
          subject: string | null;
          template_name: string | null;
          status: string | null;
          error_message: string | null;
          sent_at: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          tenant_id?: string | null;
          recipient_email: string;
          subject?: string | null;
          template_name?: string | null;
          status?: string | null;
          error_message?: string | null;
          sent_at?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          tenant_id?: string | null;
          recipient_email?: string;
          subject?: string | null;
          template_name?: string | null;
          status?: string | null;
          error_message?: string | null;
          sent_at?: string | null;
          created_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "email_logs_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      function_executions: {
        Row: {
          id: string;
          tenant_id: string | null;
          function_name: string;
          execution_time_ms: number | null;
          success: boolean | null;
          error_message: string | null;
          input_data: import("../types/database.types").Json | null;
          output_data: import("../types/database.types").Json | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          tenant_id?: string | null;
          function_name: string;
          execution_time_ms?: number | null;
          success?: boolean | null;
          error_message?: string | null;
          input_data?: import("../types/database.types").Json | null;
          output_data?: import("../types/database.types").Json | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          tenant_id?: string | null;
          function_name?: string;
          execution_time_ms?: number | null;
          success?: boolean | null;
          error_message?: string | null;
          input_data?: import("../types/database.types").Json | null;
          output_data?: import("../types/database.types").Json | null;
          created_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "function_executions_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      system_health_logs: {
        Row: {
          id: string;
          component: string;
          status: string;
          details: import("../types/database.types").Json | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          component: string;
          status: string;
          details?: import("../types/database.types").Json | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          component?: string;
          status?: string;
          details?: import("../types/database.types").Json | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      citext: {
        Args:
          | {
              "": boolean;
            }
          | {
              "": string;
            }
          | {
              "": unknown;
            };
        Returns: string;
      };
      citext_hash: {
        Args: {
          "": string;
        };
        Returns: number;
      };
      citextin: {
        Args: {
          "": unknown;
        };
        Returns: string;
      };
      citextout: {
        Args: {
          "": string;
        };
        Returns: unknown;
      };
      citextrecv: {
        Args: {
          "": unknown;
        };
        Returns: string;
      };
      citextsend: {
        Args: {
          "": string;
        };
        Returns: string;
      };
    };
    Enums: {
      appointment_status:
        | "pending"
        | "confirmed"
        | "in_progress"
        | "completed"
        | "cancelled"
        | "no_show"
        | "rescheduled";
      business_domain:
        | "legal"
        | "healthcare"
        | "education"
        | "beauty"
        | "sports"
        | "consulting"
        | "other";
      duration_type: "fixed" | "variable" | "estimated" | "session";
      price_model: "fixed" | "hourly" | "package" | "dynamic" | "consultation";
    };
    CompositeTypes: { [_ in never]: never };
  }
>;
export declare const getTenantClient: (
  tenantId: string,
) => import("@supabase/supabase-js").SupabaseClient<
  Database,
  "public",
  {
    Tables: {
      admin_permissions: {
        Row: {
          id: string;
          admin_user_id: string | null;
          permission: string;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          admin_user_id?: string | null;
          permission: string;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          admin_user_id?: string | null;
          permission?: string;
          created_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "admin_permissions_admin_user_id_fkey";
            columns: ["admin_user_id"];
            isOneToOne: false;
            referencedRelation: "admin_users";
            referencedColumns: ["id"];
          },
        ];
      };
      admin_users: {
        Row: {
          id: string;
          email: string;
          password_hash: string;
          name: string;
          role: string;
          tenant_id: string | null;
          is_active: boolean | null;
          last_login_at: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          email: string;
          password_hash: string;
          name: string;
          role?: string;
          tenant_id?: string | null;
          is_active?: boolean | null;
          last_login_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          email?: string;
          password_hash?: string;
          name?: string;
          role?: string;
          tenant_id?: string | null;
          is_active?: boolean | null;
          last_login_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "admin_users_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      appointments: {
        Row: {
          appointment_data: import("../types/database.types").Json | null;
          cancellation_reason: string | null;
          cancelled_at: string | null;
          cancelled_by: string | null;
          created_at: string | null;
          currency: string | null;
          customer_notes: string | null;
          end_time: string;
          external_event_id: string | null;
          final_price: number | null;
          id: string;
          internal_notes: string | null;
          quoted_price: number | null;
          service_id: string | null;
          start_time: string;
          status: Database["public"]["Enums"]["appointment_status"] | null;
          tenant_id: string | null;
          timezone: string | null;
          updated_at: string | null;
          user_id: string | null;
        };
        Insert: {
          appointment_data?: import("../types/database.types").Json | null;
          cancellation_reason?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          created_at?: string | null;
          currency?: string | null;
          customer_notes?: string | null;
          end_time: string;
          external_event_id?: string | null;
          final_price?: number | null;
          id?: string;
          internal_notes?: string | null;
          quoted_price?: number | null;
          service_id?: string | null;
          start_time: string;
          status?: Database["public"]["Enums"]["appointment_status"] | null;
          tenant_id?: string | null;
          timezone?: string | null;
          updated_at?: string | null;
          user_id?: string | null;
        };
        Update: {
          appointment_data?: import("../types/database.types").Json | null;
          cancellation_reason?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          created_at?: string | null;
          currency?: string | null;
          customer_notes?: string | null;
          end_time?: string;
          external_event_id?: string | null;
          final_price?: number | null;
          id?: string;
          internal_notes?: string | null;
          quoted_price?: number | null;
          service_id?: string | null;
          start_time?: string;
          status?: Database["public"]["Enums"]["appointment_status"] | null;
          tenant_id?: string | null;
          timezone?: string | null;
          updated_at?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "appointments_service_id_fkey";
            columns: ["service_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointments_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointments_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      availability_templates: {
        Row: {
          created_at: string | null;
          friday_slots: import("../types/database.types").Json | null;
          id: string;
          is_default: boolean | null;
          monday_slots: import("../types/database.types").Json | null;
          name: string;
          saturday_slots: import("../types/database.types").Json | null;
          special_dates: import("../types/database.types").Json | null;
          sunday_slots: import("../types/database.types").Json | null;
          tenant_id: string | null;
          thursday_slots: import("../types/database.types").Json | null;
          tuesday_slots: import("../types/database.types").Json | null;
          updated_at: string | null;
          wednesday_slots: import("../types/database.types").Json | null;
        };
        Insert: {
          created_at?: string | null;
          friday_slots?: import("../types/database.types").Json | null;
          id?: string;
          is_default?: boolean | null;
          monday_slots?: import("../types/database.types").Json | null;
          name: string;
          saturday_slots?: import("../types/database.types").Json | null;
          special_dates?: import("../types/database.types").Json | null;
          sunday_slots?: import("../types/database.types").Json | null;
          tenant_id?: string | null;
          thursday_slots?: import("../types/database.types").Json | null;
          tuesday_slots?: import("../types/database.types").Json | null;
          updated_at?: string | null;
          wednesday_slots?: import("../types/database.types").Json | null;
        };
        Update: {
          created_at?: string | null;
          friday_slots?: import("../types/database.types").Json | null;
          id?: string;
          is_default?: boolean | null;
          monday_slots?: import("../types/database.types").Json | null;
          name?: string;
          saturday_slots?: import("../types/database.types").Json | null;
          special_dates?: import("../types/database.types").Json | null;
          sunday_slots?: import("../types/database.types").Json | null;
          tenant_id?: string | null;
          thursday_slots?: import("../types/database.types").Json | null;
          tuesday_slots?: import("../types/database.types").Json | null;
          updated_at?: string | null;
          wednesday_slots?: import("../types/database.types").Json | null;
        };
        Relationships: [
          {
            foreignKeyName: "availability_templates_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      conversation_history: {
        Row: {
          confidence_score: number | null;
          content: string;
          conversation_context: import("../types/database.types").Json | null;
          created_at: string | null;
          id: string;
          intent_detected: string | null;
          is_from_user: boolean;
          message_content: string | null;
          message_id: string | null;
          message_type: string;
          phone_number: string | null;
          raw_message: import("../types/database.types").Json | null;
          tenant_id: string;
          user_id: string | null;
          user_name: string | null;
        };
        Insert: {
          confidence_score?: number | null;
          content: string;
          conversation_context?: import("../types/database.types").Json | null;
          created_at?: string | null;
          id?: string;
          intent_detected?: string | null;
          is_from_user: boolean;
          message_content?: string | null;
          message_id?: string | null;
          message_type: string;
          phone_number?: string | null;
          raw_message?: import("../types/database.types").Json | null;
          tenant_id: string;
          user_id?: string | null;
          user_name?: string | null;
        };
        Update: {
          confidence_score?: number | null;
          content?: string;
          conversation_context?: import("../types/database.types").Json | null;
          created_at?: string | null;
          id?: string;
          intent_detected?: string | null;
          is_from_user?: boolean;
          message_content?: string | null;
          message_id?: string | null;
          message_type?: string;
          phone_number?: string | null;
          raw_message?: import("../types/database.types").Json | null;
          tenant_id?: string;
          user_id?: string | null;
          user_name?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "conversation_history_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversation_history_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      conversation_states: {
        Row: {
          context: import("../types/database.types").Json | null;
          created_at: string | null;
          current_step: string | null;
          id: string;
          last_message_at: string | null;
          phone_number: string;
          tenant_id: string;
          updated_at: string | null;
        };
        Insert: {
          context?: import("../types/database.types").Json | null;
          created_at?: string | null;
          current_step?: string | null;
          id?: string;
          last_message_at?: string | null;
          phone_number: string;
          tenant_id: string;
          updated_at?: string | null;
        };
        Update: {
          context?: import("../types/database.types").Json | null;
          created_at?: string | null;
          current_step?: string | null;
          id?: string;
          last_message_at?: string | null;
          phone_number?: string;
          tenant_id?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "conversation_states_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      service_categories: {
        Row: {
          created_at: string | null;
          description: string | null;
          display_order: number | null;
          id: string;
          name: string;
          tenant_id: string | null;
        };
        Insert: {
          created_at?: string | null;
          description?: string | null;
          display_order?: number | null;
          id?: string;
          name: string;
          tenant_id?: string | null;
        };
        Update: {
          created_at?: string | null;
          description?: string | null;
          display_order?: number | null;
          id?: string;
          name?: string;
          tenant_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "service_categories_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      services: {
        Row: {
          advance_booking_days: number | null;
          base_price: number | null;
          category_id: string | null;
          created_at: string | null;
          currency: string | null;
          description: string | null;
          display_order: number | null;
          duration_max: number | null;
          duration_min: number | null;
          duration_minutes: number | null;
          duration_type: Database["public"]["Enums"]["duration_type"];
          id: string;
          is_active: boolean | null;
          max_bookings_per_day: number | null;
          name: string;
          price_model: Database["public"]["Enums"]["price_model"];
          service_config: import("../types/database.types").Json | null;
          tenant_id: string | null;
          updated_at: string | null;
        };
        Insert: {
          advance_booking_days?: number | null;
          base_price?: number | null;
          category_id?: string | null;
          created_at?: string | null;
          currency?: string | null;
          description?: string | null;
          display_order?: number | null;
          duration_max?: number | null;
          duration_min?: number | null;
          duration_minutes?: number | null;
          duration_type?: Database["public"]["Enums"]["duration_type"];
          id?: string;
          is_active?: boolean | null;
          max_bookings_per_day?: number | null;
          name: string;
          price_model?: Database["public"]["Enums"]["price_model"];
          service_config?: import("../types/database.types").Json | null;
          tenant_id?: string | null;
          updated_at?: string | null;
        };
        Update: {
          advance_booking_days?: number | null;
          base_price?: number | null;
          category_id?: string | null;
          created_at?: string | null;
          currency?: string | null;
          description?: string | null;
          display_order?: number | null;
          duration_max?: number | null;
          duration_min?: number | null;
          duration_minutes?: number | null;
          duration_type?: Database["public"]["Enums"]["duration_type"];
          id?: string;
          is_active?: boolean | null;
          max_bookings_per_day?: number | null;
          name?: string;
          price_model?: Database["public"]["Enums"]["price_model"];
          service_config?: import("../types/database.types").Json | null;
          tenant_id?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "services_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "service_categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "services_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      tenants: {
        Row: {
          ai_settings: import("../types/database.types").Json;
          business_address: import("../types/database.types").Json | null;
          business_description: string | null;
          business_name: string;
          business_rules: import("../types/database.types").Json;
          created_at: string | null;
          domain: Database["public"]["Enums"]["business_domain"];
          domain_config: import("../types/database.types").Json;
          email: string;
          id: string;
          name: string;
          phone: string;
          slug: string;
          status: string | null;
          subscription_plan: string | null;
          updated_at: string | null;
          whatsapp_phone: string | null;
          whatsapp_settings: import("../types/database.types").Json | null;
        };
        Insert: {
          ai_settings?: import("../types/database.types").Json;
          business_address?: import("../types/database.types").Json | null;
          business_description?: string | null;
          business_name: string;
          business_rules?: import("../types/database.types").Json;
          created_at?: string | null;
          domain: Database["public"]["Enums"]["business_domain"];
          domain_config?: import("../types/database.types").Json;
          email: string;
          id?: string;
          name: string;
          phone: string;
          slug: string;
          status?: string | null;
          subscription_plan?: string | null;
          updated_at?: string | null;
          whatsapp_phone?: string | null;
          whatsapp_settings?: import("../types/database.types").Json | null;
        };
        Update: {
          ai_settings?: import("../types/database.types").Json;
          business_address?: import("../types/database.types").Json | null;
          business_description?: string | null;
          business_name?: string;
          business_rules?: import("../types/database.types").Json;
          created_at?: string | null;
          domain?: Database["public"]["Enums"]["business_domain"];
          domain_config?: import("../types/database.types").Json;
          email?: string;
          id?: string;
          name?: string;
          phone?: string;
          slug?: string;
          status?: string | null;
          subscription_plan?: string | null;
          updated_at?: string | null;
          whatsapp_phone?: string | null;
          whatsapp_settings?: import("../types/database.types").Json | null;
        };
        Relationships: [];
      };
      user_tenants: {
        Row: {
          first_interaction: string | null;
          last_interaction: string | null;
          role: string | null;
          tenant_id: string;
          tenant_preferences: import("../types/database.types").Json | null;
          total_bookings: number | null;
          user_id: string;
        };
        Insert: {
          first_interaction?: string | null;
          last_interaction?: string | null;
          role?: string | null;
          tenant_id: string;
          tenant_preferences?: import("../types/database.types").Json | null;
          total_bookings?: number | null;
          user_id: string;
        };
        Update: {
          first_interaction?: string | null;
          last_interaction?: string | null;
          role?: string | null;
          tenant_id?: string;
          tenant_preferences?: import("../types/database.types").Json | null;
          total_bookings?: number | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_tenants_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_tenants_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      users: {
        Row: {
          created_at: string | null;
          email: string | null;
          id: string;
          name: string | null;
          phone: string;
          preferences: import("../types/database.types").Json | null;
          updated_at: string | null;
        };
        Insert: {
          created_at?: string | null;
          email?: string | null;
          id?: string;
          name?: string | null;
          phone: string;
          preferences?: import("../types/database.types").Json | null;
          updated_at?: string | null;
        };
        Update: {
          created_at?: string | null;
          email?: string | null;
          id?: string;
          name?: string | null;
          phone?: string;
          preferences?: import("../types/database.types").Json | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      whatsapp_media: {
        Row: {
          caption: string | null;
          created_at: string | null;
          file_size: number | null;
          filename: string | null;
          id: string;
          local_path: string | null;
          media_id: string;
          media_type: string;
          media_url: string | null;
          message_id: string;
          mime_type: string | null;
          phone_number: string;
          tenant_id: string;
          updated_at: string | null;
        };
        Insert: {
          caption?: string | null;
          created_at?: string | null;
          file_size?: number | null;
          filename?: string | null;
          id?: string;
          local_path?: string | null;
          media_id: string;
          media_type: string;
          media_url?: string | null;
          message_id: string;
          mime_type?: string | null;
          phone_number: string;
          tenant_id: string;
          updated_at?: string | null;
        };
        Update: {
          caption?: string | null;
          created_at?: string | null;
          file_size?: number | null;
          filename?: string | null;
          id?: string;
          local_path?: string | null;
          media_id?: string;
          media_type?: string;
          media_url?: string | null;
          message_id?: string;
          mime_type?: string | null;
          phone_number?: string;
          tenant_id?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "whatsapp_media_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      whatsapp_templates: {
        Row: {
          category: string | null;
          components: import("../types/database.types").Json | null;
          created_at: string | null;
          id: string;
          is_active: boolean | null;
          language_code: string | null;
          name: string;
          status: string | null;
          template_name: string;
          tenant_id: string;
          updated_at: string | null;
        };
        Insert: {
          category?: string | null;
          components?: import("../types/database.types").Json | null;
          created_at?: string | null;
          id?: string;
          is_active?: boolean | null;
          language_code?: string | null;
          name: string;
          status?: string | null;
          template_name: string;
          tenant_id: string;
          updated_at?: string | null;
        };
        Update: {
          category?: string | null;
          components?: import("../types/database.types").Json | null;
          created_at?: string | null;
          id?: string;
          is_active?: boolean | null;
          language_code?: string | null;
          name?: string;
          status?: string | null;
          template_name?: string;
          tenant_id?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "whatsapp_templates_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      calendar_sync_tokens: {
        Row: {
          id: string;
          tenant_id: string | null;
          google_calendar_id: string | null;
          sync_token: string | null;
          last_sync_at: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          tenant_id?: string | null;
          google_calendar_id?: string | null;
          sync_token?: string | null;
          last_sync_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          tenant_id?: string | null;
          google_calendar_id?: string | null;
          sync_token?: string | null;
          last_sync_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "calendar_sync_tokens_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      email_logs: {
        Row: {
          id: string;
          tenant_id: string | null;
          recipient_email: string;
          subject: string | null;
          template_name: string | null;
          status: string | null;
          error_message: string | null;
          sent_at: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          tenant_id?: string | null;
          recipient_email: string;
          subject?: string | null;
          template_name?: string | null;
          status?: string | null;
          error_message?: string | null;
          sent_at?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          tenant_id?: string | null;
          recipient_email?: string;
          subject?: string | null;
          template_name?: string | null;
          status?: string | null;
          error_message?: string | null;
          sent_at?: string | null;
          created_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "email_logs_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      function_executions: {
        Row: {
          id: string;
          tenant_id: string | null;
          function_name: string;
          execution_time_ms: number | null;
          success: boolean | null;
          error_message: string | null;
          input_data: import("../types/database.types").Json | null;
          output_data: import("../types/database.types").Json | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          tenant_id?: string | null;
          function_name: string;
          execution_time_ms?: number | null;
          success?: boolean | null;
          error_message?: string | null;
          input_data?: import("../types/database.types").Json | null;
          output_data?: import("../types/database.types").Json | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          tenant_id?: string | null;
          function_name?: string;
          execution_time_ms?: number | null;
          success?: boolean | null;
          error_message?: string | null;
          input_data?: import("../types/database.types").Json | null;
          output_data?: import("../types/database.types").Json | null;
          created_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "function_executions_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      system_health_logs: {
        Row: {
          id: string;
          component: string;
          status: string;
          details: import("../types/database.types").Json | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          component: string;
          status: string;
          details?: import("../types/database.types").Json | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          component?: string;
          status?: string;
          details?: import("../types/database.types").Json | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      citext: {
        Args:
          | {
              "": boolean;
            }
          | {
              "": string;
            }
          | {
              "": unknown;
            };
        Returns: string;
      };
      citext_hash: {
        Args: {
          "": string;
        };
        Returns: number;
      };
      citextin: {
        Args: {
          "": unknown;
        };
        Returns: string;
      };
      citextout: {
        Args: {
          "": string;
        };
        Returns: unknown;
      };
      citextrecv: {
        Args: {
          "": unknown;
        };
        Returns: string;
      };
      citextsend: {
        Args: {
          "": string;
        };
        Returns: string;
      };
    };
    Enums: {
      appointment_status:
        | "pending"
        | "confirmed"
        | "in_progress"
        | "completed"
        | "cancelled"
        | "no_show"
        | "rescheduled";
      business_domain:
        | "legal"
        | "healthcare"
        | "education"
        | "beauty"
        | "sports"
        | "consulting"
        | "other";
      duration_type: "fixed" | "variable" | "estimated" | "session";
      price_model: "fixed" | "hourly" | "package" | "dynamic" | "consultation";
    };
    CompositeTypes: { [_ in never]: never };
  }
>;
export declare const getAdminClient: () => import("@supabase/supabase-js").SupabaseClient<
  Database,
  "public",
  {
    Tables: {
      admin_permissions: {
        Row: {
          id: string;
          admin_user_id: string | null;
          permission: string;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          admin_user_id?: string | null;
          permission: string;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          admin_user_id?: string | null;
          permission?: string;
          created_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "admin_permissions_admin_user_id_fkey";
            columns: ["admin_user_id"];
            isOneToOne: false;
            referencedRelation: "admin_users";
            referencedColumns: ["id"];
          },
        ];
      };
      admin_users: {
        Row: {
          id: string;
          email: string;
          password_hash: string;
          name: string;
          role: string;
          tenant_id: string | null;
          is_active: boolean | null;
          last_login_at: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          email: string;
          password_hash: string;
          name: string;
          role?: string;
          tenant_id?: string | null;
          is_active?: boolean | null;
          last_login_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          email?: string;
          password_hash?: string;
          name?: string;
          role?: string;
          tenant_id?: string | null;
          is_active?: boolean | null;
          last_login_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "admin_users_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      appointments: {
        Row: {
          appointment_data: import("../types/database.types").Json | null;
          cancellation_reason: string | null;
          cancelled_at: string | null;
          cancelled_by: string | null;
          created_at: string | null;
          currency: string | null;
          customer_notes: string | null;
          end_time: string;
          external_event_id: string | null;
          final_price: number | null;
          id: string;
          internal_notes: string | null;
          quoted_price: number | null;
          service_id: string | null;
          start_time: string;
          status: Database["public"]["Enums"]["appointment_status"] | null;
          tenant_id: string | null;
          timezone: string | null;
          updated_at: string | null;
          user_id: string | null;
        };
        Insert: {
          appointment_data?: import("../types/database.types").Json | null;
          cancellation_reason?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          created_at?: string | null;
          currency?: string | null;
          customer_notes?: string | null;
          end_time: string;
          external_event_id?: string | null;
          final_price?: number | null;
          id?: string;
          internal_notes?: string | null;
          quoted_price?: number | null;
          service_id?: string | null;
          start_time: string;
          status?: Database["public"]["Enums"]["appointment_status"] | null;
          tenant_id?: string | null;
          timezone?: string | null;
          updated_at?: string | null;
          user_id?: string | null;
        };
        Update: {
          appointment_data?: import("../types/database.types").Json | null;
          cancellation_reason?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          created_at?: string | null;
          currency?: string | null;
          customer_notes?: string | null;
          end_time?: string;
          external_event_id?: string | null;
          final_price?: number | null;
          id?: string;
          internal_notes?: string | null;
          quoted_price?: number | null;
          service_id?: string | null;
          start_time?: string;
          status?: Database["public"]["Enums"]["appointment_status"] | null;
          tenant_id?: string | null;
          timezone?: string | null;
          updated_at?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "appointments_service_id_fkey";
            columns: ["service_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointments_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointments_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      availability_templates: {
        Row: {
          created_at: string | null;
          friday_slots: import("../types/database.types").Json | null;
          id: string;
          is_default: boolean | null;
          monday_slots: import("../types/database.types").Json | null;
          name: string;
          saturday_slots: import("../types/database.types").Json | null;
          special_dates: import("../types/database.types").Json | null;
          sunday_slots: import("../types/database.types").Json | null;
          tenant_id: string | null;
          thursday_slots: import("../types/database.types").Json | null;
          tuesday_slots: import("../types/database.types").Json | null;
          updated_at: string | null;
          wednesday_slots: import("../types/database.types").Json | null;
        };
        Insert: {
          created_at?: string | null;
          friday_slots?: import("../types/database.types").Json | null;
          id?: string;
          is_default?: boolean | null;
          monday_slots?: import("../types/database.types").Json | null;
          name: string;
          saturday_slots?: import("../types/database.types").Json | null;
          special_dates?: import("../types/database.types").Json | null;
          sunday_slots?: import("../types/database.types").Json | null;
          tenant_id?: string | null;
          thursday_slots?: import("../types/database.types").Json | null;
          tuesday_slots?: import("../types/database.types").Json | null;
          updated_at?: string | null;
          wednesday_slots?: import("../types/database.types").Json | null;
        };
        Update: {
          created_at?: string | null;
          friday_slots?: import("../types/database.types").Json | null;
          id?: string;
          is_default?: boolean | null;
          monday_slots?: import("../types/database.types").Json | null;
          name?: string;
          saturday_slots?: import("../types/database.types").Json | null;
          special_dates?: import("../types/database.types").Json | null;
          sunday_slots?: import("../types/database.types").Json | null;
          tenant_id?: string | null;
          thursday_slots?: import("../types/database.types").Json | null;
          tuesday_slots?: import("../types/database.types").Json | null;
          updated_at?: string | null;
          wednesday_slots?: import("../types/database.types").Json | null;
        };
        Relationships: [
          {
            foreignKeyName: "availability_templates_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      conversation_history: {
        Row: {
          confidence_score: number | null;
          content: string;
          conversation_context: import("../types/database.types").Json | null;
          created_at: string | null;
          id: string;
          intent_detected: string | null;
          is_from_user: boolean;
          message_content: string | null;
          message_id: string | null;
          message_type: string;
          phone_number: string | null;
          raw_message: import("../types/database.types").Json | null;
          tenant_id: string;
          user_id: string | null;
          user_name: string | null;
        };
        Insert: {
          confidence_score?: number | null;
          content: string;
          conversation_context?: import("../types/database.types").Json | null;
          created_at?: string | null;
          id?: string;
          intent_detected?: string | null;
          is_from_user: boolean;
          message_content?: string | null;
          message_id?: string | null;
          message_type: string;
          phone_number?: string | null;
          raw_message?: import("../types/database.types").Json | null;
          tenant_id: string;
          user_id?: string | null;
          user_name?: string | null;
        };
        Update: {
          confidence_score?: number | null;
          content?: string;
          conversation_context?: import("../types/database.types").Json | null;
          created_at?: string | null;
          id?: string;
          intent_detected?: string | null;
          is_from_user?: boolean;
          message_content?: string | null;
          message_id?: string | null;
          message_type?: string;
          phone_number?: string | null;
          raw_message?: import("../types/database.types").Json | null;
          tenant_id?: string;
          user_id?: string | null;
          user_name?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "conversation_history_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversation_history_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      conversation_states: {
        Row: {
          context: import("../types/database.types").Json | null;
          created_at: string | null;
          current_step: string | null;
          id: string;
          last_message_at: string | null;
          phone_number: string;
          tenant_id: string;
          updated_at: string | null;
        };
        Insert: {
          context?: import("../types/database.types").Json | null;
          created_at?: string | null;
          current_step?: string | null;
          id?: string;
          last_message_at?: string | null;
          phone_number: string;
          tenant_id: string;
          updated_at?: string | null;
        };
        Update: {
          context?: import("../types/database.types").Json | null;
          created_at?: string | null;
          current_step?: string | null;
          id?: string;
          last_message_at?: string | null;
          phone_number?: string;
          tenant_id?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "conversation_states_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      service_categories: {
        Row: {
          created_at: string | null;
          description: string | null;
          display_order: number | null;
          id: string;
          name: string;
          tenant_id: string | null;
        };
        Insert: {
          created_at?: string | null;
          description?: string | null;
          display_order?: number | null;
          id?: string;
          name: string;
          tenant_id?: string | null;
        };
        Update: {
          created_at?: string | null;
          description?: string | null;
          display_order?: number | null;
          id?: string;
          name?: string;
          tenant_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "service_categories_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      services: {
        Row: {
          advance_booking_days: number | null;
          base_price: number | null;
          category_id: string | null;
          created_at: string | null;
          currency: string | null;
          description: string | null;
          display_order: number | null;
          duration_max: number | null;
          duration_min: number | null;
          duration_minutes: number | null;
          duration_type: Database["public"]["Enums"]["duration_type"];
          id: string;
          is_active: boolean | null;
          max_bookings_per_day: number | null;
          name: string;
          price_model: Database["public"]["Enums"]["price_model"];
          service_config: import("../types/database.types").Json | null;
          tenant_id: string | null;
          updated_at: string | null;
        };
        Insert: {
          advance_booking_days?: number | null;
          base_price?: number | null;
          category_id?: string | null;
          created_at?: string | null;
          currency?: string | null;
          description?: string | null;
          display_order?: number | null;
          duration_max?: number | null;
          duration_min?: number | null;
          duration_minutes?: number | null;
          duration_type?: Database["public"]["Enums"]["duration_type"];
          id?: string;
          is_active?: boolean | null;
          max_bookings_per_day?: number | null;
          name: string;
          price_model?: Database["public"]["Enums"]["price_model"];
          service_config?: import("../types/database.types").Json | null;
          tenant_id?: string | null;
          updated_at?: string | null;
        };
        Update: {
          advance_booking_days?: number | null;
          base_price?: number | null;
          category_id?: string | null;
          created_at?: string | null;
          currency?: string | null;
          description?: string | null;
          display_order?: number | null;
          duration_max?: number | null;
          duration_min?: number | null;
          duration_minutes?: number | null;
          duration_type?: Database["public"]["Enums"]["duration_type"];
          id?: string;
          is_active?: boolean | null;
          max_bookings_per_day?: number | null;
          name?: string;
          price_model?: Database["public"]["Enums"]["price_model"];
          service_config?: import("../types/database.types").Json | null;
          tenant_id?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "services_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "service_categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "services_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      tenants: {
        Row: {
          ai_settings: import("../types/database.types").Json;
          business_address: import("../types/database.types").Json | null;
          business_description: string | null;
          business_name: string;
          business_rules: import("../types/database.types").Json;
          created_at: string | null;
          domain: Database["public"]["Enums"]["business_domain"];
          domain_config: import("../types/database.types").Json;
          email: string;
          id: string;
          name: string;
          phone: string;
          slug: string;
          status: string | null;
          subscription_plan: string | null;
          updated_at: string | null;
          whatsapp_phone: string | null;
          whatsapp_settings: import("../types/database.types").Json | null;
        };
        Insert: {
          ai_settings?: import("../types/database.types").Json;
          business_address?: import("../types/database.types").Json | null;
          business_description?: string | null;
          business_name: string;
          business_rules?: import("../types/database.types").Json;
          created_at?: string | null;
          domain: Database["public"]["Enums"]["business_domain"];
          domain_config?: import("../types/database.types").Json;
          email: string;
          id?: string;
          name: string;
          phone: string;
          slug: string;
          status?: string | null;
          subscription_plan?: string | null;
          updated_at?: string | null;
          whatsapp_phone?: string | null;
          whatsapp_settings?: import("../types/database.types").Json | null;
        };
        Update: {
          ai_settings?: import("../types/database.types").Json;
          business_address?: import("../types/database.types").Json | null;
          business_description?: string | null;
          business_name?: string;
          business_rules?: import("../types/database.types").Json;
          created_at?: string | null;
          domain?: Database["public"]["Enums"]["business_domain"];
          domain_config?: import("../types/database.types").Json;
          email?: string;
          id?: string;
          name?: string;
          phone?: string;
          slug?: string;
          status?: string | null;
          subscription_plan?: string | null;
          updated_at?: string | null;
          whatsapp_phone?: string | null;
          whatsapp_settings?: import("../types/database.types").Json | null;
        };
        Relationships: [];
      };
      user_tenants: {
        Row: {
          first_interaction: string | null;
          last_interaction: string | null;
          role: string | null;
          tenant_id: string;
          tenant_preferences: import("../types/database.types").Json | null;
          total_bookings: number | null;
          user_id: string;
        };
        Insert: {
          first_interaction?: string | null;
          last_interaction?: string | null;
          role?: string | null;
          tenant_id: string;
          tenant_preferences?: import("../types/database.types").Json | null;
          total_bookings?: number | null;
          user_id: string;
        };
        Update: {
          first_interaction?: string | null;
          last_interaction?: string | null;
          role?: string | null;
          tenant_id?: string;
          tenant_preferences?: import("../types/database.types").Json | null;
          total_bookings?: number | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_tenants_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_tenants_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      users: {
        Row: {
          created_at: string | null;
          email: string | null;
          id: string;
          name: string | null;
          phone: string;
          preferences: import("../types/database.types").Json | null;
          updated_at: string | null;
        };
        Insert: {
          created_at?: string | null;
          email?: string | null;
          id?: string;
          name?: string | null;
          phone: string;
          preferences?: import("../types/database.types").Json | null;
          updated_at?: string | null;
        };
        Update: {
          created_at?: string | null;
          email?: string | null;
          id?: string;
          name?: string | null;
          phone?: string;
          preferences?: import("../types/database.types").Json | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      whatsapp_media: {
        Row: {
          caption: string | null;
          created_at: string | null;
          file_size: number | null;
          filename: string | null;
          id: string;
          local_path: string | null;
          media_id: string;
          media_type: string;
          media_url: string | null;
          message_id: string;
          mime_type: string | null;
          phone_number: string;
          tenant_id: string;
          updated_at: string | null;
        };
        Insert: {
          caption?: string | null;
          created_at?: string | null;
          file_size?: number | null;
          filename?: string | null;
          id?: string;
          local_path?: string | null;
          media_id: string;
          media_type: string;
          media_url?: string | null;
          message_id: string;
          mime_type?: string | null;
          phone_number: string;
          tenant_id: string;
          updated_at?: string | null;
        };
        Update: {
          caption?: string | null;
          created_at?: string | null;
          file_size?: number | null;
          filename?: string | null;
          id?: string;
          local_path?: string | null;
          media_id?: string;
          media_type?: string;
          media_url?: string | null;
          message_id?: string;
          mime_type?: string | null;
          phone_number?: string;
          tenant_id?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "whatsapp_media_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      whatsapp_templates: {
        Row: {
          category: string | null;
          components: import("../types/database.types").Json | null;
          created_at: string | null;
          id: string;
          is_active: boolean | null;
          language_code: string | null;
          name: string;
          status: string | null;
          template_name: string;
          tenant_id: string;
          updated_at: string | null;
        };
        Insert: {
          category?: string | null;
          components?: import("../types/database.types").Json | null;
          created_at?: string | null;
          id?: string;
          is_active?: boolean | null;
          language_code?: string | null;
          name: string;
          status?: string | null;
          template_name: string;
          tenant_id: string;
          updated_at?: string | null;
        };
        Update: {
          category?: string | null;
          components?: import("../types/database.types").Json | null;
          created_at?: string | null;
          id?: string;
          is_active?: boolean | null;
          language_code?: string | null;
          name?: string;
          status?: string | null;
          template_name?: string;
          tenant_id?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "whatsapp_templates_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      calendar_sync_tokens: {
        Row: {
          id: string;
          tenant_id: string | null;
          google_calendar_id: string | null;
          sync_token: string | null;
          last_sync_at: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          tenant_id?: string | null;
          google_calendar_id?: string | null;
          sync_token?: string | null;
          last_sync_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          tenant_id?: string | null;
          google_calendar_id?: string | null;
          sync_token?: string | null;
          last_sync_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "calendar_sync_tokens_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      email_logs: {
        Row: {
          id: string;
          tenant_id: string | null;
          recipient_email: string;
          subject: string | null;
          template_name: string | null;
          status: string | null;
          error_message: string | null;
          sent_at: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          tenant_id?: string | null;
          recipient_email: string;
          subject?: string | null;
          template_name?: string | null;
          status?: string | null;
          error_message?: string | null;
          sent_at?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          tenant_id?: string | null;
          recipient_email?: string;
          subject?: string | null;
          template_name?: string | null;
          status?: string | null;
          error_message?: string | null;
          sent_at?: string | null;
          created_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "email_logs_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      function_executions: {
        Row: {
          id: string;
          tenant_id: string | null;
          function_name: string;
          execution_time_ms: number | null;
          success: boolean | null;
          error_message: string | null;
          input_data: import("../types/database.types").Json | null;
          output_data: import("../types/database.types").Json | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          tenant_id?: string | null;
          function_name: string;
          execution_time_ms?: number | null;
          success?: boolean | null;
          error_message?: string | null;
          input_data?: import("../types/database.types").Json | null;
          output_data?: import("../types/database.types").Json | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          tenant_id?: string | null;
          function_name?: string;
          execution_time_ms?: number | null;
          success?: boolean | null;
          error_message?: string | null;
          input_data?: import("../types/database.types").Json | null;
          output_data?: import("../types/database.types").Json | null;
          created_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "function_executions_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      system_health_logs: {
        Row: {
          id: string;
          component: string;
          status: string;
          details: import("../types/database.types").Json | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          component: string;
          status: string;
          details?: import("../types/database.types").Json | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          component?: string;
          status?: string;
          details?: import("../types/database.types").Json | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      citext: {
        Args:
          | {
              "": boolean;
            }
          | {
              "": string;
            }
          | {
              "": unknown;
            };
        Returns: string;
      };
      citext_hash: {
        Args: {
          "": string;
        };
        Returns: number;
      };
      citextin: {
        Args: {
          "": unknown;
        };
        Returns: string;
      };
      citextout: {
        Args: {
          "": string;
        };
        Returns: unknown;
      };
      citextrecv: {
        Args: {
          "": unknown;
        };
        Returns: string;
      };
      citextsend: {
        Args: {
          "": string;
        };
        Returns: string;
      };
    };
    Enums: {
      appointment_status:
        | "pending"
        | "confirmed"
        | "in_progress"
        | "completed"
        | "cancelled"
        | "no_show"
        | "rescheduled";
      business_domain:
        | "legal"
        | "healthcare"
        | "education"
        | "beauty"
        | "sports"
        | "consulting"
        | "other";
      duration_type: "fixed" | "variable" | "estimated" | "session";
      price_model: "fixed" | "hourly" | "package" | "dynamic" | "consultation";
    };
    CompositeTypes: { [_ in never]: never };
  }
>;
export declare const supabaseAdmin: import("@supabase/supabase-js").SupabaseClient<
  Database,
  "public",
  {
    Tables: {
      admin_permissions: {
        Row: {
          id: string;
          admin_user_id: string | null;
          permission: string;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          admin_user_id?: string | null;
          permission: string;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          admin_user_id?: string | null;
          permission?: string;
          created_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "admin_permissions_admin_user_id_fkey";
            columns: ["admin_user_id"];
            isOneToOne: false;
            referencedRelation: "admin_users";
            referencedColumns: ["id"];
          },
        ];
      };
      admin_users: {
        Row: {
          id: string;
          email: string;
          password_hash: string;
          name: string;
          role: string;
          tenant_id: string | null;
          is_active: boolean | null;
          last_login_at: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          email: string;
          password_hash: string;
          name: string;
          role?: string;
          tenant_id?: string | null;
          is_active?: boolean | null;
          last_login_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          email?: string;
          password_hash?: string;
          name?: string;
          role?: string;
          tenant_id?: string | null;
          is_active?: boolean | null;
          last_login_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "admin_users_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      appointments: {
        Row: {
          appointment_data: import("../types/database.types").Json | null;
          cancellation_reason: string | null;
          cancelled_at: string | null;
          cancelled_by: string | null;
          created_at: string | null;
          currency: string | null;
          customer_notes: string | null;
          end_time: string;
          external_event_id: string | null;
          final_price: number | null;
          id: string;
          internal_notes: string | null;
          quoted_price: number | null;
          service_id: string | null;
          start_time: string;
          status: Database["public"]["Enums"]["appointment_status"] | null;
          tenant_id: string | null;
          timezone: string | null;
          updated_at: string | null;
          user_id: string | null;
        };
        Insert: {
          appointment_data?: import("../types/database.types").Json | null;
          cancellation_reason?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          created_at?: string | null;
          currency?: string | null;
          customer_notes?: string | null;
          end_time: string;
          external_event_id?: string | null;
          final_price?: number | null;
          id?: string;
          internal_notes?: string | null;
          quoted_price?: number | null;
          service_id?: string | null;
          start_time: string;
          status?: Database["public"]["Enums"]["appointment_status"] | null;
          tenant_id?: string | null;
          timezone?: string | null;
          updated_at?: string | null;
          user_id?: string | null;
        };
        Update: {
          appointment_data?: import("../types/database.types").Json | null;
          cancellation_reason?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          created_at?: string | null;
          currency?: string | null;
          customer_notes?: string | null;
          end_time?: string;
          external_event_id?: string | null;
          final_price?: number | null;
          id?: string;
          internal_notes?: string | null;
          quoted_price?: number | null;
          service_id?: string | null;
          start_time?: string;
          status?: Database["public"]["Enums"]["appointment_status"] | null;
          tenant_id?: string | null;
          timezone?: string | null;
          updated_at?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "appointments_service_id_fkey";
            columns: ["service_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointments_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointments_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      availability_templates: {
        Row: {
          created_at: string | null;
          friday_slots: import("../types/database.types").Json | null;
          id: string;
          is_default: boolean | null;
          monday_slots: import("../types/database.types").Json | null;
          name: string;
          saturday_slots: import("../types/database.types").Json | null;
          special_dates: import("../types/database.types").Json | null;
          sunday_slots: import("../types/database.types").Json | null;
          tenant_id: string | null;
          thursday_slots: import("../types/database.types").Json | null;
          tuesday_slots: import("../types/database.types").Json | null;
          updated_at: string | null;
          wednesday_slots: import("../types/database.types").Json | null;
        };
        Insert: {
          created_at?: string | null;
          friday_slots?: import("../types/database.types").Json | null;
          id?: string;
          is_default?: boolean | null;
          monday_slots?: import("../types/database.types").Json | null;
          name: string;
          saturday_slots?: import("../types/database.types").Json | null;
          special_dates?: import("../types/database.types").Json | null;
          sunday_slots?: import("../types/database.types").Json | null;
          tenant_id?: string | null;
          thursday_slots?: import("../types/database.types").Json | null;
          tuesday_slots?: import("../types/database.types").Json | null;
          updated_at?: string | null;
          wednesday_slots?: import("../types/database.types").Json | null;
        };
        Update: {
          created_at?: string | null;
          friday_slots?: import("../types/database.types").Json | null;
          id?: string;
          is_default?: boolean | null;
          monday_slots?: import("../types/database.types").Json | null;
          name?: string;
          saturday_slots?: import("../types/database.types").Json | null;
          special_dates?: import("../types/database.types").Json | null;
          sunday_slots?: import("../types/database.types").Json | null;
          tenant_id?: string | null;
          thursday_slots?: import("../types/database.types").Json | null;
          tuesday_slots?: import("../types/database.types").Json | null;
          updated_at?: string | null;
          wednesday_slots?: import("../types/database.types").Json | null;
        };
        Relationships: [
          {
            foreignKeyName: "availability_templates_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      conversation_history: {
        Row: {
          confidence_score: number | null;
          content: string;
          conversation_context: import("../types/database.types").Json | null;
          created_at: string | null;
          id: string;
          intent_detected: string | null;
          is_from_user: boolean;
          message_content: string | null;
          message_id: string | null;
          message_type: string;
          phone_number: string | null;
          raw_message: import("../types/database.types").Json | null;
          tenant_id: string;
          user_id: string | null;
          user_name: string | null;
        };
        Insert: {
          confidence_score?: number | null;
          content: string;
          conversation_context?: import("../types/database.types").Json | null;
          created_at?: string | null;
          id?: string;
          intent_detected?: string | null;
          is_from_user: boolean;
          message_content?: string | null;
          message_id?: string | null;
          message_type: string;
          phone_number?: string | null;
          raw_message?: import("../types/database.types").Json | null;
          tenant_id: string;
          user_id?: string | null;
          user_name?: string | null;
        };
        Update: {
          confidence_score?: number | null;
          content?: string;
          conversation_context?: import("../types/database.types").Json | null;
          created_at?: string | null;
          id?: string;
          intent_detected?: string | null;
          is_from_user?: boolean;
          message_content?: string | null;
          message_id?: string | null;
          message_type?: string;
          phone_number?: string | null;
          raw_message?: import("../types/database.types").Json | null;
          tenant_id?: string;
          user_id?: string | null;
          user_name?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "conversation_history_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversation_history_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      conversation_states: {
        Row: {
          context: import("../types/database.types").Json | null;
          created_at: string | null;
          current_step: string | null;
          id: string;
          last_message_at: string | null;
          phone_number: string;
          tenant_id: string;
          updated_at: string | null;
        };
        Insert: {
          context?: import("../types/database.types").Json | null;
          created_at?: string | null;
          current_step?: string | null;
          id?: string;
          last_message_at?: string | null;
          phone_number: string;
          tenant_id: string;
          updated_at?: string | null;
        };
        Update: {
          context?: import("../types/database.types").Json | null;
          created_at?: string | null;
          current_step?: string | null;
          id?: string;
          last_message_at?: string | null;
          phone_number?: string;
          tenant_id?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "conversation_states_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      service_categories: {
        Row: {
          created_at: string | null;
          description: string | null;
          display_order: number | null;
          id: string;
          name: string;
          tenant_id: string | null;
        };
        Insert: {
          created_at?: string | null;
          description?: string | null;
          display_order?: number | null;
          id?: string;
          name: string;
          tenant_id?: string | null;
        };
        Update: {
          created_at?: string | null;
          description?: string | null;
          display_order?: number | null;
          id?: string;
          name?: string;
          tenant_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "service_categories_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      services: {
        Row: {
          advance_booking_days: number | null;
          base_price: number | null;
          category_id: string | null;
          created_at: string | null;
          currency: string | null;
          description: string | null;
          display_order: number | null;
          duration_max: number | null;
          duration_min: number | null;
          duration_minutes: number | null;
          duration_type: Database["public"]["Enums"]["duration_type"];
          id: string;
          is_active: boolean | null;
          max_bookings_per_day: number | null;
          name: string;
          price_model: Database["public"]["Enums"]["price_model"];
          service_config: import("../types/database.types").Json | null;
          tenant_id: string | null;
          updated_at: string | null;
        };
        Insert: {
          advance_booking_days?: number | null;
          base_price?: number | null;
          category_id?: string | null;
          created_at?: string | null;
          currency?: string | null;
          description?: string | null;
          display_order?: number | null;
          duration_max?: number | null;
          duration_min?: number | null;
          duration_minutes?: number | null;
          duration_type?: Database["public"]["Enums"]["duration_type"];
          id?: string;
          is_active?: boolean | null;
          max_bookings_per_day?: number | null;
          name: string;
          price_model?: Database["public"]["Enums"]["price_model"];
          service_config?: import("../types/database.types").Json | null;
          tenant_id?: string | null;
          updated_at?: string | null;
        };
        Update: {
          advance_booking_days?: number | null;
          base_price?: number | null;
          category_id?: string | null;
          created_at?: string | null;
          currency?: string | null;
          description?: string | null;
          display_order?: number | null;
          duration_max?: number | null;
          duration_min?: number | null;
          duration_minutes?: number | null;
          duration_type?: Database["public"]["Enums"]["duration_type"];
          id?: string;
          is_active?: boolean | null;
          max_bookings_per_day?: number | null;
          name?: string;
          price_model?: Database["public"]["Enums"]["price_model"];
          service_config?: import("../types/database.types").Json | null;
          tenant_id?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "services_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "service_categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "services_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      tenants: {
        Row: {
          ai_settings: import("../types/database.types").Json;
          business_address: import("../types/database.types").Json | null;
          business_description: string | null;
          business_name: string;
          business_rules: import("../types/database.types").Json;
          created_at: string | null;
          domain: Database["public"]["Enums"]["business_domain"];
          domain_config: import("../types/database.types").Json;
          email: string;
          id: string;
          name: string;
          phone: string;
          slug: string;
          status: string | null;
          subscription_plan: string | null;
          updated_at: string | null;
          whatsapp_phone: string | null;
          whatsapp_settings: import("../types/database.types").Json | null;
        };
        Insert: {
          ai_settings?: import("../types/database.types").Json;
          business_address?: import("../types/database.types").Json | null;
          business_description?: string | null;
          business_name: string;
          business_rules?: import("../types/database.types").Json;
          created_at?: string | null;
          domain: Database["public"]["Enums"]["business_domain"];
          domain_config?: import("../types/database.types").Json;
          email: string;
          id?: string;
          name: string;
          phone: string;
          slug: string;
          status?: string | null;
          subscription_plan?: string | null;
          updated_at?: string | null;
          whatsapp_phone?: string | null;
          whatsapp_settings?: import("../types/database.types").Json | null;
        };
        Update: {
          ai_settings?: import("../types/database.types").Json;
          business_address?: import("../types/database.types").Json | null;
          business_description?: string | null;
          business_name?: string;
          business_rules?: import("../types/database.types").Json;
          created_at?: string | null;
          domain?: Database["public"]["Enums"]["business_domain"];
          domain_config?: import("../types/database.types").Json;
          email?: string;
          id?: string;
          name?: string;
          phone?: string;
          slug?: string;
          status?: string | null;
          subscription_plan?: string | null;
          updated_at?: string | null;
          whatsapp_phone?: string | null;
          whatsapp_settings?: import("../types/database.types").Json | null;
        };
        Relationships: [];
      };
      user_tenants: {
        Row: {
          first_interaction: string | null;
          last_interaction: string | null;
          role: string | null;
          tenant_id: string;
          tenant_preferences: import("../types/database.types").Json | null;
          total_bookings: number | null;
          user_id: string;
        };
        Insert: {
          first_interaction?: string | null;
          last_interaction?: string | null;
          role?: string | null;
          tenant_id: string;
          tenant_preferences?: import("../types/database.types").Json | null;
          total_bookings?: number | null;
          user_id: string;
        };
        Update: {
          first_interaction?: string | null;
          last_interaction?: string | null;
          role?: string | null;
          tenant_id?: string;
          tenant_preferences?: import("../types/database.types").Json | null;
          total_bookings?: number | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_tenants_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_tenants_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      users: {
        Row: {
          created_at: string | null;
          email: string | null;
          id: string;
          name: string | null;
          phone: string;
          preferences: import("../types/database.types").Json | null;
          updated_at: string | null;
        };
        Insert: {
          created_at?: string | null;
          email?: string | null;
          id?: string;
          name?: string | null;
          phone: string;
          preferences?: import("../types/database.types").Json | null;
          updated_at?: string | null;
        };
        Update: {
          created_at?: string | null;
          email?: string | null;
          id?: string;
          name?: string | null;
          phone?: string;
          preferences?: import("../types/database.types").Json | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      whatsapp_media: {
        Row: {
          caption: string | null;
          created_at: string | null;
          file_size: number | null;
          filename: string | null;
          id: string;
          local_path: string | null;
          media_id: string;
          media_type: string;
          media_url: string | null;
          message_id: string;
          mime_type: string | null;
          phone_number: string;
          tenant_id: string;
          updated_at: string | null;
        };
        Insert: {
          caption?: string | null;
          created_at?: string | null;
          file_size?: number | null;
          filename?: string | null;
          id?: string;
          local_path?: string | null;
          media_id: string;
          media_type: string;
          media_url?: string | null;
          message_id: string;
          mime_type?: string | null;
          phone_number: string;
          tenant_id: string;
          updated_at?: string | null;
        };
        Update: {
          caption?: string | null;
          created_at?: string | null;
          file_size?: number | null;
          filename?: string | null;
          id?: string;
          local_path?: string | null;
          media_id?: string;
          media_type?: string;
          media_url?: string | null;
          message_id?: string;
          mime_type?: string | null;
          phone_number?: string;
          tenant_id?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "whatsapp_media_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      whatsapp_templates: {
        Row: {
          category: string | null;
          components: import("../types/database.types").Json | null;
          created_at: string | null;
          id: string;
          is_active: boolean | null;
          language_code: string | null;
          name: string;
          status: string | null;
          template_name: string;
          tenant_id: string;
          updated_at: string | null;
        };
        Insert: {
          category?: string | null;
          components?: import("../types/database.types").Json | null;
          created_at?: string | null;
          id?: string;
          is_active?: boolean | null;
          language_code?: string | null;
          name: string;
          status?: string | null;
          template_name: string;
          tenant_id: string;
          updated_at?: string | null;
        };
        Update: {
          category?: string | null;
          components?: import("../types/database.types").Json | null;
          created_at?: string | null;
          id?: string;
          is_active?: boolean | null;
          language_code?: string | null;
          name?: string;
          status?: string | null;
          template_name?: string;
          tenant_id?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "whatsapp_templates_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      calendar_sync_tokens: {
        Row: {
          id: string;
          tenant_id: string | null;
          google_calendar_id: string | null;
          sync_token: string | null;
          last_sync_at: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          tenant_id?: string | null;
          google_calendar_id?: string | null;
          sync_token?: string | null;
          last_sync_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          tenant_id?: string | null;
          google_calendar_id?: string | null;
          sync_token?: string | null;
          last_sync_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "calendar_sync_tokens_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      email_logs: {
        Row: {
          id: string;
          tenant_id: string | null;
          recipient_email: string;
          subject: string | null;
          template_name: string | null;
          status: string | null;
          error_message: string | null;
          sent_at: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          tenant_id?: string | null;
          recipient_email: string;
          subject?: string | null;
          template_name?: string | null;
          status?: string | null;
          error_message?: string | null;
          sent_at?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          tenant_id?: string | null;
          recipient_email?: string;
          subject?: string | null;
          template_name?: string | null;
          status?: string | null;
          error_message?: string | null;
          sent_at?: string | null;
          created_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "email_logs_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      function_executions: {
        Row: {
          id: string;
          tenant_id: string | null;
          function_name: string;
          execution_time_ms: number | null;
          success: boolean | null;
          error_message: string | null;
          input_data: import("../types/database.types").Json | null;
          output_data: import("../types/database.types").Json | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          tenant_id?: string | null;
          function_name: string;
          execution_time_ms?: number | null;
          success?: boolean | null;
          error_message?: string | null;
          input_data?: import("../types/database.types").Json | null;
          output_data?: import("../types/database.types").Json | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          tenant_id?: string | null;
          function_name?: string;
          execution_time_ms?: number | null;
          success?: boolean | null;
          error_message?: string | null;
          input_data?: import("../types/database.types").Json | null;
          output_data?: import("../types/database.types").Json | null;
          created_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "function_executions_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      system_health_logs: {
        Row: {
          id: string;
          component: string;
          status: string;
          details: import("../types/database.types").Json | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          component: string;
          status: string;
          details?: import("../types/database.types").Json | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          component?: string;
          status?: string;
          details?: import("../types/database.types").Json | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      citext: {
        Args:
          | {
              "": boolean;
            }
          | {
              "": string;
            }
          | {
              "": unknown;
            };
        Returns: string;
      };
      citext_hash: {
        Args: {
          "": string;
        };
        Returns: number;
      };
      citextin: {
        Args: {
          "": unknown;
        };
        Returns: string;
      };
      citextout: {
        Args: {
          "": string;
        };
        Returns: unknown;
      };
      citextrecv: {
        Args: {
          "": unknown;
        };
        Returns: string;
      };
      citextsend: {
        Args: {
          "": string;
        };
        Returns: string;
      };
    };
    Enums: {
      appointment_status:
        | "pending"
        | "confirmed"
        | "in_progress"
        | "completed"
        | "cancelled"
        | "no_show"
        | "rescheduled";
      business_domain:
        | "legal"
        | "healthcare"
        | "education"
        | "beauty"
        | "sports"
        | "consulting"
        | "other";
      duration_type: "fixed" | "variable" | "estimated" | "session";
      price_model: "fixed" | "hourly" | "package" | "dynamic" | "consultation";
    };
    CompositeTypes: { [_ in never]: never };
  }
>;
export default supabase;
//# sourceMappingURL=database.d.ts.map
