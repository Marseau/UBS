#!/usr/bin/env python3
"""
SCRIPT DE VALIDAÇÃO DE MÉTRICAS - PYTHON
Calcula métricas diretamente do banco PostgreSQL/Supabase usando estrutura real
Compara com APIs do dashboard para detectar divergências

Requer: pip install psycopg2-binary python-dotenv requests
"""

import os
import psycopg2
import requests
import json
from datetime import datetime, timedelta
from typing import Dict, Any, List, Tuple
from decimal import Decimal
from dotenv import load_dotenv

# Carregar variáveis de ambiente
load_dotenv()

class MetricsValidator:
    def __init__(self):
        """Inicializa o validador com configurações do banco e API"""
        self.db_url = os.getenv('SUPABASE_URL')
        self.db_key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
        self.api_base = 'http://localhost:3000'
        
        # Conexão PostgreSQL via Supabase
        db_parts = self.db_url.replace('https://', '').split('.')
        project_ref = db_parts[0]
        
        self.db_config = {
            'host': f'db.{project_ref}.supabase.co',
            'port': 5432,
            'database': 'postgres',
            'user': 'postgres',
            'password': os.getenv('SUPABASE_DB_PASSWORD', ''),
            'sslmode': 'require'
        }
        
        print(f"🔗 Conectando ao banco: {self.db_config['host']}")
        
    def get_db_connection(self):
        """Estabelece conexão com PostgreSQL"""
        try:
            conn = psycopg2.connect(**self.db_config)
            conn.autocommit = True
            return conn
        except Exception as e:
            print(f"❌ Erro conectando ao banco: {e}")
            raise
            
    def calculate_direct_metrics(self, days: int = 30) -> Dict[str, Any]:
        """Calcula métricas diretamente do banco usando queries SQL reais"""
        print(f"🔍 Calculando métricas direto do BD ({days} dias)...")
        
        start_date = (datetime.now() - timedelta(days=days)).strftime('%Y-%m-%d')
        
        with self.get_db_connection() as conn:
            cursor = conn.cursor()
            
            try:
                # 1. TENANTS ATIVOS
                cursor.execute("""
                    SELECT COUNT(*) as total
                    FROM tenants 
                    WHERE status = 'active'
                """)
                active_tenants = cursor.fetchone()[0]
                
                # 2. TOTAL APPOINTMENTS NO PERÍODO
                cursor.execute("""
                    SELECT 
                        COUNT(*) as total,
                        COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled,
                        COUNT(*) FILTER (WHERE status = 'no_show') as no_show,
                        COUNT(*) FILTER (WHERE status = 'completed') as completed
                    FROM appointments 
                    WHERE created_at >= %s
                """, (start_date,))
                apt_data = cursor.fetchone()
                total_appointments = apt_data[0]
                cancelled_appointments = apt_data[1] + apt_data[2]  # cancelled + no_show
                
                # 3. TOTAL CONVERSAS NO PERÍODO
                cursor.execute("""
                    SELECT COUNT(*) as total
                    FROM conversation_history 
                    WHERE created_at >= %s
                """, (start_date,))
                total_conversations = cursor.fetchone()[0]
                
                # 4. AI INTERACTIONS (confidence_score >= 0.7)
                cursor.execute("""
                    SELECT COUNT(*) as total
                    FROM conversation_history 
                    WHERE created_at >= %s 
                    AND confidence_score IS NOT NULL 
                    AND confidence_score >= 0.7
                """, (start_date,))
                ai_interactions = cursor.fetchone()[0]
                
                # 5. SPAM RATE (confidence_score < 0.7)
                cursor.execute("""
                    SELECT 
                        COUNT(*) FILTER (WHERE confidence_score >= 0.7) as valid,
                        COUNT(*) FILTER (WHERE confidence_score < 0.7) as spam,
                        COUNT(*) as total_with_score
                    FROM conversation_history 
                    WHERE created_at >= %s 
                    AND confidence_score IS NOT NULL
                """, (start_date,))
                spam_data = cursor.fetchone()
                valid_conversations = spam_data[0]
                spam_conversations = spam_data[1]
                total_with_score = spam_data[2]
                
                spam_rate = (spam_conversations / total_with_score * 100) if total_with_score > 0 else 0
                
                # 6. MRR - RECEITA REAL DOS PAGAMENTOS
                cursor.execute("""
                    SELECT COALESCE(SUM(amount), 0) as total_revenue
                    FROM subscription_payments 
                    WHERE payment_date >= %s 
                    AND payment_status = 'paid'
                    AND currency = 'BRL'
                """, (start_date,))
                total_revenue_result = cursor.fetchone()[0]
                total_revenue = float(total_revenue_result) if total_revenue_result else 0
                
                # MRR = receita mensal (aproximação)
                mrr = total_revenue * (30 / days) if days > 0 else total_revenue
                
                # 7. CHAT MINUTES - CÁLCULO REAL baseado em timestamps
                cursor.execute("""
                    WITH conversation_durations AS (
                        SELECT 
                            tenant_id,
                            user_id,
                            EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at)))/60 as duration_minutes
                        FROM conversation_history 
                        WHERE created_at >= %s 
                        GROUP BY tenant_id, user_id
                        HAVING COUNT(*) > 1
                    )
                    SELECT COALESCE(SUM(duration_minutes), 0) as total_minutes
                    FROM conversation_durations
                """, (start_date,))
                chat_minutes_result = cursor.fetchone()[0]
                total_chat_minutes = float(chat_minutes_result) if chat_minutes_result else 0
                
                # 8. OPERATIONAL EFFICIENCY
                operational_efficiency = (total_appointments / total_conversations * 100) if total_conversations > 0 else 0
                
                # 9. CANCELLATION RATE
                cancellation_rate = (cancelled_appointments / total_appointments * 100) if total_appointments > 0 else 0
                
                # 10. RECEITA/USO RATIO
                receita_uso_ratio = (total_revenue / total_chat_minutes) if total_chat_minutes > 0 else 0
                
                # 11. TOTAL CUSTOMERS ÚNICOS
                cursor.execute("""
                    SELECT COUNT(DISTINCT user_id) as unique_customers
                    FROM appointments 
                    WHERE created_at >= %s
                """, (start_date,))
                total_customers = cursor.fetchone()[0]
                
                metrics = {
                    'activeTenants': active_tenants,
                    'totalAppointments': total_appointments,
                    'totalConversations': total_conversations,
                    'aiInteractions': ai_interactions,
                    'totalRevenue': round(total_revenue, 2),
                    'totalChatMinutes': round(total_chat_minutes, 2),
                    'spamRate': round(spam_rate, 2),
                    'operationalEfficiency': round(operational_efficiency, 2),
                    'cancellationRate': round(cancellation_rate, 2),
                    'mrrPlatform': round(mrr, 2),
                    'receitaUsoRatio': round(receita_uso_ratio, 4),
                    'totalCustomers': total_customers,
                    # Debug info
                    'debug': {
                        'cancelled_appointments': cancelled_appointments,
                        'valid_conversations': valid_conversations,
                        'spam_conversations': spam_conversations,
                        'total_with_score': total_with_score
                    }
                }
                
                print(f"✅ Métricas calculadas do BD real:")
                for key, value in metrics.items():
                    if key != 'debug':
                        print(f"   {key}: {value}")
                
                return metrics
                
            except Exception as e:
                print(f"❌ Erro calculando métricas: {e}")
                raise
                
    def fetch_api_metrics(self, days: int = 30) -> Dict[str, Any]:
        """Busca métricas da API do dashboard"""
        print(f"🌐 Buscando métricas da API ({days} dias)...")
        
        try:
            response = requests.get(
                f"{self.api_base}/api/super-admin/kpis?period={days}",
                headers={'Content-Type': 'application/json'},
                timeout=30
            )
            
            if not response.ok:
                raise Exception(f"API retornou {response.status}: {response.text}")
                
            result = response.json()
            
            if not result.get('success') or not result.get('data', {}).get('kpis'):
                raise Exception(f"Estrutura de resposta inválida: {result}")
                
            kpis = result['data']['kpis']
            
            # Extrair valores numéricos
            metrics = {}
            for key, value_obj in kpis.items():
                if isinstance(value_obj, dict) and 'value' in value_obj:
                    try:
                        # Remove símbolos de moeda e converte
                        raw_value = str(value_obj['value']).replace('R$', '').replace(',', '').replace('%', '').strip()
                        metrics[key] = float(raw_value) if raw_value else 0
                    except (ValueError, TypeError):
                        metrics[key] = 0
                        
            print(f"✅ Métricas obtidas da API:")
            for key, value in metrics.items():
                print(f"   {key}: {value}")
                
            return metrics
            
        except Exception as e:
            print(f"❌ Erro buscando API: {e}")
            raise
            
    def compare_metrics(self, db_metrics: Dict, api_metrics: Dict, tolerance: float = 5.0) -> List[Dict]:
        """Compara métricas com tolerância percentual"""
        print(f"📊 Comparando métricas (tolerância: ±{tolerance}%)...")
        
        comparisons = []
        common_keys = set(db_metrics.keys()) & set(api_metrics.keys())
        
        # Remove debug do comparison
        common_keys.discard('debug')
        
        for metric in sorted(common_keys):
            db_val = db_metrics[metric]
            api_val = api_metrics[metric]
            
            # Calcular diferença percentual
            if db_val != 0:
                diff_pct = abs((api_val - db_val) / db_val) * 100
            elif api_val != 0:
                diff_pct = 100  # DB é 0 mas API não é
            else:
                diff_pct = 0  # Ambos são 0
                
            within_tolerance = diff_pct <= tolerance
            
            comparison = {
                'metric': metric,
                'db_value': db_val,
                'api_value': api_val,
                'difference': api_val - db_val,
                'diff_percentage': round(diff_pct, 2),
                'within_tolerance': within_tolerance,
                'status': '✅ OK' if within_tolerance else '❌ DIVERGÊNCIA'
            }
            
            comparisons.append(comparison)
            
            if not within_tolerance:
                print(f"⚠️ DIVERGÊNCIA em {metric}:")
                print(f"   BD: {db_val} | API: {api_val} | Diff: {diff_pct:.2f}%")
                
        return comparisons
        
    def generate_report(self, comparisons: List[Dict], days: int) -> Dict:
        """Gera relatório detalhado de validação"""
        print(f"\n📋 ===== RELATÓRIO DE VALIDAÇÃO - PYTHON =====")
        print(f"🕐 Data/Hora: {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}")
        print(f"📅 Período: {days} dias")
        print(f"🎯 Tolerância: ±5%")
        print(f"📊 Métricas analisadas: {len(comparisons)}")
        
        divergences = [c for c in comparisons if not c['within_tolerance']]
        conforming = [c for c in comparisons if c['within_tolerance']]
        
        conformity_rate = (len(conforming) / len(comparisons)) * 100 if comparisons else 0
        
        print(f"✅ Conformes: {len(conforming)}")
        print(f"❌ Divergências: {len(divergences)}")
        print(f"📈 Taxa de conformidade: {conformity_rate:.1f}%")
        
        print(f"\n📊 ===== DETALHAMENTO POR MÉTRICA =====")
        print(f"{'MÉTRICA':<25} {'BD':<12} {'API':<12} {'DIFF%':<8} {'STATUS':<12}")
        print("-" * 70)
        
        for comp in comparisons:
            metric = comp['metric'][:24].ljust(25)
            db_val = str(comp['db_value'])[:11].ljust(12)
            api_val = str(comp['api_value'])[:11].ljust(12)
            diff = f"{comp['diff_percentage']}%"[:7].ljust(8)
            status = comp['status'][:11].ljust(12)
            
            print(f"{metric}{db_val}{api_val}{diff}{status}")
            
        if divergences:
            print(f"\n⚠️ ===== DIVERGÊNCIAS CRÍTICAS =====")
            for div in divergences:
                print(f"❌ {div['metric']}:")
                print(f"   Banco: {div['db_value']}")
                print(f"   API: {div['api_value']}")
                print(f"   Diferença: {div['difference']} ({div['diff_percentage']}%)")
                print(f"   Ação: Investigar lógica de cálculo\n")
                
        print(f"\n🎯 ===== RECOMENDAÇÕES =====")
        if not divergences:
            print(f"✅ Todas as métricas estão dentro da tolerância")
            print(f"✅ Dashboard apresenta dados consistentes com o BD")
            print(f"✅ Nenhuma ação corretiva necessária")
        else:
            print(f"❌ {len(divergences)} métricas com divergências detectadas")
            print(f"🔍 Verificar lógica de cálculo nos endpoints da API")
            print(f"🔍 Comparar queries do BD com funções de cálculo")
            print(f"🔍 Revisar mapeamento de dados no frontend")
            
        print(f"\n================================================")
        
        return {
            'total_metrics': len(comparisons),
            'conforming': len(conforming),
            'divergences': len(divergences),
            'conformity_rate': conformity_rate,
            'details': comparisons
        }
        
    def validate(self, days: int = 30) -> Dict:
        """Executa validação completa"""
        print(f"🚀 Iniciando validação de métricas Python...")
        
        try:
            # 1. Calcular métricas direto do BD
            db_metrics = self.calculate_direct_metrics(days)
            
            # 2. Buscar métricas da API
            api_metrics = self.fetch_api_metrics(days)
            
            # 3. Comparar com tolerância
            comparisons = self.compare_metrics(db_metrics, api_metrics)
            
            # 4. Gerar relatório
            report = self.generate_report(comparisons, days)
            
            return report
            
        except Exception as e:
            print(f"❌ Erro na validação: {e}")
            raise

def main():
    """Função principal"""
    import sys
    
    days = int(sys.argv[1]) if len(sys.argv) > 1 else 30
    
    validator = MetricsValidator()
    
    try:
        report = validator.validate(days)
        
        # Exit code baseado nas divergências
        exit_code = 1 if report['divergences'] > 0 else 0
        sys.exit(exit_code)
        
    except Exception as e:
        print(f"💥 Falha na validação: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()