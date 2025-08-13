export type Json =
  | string
  | number
  | boolean
  | null
  | {
      [key: string]: Json | undefined;
    }
  | Json[];
export type Database = {
  public: {
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
          appointment_data: Json | null;
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
          appointment_data?: Json | null;
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
          appointment_data?: Json | null;
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
          friday_slots: Json | null;
          id: string;
          is_default: boolean | null;
          monday_slots: Json | null;
          name: string;
          saturday_slots: Json | null;
          special_dates: Json | null;
          sunday_slots: Json | null;
          tenant_id: string | null;
          thursday_slots: Json | null;
          tuesday_slots: Json | null;
          updated_at: string | null;
          wednesday_slots: Json | null;
        };
        Insert: {
          created_at?: string | null;
          friday_slots?: Json | null;
          id?: string;
          is_default?: boolean | null;
          monday_slots?: Json | null;
          name: string;
          saturday_slots?: Json | null;
          special_dates?: Json | null;
          sunday_slots?: Json | null;
          tenant_id?: string | null;
          thursday_slots?: Json | null;
          tuesday_slots?: Json | null;
          updated_at?: string | null;
          wednesday_slots?: Json | null;
        };
        Update: {
          created_at?: string | null;
          friday_slots?: Json | null;
          id?: string;
          is_default?: boolean | null;
          monday_slots?: Json | null;
          name?: string;
          saturday_slots?: Json | null;
          special_dates?: Json | null;
          sunday_slots?: Json | null;
          tenant_id?: string | null;
          thursday_slots?: Json | null;
          tuesday_slots?: Json | null;
          updated_at?: string | null;
          wednesday_slots?: Json | null;
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
          conversation_context: Json | null;
          conversation_outcome: string | null;
          created_at: string | null;
          id: string;
          intent_detected: string | null;
          is_from_user: boolean;
          message_content: string | null;
          message_id: string | null;
          message_type: string;
          phone_number: string | null;
          raw_message: Json | null;
          tenant_id: string;
          user_id: string | null;
          user_name: string | null;
        };
        Insert: {
          confidence_score?: number | null;
          content: string;
          conversation_context?: Json | null;
          conversation_outcome?: string | null;
          created_at?: string | null;
          id?: string;
          intent_detected?: string | null;
          is_from_user: boolean;
          message_content?: string | null;
          message_id?: string | null;
          message_type: string;
          phone_number?: string | null;
          raw_message?: Json | null;
          tenant_id: string;
          user_id?: string | null;
          user_name?: string | null;
        };
        Update: {
          confidence_score?: number | null;
          content?: string;
          conversation_context?: Json | null;
          conversation_outcome?: string | null;
          created_at?: string | null;
          id?: string;
          intent_detected?: string | null;
          is_from_user?: boolean;
          message_content?: string | null;
          message_id?: string | null;
          message_type?: string;
          phone_number?: string | null;
          raw_message?: Json | null;
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
          context: Json | null;
          created_at: string | null;
          current_step: string | null;
          id: string;
          last_message_at: string | null;
          phone_number: string;
          tenant_id: string;
          updated_at: string | null;
        };
        Insert: {
          context?: Json | null;
          created_at?: string | null;
          current_step?: string | null;
          id?: string;
          last_message_at?: string | null;
          phone_number: string;
          tenant_id: string;
          updated_at?: string | null;
        };
        Update: {
          context?: Json | null;
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
          service_config: Json | null;
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
          service_config?: Json | null;
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
          service_config?: Json | null;
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
          ai_settings: Json;
          business_address: Json | null;
          business_description: string | null;
          business_name: string;
          business_rules: Json;
          created_at: string | null;
          domain: Database["public"]["Enums"]["business_domain"];
          domain_config: Json;
          email: string;
          id: string;
          name: string;
          phone: string;
          slug: string;
          status: string | null;
          subscription_plan: string | null;
          updated_at: string | null;
          whatsapp_phone: string | null;
          whatsapp_settings: Json | null;
        };
        Insert: {
          ai_settings?: Json;
          business_address?: Json | null;
          business_description?: string | null;
          business_name: string;
          business_rules?: Json;
          created_at?: string | null;
          domain: Database["public"]["Enums"]["business_domain"];
          domain_config?: Json;
          email: string;
          id?: string;
          name: string;
          phone: string;
          slug: string;
          status?: string | null;
          subscription_plan?: string | null;
          updated_at?: string | null;
          whatsapp_phone?: string | null;
          whatsapp_settings?: Json | null;
        };
        Update: {
          ai_settings?: Json;
          business_address?: Json | null;
          business_description?: string | null;
          business_name?: string;
          business_rules?: Json;
          created_at?: string | null;
          domain?: Database["public"]["Enums"]["business_domain"];
          domain_config?: Json;
          email?: string;
          id?: string;
          name?: string;
          phone?: string;
          slug?: string;
          status?: string | null;
          subscription_plan?: string | null;
          updated_at?: string | null;
          whatsapp_phone?: string | null;
          whatsapp_settings?: Json | null;
        };
        Relationships: [];
      };
      user_tenants: {
        Row: {
          first_interaction: string | null;
          last_interaction: string | null;
          role: string | null;
          tenant_id: string;
          tenant_preferences: Json | null;
          total_bookings: number | null;
          user_id: string;
        };
        Insert: {
          first_interaction?: string | null;
          last_interaction?: string | null;
          role?: string | null;
          tenant_id: string;
          tenant_preferences?: Json | null;
          total_bookings?: number | null;
          user_id: string;
        };
        Update: {
          first_interaction?: string | null;
          last_interaction?: string | null;
          role?: string | null;
          tenant_id?: string;
          tenant_preferences?: Json | null;
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
      tenant_metrics: {
        Row: {
          id: string;
          tenant_id: string | null;
          metric_type: string;
          period: string;
          metric_data: Json;
          calculated_at: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          tenant_id?: string | null;
          metric_type: string;
          period: string;
          metric_data: Json;
          calculated_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          tenant_id?: string | null;
          metric_type?: string;
          period?: string;
          metric_data?: Json;
          calculated_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "tenant_metrics_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      platform_metrics: {
        Row: {
          id: string;
          calculation_date: string;
          period: string;

          // METADATA DA AGREGAÇÃO
          tenants_processed: number;
          total_tenants: number;
          calculation_method: string | null;
          data_quality_score: number | null;

          // PLATFORM MRR (do custo_plataforma)
          platform_mrr: number | null;

          // RECEITA TOTAL (do comprehensive)
          total_revenue: number | null;
          revenue_per_customer: number | null;
          revenue_per_appointment: number | null;
          total_revenue_validation: number | null;
          roi_per_conversation: number | null;

          // OPERACIONAIS (do comprehensive)
          active_tenants: number | null;
          total_appointments: number | null;
          total_chat_minutes: number | null;
          total_new_customers: number | null;
          total_sessions: number | null;
          total_professionals: number | null;
          total_services: number | null;

          // PERFORMANCE (médias ponderadas)
          avg_appointment_success_rate: number | null;
          avg_whatsapp_quality_score: number | null;
          avg_customer_satisfaction_score: number | null;
          avg_conversion_rate: number | null;
          avg_customer_retention_rate: number | null;
          avg_customer_recurrence_rate: number | null;

          // EFICIÊNCIA (médias ponderadas)
          avg_ai_assistant_efficiency: number | null;
          avg_response_time: number | null;
          avg_business_hours_utilization: number | null;
          avg_minutes_per_conversation: number | null;

          // CUSTO (do comprehensive + conversation_billing)
          avg_customer_acquisition_cost: number | null;
          avg_profit_margin_percentage: number | null;
          total_platform_cost_usd: number | null;
          avg_cost_per_conversation: number | null;

          // QUALIDADE (do conversation_billing)
          total_billable_conversations: number | null;
          avg_efficiency_pct: number | null;
          avg_spam_rate_pct: number | null;

          // CALCULADAS (derivadas)
          revenue_platform_ratio: number | null;
          avg_revenue_per_tenant: number | null;
          avg_appointments_per_tenant: number | null;
          avg_sessions_per_tenant: number | null;
          avg_customers_per_tenant: number | null;
          platform_utilization_score: number | null;

          // TIMESTAMPS
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          calculation_date: string;
          period: string;
          tenants_processed?: number;
          total_tenants?: number;
          calculation_method?: string | null;
          data_quality_score?: number | null;
          platform_mrr?: number | null;
          total_revenue?: number | null;
          revenue_per_customer?: number | null;
          revenue_per_appointment?: number | null;
          total_revenue_validation?: number | null;
          roi_per_conversation?: number | null;
          active_tenants?: number | null;
          total_appointments?: number | null;
          total_chat_minutes?: number | null;
          total_new_customers?: number | null;
          total_sessions?: number | null;
          total_professionals?: number | null;
          total_services?: number | null;
          avg_appointment_success_rate?: number | null;
          avg_whatsapp_quality_score?: number | null;
          avg_customer_satisfaction_score?: number | null;
          avg_conversion_rate?: number | null;
          avg_customer_retention_rate?: number | null;
          avg_customer_recurrence_rate?: number | null;
          avg_ai_assistant_efficiency?: number | null;
          avg_response_time?: number | null;
          avg_business_hours_utilization?: number | null;
          avg_minutes_per_conversation?: number | null;
          avg_customer_acquisition_cost?: number | null;
          avg_profit_margin_percentage?: number | null;
          total_platform_cost_usd?: number | null;
          avg_cost_per_conversation?: number | null;
          total_billable_conversations?: number | null;
          avg_efficiency_pct?: number | null;
          avg_spam_rate_pct?: number | null;
          revenue_platform_ratio?: number | null;
          avg_revenue_per_tenant?: number | null;
          avg_appointments_per_tenant?: number | null;
          avg_sessions_per_tenant?: number | null;
          avg_customers_per_tenant?: number | null;
          platform_utilization_score?: number | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          calculation_date?: string;
          period?: string;
          tenants_processed?: number;
          total_tenants?: number;
          calculation_method?: string | null;
          data_quality_score?: number | null;
          platform_mrr?: number | null;
          total_revenue?: number | null;
          revenue_per_customer?: number | null;
          revenue_per_appointment?: number | null;
          total_revenue_validation?: number | null;
          roi_per_conversation?: number | null;
          active_tenants?: number | null;
          total_appointments?: number | null;
          total_chat_minutes?: number | null;
          total_new_customers?: number | null;
          total_sessions?: number | null;
          total_professionals?: number | null;
          total_services?: number | null;
          avg_appointment_success_rate?: number | null;
          avg_whatsapp_quality_score?: number | null;
          avg_customer_satisfaction_score?: number | null;
          avg_conversion_rate?: number | null;
          avg_customer_retention_rate?: number | null;
          avg_customer_recurrence_rate?: number | null;
          avg_ai_assistant_efficiency?: number | null;
          avg_response_time?: number | null;
          avg_business_hours_utilization?: number | null;
          avg_minutes_per_conversation?: number | null;
          avg_customer_acquisition_cost?: number | null;
          avg_profit_margin_percentage?: number | null;
          total_platform_cost_usd?: number | null;
          avg_cost_per_conversation?: number | null;
          total_billable_conversations?: number | null;
          avg_efficiency_pct?: number | null;
          avg_spam_rate_pct?: number | null;
          revenue_platform_ratio?: number | null;
          avg_revenue_per_tenant?: number | null;
          avg_appointments_per_tenant?: number | null;
          avg_sessions_per_tenant?: number | null;
          avg_customers_per_tenant?: number | null;
          platform_utilization_score?: number | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      conversation_billing: {
        Row: {
          id: string;
          tenant_id: string | null;
          billing_period_start: string;
          billing_period_end: string;
          conversation_count: number | null;
          appointment_count: number | null;
          total_amount_brl: number | null;
          plan_used: string | null;
          was_upgraded: boolean | null;
          calculation_method: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          tenant_id?: string | null;
          billing_period_start: string;
          billing_period_end: string;
          conversation_count?: number | null;
          appointment_count?: number | null;
          total_amount_brl?: number | null;
          plan_used?: string | null;
          was_upgraded?: boolean | null;
          calculation_method?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          tenant_id?: string | null;
          billing_period_start?: string;
          billing_period_end?: string;
          conversation_count?: number | null;
          appointment_count?: number | null;
          total_amount_brl?: number | null;
          plan_used?: string | null;
          was_upgraded?: boolean | null;
          calculation_method?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "conversation_billing_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
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
          preferences: Json | null;
          updated_at: string | null;
        };
        Insert: {
          created_at?: string | null;
          email?: string | null;
          id?: string;
          name?: string | null;
          phone: string;
          preferences?: Json | null;
          updated_at?: string | null;
        };
        Update: {
          created_at?: string | null;
          email?: string | null;
          id?: string;
          name?: string | null;
          phone?: string;
          preferences?: Json | null;
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
          components: Json | null;
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
          components?: Json | null;
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
          components?: Json | null;
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
          input_data: Json | null;
          output_data: Json | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          tenant_id?: string | null;
          function_name: string;
          execution_time_ms?: number | null;
          success?: boolean | null;
          error_message?: string | null;
          input_data?: Json | null;
          output_data?: Json | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          tenant_id?: string | null;
          function_name?: string;
          execution_time_ms?: number | null;
          success?: boolean | null;
          error_message?: string | null;
          input_data?: Json | null;
          output_data?: Json | null;
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
          details: Json | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          component: string;
          status: string;
          details?: Json | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          component?: string;
          status?: string;
          details?: Json | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      analytics_system_metrics: {
        Row: {
          id: string;
          metric_date: string;
          period_type: string;
          total_tenants: number | null;
          active_tenants: number | null;
          total_appointments: number | null;
          total_revenue: number | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          metric_date: string;
          period_type: string;
          total_tenants?: number | null;
          active_tenants?: number | null;
          total_appointments?: number | null;
          total_revenue?: number | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          metric_date?: string;
          period_type?: string;
          total_tenants?: number | null;
          active_tenants?: number | null;
          total_appointments?: number | null;
          total_revenue?: number | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      analytics_tenant_metrics: {
        Row: {
          id: string;
          tenant_id: string;
          metric_date: string;
          period_type: string;
          appointments_count: number | null;
          revenue: number | null;
          conversations_count: number | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          metric_date: string;
          period_type: string;
          appointments_count?: number | null;
          revenue?: number | null;
          conversations_count?: number | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          metric_date?: string;
          period_type?: string;
          appointments_count?: number | null;
          revenue?: number | null;
          conversations_count?: number | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "analytics_tenant_metrics_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      analytics_job_executions: {
        Row: {
          id: string;
          job_name: string;
          status: string;
          duration_ms: number | null;
          target_date: string | null;
          error_message: string | null;
          metadata: Json | null;
          executed_at: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          job_name: string;
          status: string;
          duration_ms?: number | null;
          target_date?: string | null;
          error_message?: string | null;
          metadata?: Json | null;
          executed_at?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          job_name?: string;
          status?: string;
          duration_ms?: number | null;
          target_date?: string | null;
          error_message?: string | null;
          metadata?: Json | null;
          executed_at?: string | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      chart_data_cache: {
        Row: {
          id: string;
          type: string;
          tenant_id: string | null;
          chart_data: Json;
          computed_date: string;
          period: string;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          type: string;
          tenant_id?: string | null;
          chart_data: Json;
          computed_date: string;
          period: string;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          type?: string;
          tenant_id?: string | null;
          chart_data?: Json;
          computed_date?: string;
          period?: string;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "chart_data_cache_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      professionals: {
        Row: {
          id: string;
          tenant_id: string;
          name: string;
          email: string | null;
          phone: string | null;
          specialization: string | null;
          is_active: boolean | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          name: string;
          email?: string | null;
          phone?: string | null;
          specialization?: string | null;
          is_active?: boolean | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          name?: string;
          email?: string | null;
          phone?: string | null;
          specialization?: string | null;
          is_active?: boolean | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "professionals_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      subscription_payments: {
        Row: {
          id: string;
          tenant_id: string | null;
          amount: number;
          currency: string;
          payment_method: string | null;
          payment_status: string | null;
          subscription_plan: string | null;
          billing_period_start: string | null;
          billing_period_end: string | null;
          payment_date: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          tenant_id?: string | null;
          amount: number;
          currency?: string;
          payment_method?: string | null;
          payment_status?: string | null;
          subscription_plan?: string | null;
          billing_period_start?: string | null;
          billing_period_end?: string | null;
          payment_date?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          tenant_id?: string | null;
          amount?: number;
          currency?: string;
          payment_method?: string | null;
          payment_status?: string | null;
          subscription_plan?: string | null;
          billing_period_start?: string | null;
          billing_period_end?: string | null;
          payment_date?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "subscription_payments_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      mv_daily_appointment_stats: {
        Row: {
          appointment_date: string;
          tenant_id: string;
          total_appointments: number | null;
          completed_appointments: number | null;
          cancelled_appointments: number | null;
          total_revenue: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "mv_daily_appointment_stats_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
    };
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
      aggregate_tenant_daily_metrics: {
        Args: {
          target_date: string;
        };
        Returns: void;
      };
      aggregate_system_daily_metrics: {
        Args: {
          target_date: string;
        };
        Returns: void;
      };
      refresh_analytics_materialized_views: {
        Args: Record<PropertyKey, never>;
        Returns: void;
      };
      clean_expired_analytics_cache: {
        Args: Record<PropertyKey, never>;
        Returns: number;
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
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
type DefaultSchema = Database[Extract<keyof Database, "public">];
export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | {
        schema: keyof Database;
      },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database;
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof Database;
}
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;
export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | {
        schema: keyof Database;
      },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database;
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof Database;
}
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;
export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | {
        schema: keyof Database;
      },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database;
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof Database;
}
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;
export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | {
        schema: keyof Database;
      },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database;
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof Database;
}
  ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;
export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | {
        schema: keyof Database;
      },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database;
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof Database;
}
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;
export declare const Constants: {
  readonly public: {
    readonly Enums: {
      readonly appointment_status: readonly [
        "pending",
        "confirmed",
        "in_progress",
        "completed",
        "cancelled",
        "no_show",
        "rescheduled",
      ];
      readonly business_domain: readonly [
        "legal",
        "healthcare",
        "education",
        "beauty",
        "sports",
        "consulting",
        "other",
      ];
      readonly duration_type: readonly [
        "fixed",
        "variable",
        "estimated",
        "session",
      ];
      readonly price_model: readonly [
        "fixed",
        "hourly",
        "package",
        "dynamic",
        "consultation",
      ];
    };
  };
};
export type BusinessDomain = Database["public"]["Enums"]["business_domain"];
export type AppointmentStatus =
  Database["public"]["Enums"]["appointment_status"];
export type DurationType = Database["public"]["Enums"]["duration_type"];
export type PriceModel = Database["public"]["Enums"]["price_model"];
export type Tenant = Tables<"tenants">;
export type User = Tables<"users">;
export type Service = Tables<"services">;
export type Appointment = Tables<"appointments">;
export type ConversationHistory = Tables<"conversation_history">;
export type ConversationState = Tables<"conversation_states">;
export type WhatsAppMedia = Tables<"whatsapp_media">;
export type WhatsAppTemplate = Tables<"whatsapp_templates">;
export {};
//# sourceMappingURL=database.types.d.ts.map
