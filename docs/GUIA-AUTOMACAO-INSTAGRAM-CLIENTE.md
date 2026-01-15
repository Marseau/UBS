# Guia de Automacao de Publicacoes no Instagram

## Visao Geral

Este guia explica como funciona a automacao de publicacoes no Instagram para sua conta. Com este servico, voce podera:

- **Publicar automaticamente ate 8 posts por dia**
- **Agendar posts com antecedencia**
- **Upload de imagens/videos em um bucket dedicado**
- **Legendas e hashtags personalizadas**

---

## 1. Requisitos Obrigatorios

### 1.1 Conta Instagram Business ou Creator

Para automatizar publicacoes, sua conta Instagram **DEVE** ser do tipo **Business** ou **Creator** (nao pode ser conta pessoal).

**Como converter para Business:**

1. Abra o Instagram no celular
2. Va em **Configuracoes** > **Conta**
3. Toque em **Mudar para conta profissional**
4. Escolha **Business** (Empresa)
5. Conecte a uma **Pagina do Facebook** (obrigatorio)
6. Complete as informacoes do perfil comercial

> **IMPORTANTE:** A conta Instagram Business DEVE estar vinculada a uma Pagina do Facebook. Isso e um requisito da Meta para usar a API.

### 1.2 Pagina do Facebook

Se voce ainda nao tem uma Pagina do Facebook:

