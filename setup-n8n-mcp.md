# 🔧 Setup N8N MCP Server - WhatsApp Salon N8N

## ✅ **STATUS ATUAL**

- ✅ **N8N MCP Server instalado** em `/Users/marseau/Developer/WhatsAppSalon-N8N/n8n-mcp-server/`
- ✅ **Dependências instaladas** e compiladas
- ✅ **Servidor N8N rodando** em `https://n8n-rms.stratfin.tec.br/`
- ⚠️ **Pendente**: Gerar API Key no N8N

## 🔑 **1. GERAR API KEY NO N8N**

### **Passos:**
1. **Acessar**: https://n8n-rms.stratfin.tec.br/
2. **Login** no N8N
3. **Settings** → **API Keys** → **Create API Key**
4. **Nome**: `WhatsApp-Salon-MCP-Integration`
5. **Copiar** a API key gerada

### **Configurar API Key:**
```bash
cd /Users/marseau/Developer/WhatsAppSalon-N8N/n8n-mcp-server/
```

Editar `.env`:
```bash
N8N_API_KEY=[SUA_API_KEY_AQUI]
```

## 🚀 **2. TESTAR MCP SERVER**

```bash
cd /Users/marseau/Developer/WhatsAppSalon-N8N/n8n-mcp-server/
npm start
```

## 📋 **3. CONFIGURAÇÃO COMPLETA ATUAL**

```bash
# /Users/marseau/Developer/WhatsAppSalon-N8N/n8n-mcp-server/.env
N8N_API_URL=https://n8n-rms.stratfin.tec.br/api/v1
N8N_API_KEY=n8n_api_key_placeholder  # ← SUBSTITUIR
DEBUG=true
```

## 🔗 **4. INTEGRAÇÃO COM CLAUDE CODE**

Uma vez com a API key configurada, você pode usar comandos como:

```bash
# Listar workflows
curl -X GET "https://n8n-rms.stratfin.tec.br/api/v1/workflows" \
     -H "X-N8N-API-KEY: [SUA_API_KEY]"

# Executar workflow
curl -X POST "https://n8n-rms.stratfin.tec.br/api/v1/workflows/[ID]/execute" \
     -H "X-N8N-API-KEY: [SUA_API_KEY]"
```

## 📁 **5. WORKFLOWS DISPONÍVEIS**

Os workflows já criados no projeto:
- `N8N-WABA-Booking-E2E-Flow-CORRECTED.json` - Fluxo completo de agendamento
- `N8N-Business-Analytics-Metrics-CORRECTED.json` - Métricas de negócio
- `N8N-Appointment-Confirmation-Reminders-CORRECTED.json` - Lembretes
- `N8N-Human-Escalation-Management.json` - Escalação humana

## ✅ **PRÓXIMOS PASSOS**

1. **Gerar API Key** no N8N UI
2. **Atualizar `.env`** com a API key real
3. **Testar**: `npm start` no diretório do MCP server
4. **Integrar** com workflows existentes

## 🎯 **FUNCIONALIDADES DO MCP N8N**

Com o MCP instalado, você poderá:
- ✅ **Listar workflows** do N8N via comando natural
- ✅ **Executar workflows** remotamente 
- ✅ **Monitorar execuções** em tempo real
- ✅ **Gerenciar credenciais** e configurações
- ✅ **Integrar** com o sistema WhatsApp Salon

---

**Status**: ⚠️ **Aguardando API Key** - Depois disso estará 100% funcional!