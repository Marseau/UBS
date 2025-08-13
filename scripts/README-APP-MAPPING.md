# 🗺️ Mapeamento Automático de App com Puppeteer

Script completo para mapear automaticamente todo o frontend de uma aplicação web, incluindo login, navegação, screenshots e relatórios detalhados.

## ✨ Funcionalidades

- 🔐 **Login automático** com credenciais
- 🔍 **Descoberta automática** de páginas
- 📸 **Screenshots** de todas as páginas
- 📊 **Relatórios** em JSON e HTML
- 🔗 **Mapeamento de links** e navegação
- 📝 **Análise de formulários** e elementos interativos
- 📈 **Estatísticas** detalhadas do app
- ⚡ **Configuração flexível**

## 🚀 Instalação

```bash
# Instalar dependências
npm install puppeteer

# Ou se já tiver o projeto configurado
npm install
```

## ⚙️ Configuração

1. **Edite o arquivo de configuração:**
   ```bash
   nano scripts/app-mapping-config.js
   ```

2. **Configure suas credenciais:**
   ```javascript
   username: 'seu_email@exemplo.com',
   password: 'sua_senha',
   baseUrl: 'http://localhost:3000', // URL do seu app
   ```

3. **Ajuste seletores de login** (se necessário):
   ```javascript
   selectors: {
       username: 'input[name="email"]',
       password: 'input[name="password"]',
       loginButton: 'button[type="submit"]'
   }
   ```

## 🎯 Como Usar

### Execução Básica
```bash
node scripts/app-mapping-puppeteer.js
```

### Execução com Configuração Personalizada
```javascript
const AppMapper = require('./scripts/app-mapping-puppeteer');
const config = require('./scripts/app-mapping-config');

const mapper = new AppMapper(config);
mapper.run();
```

### Execução Programática
```javascript
const AppMapper = require('./scripts/app-mapping-puppeteer');

const customConfig = {
    baseUrl: 'https://meuapp.com',
    username: 'admin@exemplo.com',
    password: 'senha123',
    specificPages: ['/dashboard', '/users', '/settings'],
    delay: 3000
};

const mapper = new AppMapper(customConfig);
mapper.run();
```

## 📁 Output Gerado

```
app-mapping-results/
├── app-mapping-report.json    # Relatório completo em JSON
├── app-mapping-report.html    # Relatório visual em HTML
└── app-mapping-screenshots/   # Screenshots de todas as páginas
    ├── page_1_home_2024-01-15T10-30-00.png
    ├── page_2_dashboard_2024-01-15T10-30-05.png
    └── ...
```

## 📊 Estrutura do Relatório

### JSON Report
```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "baseUrl": "http://localhost:3000",
  "pages": [
    {
      "name": "page_1_home",
      "url": "http://localhost:3000/",
      "title": "Dashboard - Meu App",
      "elements": {
        "buttons": 15,
        "inputs": 8,
        "links": 25,
        "forms": 3
      },
      "links": [...],
      "forms": [...],
      "screenshot": "./app-mapping-screenshots/page_1_home.png"
    }
  ],
  "summary": {
    "totalPages": 12,
    "totalScreenshots": 12,
    "totalLinks": 156,
    "totalForms": 8
  }
}
```

### HTML Report
- 📊 Dashboard com estatísticas
- 📄 Lista de todas as páginas mapeadas
- 📸 Screenshots integrados
- 🔗 Links e navegação
- ❌ Erros encontrados

## ⚙️ Configurações Avançadas

### Timing e Performance
```javascript
{
    delay: 2000,        // Delay entre ações
    timeout: 30000,     // Timeout de navegação
    viewport: {         // Resolução do browser
        width: 1920,
        height: 1080
    }
}
```

### Browser Options
```javascript
{
    browser: {
        headless: false,  // true para execução sem interface
        args: [
            '--no-sandbox',
            '--disable-gpu'
        ]
    }
}
```

### Screenshot Options
```javascript
{
    screenshot: {
        fullPage: true,   // Screenshot da página completa
        quality: 90,      // Qualidade da imagem
        format: 'png'     // Formato do arquivo
    }
}
```

## 🔧 Personalização

### Mapear Páginas Específicas
```javascript
{
    specificPages: [
        '/dashboard',
        '/appointments',
        '/analytics',
        '/settings'
    ]
}
```

### Seletores Personalizados
```javascript
{
    selectors: {
        username: '#email-field',
        password: '#password-field',
        loginButton: '.btn-login'
    }
}
```

### Filtros de Links
```javascript
// No código, você pode adicionar filtros:
const links = await this.extractLinks();
const filteredLinks = links.filter(link => 
    !link.href.includes('/admin') && 
    !link.href.includes('/api')
);
```

## 🐛 Troubleshooting

### Erro de Login
- Verifique se as credenciais estão corretas
- Ajuste os seletores CSS no arquivo de configuração
- Verifique se o app está rodando na URL configurada

### Timeout de Navegação
- Aumente o valor de `timeout` na configuração
- Verifique a conectividade com o app
- Ajuste o `delay` entre ações

### Screenshots Não Gerados
- Verifique permissões de escrita no diretório
- Ajuste configurações de viewport
- Verifique se o browser está funcionando

### Páginas Não Descobertas
- Verifique se os links estão sendo renderizados corretamente
- Ajuste os filtros de links no código
- Use `specificPages` para mapear páginas específicas

## 📈 Exemplos de Uso

### Mapeamento Rápido
```bash
# Configuração mínima para teste rápido
node -e "
const AppMapper = require('./scripts/app-mapping-puppeteer');
const mapper = new AppMapper({
    baseUrl: 'http://localhost:3000',
    username: 'test@exemplo.com',
    password: '123456',
    delay: 1000
});
mapper.run();
"
```

### Mapeamento com Filtros
```javascript
// Mapear apenas páginas específicas
const config = {
    ...require('./scripts/app-mapping-config'),
    specificPages: ['/dashboard', '/users'],
    delay: 3000
};
```

### Mapeamento Headless (Produção)
```javascript
const config = {
    ...require('./scripts/app-mapping-config'),
    browser: { headless: true },
    delay: 1000
};
```

## 🔒 Segurança

- ⚠️ **Nunca commite credenciais** no repositório
- 🔐 Use variáveis de ambiente para credenciais
- 📁 Mantenha relatórios em diretórios seguros
- 🗑️ Limpe screenshots sensíveis após análise

## 📝 Logs e Debug

O script gera logs detalhados:
```
🚀 Iniciando mapeamento do app...
✅ Browser iniciado com sucesso
🔐 Fazendo login...
✅ Login realizado com sucesso
🔍 Descobrindo páginas do app...
🔍 15 páginas descobertas
📄 Mapeando página: page_1_home (/)
📸 Screenshot salvo: ./app-mapping-screenshots/page_1_home.png
✅ Página mapeada: page_1_home
📈 Progresso: 1/15
...
🎉 Mapeamento concluído com sucesso!
```

## 🤝 Contribuição

Para melhorar o script:
1. Teste com diferentes tipos de apps
2. Adicione novos tipos de elementos para extrair
3. Melhore o sistema de relatórios
4. Adicione suporte a diferentes frameworks

## 📄 Licença

Este script é parte do projeto WhatsAppSalon-N8N e segue as mesmas diretrizes de uso. 