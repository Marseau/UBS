# 🌱 Mock Data - Instruções Completas

## Visão Geral

Este sistema agora possui **dados mock completos** para todos os 6 domínios de negócio, permitindo testes rigorosos em todas as funcionalidades do sistema multi-tenant.

## 📊 Dados Criados

### 🏢 **Tenants (30 negócios)**
- **Beauty (5)**: Salon Bella Vista, Estética Glamour, Barbearia Moderna, Spa Relaxante, Studio de Beleza Ana
- **Healthcare (5)**: Clínica Bem Estar, Consultório Dra. Silva, Centro Terapêutico, Psicologia Integral, Fisioterapia Avançada
- **Legal (5)**: Escritório Advocacia Silva, Consultoria Jurídica Ltda, Advogados Associados, Jurídico Empresarial, Direito & Consultoria
- **Education (5)**: Aulas Particulares Pro, Reforço Escolar Plus, Curso ENEM Excellence, Tutoria Acadêmica, Ensino Personalizado
- **Sports (5)**: Personal Trainer Pro, Academia Fitness, Treinamento Funcional, Crossfit Elite, Pilates Studio
- **Consulting (5)**: Consultoria Estratégica, Business Consulting, Coaching Empresarial, Consultoria Digital, Gestão & Resultados

### 👥 **Usuários (50 clientes)**
- Nomes brasileiros realistas
- Telefones com DDDs brasileiros
- Emails únicos
- Preferências configuradas

### 📋 **Categorias e Serviços**
- **4 categorias por tenant** (120 total)
- **5-7 serviços por tenant** (175+ total)
- Preços realistas por domínio
- Durações específicas
- Configurações detalhadas

### 📆 **Agendamentos (200)**
- Distribuídos pelos próximos 30 dias
- Todos os status: pending, confirmed, in_progress, completed, cancelled
- Preços calculados
- Notas de cliente e internas
- Metadados de origem

### 💬 **Conversas (300)**
- Histórico realista de conversas WhatsApp
- Intenções detectadas: booking, cancellation, inquiry, emergency, pricing, availability
- Níveis de confiança da IA
- Contexto de conversa mantido

### 📱 **Templates WhatsApp**
- Confirmação de agendamento
- Lembretes
- Cancelamentos
- Aprovados e ativos

### 👨‍💼 **Admin Users**
- 1 admin por tenant
- Permissões configuradas
- Emails corporativos

## 🚀 Como Executar

### 1. **Popular Banco Completo**
```bash
npm run db:populate
```
Este comando:
- Executa `seed-comprehensive-data.js`
- Executa `test-seed-data.js` 
- Mostra estatísticas completas

### 2. **Apenas Seed (sem teste)**
```bash
npm run db:seed-comprehensive
```

### 3. **Apenas Teste (verificar dados)**
```bash
npm run db:test-seed
```

## 📈 Estatísticas Esperadas

Após executar o seed, você deve ver:

```
✅ SEED COMPLETO!
==========================================
🏢 Tenants criados: 30
👥 Usuários criados: 50
📋 Categorias criadas: 120
⚙️ Serviços criados: 175+
📆 Agendamentos criados: 200
==========================================
```

## 🧪 Testes Rigorosos Disponíveis

### 1. **Teste Multi-Tenant**
```bash
npm run test:ai
```
- Testa todos os domínios
- Verifica isolamento de dados
- Valida regras específicas

### 2. **Teste WhatsApp Integration**
```bash
npm run test:whatsapp
```
- Simula conversas reais
- Testa processamento multimodal
- Valida function calling

### 3. **Teste Action Executor**
```bash
npm run test:action-executor
```
- Testa agendamentos automáticos
- Verifica cancelamentos
- Valida buscas

### 4. **Teste Intent Recognition**
```bash
npm run test:intent-recognition
```
- Analisa detecção de intenções
- Testa classificação por domínio
- Verifica confiança da IA

### 5. **Teste Multimodal**
```bash
npm run test:multimodal
```
- Processa imagens
- Analisa áudios
- Extrai contexto

### 6. **Teste de Stress**
```bash
npm run test:stress
```
- Simula carga alta
- Testa concurrent users
- Valida performance

### 7. **Executar Todos os Testes**
```bash
npm run test:all
```

## 🔧 Cenários de Teste Específicos

### **Beauty Domain**
```bash
# Agendamento de corte
"Oi, quero agendar um corte de cabelo para amanhã"

# Cancelamento
"Preciso cancelar meu horário das 14h"

# Consulta de preços
"Quanto custa uma coloração completa?"
```

### **Healthcare Domain**
```bash
# Emergência
"Socorro, preciso de ajuda urgente!"

# Agendamento terapêutico
"Quero marcar uma sessão de fisioterapia"

# Consulta psicológica
"Preciso falar com um psicólogo"
```

### **Legal Domain**
```bash
# Consulta trabalhista
"Fui demitido e preciso de orientação"

# Direito familiar
"Quero dar entrada no divórcio"

# Análise de contrato
"Preciso analisar um contrato"
```

### **Education Domain**
```bash
# Aula particular
"Preciso de reforço em matemática"

# ENEM
"Quero me preparar para o vestibular"

# Inglês
"Preciso melhorar meu inglês"
```

### **Sports Domain**
```bash
# Personal trainer
"Quero contratar um personal"

# Pilates
"Gostaria de fazer pilates"

# Avaliação física
"Preciso de uma avaliação completa"
```

### **Consulting Domain**
```bash
# Estratégia empresarial
"Minha empresa precisa de consultoria"

# Coaching
"Quero um coach executivo"

# Marketing digital
"Preciso melhorar meu marketing"
```

## 💡 Dados Realistas

### **Configurações por Domínio**
- **Horários específicos** por tipo de negócio
- **Preços realistas** baseados no mercado brasileiro
- **Regras de cancelamento** apropriadas
- **Configurações de IA** otimizadas
- **Templates específicos** por domínio

### **Relacionamentos Complexos**
- Usuários conectados a múltiplos tenants
- Histórico de interações
- Preferências por serviço
- Estados de conversa mantidos

### **Metadados Ricos**
- Origem do agendamento (WhatsApp, site, telefone)
- Lembretes enviados
- Confirmações registradas
- Notas internas e do cliente

## 🔍 Verificação de Qualidade

O script de teste (`test-seed-data.js`) verifica:
- ✅ Contagem de registros por tabela
- ✅ Distribuição por domínio
- ✅ Integridade dos relacionamentos
- ✅ Estatísticas de agendamentos
- ✅ Análise de conversas
- ✅ Confiança da IA
- ✅ Tipos de mensagem

## 🎯 Próximos Passos

1. **Execute o seed**: `npm run db:populate`
2. **Verifique os dados**: Analise o output detalhado
3. **Execute testes específicos**: Escolha o domínio de interesse
4. **Teste cenários reais**: Use os exemplos acima
5. **Monitore performance**: Execute testes de stress
6. **Ajuste configurações**: Baseado nos resultados

## 🚨 Observações Importantes

- **Backup**: Sempre faça backup antes de executar seed em produção
- **Variáveis de ambiente**: Configure `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`
- **Limpeza**: O script limpa dados existentes - use com cuidado
- **Performance**: Seed completo pode levar 2-5 minutos dependendo da conexão

## 🎉 Resultado Final

Após executar todos os scripts, você terá:
- **Sistema completamente populado**
- **Dados realistas e interconectados**
- **Cenários de teste abrangentes**
- **Métricas de qualidade validadas**
- **Base sólida para desenvolvimento**

**Agora você pode executar testes rigorosos em todos os aspectos do sistema!** 🚀