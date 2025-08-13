# 📊 Fluxos Visuais - UBS System

Este diretório contém todos os fluxogramas e diagramas do sistema UBS.

## 🛠️ Ferramentas Utilizadas

### 1. Mermaid.js
- **Fluxogramas de páginas**
- **User journeys**
- **Diagramas de sequência**

### 2. PlantUML
- **Arquitetura de sistema**
- **Diagramas de classe**
- **Diagramas de componentes**

## 📋 Fluxos Disponíveis

### 🎯 [User Journey - Novo Cliente](./user-journey-new-client.md)
Fluxo completo desde descoberta até primeiro agendamento

### 💰 [Billing Flow - Modelo por Conversa](./billing-flow-conversation.md)
Lógica de cobrança, upgrades automáticos e excedentes

### 🏗️ [System Architecture](./system-architecture.md)
Arquitetura técnica completa do sistema

### 📱 [Frontend Page Flow](./frontend-page-flow.md)
Navegação entre páginas e componentes

### 🔄 [WhatsApp Integration Flow](./whatsapp-integration-flow.md)
Fluxo de integração com WhatsApp Business API

## 🎨 Como Usar

### Visualizar no VS Code
1. Instale a extensão "Mermaid Preview"
2. Abra qualquer arquivo `.md` com diagramas
3. Use `Ctrl+Shift+P` → "Mermaid: Preview"

### Gerar Imagens
```bash
npm run generate:diagrams
```

### Adicionar Novo Fluxo
1. Crie arquivo `.md` neste diretório
2. Use sintaxe Mermaid ou PlantUML
3. Documente o propósito e contexto