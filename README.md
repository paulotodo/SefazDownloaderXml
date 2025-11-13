# 🚀 SEFAZ XML Sync

Sistema completo de download automático de XMLs (nfeProc) da SEFAZ com autenticação multi-usuário.

## ✨ Características

- 🔐 **Autenticação Multi-Usuário** com Supabase Auth (JWT)
- 🔄 **Sincronização Automática** a cada 1 hora via cron
- 📁 **Organização Inteligente** de XMLs por CNPJ/Ano/Mês
- 🏢 **Multi-Empresa** - cada usuário gerencia suas próprias empresas
- 🔒 **Row-Level Security (RLS)** para isolamento completo de dados
- 📜 **Upload de Certificados Digitais** (.pfx) via interface web
- 🎨 **Interface Moderna** com Shadcn UI + Tailwind CSS
- 🐳 **Deploy Docker** pronto para produção (standalone ou Portainer)
- 🔐 **SSL/HTTPS Automático** via Let's Encrypt

## 🛠️ Stack Tecnológica

### Frontend
- React 18 + TypeScript
- Tailwind CSS + Shadcn UI
- React Query (TanStack Query)
- Wouter (roteamento)
- Vite

### Backend
- Node.js + Express + TypeScript
- Supabase (PostgreSQL + Auth)
- node-cron (agendamento)
- fast-xml-parser (processamento XML)
- multer (upload de arquivos)

### Deploy
- Docker + Docker Compose
- Nginx + Certbot (standalone)
- Traefik + Portainer (alternativo)

## 📦 Instalação

### Desenvolvimento Local

```bash
# Instalar dependências
npm install

# Configurar variáveis de ambiente
cp .env.example .env
# Editar .env com suas credenciais Supabase

# Executar schema SQL no Supabase
# Ver arquivo: supabase-schema.sql

# Iniciar servidor de desenvolvimento
npm run dev
```

Acesse: `http://localhost:5000`

### Deploy em Produção

**Duas opções disponíveis:**

#### Opção 1: Docker Standalone (Nginx + Certbot)
```bash
# Ver guia completo
cat DEPLOYMENT.md
```

#### Opção 2: Portainer + Traefik (Recomendado)
```bash
# Ver guia completo
cat DEPLOYMENT-PORTAINER.md

# Quick start
cat QUICK-START-PORTAINER.md
```

## 📖 Documentação

- 📘 [`DEPLOYMENT.md`](DEPLOYMENT.md) - Deploy Docker standalone completo
- 🐳 [`DEPLOYMENT-PORTAINER.md`](DEPLOYMENT-PORTAINER.md) - Deploy Portainer + Traefik
- ⚡ [`QUICK-START-PORTAINER.md`](QUICK-START-PORTAINER.md) - Referência rápida Portainer
- 📦 [`GIT-SETUP.md`](GIT-SETUP.md) - Como subir código para GitHub
- 🗄️ [`supabase-schema.sql`](supabase-schema.sql) - Schema do banco de dados

## 🔐 Configuração Supabase

### 1. Criar Projeto Supabase

1. Acesse: https://supabase.com
2. Criar novo projeto
3. Copiar credenciais:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`

### 2. Executar Schema SQL

1. No Supabase Dashboard: **SQL Editor**
2. Copiar e executar: `supabase-schema.sql`
3. Verificar criação de tabelas e RLS policies

### 3. Configurar Autenticação

**Opção A: Sem Confirmação de Email (Recomendado para apps internos)**
- Supabase → Authentication → Providers → Email
- Desabilitar: "Confirm email"

**Opção B: Com Confirmação de Email**
- Supabase → Authentication → URL Configuration
- Site URL: `https://seu-dominio.com`
- Redirect URLs: `https://seu-dominio.com/auth/confirm`

## 🔑 Variáveis de Ambiente

```env
# Supabase
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...

# Session
SESSION_SECRET=gere-com-openssl-rand-base64-32

# Ambiente
NODE_ENV=production
PORT=5000

# Storage
XML_DEST_PATH=/app/xmls

# Desenvolvimento
ALLOW_SEFAZ_SIMULATION=false  # true em dev, false em prod
```

## 🚀 Funcionalidades

