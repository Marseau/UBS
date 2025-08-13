export type Json = string | number | boolean | null | {
    [key: string]: Json | undefined;
} | Json[];
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
                    }
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
                    }
                ];
            };
            appointments: {
                Row: {
                    id: string;
                    tenant_id: string | null;
                    user_id: string | null;
                    service_id: string | null;
                    start_time: string;
                    end_time: string;
                    status: Database["public"]["Enums"]["appointment_status"] | null;
                    quoted_price: number | null;
                    final_price: number | null;
                    currency: string | null;
                    timezone: string | null;
                    customer_notes: string | null;
                    internal_notes: string | null;
                    appointment_data: Json | null;
                    external_event_id: string | null;
                    cancelled_at: string | null;
                    cancelled_by: string | null;
                    cancellation_reason: string | null;
                    created_at: string | null;
                    updated_at: string | null;
                };
                Insert: {
                    id?: string;
                    tenant_id?: string | null;
                    user_id?: string | null;
                    service_id?: string | null;
                    start_time: string;
                    end_time: string;
                    status?: Database["public"]["Enums"]["appointment_status"] | null;
                    quoted_price?: number | null;
                    final_price?: number | null;
                    currency?: string | null;
                    timezone?: string | null;
                    customer_notes?: string | null;
                    internal_notes?: string | null;
                    appointment_data?: Json | null;
                    external_event_id?: string | null;
                    cancelled_at?: string | null;
                    cancelled_by?: string | null;
                    cancellation_reason?: string | null;
                    created_at?: string | null;
                    updated_at?: string | null;
                };
                Update: {
                    id?: string;
                    tenant_id?: string | null;
                    user_id?: string | null;
                    service_id?: string | null;
                    start_time?: string;
                    end_time?: string;
                    status?: Database["public"]["Enums"]["appointment_status"] | null;
                    quoted_price?: number | null;
                    final_price?: number | null;
                    currency?: string | null;
                    timezone?: string | null;
                    customer_notes?: string | null;
                    internal_notes?: string | null;
                    appointment_data?: Json | null;
                    external_event_id?: string | null;
                    cancelled_at?: string | null;
                    cancelled_by?: string | null;
                    cancellation_reason?: string | null;
                    created_at?: string | null;
                    updated_at?: string | null;
                };
                Relationships: [
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
                    {
                        foreignKeyName: "appointments_service_id_fkey";
                        columns: ["service_id"];
                        isOneToOne: false;
                        referencedRelation: "services";
                        referencedColumns: ["id"];
                    }
                ];
            };
            availability_templates: {
                Row: {
                    id: string;
                    tenant_id: string | null;
                    name: string;
                    availability_data: Json;
                    is_default: boolean | null;
                    created_at: string | null;
                    updated_at: string | null;
                };
                Insert: {
                    id?: string;
                    tenant_id?: string | null;
                    name: string;
                    availability_data: Json;
                    is_default?: boolean | null;
                    created_at?: string | null;
                    updated_at?: string | null;
                };
                Update: {
                    id?: string;
                    tenant_id?: string | null;
                    name?: string;
                    availability_data?: Json;
                    is_default?: boolean | null;
                    created_at?: string | null;
                    updated_at?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "availability_templates_tenant_id_fkey";
                        columns: ["tenant_id"];
                        isOneToOne: false;
                        referencedRelation: "tenants";
                        referencedColumns: ["id"];
                    }
                ];
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
                    }
                ];
            };
            conversation_history: {
                Row: {
                    id: string;
                    tenant_id: string | null;
                    user_id: string | null;
                    content: string;
                    is_from_user: boolean | null;
                    message_type: string | null;
                    intent_detected: string | null;
                    confidence_score: number | null;
                    conversation_context: Json | null;
                    created_at: string | null;
                };
                Insert: {
                    id?: string;
                    tenant_id?: string | null;
                    user_id?: string | null;
                    content: string;
                    is_from_user?: boolean | null;
                    message_type?: string | null;
                    intent_detected?: string | null;
                    confidence_score?: number | null;
                    conversation_context?: Json | null;
                    created_at?: string | null;
                };
                Update: {
                    id?: string;
                    tenant_id?: string | null;
                    user_id?: string | null;
                    content?: string;
                    is_from_user?: boolean | null;
                    message_type?: string | null;
                    intent_detected?: string | null;
                    confidence_score?: number | null;
                    conversation_context?: Json | null;
                    created_at?: string | null;
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
                    }
                ];
            };
            platform_metrics: {
                Row: {
                    id: string;
                    calculation_date: string | null;
                    period_days: number | null;
                    data_source: string | null;
                    total_revenue: number | null;
                    total_appointments: number | null;
                    total_customers: number | null;
                    total_ai_interactions: number | null;
                    active_tenants: number | null;
                    platform_mrr: number | null;
                    total_chat_minutes: number | null;
                    total_conversations: number | null;
                    total_valid_conversations: number | null;
                    total_spam_conversations: number | null;
                    receita_uso_ratio: number | null;
                    operational_efficiency_pct: number | null;
                    spam_rate_pct: number | null;
                    cancellation_rate_pct: number | null;
                    revenue_usage_distortion_index: number | null;
                    platform_health_score: number | null;
                    tenants_above_usage: number | null;
                    tenants_below_usage: number | null;
                    platform_avg_clv: number | null;
                    platform_avg_conversion_rate: number | null;
                    platform_high_risk_tenants: number | null;
                    platform_domain_breakdown: Json | null;
                    platform_quality_score: number | null;
                    created_at: string | null;
                    updated_at: string | null;
                };
                Insert: {
                    id?: string;
                    calculation_date?: string | null;
                    period_days?: number | null;
                    data_source?: string | null;
                    total_revenue?: number | null;
                    total_appointments?: number | null;
                    total_customers?: number | null;
                    total_ai_interactions?: number | null;
                    active_tenants?: number | null;
                    platform_mrr?: number | null;
                    total_chat_minutes?: number | null;
                    total_conversations?: number | null;
                    total_valid_conversations?: number | null;
                    total_spam_conversations?: number | null;
                    receita_uso_ratio?: number | null;
                    operational_efficiency_pct?: number | null;
                    spam_rate_pct?: number | null;
                    cancellation_rate_pct?: number | null;
                    revenue_usage_distortion_index?: number | null;
                    platform_health_score?: number | null;
                    tenants_above_usage?: number | null;
                    tenants_below_usage?: number | null;
                    platform_avg_clv?: number | null;
                    platform_avg_conversion_rate?: number | null;
                    platform_high_risk_tenants?: number | null;
                    platform_domain_breakdown?: Json | null;
                    platform_quality_score?: number | null;
                    created_at?: string | null;
                    updated_at?: string | null;
                };
                Update: {
                    id?: string;
                    calculation_date?: string | null;
                    period_days?: number | null;
                    data_source?: string | null;
                    total_revenue?: number | null;
                    total_appointments?: number | null;
                    total_customers?: number | null;
                    total_ai_interactions?: number | null;
                    active_tenants?: number | null;
                    platform_mrr?: number | null;
                    total_chat_minutes?: number | null;
                    total_conversations?: number | null;
                    total_valid_conversations?: number | null;
                    total_spam_conversations?: number | null;
                    receita_uso_ratio?: number | null;
                    operational_efficiency_pct?: number | null;
                    spam_rate_pct?: number | null;
                    cancellation_rate_pct?: number | null;
                    revenue_usage_distortion_index?: number | null;
                    platform_health_score?: number | null;
                    tenants_above_usage?: number | null;
                    tenants_below_usage?: number | null;
                    platform_avg_clv?: number | null;
                    platform_avg_conversion_rate?: number | null;
                    platform_high_risk_tenants?: number | null;
                    platform_domain_breakdown?: Json | null;
                    platform_quality_score?: number | null;
                    created_at?: string | null;
                    updated_at?: string | null;
                };
                Relationships: [];
            };
            service_categories: {
                Row: {
                    id: string;
                    tenant_id: string | null;
                    name: string;
                    description: string | null;
                    color: string | null;
                    icon: string | null;
                    display_order: number | null;
                    is_active: boolean | null;
                    created_at: string | null;
                    updated_at: string | null;
                };
                Insert: {
                    id?: string;
                    tenant_id?: string | null;
                    name: string;
                    description?: string | null;
                    color?: string | null;
                    icon?: string | null;
                    display_order?: number | null;
                    is_active?: boolean | null;
                    created_at?: string | null;
                    updated_at?: string | null;
                };
                Update: {
                    id?: string;
                    tenant_id?: string | null;
                    name?: string;
                    description?: string | null;
                    color?: string | null;
                    icon?: string | null;
                    display_order?: number | null;
                    is_active?: boolean | null;
                    created_at?: string | null;
                    updated_at?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "service_categories_tenant_id_fkey";
                        columns: ["tenant_id"];
                        isOneToOne: false;
                        referencedRelation: "tenants";
                        referencedColumns: ["id"];
                    }
                ];
            };
            services: {
                Row: {
                    id: string;
                    tenant_id: string | null;
                    category_id: string | null;
                    name: string;
                    description: string | null;
                    duration_minutes: number | null;
                    duration_min: number | null;
                    duration_max: number | null;
                    duration_type: Database["public"]["Enums"]["duration_type"] | null;
                    base_price: number | null;
                    price_model: Database["public"]["Enums"]["price_model"] | null;
                    currency: string | null;
                    service_config: Json | null;
                    is_active: boolean | null;
                    display_order: number | null;
                    advance_booking_days: number | null;
                    max_bookings_per_day: number | null;
                    created_at: string | null;
                    updated_at: string | null;
                };
                Insert: {
                    id?: string;
                    tenant_id?: string | null;
                    category_id?: string | null;
                    name: string;
                    description?: string | null;
                    duration_minutes?: number | null;
                    duration_min?: number | null;
                    duration_max?: number | null;
                    duration_type?: Database["public"]["Enums"]["duration_type"] | null;
                    base_price?: number | null;
                    price_model?: Database["public"]["Enums"]["price_model"] | null;
                    currency?: string | null;
                    service_config?: Json | null;
                    is_active?: boolean | null;
                    display_order?: number | null;
                    advance_booking_days?: number | null;
                    max_bookings_per_day?: number | null;
                    created_at?: string | null;
                    updated_at?: string | null;
                };
                Update: {
                    id?: string;
                    tenant_id?: string | null;
                    category_id?: string | null;
                    name?: string;
                    description?: string | null;
                    duration_minutes?: number | null;
                    duration_min?: number | null;
                    duration_max?: number | null;
                    duration_type?: Database["public"]["Enums"]["duration_type"] | null;
                    base_price?: number | null;
                    price_model?: Database["public"]["Enums"]["price_model"] | null;
                    currency?: string | null;
                    service_config?: Json | null;
                    is_active?: boolean | null;
                    display_order?: number | null;
                    advance_booking_days?: number | null;
                    max_bookings_per_day?: number | null;
                    created_at?: string | null;
                    updated_at?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "services_tenant_id_fkey";
                        columns: ["tenant_id"];
                        isOneToOne: false;
                        referencedRelation: "tenants";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "services_category_id_fkey";
                        columns: ["category_id"];
                        isOneToOne: false;
                        referencedRelation: "service_categories";
                        referencedColumns: ["id"];
                    }
                ];
            };
            support_tickets: {
                Row: {
                    id: string;
                    tenant_id: string | null;
                    user_id: string | null;
                    title: string;
                    description: string;
                    status: string | null;
                    priority: string | null;
                    category: string | null;
                    assigned_to: string | null;
                    resolved_at: string | null;
                    created_at: string | null;
                    updated_at: string | null;
                };
                Insert: {
                    id?: string;
                    tenant_id?: string | null;
                    user_id?: string | null;
                    title: string;
                    description: string;
                    status?: string | null;
                    priority?: string | null;
                    category?: string | null;
                    assigned_to?: string | null;
                    resolved_at?: string | null;
                    created_at?: string | null;
                    updated_at?: string | null;
                };
                Update: {
                    id?: string;
                    tenant_id?: string | null;
                    user_id?: string | null;
                    title?: string;
                    description?: string;
                    status?: string | null;
                    priority?: string | null;
                    category?: string | null;
                    assigned_to?: string | null;
                    resolved_at?: string | null;
                    created_at?: string | null;
                    updated_at?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "support_tickets_tenant_id_fkey";
                        columns: ["tenant_id"];
                        isOneToOne: false;
                        referencedRelation: "tenants";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "support_tickets_user_id_fkey";
                        columns: ["user_id"];
                        isOneToOne: false;
                        referencedRelation: "users";
                        referencedColumns: ["id"];
                    }
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
                    }
                ];
            };
            tenants: {
                Row: {
                    id: string;
                    name: string;
                    business_name: string;
                    email: string;
                    phone: string;
                    slug: string;
                    domain: Database["public"]["Enums"]["business_domain"];
                    status: string | null;
                    subscription_plan: string | null;
                    business_address: Json | null;
                    business_description: string | null;
                    whatsapp_phone: string | null;
                    whatsapp_settings: Json | null;
                    ai_settings: Json;
                    business_rules: Json;
                    domain_config: Json;
                    created_at: string | null;
                    updated_at: string | null;
                };
                Insert: {
                    id?: string;
                    name: string;
                    business_name: string;
                    email: string;
                    phone: string;
                    slug: string;
                    domain: Database["public"]["Enums"]["business_domain"];
                    status?: string | null;
                    subscription_plan?: string | null;
                    business_address?: Json | null;
                    business_description?: string | null;
                    whatsapp_phone?: string | null;
                    whatsapp_settings?: Json | null;
                    ai_settings: Json;
                    business_rules: Json;
                    domain_config: Json;
                    created_at?: string | null;
                    updated_at?: string | null;
                };
                Update: {
                    id?: string;
                    name?: string;
                    business_name?: string;
                    email?: string;
                    phone?: string;
                    slug?: string;
                    domain?: Database["public"]["Enums"]["business_domain"];
                    status?: string | null;
                    subscription_plan?: string | null;
                    business_address?: Json | null;
                    business_description?: string | null;
                    whatsapp_phone?: string | null;
                    whatsapp_settings?: Json | null;
                    ai_settings?: Json;
                    business_rules?: Json;
                    domain_config?: Json;
                    created_at?: string | null;
                    updated_at?: string | null;
                };
                Relationships: [];
            };
            ubs_metric_system_runs: {
                Row: {
                    id: string;
                    run_date: string;
                    period_days: number;
                    run_status: string | null;
                    tenants_processed: number | null;
                    total_tenants: number | null;
                    execution_time_ms: number | null;
                    error_message: string | null;
                    metrics_calculated: number | null;
                    started_at: string | null;
                    completed_at: string | null;
                    data_quality_score: number | null;
                    missing_data_count: number | null;
                };
                Insert: {
                    id?: string;
                    run_date: string;
                    period_days: number;
                    run_status?: string | null;
                    tenants_processed?: number | null;
                    total_tenants?: number | null;
                    execution_time_ms?: number | null;
                    error_message?: string | null;
                    metrics_calculated?: number | null;
                    started_at?: string | null;
                    completed_at?: string | null;
                    data_quality_score?: number | null;
                    missing_data_count?: number | null;
                };
                Update: {
                    id?: string;
                    run_date?: string;
                    period_days?: number;
                    run_status?: string | null;
                    tenants_processed?: number | null;
                    total_tenants?: number | null;
                    execution_time_ms?: number | null;
                    error_message?: string | null;
                    metrics_calculated?: number | null;
                    started_at?: string | null;
                    completed_at?: string | null;
                    data_quality_score?: number | null;
                    missing_data_count?: number | null;
                };
                Relationships: [];
            };
            user_tenants: {
                Row: {
                    user_id: string;
                    tenant_id: string;
                    role: string | null;
                    first_interaction: string | null;
                    last_interaction: string | null;
                    total_bookings: number | null;
                    tenant_preferences: Json | null;
                };
                Insert: {
                    user_id: string;
                    tenant_id: string;
                    role?: string | null;
                    first_interaction?: string | null;
                    last_interaction?: string | null;
                    total_bookings?: number | null;
                    tenant_preferences?: Json | null;
                };
                Update: {
                    user_id?: string;
                    tenant_id?: string;
                    role?: string | null;
                    first_interaction?: string | null;
                    last_interaction?: string | null;
                    total_bookings?: number | null;
                    tenant_preferences?: Json | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "user_tenants_user_id_fkey";
                        columns: ["user_id"];
                        isOneToOne: false;
                        referencedRelation: "users";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "user_tenants_tenant_id_fkey";
                        columns: ["tenant_id"];
                        isOneToOne: false;
                        referencedRelation: "tenants";
                        referencedColumns: ["id"];
                    }
                ];
            };
            users: {
                Row: {
                    id: string;
                    phone: string;
                    name: string | null;
                    email: string | null;
                    preferences: Json | null;
                    created_at: string | null;
                    updated_at: string | null;
                };
                Insert: {
                    id?: string;
                    phone: string;
                    name?: string | null;
                    email?: string | null;
                    preferences?: Json | null;
                    created_at?: string | null;
                    updated_at?: string | null;
                };
                Update: {
                    id?: string;
                    phone?: string;
                    name?: string | null;
                    email?: string | null;
                    preferences?: Json | null;
                    created_at?: string | null;
                    updated_at?: string | null;
                };
                Relationships: [];
            };
            validation_results: {
                Row: {
                    id: string;
                    tenant_id: string | null;
                    validation_type: string;
                    metric_name: string;
                    field_name: string | null;
                    status: string;
                    score: number;
                    passed: boolean;
                    details: Json;
                    recommendations: string[];
                    execution_time_ms: number;
                    created_at: string | null;
                    validated_at: string | null;
                };
                Insert: {
                    id?: string;
                    tenant_id?: string | null;
                    validation_type: string;
                    metric_name: string;
                    field_name?: string | null;
                    status: string;
                    score: number;
                    passed: boolean;
                    details?: Json;
                    recommendations?: string[];
                    execution_time_ms?: number;
                    created_at?: string | null;
                    validated_at?: string | null;
                };
                Update: {
                    id?: string;
                    tenant_id?: string | null;
                    validation_type?: string;
                    metric_name?: string;
                    field_name?: string | null;
                    status?: string;
                    score?: number;
                    passed?: boolean;
                    details?: Json;
                    recommendations?: string[];
                    execution_time_ms?: number;
                    created_at?: string | null;
                    validated_at?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "validation_results_tenant_id_fkey";
                        columns: ["tenant_id"];
                        isOneToOne: false;
                        referencedRelation: "tenants";
                        referencedColumns: ["id"];
                    }
                ];
            };
            validation_rules: {
                Row: {
                    id: string;
                    rule_name: string;
                    rule_type: string;
                    target_table: string;
                    target_field: string | null;
                    validation_logic: Json;
                    severity: string;
                    threshold: number | null;
                    is_active: boolean;
                    description: string | null;
                    created_at: string | null;
                    updated_at: string | null;
                };
                Insert: {
                    id?: string;
                    rule_name: string;
                    rule_type: string;
                    target_table: string;
                    target_field?: string | null;
                    validation_logic: Json;
                    severity?: string;
                    threshold?: number | null;
                    is_active?: boolean;
                    description?: string | null;
                    created_at?: string | null;
                    updated_at?: string | null;
                };
                Update: {
                    id?: string;
                    rule_name?: string;
                    rule_type?: string;
                    target_table?: string;
                    target_field?: string | null;
                    validation_logic?: Json;
                    severity?: string;
                    threshold?: number | null;
                    is_active?: boolean;
                    description?: string | null;
                    created_at?: string | null;
                    updated_at?: string | null;
                };
                Relationships: [];
            };
            tenant_quality_config: {
                Row: {
                    id: string;
                    tenant_id: string;
                    overall_threshold: number;
                    field_semantic_weight: number;
                    calculation_accuracy_weight: number;
                    cross_table_consistency_weight: number;
                    data_quality_weight: number;
                    auto_rollback_enabled: boolean;
                    alert_threshold: number;
                    notification_channels: Json;
                    custom_rules: Json;
                    created_at: string | null;
                    updated_at: string | null;
                };
                Insert: {
                    id?: string;
                    tenant_id: string;
                    overall_threshold?: number;
                    field_semantic_weight?: number;
                    calculation_accuracy_weight?: number;
                    cross_table_consistency_weight?: number;
                    data_quality_weight?: number;
                    auto_rollback_enabled?: boolean;
                    alert_threshold?: number;
                    notification_channels?: Json;
                    custom_rules?: Json;
                    created_at?: string | null;
                    updated_at?: string | null;
                };
                Update: {
                    id?: string;
                    tenant_id?: string;
                    overall_threshold?: number;
                    field_semantic_weight?: number;
                    calculation_accuracy_weight?: number;
                    cross_table_consistency_weight?: number;
                    data_quality_weight?: number;
                    auto_rollback_enabled?: boolean;
                    alert_threshold?: number;
                    notification_channels?: Json;
                    custom_rules?: Json;
                    created_at?: string | null;
                    updated_at?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "tenant_quality_config_tenant_id_fkey";
                        columns: ["tenant_id"];
                        isOneToOne: true;
                        referencedRelation: "tenants";
                        referencedColumns: ["id"];
                    }
                ];
            };
            system_validation_health: {
                Row: {
                    id: string;
                    validation_run_id: string;
                    system_component: string;
                    health_score: number;
                    total_validations: number;
                    passed_validations: number;
                    failed_validations: number;
                    warning_validations: number;
                    average_execution_time_ms: number;
                    performance_trend: string | null;
                    recommendations: string[];
                    created_at: string | null;
                };
                Insert: {
                    id?: string;
                    validation_run_id: string;
                    system_component: string;
                    health_score: number;
                    total_validations?: number;
                    passed_validations?: number;
                    failed_validations?: number;
                    warning_validations?: number;
                    average_execution_time_ms?: number;
                    performance_trend?: string | null;
                    recommendations?: string[];
                    created_at?: string | null;
                };
                Update: {
                    id?: string;
                    validation_run_id?: string;
                    system_component?: string;
                    health_score?: number;
                    total_validations?: number;
                    passed_validations?: number;
                    failed_validations?: number;
                    warning_validations?: number;
                    average_execution_time_ms?: number;
                    performance_trend?: string | null;
                    recommendations?: string[];
                    created_at?: string | null;
                };
                Relationships: [];
            };
        };
        Views: {
            [_ in never]: never;
        };
        Functions: {
            [_ in never]: never;
        };
        Enums: {
            appointment_status: "pending" | "confirmed" | "in_progress" | "completed" | "cancelled" | "no_show" | "rescheduled";
            business_domain: "legal" | "healthcare" | "education" | "beauty" | "sports" | "consulting" | "other";
            duration_type: "fixed" | "variable" | "estimated" | "session";
            price_model: "fixed" | "hourly" | "package" | "dynamic" | "consultation";
        };
        CompositeTypes: {
            [_ in never]: never;
        };
    };
};
type DefaultSchema = Database[Extract<keyof Database, "public">];
export type Tables<DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"]) | {
    schema: keyof Database;
}, TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database;
} ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] & Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"]) : never = never> = DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database;
} ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] & Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
    Row: infer R;
} ? R : never : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"]) ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
    Row: infer R;
} ? R : never : never;
export type TablesInsert<DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | {
    schema: keyof Database;
}, TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database;
} ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] : never = never> = DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database;
} ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
    Insert: infer I;
} ? I : never : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
    Insert: infer I;
} ? I : never : never;
export type TablesUpdate<DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | {
    schema: keyof Database;
}, TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database;
} ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] : never = never> = DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database;
} ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
    Update: infer U;
} ? U : never : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
    Update: infer U;
} ? U : never : never;
export type Enums<DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"] | {
    schema: keyof Database;
}, EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database;
} ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"] : never = never> = DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database;
} ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName] : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"] ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions] : never;
export type Tenant = Tables<"tenants">;
export type User = Tables<"users">;
export type Service = Tables<"services">;
export type Appointment = Tables<"appointments">;
export type ConversationHistory = Tables<"conversation_history">;
export type TenantMetrics = Tables<"tenant_metrics">;
export type PlatformMetrics = Tables<"platform_metrics">;
export type ConversationBilling = Tables<"conversation_billing">;
export type UbsMetricSystemRuns = Tables<"ubs_metric_system_runs">;
export type BusinessDomain = Database["public"]["Enums"]["business_domain"];
export type AppointmentStatus = Database["public"]["Enums"]["appointment_status"];
export type DurationType = Database["public"]["Enums"]["duration_type"];
export type PriceModel = Database["public"]["Enums"]["price_model"];
export interface DomainConfig {
    [key: string]: any;
}
export interface AISettings {
    greeting_message: string;
    domain_keywords: string[];
    escalation_triggers?: string[];
    sensitive_topics?: string[];
    crisis_response?: string;
    upsell_enabled?: boolean;
    motivational_messages?: boolean;
}
export interface BusinessRules {
    working_hours: {
        monday: string[];
        tuesday: string[];
        wednesday: string[];
        thursday: string[];
        friday: string[];
        saturday: string[];
        sunday: string[];
    };
    advance_booking_days?: number;
    cancellation_policy?: string;
    payment_methods?: string[];
    travel_time_minutes?: number;
    package_discounts?: boolean;
    peak_hours_surcharge?: number;
    loyalty_program?: boolean;
    weather_cancellation?: boolean;
    court_booking_required?: boolean;
}
export {};
