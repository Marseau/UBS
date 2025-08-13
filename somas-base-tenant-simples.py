#!/usr/bin/env python3
"""
SCRIPT SIMPLES DE SOMAS BASE POR TENANT
Calcula somas básicas usando API do Supabase
Períodos: 7, 30 e 90 dias
"""

import os
import json
import requests
from datetime import datetime, timedelta
from dotenv import load_dotenv

load_dotenv()

class SimpleTenantSums:
    def __init__(self):
        self.supabase_url = os.getenv('SUPABASE_URL')
        self.supabase_key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
        
        self.headers = {
            'apikey': self.supabase_key,
            'Authorization': f'Bearer {self.supabase_key}',
            'Content-Type': 'application/json'
        }
        
    def get_tenants(self):
        """Busca todos os tenants ativos"""
        url = f"{self.supabase_url}/rest/v1/tenants"
        params = {
            'select': 'id,name,domain',
            'status': 'eq.active'
        }
        
        response = requests.get(url, headers=self.headers, params=params)
        return response.json()
        
    def count_records(self, table, tenant_id, start_date=None, additional_filters=None):
        """Conta registros de uma tabela para um tenant"""
        url = f"{self.supabase_url}/rest/v1/{table}"
        
        params = {
            'select': '*',
            'tenant_id': f'eq.{tenant_id}'
        }
        
        if start_date:
            params['created_at'] = f'gte.{start_date}'
            
        if additional_filters:
            params.update(additional_filters)
        
        # Usar HEAD request para contar
        response = requests.head(url, headers=self.headers, params=params)
        
        # O count vem no header Content-Range
        content_range = response.headers.get('Content-Range', '0-0/0')
        count = int(content_range.split('/')[-1])
        
        return count
        
    def calculate_tenant_sums(self, tenant_id, days):
        """Calcula somas básicas para um tenant"""
        start_date = (datetime.now() - timedelta(days=days)).strftime('%Y-%m-%d')
        
        sums = {
            'tenant_id': tenant_id,
            'period_days': days,
            'start_date': start_date,
            'calculated_at': datetime.now().isoformat()
        }
        
        try:
            # APPOINTMENTS
            sums['appointments_total'] = self.count_records('appointments', tenant_id, start_date)
            sums['appointments_confirmed'] = self.count_records('appointments', tenant_id, start_date, {'status': 'eq.confirmed'})
            sums['appointments_cancelled'] = self.count_records('appointments', tenant_id, start_date, {'status': 'eq.cancelled'})
            sums['appointments_no_show'] = self.count_records('appointments', tenant_id, start_date, {'status': 'eq.no_show'})
            sums['appointments_completed'] = self.count_records('appointments', tenant_id, start_date, {'status': 'eq.completed'})
            
            # CONVERSATIONS
            sums['conversations_total'] = self.count_records('conversation_history', tenant_id, start_date)
            sums['conversations_from_users'] = self.count_records('conversation_history', tenant_id, start_date, {'is_from_user': 'eq.true'})
            
            # SERVICES
            sums['services_active'] = self.count_records('services', tenant_id, None, {'is_active': 'eq.true'})
            sums['services_total'] = self.count_records('services', tenant_id)
            
            print(f"✅ Tenant {tenant_id}: {sums['appointments_total']} appointments, {sums['conversations_total']} conversations")
            
        except Exception as e:
            print(f"❌ Erro no tenant {tenant_id}: {e}")
            sums['error'] = str(e)
            
        return sums
        
    def calculate_for_all_tenants(self, days=30):
        """Calcula para todos os tenants"""
        print(f"🚀 Calculando somas base ({days} dias)...")
        
        tenants = self.get_tenants()
        print(f"📋 Encontrados {len(tenants)} tenants ativos")
        
        results = {}
        
        for tenant in tenants:
            tenant_id = tenant['id']
            tenant_name = tenant['name']
            
            print(f"\n🏢 Processando: {tenant_name}")
            
            tenant_sums = self.calculate_tenant_sums(tenant_id, days)
            tenant_sums['tenant_name'] = tenant_name
            tenant_sums['tenant_domain'] = tenant['domain']
            
            results[tenant_id] = tenant_sums
            
        return results
        
    def save_results(self, results, days):
        """Salva resultados em arquivo"""
        filename = f"tenant-somas-base-{days}d-{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(results, f, indent=2, ensure_ascii=False)
            
        print(f"💾 Resultados salvos: {filename}")
        return filename

def main():
    calculator = SimpleTenantSums()
    
    # Calcular para múltiplos períodos
    for days in [7, 30, 90]:
        print(f"\n{'='*50}")
        print(f"📊 PERÍODO: {days} DIAS")
        print(f"{'='*50}")
        
        results = calculator.calculate_for_all_tenants(days)
        filename = calculator.save_results(results, days)
        
        # Resumo
        total_tenants = len(results)
        total_appointments = sum(r.get('appointments_total', 0) for r in results.values())
        total_conversations = sum(r.get('conversations_total', 0) for r in results.values())
        
        print(f"\n📋 RESUMO:")
        print(f"👥 Tenants: {total_tenants}")
        print(f"📅 Total appointments: {total_appointments}")
        print(f"💬 Total conversations: {total_conversations}")
        print(f"📄 Arquivo: {filename}")

if __name__ == "__main__":
    main()