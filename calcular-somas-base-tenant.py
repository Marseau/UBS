#!/usr/bin/env python3
"""
SCRIPT DE SOMAS BASE POR TENANT
Calcula todas as somas das colunas importantes para cada tenant
Períodos: 7, 30 e 90 dias
Base para todas as métricas do dashboard
"""

import os
import json
import requests
from datetime import datetime, timedelta
from dotenv import load_dotenv

# Carregar variáveis de ambiente
load_dotenv()

class TenantBaseSumsCalculator:
    def __init__(self):
        """Inicializa o calculador com configurações do Supabase"""
        self.supabase_url = os.getenv('SUPABASE_URL')
        self.supabase_key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
        
        if not self.supabase_url or not self.supabase_key:
            raise ValueError("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios")
        
        self.headers = {
            'apikey': self.supabase_key,
            'Authorization': f'Bearer {self.supabase_key}',
            'Content-Type': 'application/json'
        }
        
        print(f"🔗 Conectando ao Supabase: {self.supabase_url}")
        
    def execute_rpc(self, function_name: str, params: dict = None):
        """Executa uma função RPC no Supabase"""
        url = f"{self.supabase_url}/rest/v1/rpc/{function_name}"
        
        try:
            response = requests.post(url, headers=self.headers, json=params or {})
            response.raise_for_status()
            return response.json()
        except Exception as e:
            print(f"❌ Erro executando RPC {function_name}: {e}")
            raise
            
    def query_table(self, table: str, select: str = "*", filters: dict = None):
        """Faz query em uma tabela do Supabase"""
        url = f"{self.supabase_url}/rest/v1/{table}"
        
        params = {'select': select}
        if filters:
            for key, value in filters.items():
                params[key] = value
        
        try:
            response = requests.get(url, headers=self.headers, params=params)
            response.raise_for_status()
            return response.json()
        except Exception as e:
            print(f"❌ Erro consultando tabela {table}: {e}")
            raise
            
    def calculate_base_sums_for_tenant(self, tenant_id: str, days: int) -> dict:
        """Calcula todas as somas base para um tenant específico"""
        print(f"📊 Calculando somas base para tenant {tenant_id} ({days} dias)...")
        
        start_date = (datetime.now() - timedelta(days=days)).strftime('%Y-%m-%d')
        sums = {}
        
        try:
                # ==========================================
                # 1. APPOINTMENTS - Somas Base
                # ==========================================
                print(f"   📅 Calculando appointments...")
                cursor.execute("""
                    SELECT 
                        COUNT(*) as total,
                        COUNT(*) FILTER (WHERE status = 'pending') as pending,
                        COUNT(*) FILTER (WHERE status = 'confirmed') as confirmed,
                        COUNT(*) FILTER (WHERE status = 'completed') as completed,
                        COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled,
                        COUNT(*) FILTER (WHERE status = 'no_show') as no_show,
                        COUNT(*) FILTER (WHERE status = 'rescheduled') as rescheduled,
                        COALESCE(SUM(quoted_price), 0) as total_quoted_value,
                        COALESCE(SUM(final_price), 0) as total_final_value,
                        COUNT(DISTINCT user_id) as unique_customers,
                        COUNT(DISTINCT service_id) as unique_services,
                        COALESCE(AVG(EXTRACT(EPOCH FROM (end_time - start_time))/60), 0) as avg_duration_minutes
                    FROM appointments 
                    WHERE tenant_id = %s 
                    AND created_at >= %s
                """, (tenant_id, start_date))
                
                apt_row = cursor.fetchone()
                sums['appointments'] = {
                    'total': apt_row[0],
                    'pending': apt_row[1],
                    'confirmed': apt_row[2], 
                    'completed': apt_row[3],
                    'cancelled': apt_row[4],
                    'no_show': apt_row[5],
                    'rescheduled': apt_row[6],
                    'total_quoted_value': float(apt_row[7]) if apt_row[7] else 0,
                    'total_final_value': float(apt_row[8]) if apt_row[8] else 0,
                    'unique_customers': apt_row[9],
                    'unique_services': apt_row[10],
                    'avg_duration_minutes': float(apt_row[11]) if apt_row[11] else 0
                }
                
                # ==========================================
                # 2. CONVERSATION_HISTORY - Somas Base
                # ==========================================
                print(f"   💬 Calculando conversations...")
                cursor.execute("""
                    SELECT 
                        COUNT(*) as total,
                        COUNT(*) FILTER (WHERE is_from_user = true) as from_users,
                        COUNT(*) FILTER (WHERE is_from_user = false) as from_ai,
                        COUNT(*) FILTER (WHERE confidence_score IS NOT NULL) as with_confidence,
                        COUNT(*) FILTER (WHERE confidence_score >= 0.7) as high_confidence,
                        COUNT(*) FILTER (WHERE confidence_score < 0.7 AND confidence_score IS NOT NULL) as low_confidence,
                        COALESCE(SUM(confidence_score), 0) as total_confidence_sum,
                        COALESCE(AVG(confidence_score), 0) as avg_confidence,
                        COUNT(DISTINCT user_id) as unique_users,
                        COUNT(DISTINCT intent_detected) as unique_intents,
                        COUNT(*) FILTER (WHERE message_type = 'text') as text_messages,
                        COUNT(*) FILTER (WHERE message_type = 'image') as image_messages,
                        COUNT(*) FILTER (WHERE message_type = 'audio') as audio_messages
                    FROM conversation_history 
                    WHERE tenant_id = %s 
                    AND created_at >= %s
                """, (tenant_id, start_date))
                
                conv_row = cursor.fetchone()
                sums['conversations'] = {
                    'total': conv_row[0],
                    'from_users': conv_row[1],
                    'from_ai': conv_row[2],
                    'with_confidence': conv_row[3],
                    'high_confidence': conv_row[4],
                    'low_confidence': conv_row[5],
                    'total_confidence_sum': float(conv_row[6]) if conv_row[6] else 0,
                    'avg_confidence': float(conv_row[7]) if conv_row[7] else 0,
                    'unique_users': conv_row[8],
                    'unique_intents': conv_row[9],
                    'text_messages': conv_row[10],
                    'image_messages': conv_row[11],
                    'audio_messages': conv_row[12]
                }
                
                # ==========================================
                # 3. CONVERSATION OUTCOMES - Somas Base  
                # ==========================================
                print(f"   🎯 Calculando outcomes...")
                cursor.execute("""
                    SELECT 
                        COUNT(*) FILTER (WHERE conversation_outcome = 'appointment_created') as appointment_created,
                        COUNT(*) FILTER (WHERE conversation_outcome = 'appointment_cancelled') as appointment_cancelled,
                        COUNT(*) FILTER (WHERE conversation_outcome = 'appointment_rescheduled') as appointment_rescheduled,
                        COUNT(*) FILTER (WHERE conversation_outcome = 'appointment_confirmed') as appointment_confirmed,
                        COUNT(*) FILTER (WHERE conversation_outcome = 'info_request_fulfilled') as info_requests,
                        COUNT(*) FILTER (WHERE conversation_outcome = 'spam_detected') as spam_detected,
                        COUNT(*) FILTER (WHERE conversation_outcome = 'wrong_number') as wrong_numbers,
                        COUNT(*) FILTER (WHERE conversation_outcome = 'booking_abandoned') as booking_abandoned,
                        COUNT(*) FILTER (WHERE conversation_outcome = 'timeout_abandoned') as timeout_abandoned,
                        COUNT(*) FILTER (WHERE conversation_outcome IS NOT NULL) as total_with_outcome,
                        COUNT(*) FILTER (WHERE conversation_outcome IS NULL) as without_outcome
                    FROM conversation_history 
                    WHERE tenant_id = %s 
                    AND created_at >= %s
                """, (tenant_id, start_date))
                
                outcome_row = cursor.fetchone()
                sums['outcomes'] = {
                    'appointment_created': outcome_row[0],
                    'appointment_cancelled': outcome_row[1],
                    'appointment_rescheduled': outcome_row[2],
                    'appointment_confirmed': outcome_row[3],
                    'info_requests': outcome_row[4],
                    'spam_detected': outcome_row[5],
                    'wrong_numbers': outcome_row[6],
                    'booking_abandoned': outcome_row[7],
                    'timeout_abandoned': outcome_row[8],
                    'total_with_outcome': outcome_row[9],
                    'without_outcome': outcome_row[10]
                }
                
                # ==========================================
                # 4. SUBSCRIPTION_PAYMENTS - Somas Base
                # ==========================================
                print(f"   💰 Calculando payments...")
                cursor.execute("""
                    SELECT 
                        COUNT(*) as total_payments,
                        COUNT(*) FILTER (WHERE payment_status = 'paid') as paid_payments,
                        COUNT(*) FILTER (WHERE payment_status = 'pending') as pending_payments,
                        COUNT(*) FILTER (WHERE payment_status = 'failed') as failed_payments,
                        COALESCE(SUM(amount), 0) as total_amount,
                        COALESCE(SUM(amount) FILTER (WHERE payment_status = 'paid'), 0) as paid_amount,
                        COALESCE(AVG(amount), 0) as avg_payment_amount,
                        COUNT(DISTINCT subscription_plan) as unique_plans
                    FROM subscription_payments 
                    WHERE tenant_id = %s 
                    AND payment_date >= %s
                """, (tenant_id, start_date))
                
                payment_row = cursor.fetchone()
                sums['payments'] = {
                    'total_payments': payment_row[0],
                    'paid_payments': payment_row[1],
                    'pending_payments': payment_row[2],
                    'failed_payments': payment_row[3],
                    'total_amount': float(payment_row[4]) if payment_row[4] else 0,
                    'paid_amount': float(payment_row[5]) if payment_row[5] else 0,
                    'avg_payment_amount': float(payment_row[6]) if payment_row[6] else 0,
                    'unique_plans': payment_row[7]
                }
                
                # ==========================================
                # 5. SERVICES - Dados do Tenant
                # ==========================================
                print(f"   🛠️ Calculando services...")
                cursor.execute("""
                    SELECT 
                        COUNT(*) as total_services,
                        COUNT(*) FILTER (WHERE is_active = true) as active_services,
                        COUNT(*) FILTER (WHERE is_active = false) as inactive_services,
                        COALESCE(AVG(base_price), 0) as avg_service_price,
                        COALESCE(SUM(base_price), 0) as total_services_value,
                        COALESCE(AVG(duration_minutes), 0) as avg_service_duration,
                        COUNT(DISTINCT category_id) as unique_categories
                    FROM services 
                    WHERE tenant_id = %s
                """, (tenant_id,))
                
                service_row = cursor.fetchone()
                sums['services'] = {
                    'total_services': service_row[0],
                    'active_services': service_row[1],
                    'inactive_services': service_row[2],
                    'avg_service_price': float(service_row[3]) if service_row[3] else 0,
                    'total_services_value': float(service_row[4]) if service_row[4] else 0,
                    'avg_service_duration': float(service_row[5]) if service_row[5] else 0,
                    'unique_categories': service_row[6]
                }
                
                # ==========================================
                # 6. CHAT DURATION REAL - Baseado em Timestamps
                # ==========================================
                print(f"   ⏱️ Calculando chat durations...")
                cursor.execute("""
                    WITH conversation_durations AS (
                        SELECT 
                            user_id,
                            DATE(created_at) as conversation_date,
                            EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at)))/60 as duration_minutes,
                            COUNT(*) as message_count
                        FROM conversation_history 
                        WHERE tenant_id = %s 
                        AND created_at >= %s
                        AND is_from_user = true
                        GROUP BY user_id, DATE(created_at)
                        HAVING COUNT(*) > 1
                    )
                    SELECT 
                        COUNT(*) as total_conversations,
                        COALESCE(SUM(duration_minutes), 0) as total_duration_minutes,
                        COALESCE(AVG(duration_minutes), 0) as avg_duration_minutes,
                        COALESCE(SUM(message_count), 0) as total_messages,
                        COALESCE(AVG(message_count), 0) as avg_messages_per_conversation
                    FROM conversation_durations
                """, (tenant_id, start_date))
                
                duration_row = cursor.fetchone()
                sums['chat_duration'] = {
                    'total_conversations': duration_row[0],
                    'total_duration_minutes': float(duration_row[1]) if duration_row[1] else 0,
                    'avg_duration_minutes': float(duration_row[2]) if duration_row[2] else 0,
                    'total_messages': duration_row[3],
                    'avg_messages_per_conversation': float(duration_row[4]) if duration_row[4] else 0
                }
                
                # ==========================================
                # 7. METADATA - Info sobre o cálculo
                # ==========================================
                sums['metadata'] = {
                    'tenant_id': tenant_id,
                    'calculation_date': datetime.now().isoformat(),
                    'period_days': days,
                    'start_date': start_date,
                    'end_date': datetime.now().strftime('%Y-%m-%d')
                }
                
                print(f"✅ Somas base calculadas para tenant {tenant_id}")
                return sums
                
            except Exception as e:
                print(f"❌ Erro calculando somas para tenant {tenant_id}: {e}")
                raise
                
    def calculate_for_all_tenants(self, days: int = 30) -> dict:
        """Calcula somas base para todos os tenants ativos"""
        print(f"🚀 Calculando somas base para todos os tenants ({days} dias)...")
        
        with self.get_db_connection() as conn:
            cursor = conn.cursor()
            
            # Buscar todos os tenants ativos
            cursor.execute("""
                SELECT id, name, domain, email
                FROM tenants 
                WHERE status = 'active'
                ORDER BY name
            """)
            
            tenants = cursor.fetchall()
            print(f"📋 Encontrados {len(tenants)} tenants ativos")
            
            all_results = {}
            
            for tenant_row in tenants:
                tenant_id, tenant_name, domain, email = tenant_row
                print(f"\n🏢 Processando: {tenant_name} ({domain})")
                
                try:
                    tenant_sums = self.calculate_base_sums_for_tenant(tenant_id, days)
                    tenant_sums['tenant_info'] = {
                        'name': tenant_name,
                        'domain': domain,
                        'email': email
                    }
                    all_results[tenant_id] = tenant_sums
                    
                except Exception as e:
                    print(f"❌ Erro no tenant {tenant_name}: {e}")
                    all_results[tenant_id] = {'error': str(e)}
            
            return all_results
            
    def save_results_to_file(self, results: dict, filename: str):
        """Salva resultados em arquivo JSON"""
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(results, f, indent=2, ensure_ascii=False, default=str)
        print(f"💾 Resultados salvos em: {filename}")
        
    def generate_summary_report(self, results: dict) -> dict:
        """Gera relatório resumo de todos os tenants"""
        print(f"📊 Gerando relatório resumo...")
        
        summary = {
            'total_tenants': len(results),
            'successful_calculations': 0,
            'failed_calculations': 0,
            'aggregate_totals': {
                'appointments_total': 0,
                'conversations_total': 0,
                'revenue_total': 0,
                'customers_total': 0
            },
            'top_performers': {
                'most_appointments': None,
                'most_conversations': None,
                'highest_revenue': None,
                'best_ai_quality': None
            }
        }
        
        best_appointments = 0
        best_conversations = 0
        best_revenue = 0
        best_ai_quality = 0
        
        for tenant_id, data in results.items():
            if 'error' in data:
                summary['failed_calculations'] += 1
                continue
                
            summary['successful_calculations'] += 1
            
            # Agregar totais
            summary['aggregate_totals']['appointments_total'] += data['appointments']['total']
            summary['aggregate_totals']['conversations_total'] += data['conversations']['total']
            summary['aggregate_totals']['revenue_total'] += data['payments']['paid_amount']
            summary['aggregate_totals']['customers_total'] += data['appointments']['unique_customers']
            
            # Identificar top performers
            if data['appointments']['total'] > best_appointments:
                best_appointments = data['appointments']['total']
                summary['top_performers']['most_appointments'] = {
                    'tenant_id': tenant_id,
                    'name': data['tenant_info']['name'],
                    'value': best_appointments
                }
                
            if data['conversations']['total'] > best_conversations:
                best_conversations = data['conversations']['total']
                summary['top_performers']['most_conversations'] = {
                    'tenant_id': tenant_id,
                    'name': data['tenant_info']['name'],
                    'value': best_conversations
                }
                
            if data['payments']['paid_amount'] > best_revenue:
                best_revenue = data['payments']['paid_amount']
                summary['top_performers']['highest_revenue'] = {
                    'tenant_id': tenant_id,
                    'name': data['tenant_info']['name'],
                    'value': best_revenue
                }
                
            if data['conversations']['avg_confidence'] > best_ai_quality:
                best_ai_quality = data['conversations']['avg_confidence']
                summary['top_performers']['best_ai_quality'] = {
                    'tenant_id': tenant_id,
                    'name': data['tenant_info']['name'],
                    'value': round(best_ai_quality, 4)
                }
        
        return summary

