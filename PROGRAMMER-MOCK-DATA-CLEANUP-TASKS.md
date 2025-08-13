# 🔥 PROGRAMMER TASK: MOCK DATA CLEANUP - PRODUCTION CRITICAL

**Urgência:** ALTA - Dados mockados estão sendo exibidos aos usuários  
**Prazo:** Imediato  
**Testador:** Claude ficará responsável por validação e testes

---

## 🎯 TASK 1: REMOVE DASHBOARD MOCK DATA (CRÍTICA)

### **Arquivo:** `src/frontend/js/tenant-admin-dashboard.js`
### **Linhas:** 467-510

**Problema:** Dashboard principal mostra dados fake aos usuários

**Ação requerida:**
1. **Remover completamente** o objeto `mockData` das linhas 467-510
2. **Substituir** todas as chamadas `this.updateDashboardData(mockData)` por chamadas reais da API
3. **Implementar** chamadas para os endpoints reais:
   - `/api/admin/analytics/tenant-dashboard`
   - `/api/dashboard/metrics`
   - `/api/dashboard/charts`

**Código a ser removido:**
```javascript
const mockData = {
    kpis: {
        appointments: { value: 143, trend: '+12%', direction: 'up' },
        revenue: { value: 'R$ 8.450', trend: '+8%', direction: 'up' },
        customers: { value: 89, trend: '+5%', direction: 'up' },
        // ... todo o objeto mockData
    }
}
```

**Substituir por:**
```javascript
// Usar dados reais da API
const realData = await this.fetchRealDashboardData();
this.updateDashboardData(realData);
```

---

## 🎯 TASK 2: FIX EXCHANGE RATE API (CRÍTICA)

### **Arquivo:** `src/routes/super-admin-dashboard-apis.ts`
### **Linhas:** 19-23

**Problema:** Taxa de câmbio fixa em 5.56 BRL/USD afeta todos os cálculos financeiros

**Ação requerida:**
1. **Remover** a função hardcoded `getUsdToBrlRate()`
2. **Implementar** chamada para API real de câmbio (sugestão: exchangerate-api.com)
3. **Adicionar** cache de 1 hora para evitar chamadas excessivas

**Código atual (REMOVER):**
```typescript
async function getUsdToBrlRate(): Promise<number> {
    return 5.56; // HARDCODED - REMOVER
}
```

**Implementar:**
```typescript
async function getUsdToBrlRate(): Promise<number> {
    try {
        const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
        const data = await response.json();
        return data.rates.BRL;
    } catch (error) {
        console.error('Exchange rate API failed, using fallback:', error);
        return 5.56; // Fallback apenas em caso de erro
    }
}
```

---

## 🎯 TASK 3: REMOVE API FALLBACK MOCK DATA (CRÍTICA)

### **Arquivo:** `src/routes/admin.js`
### **Linhas:** 165-213, 335-347, 499-541, 753-781, 787-799

**Problema:** APIs retornam dados mockados quando deveria retornar erro ou dados reais

**Ação requerida:**
1. **Remover** todos os objetos `mockData` dos fallbacks
2. **Implementar** proper error handling
3. **Retornar** dados reais do banco ou erro apropriado

**Substituir todos os blocos como:**
```javascript
const mockData = {
    totalAppointments: 488,
    totalRevenue: 87450,
    // ... dados fake
};
return res.json({ success: true, data: mockData });
```

**Por:**
```javascript
// Buscar dados reais do banco
const realData = await getRealDataFromDatabase();
if (!realData) {
    return res.status(500).json({ 
        success: false, 
        error: 'Erro ao carregar dados do sistema' 
    });
}
return res.json({ success: true, data: realData });
```

---

## 🎯 TASK 4: CLEAN TEST FILES (MÉDIA PRIORIDADE)

### **Arquivos:** `test-api-endpoints.js`, outros arquivos de teste

**Problema:** Credenciais hardcoded em arquivos de teste

**Ação requerida:**
1. **Remover** todas as credenciais hardcoded
2. **Usar** variáveis de ambiente
3. **Criar** arquivo `.env.test` se necessário

**Remover:**
```javascript
const supabase = createClient(
  'https://qsdfyffuonywmtnlycri.supabase.co',
  'your-supabase-service-role-key'
);
```

**Substituir por:**
```javascript
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);
```

---

## 🎯 TASK 5: VALIDATE BUSINESS DOMAIN CONFIG

### **Arquivos:** `src/routes/auth.js`, `src/routes/tenants.js`

**Problema:** Domínios de negócio hardcoded limitam expansão

**Ação requerida:**
1. **Mover** array de domínios para tabela do banco
2. **Criar** endpoint para gerenciar domínios
3. **Implementar** validação dinâmica

---

## 🧪 TESTING CHECKLIST (PARA VALIDAÇÃO)

Após completar as tasks, testar:

- [ ] Dashboard Tenant Admin carrega dados reais (não mock)
- [ ] Dashboard Super Admin usa taxa de câmbio real
- [ ] APIs retornam dados reais do banco ou erro apropriado
- [ ] Não há mais objetos `mockData` no código
- [ ] Taxa de câmbio atualiza automaticamente
- [ ] Fallbacks mostram erro em vez de dados fake
- [ ] Credenciais vêm de variáveis de ambiente

---

## 🚀 DELIVERY TIMELINE

**Estimativa:** 2-3 horas para programador experiente  
**Prioridade:** MÁXIMA - Sistema não pode ir para produção com mock data  
**Validação:** Claude testará cada task imediatamente após conclusão

---

## 📞 COMUNICAÇÃO

**Quando concluir cada task:**
1. Commite as changes
2. Reporte: "Task X concluída"
3. Claude fará validação imediata
4. Prosseguir para próxima task

**Status atual:** Aguardando início do desenvolvimento 🚀