1. Acesse [facebook.com/pages/create](https://facebook.com/pages/create)
2. Crie uma pagina para seu negocio
3. Vincule essa pagina ao seu Instagram Business

---

## 2. Autorizacao do Aplicativo

Para que possamos publicar em seu nome, voce precisa autorizar nosso aplicativo.

### 2.1 O que e isso?

- Usamos a **API oficial do Instagram/Facebook** (Graph API)
- Voce autoriza nosso app a publicar posts na sua conta
- Voce pode revogar a autorizacao a qualquer momento
- **NAO temos acesso** a sua senha ou mensagens privadas

### 2.2 Processo de Autorizacao

1. Enviaremos um **link de autorizacao** para voce
2. Voce fara login com sua conta do Facebook
3. Selecionara a Pagina e conta Instagram a autorizar
4. Concedera as permissoes necessarias:
   - `instagram_basic` - Informacoes basicas
   - `instagram_content_publish` - Publicar conteudo
   - `pages_read_engagement` - Ler engajamento

### 2.3 Permissoes Solicitadas

| Permissao | Para que serve |
|-----------|----------------|
| `instagram_content_publish` | Publicar fotos, videos e reels |
| `instagram_basic` | Acessar informacoes do perfil |
| `pages_read_engagement` | Verificar status das publicacoes |

> **Nota:** Nao solicitamos acesso a DMs, comentarios ou outras funcoes.

---

## 3. Como Enviar seus Posts

### 3.1 Bucket de Upload

Voce tera acesso a um **bucket dedicado** para fazer upload dos seus materiais:

```
URL: https://bucket.seudominio.com.br/cliente-xyz/
Usuario: (fornecido por nos)
Senha: (fornecido por nos)
```

### 3.2 Estrutura de Pastas

Organize seus arquivos assim:

```
/cliente-xyz/
  /2026-01-15/          <- Data da publicacao (AAAA-MM-DD)
    /post-1/
      imagem.jpg        <- Imagem do post (JPG, PNG ou MP4)
      legenda.txt       <- Texto da legenda
    /post-2/
      imagem.jpg
      legenda.txt
    /post-3/
      video.mp4
      legenda.txt
    ...
```

### 3.3 Formato dos Arquivos

**Imagens:**
- Formatos: JPG, PNG
- Tamanho maximo: 8MB
- Resolucao recomendada: 1080x1080 (quadrado) ou 1080x1350 (vertical)

**Videos:**
- Formato: MP4 (H.264)
- Duracao maxima: 60 segundos (Feed) ou 90 segundos (Reels)
- Tamanho maximo: 100MB
- Resolucao: 1080x1920 (vertical) para Reels

**Legenda (legenda.txt):**
```
Sua legenda aqui.

Pode ter multiplas linhas.

#hashtag1 #hashtag2 #hashtag3
```

### 3.4 Limite de Posts

| Periodo | Limite |
|---------|--------|
| Por hora | 25 posts |
| Por dia | 50 posts |
| **Seu plano** | **8 posts/dia** |

---

## 4. Agendamento

### 4.1 Horarios de Publicacao

Os 8 posts diarios serao publicados nos seguintes horarios (Horario de Brasilia):

| Post | Horario |
|------|---------|
| 1 | 07:00 |
| 2 | 09:00 |
| 3 | 11:00 |
| 4 | 13:00 |
| 5 | 15:00 |
| 6 | 17:00 |
| 7 | 19:00 |
| 8 | 21:00 |

> **Personalizavel:** Podemos ajustar os horarios conforme sua preferencia.

### 4.2 Prazo de Envio

- Envie os posts **ate 24 horas antes** da data de publicacao
- Exemplo: Para publicar dia 20/01, envie ate 19/01 as 23:59

---

## 5. Fluxo de Trabalho

```
┌─────────────────────────────────────────────────────────────┐
│                    FLUXO DE PUBLICACAO                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. VOCE ENVIA                                              │
│     └── Upload de imagens + legendas no bucket              │
│                                                             │
│  2. AUTOMACAO PROCESSA                                      │
│     └── Sistema verifica novos arquivos a cada hora         │
│                                                             │
│  3. AGENDAMENTO                                             │
│     └── Posts sao agendados nos horarios definidos          │
│                                                             │
│  4. PUBLICACAO                                              │
│     └── Sistema publica automaticamente via API             │
│                                                             │
│  5. CONFIRMACAO                                             │
│     └── Voce recebe notificacao de sucesso/erro             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. Notificacoes

Voce recebera notificacoes sobre suas publicacoes:

### 6.1 Canais Disponiveis

- **Email** - Resumo diario das publicacoes
- **WhatsApp** - Alerta em caso de erro
- **Telegram** - Confirmacao em tempo real (opcional)

### 6.2 Tipos de Notificacao

| Evento | Notificacao |
|--------|-------------|
| Post publicado com sucesso | Telegram (opcional) |
| Erro na publicacao | WhatsApp + Email |
| Resumo diario | Email (08:00 do dia seguinte) |
| Arquivo com formato invalido | WhatsApp |

---

## 7. Perguntas Frequentes

### O que acontece se eu nao enviar os posts a tempo?

O sistema simplesmente nao publicara nada naquele horario. Nao ha penalidade.

### Posso cancelar um post agendado?

Sim, basta deletar a pasta do post no bucket antes do horario de publicacao.

### O que acontece se a publicacao falhar?

O sistema tenta novamente ate 3 vezes. Se todas falharem, voce recebe uma notificacao com o motivo do erro.

### Posso publicar Stories?

Atualmente a API do Instagram **nao permite** publicar Stories automaticamente. Apenas posts no Feed e Reels.

### Posso publicar Carrossel (multiplas imagens)?

Sim! Basta colocar multiplas imagens na mesma pasta:
```
/post-1/
  imagem-1.jpg
  imagem-2.jpg
  imagem-3.jpg
  legenda.txt
```

### Minhas credenciais estao seguras?

Sim. Usamos a API oficial da Meta com OAuth 2.0. Nunca temos acesso a sua senha. Voce pode revogar o acesso a qualquer momento nas configuracoes do Facebook.

---

## 8. Checklist de Onboarding

- [ ] Converter conta para Instagram Business
- [ ] Criar/vincular Pagina do Facebook
- [ ] Autorizar nosso aplicativo (link enviado por email)
- [ ] Receber credenciais do bucket
- [ ] Fazer upload do primeiro lote de posts
- [ ] Confirmar horarios de publicacao
- [ ] Configurar notificacoes (WhatsApp/Email)

---

## 9. Suporte

Em caso de duvidas ou problemas:

- **Email:** suporte@seudominio.com.br
- **WhatsApp:** (11) 99999-9999
- **Horario:** Seg-Sex, 09h-18h

---

## Anexo: Exemplo de Estrutura de Arquivos

```
/bucket/cliente-xyz/
│
├── 2026-01-20/
│   ├── post-1/
│   │   ├── foto-produto.jpg
│   │   └── legenda.txt
│   ├── post-2/
│   │   ├── video-bastidores.mp4
│   │   └── legenda.txt
│   ├── post-3/
│   │   ├── img1.jpg
│   │   ├── img2.jpg
│   │   ├── img3.jpg
│   │   └── legenda.txt      <- Carrossel
│   └── ...
│
├── 2026-01-21/
│   ├── post-1/
│   │   └── ...
│   └── ...
│
└── ...
```

**Exemplo de legenda.txt:**
```
Novo produto chegando!

Conheca nossa nova colecao de verao com pecas exclusivas.

Disponivel a partir de amanha!

#moda #verao2026 #novidade #colecao #fashion #style
```

---

*Documento atualizado em: Janeiro/2026*
*Versao: 1.0*