def main():
    """Função principal - executa cálculos para múltiplos períodos"""
    calculator = TenantBaseSumsCalculator()
    
    periods = [7, 30, 90]
    
    for days in periods:
        print(f"\n{'='*60}")
        print(f"🎯 CALCULANDO SOMAS BASE - {days} DIAS")
        print(f"{'='*60}")
        
        try:
            # Calcular para todos os tenants
            results = calculator.calculate_for_all_tenants(days)
            
            # Gerar relatório resumo
            summary = calculator.generate_summary_report(results)
            
            # Salvar resultados
            filename = f"tenant-base-sums-{days}d-{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
            calculator.save_results_to_file(results, filename)
            
            # Salvar resumo
            summary_filename = f"tenant-summary-{days}d-{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
            calculator.save_results_to_file(summary, summary_filename)
            
            # Mostrar resumo no console
            print(f"\n📋 RESUMO - {days} DIAS:")
            print(f"✅ Tenants processados: {summary['successful_calculations']}/{summary['total_tenants']}")
            print(f"📅 Total appointments: {summary['aggregate_totals']['appointments_total']}")
            print(f"💬 Total conversations: {summary['aggregate_totals']['conversations_total']}")
            print(f"💰 Total revenue: R$ {summary['aggregate_totals']['revenue_total']:,.2f}")
            print(f"👥 Total customers: {summary['aggregate_totals']['customers_total']}")
            
            if summary['top_performers']['most_appointments']:
                top = summary['top_performers']['most_appointments']
                print(f"🏆 Mais appointments: {top['name']} ({top['value']})")
            
        except Exception as e:
            print(f"💥 Erro no período {days} dias: {e}")

if __name__ == "__main__":
    main()