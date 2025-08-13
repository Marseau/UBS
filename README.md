# 🚀 Sistema Universal de Agendamentos Multi-Tenant

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-43853D?style=flat&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=flat&logo=supabase&logoColor=white)](https://supabase.com/)

Sistema **SaaS multi-tenant** com automação de agendamentos via **WhatsApp AI** que funciona para qualquer domínio de negócios.

## 🎯 **Domínios Suportados**

- 🏛️ **Jurídico** (advogados, consultórios)
- 🏥 **Saúde** (psicólogos, terapeutas, médicos)  
- 🎓 **Educação** (professores particulares, tutores)
- 💅 **Beleza** (salões, estética, barbearias)
- ⚽ **Esportes** (personal trainers, professores de modalidades)
- 💼 **Consultoria** (consultores, coaches)
- 🔧 **Outros** (extensível para qualquer serviço)

## ✨ **Características Principais**

- ✅ **Multi-Tenant Real** - Isolamento completo com Row Level Security
- ✅ **Cross-Tenant Users** - Usuários podem usar múltiplos negócios
- ✅ **IA Especializada** - Agentes configuráveis por domínio
- ✅ **WhatsApp Nativo** - Integração completa com Business API
- ✅ **TypeScript** - Type-safe development
- ✅ **Escalável** - Arquitetura cloud-native

## 🛠️ **Stack Tecnológica**

- **Backend**: Node.js + TypeScript + Express
- **Banco**: PostgreSQL (Supabase) com RLS
- **IA**: OpenAI GPT-4 + Function Calling
- **WhatsApp**: WhatsApp Business API
- **Email**: Zoho Mail API
- **Deploy**: Cloud (AWS/GCP/Vercel)

## 🚀 **Quick Start**

### 1. **Clone e Install**
```bash
git clone https://github.com/Marseau/universal-booking-system.git
cd universal-booking-system
npm install
```

### 2. **Configure Environment**
```bash
cp .env.example .env
# Edite .env com suas credenciais
```

### 3. **Start Development**
```bash
npm run dev
```

### 4. **Build Production**
```bash
npm run build
npm start
```

## 📁 **Estrutura do Projeto**

```
src/
├── config/          # Configurações da aplicação
├── middleware/      # Middlewares Express
├── routes/          # Rotas da API
├── services/        # Lógica de negócio
├── types/           # TypeScript types
├── utils/           # Utilitários
└── index.ts         # Entry point

docs/                # Documentação
database/            # Schemas e migrations
scripts/             # Scripts utilitários
```

## 🔧 **Scripts Disponíveis**

```bash
npm run dev          # Desenvolvimento com hot reload
npm run build        # Build para produção
npm run start        # Start produção
npm run lint         # Lint código
npm run format       # Format código
npm run commit       # Commit rápido
npm run push         # Push para GitHub
```

## 📊 **API Endpoints**

### **Tenants**
- `POST /api/tenants` - Criar tenant
- `GET /api/tenants/:slug` - Obter tenant
- `PUT /api/tenants/:slug` - Atualizar tenant

### **Appointments**
- `POST /api/appointments` - Criar agendamento
- `GET /api/appointments` - Listar agendamentos
- `PUT /api/appointments/:id` - Atualizar agendamento
- `DELETE /api/appointments/:id` - Cancelar agendamento

### **WhatsApp**
- `POST /api/whatsapp/webhook` - Webhook WhatsApp
- `GET /api/whatsapp/webhook` - Verificação webhook

### **AI Chat**
- `POST /api/ai/chat` - Processar mensagem IA

## 🗄️ **Database Schema**

O sistema usa **Supabase PostgreSQL** com as seguintes tabelas principais:

- `tenants` - Negócios/empresas
- `users` - Usuários cross-tenant
- `user_tenants` - Relacionamento many-to-many
- `services` - Serviços oferecidos
- `appointments` - Agendamentos
- `conversation_history` - Histórico de conversas IA

Ver documentação completa em [`docs/universal-booking-system.md`](docs/universal-booking-system.md)

## 🔐 **Segurança**

- **Row Level Security (RLS)** em todas as tabelas
- **Isolamento de dados** por tenant
- **Validação de entrada** com TypeScript
- **Rate limiting** nas APIs
- **Webhook verification** para integrações

## 🚀 **Deploy**

### **Vercel (Recomendado)**
```bash
npm i -g vercel
vercel
```

### **Docker**
```bash
docker build -t universal-booking-system .
docker run -p 3000:3000 universal-booking-system
```

## 📖 **Documentação**

- [Arquitetura Completa](docs/universal-booking-system.md)
- [Database Types](src/types/database.types.ts)
- [API Reference](docs/api-reference.md) *(em breve)*
- [Deployment Guide](docs/deployment.md) *(em breve)*

## 🤝 **Contribuindo**

1. Fork o projeto
2. Crie sua feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

## 📝 **License**

Este projeto está licenciado sob a MIT License - veja o arquivo [LICENSE](LICENSE) para detalhes.

## 🙋‍♂️ **Suporte**

- 📧 Email: marseau@email.com
- 🐛 Issues: [GitHub Issues](https://github.com/Marseau/universal-booking-system/issues)
- 💬 Discussions: [GitHub Discussions](https://github.com/Marseau/universal-booking-system/discussions)

---

**Criado com ❤️ para democratizar agendamentos automatizados**
