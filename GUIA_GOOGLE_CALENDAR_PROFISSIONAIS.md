# 📅 Guia: Configuração Google Calendar para Profissionais

Este guia orienta profissionais sobre como conectar e configurar sua agenda do Google Calendar com a plataforma UBS.

## 🎯 **Pré-requisitos**

### **Para o Profissional:**
- ✅ Conta Google ativa (Gmail)
- ✅ Google Calendar configurado
- ✅ Perfil cadastrado na plataforma pelo admin

### **Para o Admin:**
- ✅ Credenciais Google OAuth configuradas no sistema
- ✅ APIs Google Calendar habilitadas
- ✅ Profissional cadastrado no sistema

---

## 🚀 **Passo-a-Passo: Conectar Google Calendar**

### **1. Acessar Configurações**
1. Admin acessa **Dashboard → Profissionais**
2. Clica no botão **"Editar"** do profissional desejado
3. Modal de edição abre com seção **"Integração Google Calendar"**

### **2. Iniciar Conexão**
1. Na seção Google Calendar, clique **"Conectar"**
2. Sistema abre popup de autenticação Google
3. **IMPORTANTE:** Popup deve permanecer aberto

### **3. Autenticação Google**
1. **Login:** Entre com email/senha da conta Google do profissional
2. **Permissões:** Autorize o acesso ao Google Calendar
   - ✅ Ver eventos do calendário
   - ✅ Criar e editar eventos
   - ✅ Sincronização automática
3. **Finalizar:** Clique "Permitir" / "Allow"

### **4. Configurar Horários de Trabalho**
Após conexão bem-sucedida, configure os horários:

**Segunda a Sexta:**
- Horário de início: Ex: 08:00
- Horário de fim: Ex: 18:00

**Sábado:**
- Horário de início: Ex: 08:00  
- Horário de fim: Ex: 12:00

**Domingo (Opcional):**
- ☑️ Marque se trabalha aos domingos
- Configure horário início/fim

### **5. Confirmar Configuração**
1. **Status deve mostrar:** 🟢 "Conectado"
2. **Email da conta:** Exibido na interface
3. **Horários salvos:** Automaticamente ao alterar
4. **Sincronização ativa:** Timestamp atualizado

---

## ⚙️ **Funcionalidades Disponíveis**

### **Sincronização Automática**
- 🔄 **Bi-direcional:** Plataforma ↔ Google Calendar
- ⏰ **Tempo real:** Agendamentos aparecem no Google
- 🚫 **Conflitos:** Sistema detecta sobreposições
- 📱 **Multi-dispositivo:** Acesso via app Google

### **Sincronização Manual**
- **Botão:** "Sincronizar Agora" 
- **Resultado:** Mostra criados/atualizados/removidos
- **Uso:** Quando precisar forçar atualização

### **Gestão de Horários**
- **Auto-save:** Mudanças salvas automaticamente
- **Flexibilidade:** Horários diferentes por dia
- **Disponibilidade:** Slots baseados nos horários

---

## 🔧 **Resolução de Problemas**

### **Erro: "Por favor, salve o profissional antes..."**
**Causa:** Tentativa de conectar profissional não salvo
**Solução:** 
1. Preencha dados obrigatórios (nome, email, etc.)
2. Clique "Salvar Alterações"
3. Reabra modal e tente conectar novamente

### **Popup não abre ou fecha inesperadamente**
**Causa:** Bloqueador de popup ou JavaScript desabilitado
**Solução:**
1. Desative bloqueador de popup para o site
2. Tente em aba anônima/privada
3. Use Chrome ou Firefox atualizados

### **Status permanece "Não conectado"**
**Causa:** Processo OAuth incompleto
**Solução:**
1. Verifique se fechou popup após autorizar
2. Aguarde 5 segundos e recarregue página
3. Tente processo novamente

### **Erro de sincronização**
**Causa:** Problemas de conectividade ou permissões
**Solução:**
1. Verifique conexão com internet
2. Reautorize Google Calendar se necessário
3. Contate suporte se persistir

---

## 📋 **Checklist de Configuração**

### **Pré-configuração:**
- [ ] Profissional possui conta Google
- [ ] Admin configurou credenciais OAuth
- [ ] Profissional está cadastrado no sistema

### **Processo de Conexão:**
- [ ] Modal de edição aberto
- [ ] Botão "Conectar" clicado
- [ ] Popup Google autorizado
- [ ] Status mostra "Conectado"
- [ ] Email da conta exibido

### **Configuração de Horários:**
- [ ] Horários segunda-sexta definidos
- [ ] Horário sábado configurado
- [ ] Domingo habilitado se necessário
- [ ] Mudanças salvas automaticamente

### **Validação Final:**
- [ ] Sincronização manual executada
- [ ] Timestamp atualizado
- [ ] Eventos aparecendo no Google Calendar
- [ ] Sistema detecta conflitos corretamente

---

## 🎯 **Benefícios da Integração**

### **Para o Profissional:**
- 🔄 **Sincronização automática** - agenda sempre atualizada
- 📱 **Acesso mobile** - via app Google Calendar  
- ⚡ **Tempo real** - agendamentos imediatos
- 🚫 **Evita conflitos** - detecção automática

### **Para o Cliente:**
- ✅ **Disponibilidade real** - horários sempre corretos
- ⏰ **Agendamento rápido** - confirmação instantânea
- 📧 **Notificações** - lembretes automáticos
- 🔄 **Flexibilidade** - reagendamentos fáceis

### **Para o Negócio:**
- 📊 **Relatórios precisos** - dados em tempo real
- 🎯 **Otimização** - aproveitamento máximo da agenda
- 💰 **Menos no-shows** - lembretes integrados
- 🚀 **Produtividade** - automação completa

---

## 📞 **Suporte e Contato**

**Problemas técnicos:** Contate o administrador do sistema
**Dúvidas sobre Google:** [Ajuda Google Calendar](https://support.google.com/calendar)
**Suporte plataforma:** [Seu canal de suporte]

---

**💡 Dica:** Mantenha o Google Calendar sempre atualizado e sincronizado em todos os dispositivos para melhor experiência!