### Dashboard
- Estatísticas em tempo real
- Total de empresas cadastradas
- XMLs baixados hoje
- Última sincronização
- Feed de atividades recentes

### Gestão de Empresas
- Cadastro de múltiplas empresas (CNPJ)
- Upload de certificados digitais (.pfx)
- Configuração por ambiente (produção/homologação)
- Sincronização manual ou automática
- Status e controle de NSU

### Navegador de XMLs
- Estrutura em árvore: CNPJ → Ano → Mês
- Visualização e download de XMLs
- Busca e filtros
- Detalhes de NF-e

### Logs do Sistema
- Filtragem por nível (info/warning/error)
- Histórico de sincronizações
- Detalhes de erros e warnings

### Sincronização SEFAZ
- Automática a cada 1 hora (configurável)
- Download via NFeDistribuicaoDFe (SOAP)
- Processamento de docZips
- Extração de nfeProc
- Atualização automática de NSU
- Retry em caso de falhas

## 🔒 Segurança

- ✅ Autenticação JWT server-side
- ✅ Row-Level Security (RLS) no Supabase
- ✅ Isolamento multi-tenant por userId
- ✅ Certificados .pfx com permissões restritas
- ✅ HTTPS obrigatório em produção
- ✅ Validação Zod em todas as entradas
- ✅ Health checks configurados

## 📂 Estrutura do Projeto

```
sefaz-xml-sync/
├── client/               # Frontend React
│   ├── src/
│   │   ├── components/  # Componentes UI
│   │   ├── contexts/    # Context API (Auth)
│   │   ├── hooks/       # Custom hooks
│   │   ├── lib/         # Utilities
│   │   └── pages/       # Páginas/rotas
│   └── index.html
├── server/              # Backend Express
│   ├── auth-middleware.ts
│   ├── auth-routes.ts
│   ├── routes.ts
│   ├── sefaz-service.ts
│   ├── supabase-storage.ts
│   └── index.ts
├── shared/              # Código compartilhado
│   └── schema.ts        # Schemas Zod/Drizzle
├── docker-compose.yml   # Docker standalone
├── docker-compose.portainer.yml  # Portainer + Traefik
├── Dockerfile
└── nginx/               # Configuração Nginx
```

## 🧪 Modo Simulação (Desenvolvimento)

Para testar sem certificados reais:

```env
ALLOW_SEFAZ_SIMULATION=true
```

Retorna XMLs simulados para desenvolvimento.

**⚠️ NUNCA use em produção!**

## 📊 Banco de Dados

### Tabelas Principais

- **profiles** - Dados dos usuários
- **empresas** - CNPJs e certificados
- **sincronizacoes** - Histórico de sincronizações
- **xmls** - Metadados dos XMLs baixados
- **logs** - Logs do sistema

### RLS Policies

Todas as tabelas têm policies que filtram por `userId`, garantindo isolamento completo entre usuários.

## 🔄 Atualização

### Via Git (Portainer)

1. Commit e push alterações
2. Portainer → Stacks → Pull and redeploy

### Via Linha de Comando

```bash
git pull
docker compose down
docker compose build
docker compose up -d
```

## 💾 Backup

```bash
# Backup de XMLs e certificados
./deploy-scripts/deploy.sh backup

# OU manualmente
tar -czf xmls-backup.tar.gz ./xmls
tar -czf certificados-backup.tar.gz ./certificados
```

## 📝 License

Proprietary - Todos os direitos reservados

## 🤝 Contribuindo

Este é um projeto privado. Para contribuir, entre em contato com o administrador.

## 📧 Suporte

Para dúvidas ou problemas:
1. Verificar documentação (arquivos `*.md`)
2. Verificar logs: `docker logs sefaz-xml-sync`
3. Consultar troubleshooting nos guias de deployment

## 🎯 Roadmap

- [ ] Notificações por email
- [ ] Exportação de relatórios (PDF/Excel)
- [ ] Dashboard com gráficos
- [ ] Filtros avançados por período
- [ ] Backup automático para S3/Google Drive
- [ ] 2FA (Two-Factor Authentication)
- [ ] API pública (webhooks)
- [ ] Integração com contabilidade

---

**Desenvolvido com ❤️ para simplificar a gestão de XMLs fiscais**
