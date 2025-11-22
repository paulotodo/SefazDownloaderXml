# 🚀 Guia de Deploy em Produção - SEFAZ XML Sync
## Docker Standalone + Traefik + Portainer

> **Sistema de Download Automático de XMLs da SEFAZ (NF-e/NFC-e)**  
> **URL Produção:** https://downloadsefaz.dibs.com.br  
> **Infraestrutura:** Docker Standalone + Traefik + Portainer

---

## 📋 Índice

1. [Pré-requisitos](#-pré-requisitos)
2. [Preparação do Servidor](#-preparação-do-servidor)
3. [Configuração do Traefik](#-configuração-do-traefik)
4. [Deploy da Aplicação](#-deploy-da-aplicação)
5. [Verificação e Testes](#-verificação-e-testes)
6. [Manutenção](#-manutenção)
7. [Troubleshooting](#-troubleshooting)

---

## 🎯 Pré-requisitos

### ✅ Servidor Linux

- **Sistema Operacional:** Ubuntu 22.04 LTS ou superior (recomendado)
- **CPU:** 2 vCPUs mínimo (4 vCPUs recomendado)
- **RAM:** 4 GB mínimo (8 GB recomendado)
- **Disco:** 50 GB SSD mínimo
- **Portas Abertas:** 80 (HTTP), 443 (HTTPS)

### ✅ Software Instalado

```bash
# Docker Engine (última versão)
docker --version  # Deve retornar >= 24.0

# Docker Compose (última versão)
docker compose version  # Deve retornar >= 2.20

# Traefik (rodando em container)
docker ps | grep traefik  # Deve mostrar container ativo

# Portainer (opcional, mas você já usa)
docker ps | grep portainer  # Deve mostrar container ativo
```

### ✅ DNS Configurado

- **Domínio:** `downloadsefaz.dibs.com.br`
- **Tipo:** A Record
- **Valor:** IP público do seu servidor
- **TTL:** 300 (5 minutos)

**Verificar DNS:**
```bash
nslookup downloadsefaz.dibs.com.br
# Deve retornar o IP do seu servidor
```

### ✅ Supabase Produção Configurado

- Projeto Supabase criado
- Banco de dados provisionado
- Schemas e tabelas criadas (via SQL Editor)
- Row-Level Security (RLS) configurado
- Credenciais de acesso (URL, ANON_KEY, SERVICE_ROLE_KEY)

---

## 🔧 Preparação do Servidor

### Passo 1: Conectar ao Servidor

```bash
# SSH para o servidor
ssh usuario@seu-servidor.com

# Ou se usa chave privada
ssh -i ~/.ssh/sua-chave.pem usuario@seu-servidor.com
```

### Passo 2: Criar Estrutura de Diretórios

```bash
# Navegar para diretório de aplicações
cd /home/usuario

# Criar diretório do projeto
mkdir -p sefaz-xml-sync
cd sefaz-xml-sync

# Criar subdiretórios para volumes Docker
mkdir -p volumes/{xmls,certificados}
chmod 755 volumes/{xmls,certificados}
```

### Passo 3: Transferir Arquivos do Projeto

**Opção A: Via Git (Recomendado)**
```bash
# Clone o repositório (se estiver no Git)
git clone https://seu-repo/sefaz-xml-sync.git .
```

**Opção B: Via SCP (Transfer Manual)**
```bash
# No seu computador local (não no servidor)
# Transferir arquivos para servidor
scp -r ./sefaz-xml-sync/* usuario@seu-servidor:/home/usuario/sefaz-xml-sync/
```

**Opção C: Via Portainer (Upload Manual)**
1. Acesse Portainer Web UI
2. Vá em "Stacks" → "Add Stack"
3. Faça upload do `docker-compose.production.yml`
4. Configure environment variables inline

---

## 🌐 Configuração do Traefik

### Verificar Traefik Existente

```bash
# Verificar se Traefik está rodando
docker ps | grep traefik

# Verificar rede do Traefik
docker network ls | grep traefik-proxy
```

### Se Traefik Ainda NÃO Estiver Configurado

**Criar rede Docker para Traefik:**
```bash
docker network create traefik-proxy
```

**Criar `docker-compose.traefik.yml`:**

```yaml
version: '3.8'

networks:
  traefik-proxy:
    name: traefik-proxy

services:
  traefik:
    image: traefik:v3.0
    container_name: traefik
    restart: unless-stopped
    
    command:
      # API & Dashboard
      - --api.dashboard=true
      - --api.insecure=false
      
      # Docker Provider
      - --providers.docker=true
      - --providers.docker.exposedbydefault=false
      - --providers.docker.network=traefik-proxy
      
      # Entry Points
      - --entrypoints.web.address=:80
      - --entrypoints.websecure.address=:443
      
      # HTTP → HTTPS Redirect Automático
      - --entrypoints.web.http.redirections.entryPoint.to=websecure
      - --entrypoints.web.http.redirections.entryPoint.scheme=https
      
      # Let's Encrypt (PRODUÇÃO) - AJUSTE SEU EMAIL!
      - [email protected]
      - --certificatesresolvers.leresolver.acme.storage=/letsencrypt/acme.json
      - --certificatesresolvers.leresolver.acme.httpchallenge.entrypoint=web
    
    ports:
      - "80:80"
      - "443:443"
    
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./letsencrypt:/letsencrypt
    
    networks:
      - traefik-proxy
```

**Deploy Traefik:**
```bash
# Criar diretório para certificados Let's Encrypt
mkdir -p letsencrypt
touch letsencrypt/acme.json
chmod 600 letsencrypt/acme.json

# IMPORTANTE: acme.json DEVE ter permissão 600!

# Subir Traefik
docker compose -f docker-compose.traefik.yml up -d

# Verificar logs
docker logs traefik -f
```

---

## 🚢 Deploy da Aplicação

### Passo 1: Configurar Variáveis de Ambiente

```bash
# Navegar para diretório do projeto
cd /home/usuario/sefaz-xml-sync

# Copiar arquivo de exemplo
cp .env.production.example .env.production

# Editar variáveis (use nano, vim ou vi)
nano .env.production
```

**Preencher `.env.production`:**
```bash
# ===== OBRIGATÓRIAS =====
NODE_ENV=production
PORT=5000

# SUPABASE (pegue no Dashboard do Supabase: Settings → API)
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ey...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ey...

# SESSION SECRET (GERE UM NOVO - veja comando abaixo)
SESSION_SECRET=COLE_AQUI_O_RESULTADO_DO_OPENSSL

# ===== OPCIONAIS =====
TZ=America/Sao_Paulo
LOG_LEVEL=info
```

**Gerar SESSION_SECRET seguro:**
```bash
openssl rand -base64 32
# Copie o resultado e cole em SESSION_SECRET no .env.production
```

**Proteger arquivo (IMPORTANTE!):**
```bash
chmod 600 .env.production

# Verificar
ls -la .env.production
# Deve mostrar: -rw------- (apenas owner pode ler/escrever)
```

### Passo 2: Build da Imagem Docker

```bash
# Build da imagem de produção
docker build -f Dockerfile.production -t sefaz-xml-sync:1.0.0 .

# Isso pode levar 3-5 minutos na primeira vez
# Verificar imagem criada
docker images | grep sefaz-xml-sync
```

### Passo 3: Deploy com Docker Compose

```bash
# Subir aplicação em background (-d = detached)
docker compose -f docker-compose.production.yml up -d

# Verificar containers rodando
docker ps | grep sefaz

# Ver logs em tempo real
docker logs sefaz-xml-sync -f

# Pressione Ctrl+C para sair dos logs (container continua rodando)
```

### Passo 4: Verificar Status Inicial

```bash
# Ver saúde do container (aguarde ~30 segundos após start)
docker inspect sefaz-xml-sync | grep -A 5 Health

# Testar API local (dentro do servidor)
curl http://localhost:5000/api/health
# Deve retornar: {"status":"ok"}

# Testar via domínio HTTP (Traefik vai redirecionar para HTTPS)
curl -L http://downloadsefaz.dibs.com.br/api/health
# -L = follow redirects
```

---

## ✅ Verificação e Testes

### 1. Verificar Certificado SSL (Let's Encrypt)

```bash
# Aguardar ~60-90 segundos para Let's Encrypt provisionar certificado
echo "Aguardando provisionamento do certificado SSL..."
sleep 90

# Testar HTTPS
curl -I https://downloadsefaz.dibs.com.br/api/health

# Deve retornar:
# HTTP/2 200
# server: nginx (Traefik retorna "nginx" internamente)
```

**Verificar Certificado no Navegador:**
1. Abrir https://downloadsefaz.dibs.com.br
2. Clicar no cadeado 🔒 na barra de endereço
3. Verificar:
   - ✅ **Emitido por:** Let's Encrypt Authority X3
   - ✅ **Válido para:** downloadsefaz.dibs.com.br
   - ✅ **Expira em:** ~90 dias (renovação automática)

### 2. Testar Funcionalidades da Aplicação

**Testes via cURL:**
```bash
# Health check da API
curl https://downloadsefaz.dibs.com.br/api/health

# Login (exemplo - ajuste conforme sua API)
curl -X POST https://downloadsefaz.dibs.com.br/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"[email protected]","password":"senha123"}'
```

**Testar no Navegador:**
1. Abrir https://downloadsefaz.dibs.com.br
2. Criar uma conta / Fazer login
3. Cadastrar empresa com certificado A1 (.pfx)
4. Testar sincronização manual
5. Verificar se XMLs são baixados em `volumes/xmls/`

### 3. Verificar Logs da Aplicação

```bash
# Logs da aplicação (últimas 100 linhas)
docker logs sefaz-xml-sync --tail 100

# Logs em tempo real (Ctrl+C para sair)
docker logs sefaz-xml-sync -f

# Logs do Traefik (para debug de certificados)
docker logs traefik --tail 100 | grep -i "certificate\|acme"

# Ver logs no Supabase Dashboard
# Acesse: https://supabase.com/dashboard → Seu Projeto → Logs
```

### 4. Monitoramento via Portainer

**Via Portainer Web UI:**
1. Acessar `https://seu-portainer.dominio.com` (ou IP:9000)
2. Ir em "Containers"
3. Clicar em `sefaz-xml-sync`
4. Ver métricas: CPU, RAM, I/O, Network, Logs

**Via Docker Stats (CLI):**
```bash
docker stats sefaz-xml-sync

# Exemplo de saída:
# CONTAINER ID   NAME               CPU %     MEM USAGE / LIMIT     
# abc123def456   sefaz-xml-sync     2.5%      512MiB / 2GiB
```

---

## 🔄 Manutenção

### Atualizar Aplicação (Deploy Nova Versão)

```bash
# 1. Navegar para diretório
cd /home/usuario/sefaz-xml-sync

# 2. Pull das mudanças (se usar Git)
git pull origin main

# 3. Rebuild da imagem com nova tag
docker build -f Dockerfile.production -t sefaz-xml-sync:1.0.1 .

# 4. Atualizar docker-compose.yml com nova versão
nano docker-compose.production.yml
# Trocar: image: sefaz-xml-sync:1.0.0
# Para:   image: sefaz-xml-sync:1.0.1

# 5. Recrear container (zero downtime com Traefik)
docker compose -f docker-compose.production.yml up -d --force-recreate

# 6. Verificar logs
docker logs sefaz-xml-sync -f

# 7. Limpar imagens antigas
docker image prune -a
```

### Backup de Dados

**Backup de XMLs e Certificados:**
```bash
# Criar diretório de backups
mkdir -p /backup/sefaz

# Backup de XMLs (compactado)
tar -czf /backup/sefaz/xmls-backup-$(date +%Y%m%d-%H%M%S).tar.gz \
  volumes/xmls/

# Backup de certificados (compactado)
tar -czf /backup/sefaz/certificados-backup-$(date +%Y%m%d-%H%M%S).tar.gz \
  volumes/certificados/

# Copiar para local seguro (exemplo: outro servidor)
scp /backup/sefaz/*.tar.gz usuario@backup-server:/backups/sefaz/

# Limpar backups antigos (manter últimos 7 dias)
find /backup/sefaz -name "*.tar.gz" -mtime +7 -delete
```

**Backup do Banco de Dados (Supabase):**
1. Acessar Supabase Dashboard: https://supabase.com/dashboard
2. Ir em seu projeto → "Database" → "Backups"
3. Clicar em "Create backup" (backup manual)
4. Configurar backup automático diário (recomendado)

**Criar Script de Backup Automático:**
```bash
# Criar script
nano /usr/local/bin/backup-sefaz.sh
```

```bash
#!/bin/bash
# Script de Backup Automático - SEFAZ XML Sync

BACKUP_DIR="/backup/sefaz"
PROJECT_DIR="/home/usuario/sefaz-xml-sync"
DATE=$(date +%Y%m%d-%H%M%S)

mkdir -p $BACKUP_DIR

# Backup XMLs
tar -czf $BACKUP_DIR/xmls-$DATE.tar.gz $PROJECT_DIR/volumes/xmls/

# Backup Certificados
tar -czf $BACKUP_DIR/certificados-$DATE.tar.gz $PROJECT_DIR/volumes/certificados/

# Manter apenas últimos 7 dias
find $BACKUP_DIR -type f -name "*.tar.gz" -mtime +7 -delete

echo "Backup realizado: $DATE" >> /var/log/backup-sefaz.log
```

```bash
# Tornar executável
chmod +x /usr/local/bin/backup-sefaz.sh

# Agendar no crontab (diário às 3h da manhã)
crontab -e

# Adicionar linha:
0 3 * * * /usr/local/bin/backup-sefaz.sh
```

### Renovação de Certificado SSL

**Traefik renova automaticamente!** ✅  
Let's Encrypt renova ~30 dias antes de expirar.

**Verificar renovação automática:**
```bash
# Ver logs de renovação do Traefik
docker logs traefik | grep -i "renew\|certificate"

# Verificar acme.json (contém certificados)
ls -lh letsencrypt/acme.json
# Tamanho deve ser > 1KB (se 0 bytes, certificado não foi provisionado)
```

**Forçar renovação manual (se necessário):**
```bash
# Parar Traefik
docker stop traefik

# Deletar certificado antigo
rm letsencrypt/acme.json
touch letsencrypt/acme.json
chmod 600 letsencrypt/acme.json

# Reiniciar Traefik (vai reprovisionar certificado)
docker start traefik

# Aguardar ~90 segundos e verificar
sleep 90
curl -I https://downloadsefaz.dibs.com.br
```

### Monitorar Uso de Disco

```bash
# Verificar uso de disco geral
df -h

# Tamanho dos XMLs
du -sh /home/usuario/sefaz-xml-sync/volumes/xmls/

# Tamanho dos certificados
du -sh /home/usuario/sefaz-xml-sync/volumes/certificados/

# Tamanho total do projeto
du -sh /home/usuario/sefaz-xml-sync/

# Limpar imagens Docker antigas (libera espaço)
docker system prune -a
# Confirme com 'y' quando perguntado
```

---

## 🐛 Troubleshooting

### Problema 1: Container não inicia

```bash
# Ver logs detalhados (últimas 200 linhas)
docker logs sefaz-xml-sync --tail 200

# Verificar variáveis de ambiente
docker exec sefaz-xml-sync env | grep -E "SUPABASE|SESSION|NODE_ENV"

# Verificar saúde do container
docker inspect sefaz-xml-sync | grep -A 10 Health

# Testar build local (sem docker-compose)
docker run -it --rm \
  --env-file .env.production \
  -p 5000:5000 \
  sefaz-xml-sync:1.0.0
```

**Erros Comuns:**
- ❌ `SUPABASE_URL is not defined` → Falta variável em `.env.production`
- ❌ `Cannot connect to Supabase` → URL/chaves incorretas
- ❌ `Port 5000 already in use` → Outro container usando mesma porta

### Problema 2: Certificado SSL não provisiona

```bash
# Verificar DNS (DEVE apontar para servidor)
nslookup downloadsefaz.dibs.com.br
# Resultado DEVE ser o IP do seu servidor

# Verificar portas abertas (80 e 443)
sudo netstat -tulpn | grep -E ':80|:443'

# Ver logs do Traefik (foco em ACME/Let's Encrypt)
docker logs traefik | grep -i "acme\|certificate\|letsencrypt"

# Verificar acme.json
ls -lh letsencrypt/acme.json
cat letsencrypt/acme.json | jq .  # Formata JSON (se jq instalado)

# Testar acesso HTTP na porta 80 (necessário para challenge)
curl -I http://downloadsefaz.dibs.com.br/.well-known/acme-challenge/test
```

**Erros Comuns:**
- ❌ DNS não aponta para servidor → Aguarde propagação DNS (até 48h)
- ❌ Firewall bloqueia porta 80/443 → Abrir portas no firewall
- ❌ `acme.json` com permissão errada → Deve ser 600 (`chmod 600`)

**Forçar renovação:**
```bash
# Parar Traefik
docker stop traefik

# Limpar certificados
rm letsencrypt/acme.json
touch letsencrypt/acme.json
chmod 600 letsencrypt/acme.json

# Reiniciar Traefik
docker start traefik

# Aguardar ~90s e testar
sleep 90
curl -I https://downloadsefaz.dibs.com.br
```

### Problema 3: Erro de conexão com Supabase

```bash
# Testar conexão de dentro do container
docker exec sefaz-xml-sync wget -O- https://seu-projeto.supabase.co/rest/v1/

# Verificar variáveis (DEVEM estar preenchidas)
docker exec sefaz-xml-sync printenv | grep SUPABASE

# Verificar firewall/security groups
# Servidor DEVE conseguir acessar *.supabase.co
ping seu-projeto.supabase.co
```

**Soluções:**
- ✅ Verificar se URL/chaves estão corretas no Supabase Dashboard
- ✅ Verificar se projeto Supabase não está pausado (plano grátis pausa após inatividade)
- ✅ Verificar se firewall permite conexões HTTPS saindo (outbound)

### Problema 4: XMLs não são baixados/salvos

```bash
# Ver logs de sincronização
docker logs sefaz-xml-sync | grep -i "sync\|download\|xml\|sefaz"

# Verificar volumes montados
docker inspect sefaz-xml-sync | grep -A 10 Mounts

# Verificar permissões do volume
ls -la volumes/xmls/

# Acessar container e verificar diretório
docker exec -it sefaz-xml-sync sh
ls -la /app/xmls/
exit
```

**Soluções:**
- ✅ Certificado A1 (.pfx) válido e não expirado
- ✅ Senha do certificado correta
- ✅ CNPJ cadastrado está correto
- ✅ Permissões do volume: `chmod 755 volumes/xmls/`

### Problema 5: Alto uso de CPU/RAM

```bash
# Ver estatísticas em tempo real
docker stats sefaz-xml-sync

# Verificar processos dentro do container
docker exec sefaz-xml-sync ps aux

# Ver logs para identificar causa
docker logs sefaz-xml-sync --tail 500 | grep -i "error\|timeout\|loop"
```

**Ajustar Limites (se necessário):**

Editar `docker-compose.production.yml`:
```yaml
services:
  sefaz-xml-sync:
    # ... outras configs ...
    deploy:
      resources:
        limits:
          cpus: '1.0'      # Limite de 1 CPU
          memory: 1G       # Limite de 1GB RAM
        reservations:
          cpus: '0.5'      # Reserva mínima
          memory: 512M     # Reserva mínima
```

Aplicar mudanças:
```bash
docker compose -f docker-compose.production.yml up -d --force-recreate
```

### Problema 6: Traefik não roteia para aplicação

```bash
# Verificar se container está na rede traefik-proxy
docker inspect sefaz-xml-sync | grep -A 5 Networks

# Verificar labels do Traefik
docker inspect sefaz-xml-sync | grep -A 20 Labels

# Ver routers ativos no Traefik
docker exec traefik wget -qO- http://localhost:8080/api/http/routers | jq .
```

**Soluções:**
- ✅ Container DEVE estar em `networks: - traefik-proxy`
- ✅ Labels DEVEM ter `traefik.enable=true`
- ✅ Certificado resolver DEVE ser `leresolver` (mesmo nome usado no Traefik)

---

## 📊 Checklist Final de Deploy

Antes de considerar deploy completo, verifique:

### Infraestrutura
- [ ] ✅ DNS `downloadsefaz.dibs.com.br` aponta para IP do servidor
- [ ] ✅ Portas 80 e 443 abertas no firewall
- [ ] ✅ Docker e Docker Compose instalados e atualizados
- [ ] ✅ Traefik rodando: `docker ps | grep traefik`
- [ ] ✅ Rede `traefik-proxy` criada: `docker network ls`

### Certificados SSL
- [ ] ✅ `letsencrypt/acme.json` com permissão 600
- [ ] ✅ Certificado SSL provisionado (aguardar ~90s após primeiro deploy)
- [ ] ✅ HTTPS funciona: `curl -I https://downloadsefaz.dibs.com.br`
- [ ] ✅ Cadeado verde 🔒 no navegador

### Aplicação
- [ ] ✅ `.env.production` configurado com valores reais
- [ ] ✅ `SESSION_SECRET` gerado com `openssl rand -base64 32`
- [ ] ✅ Imagem Docker construída: `sefaz-xml-sync:1.0.0`
- [ ] ✅ Container rodando: `docker ps | grep sefaz`
- [ ] ✅ Health check OK: `curl https://downloadsefaz.dibs.com.br/api/health`
- [ ] ✅ Logs sem erros críticos: `docker logs sefaz-xml-sync`

### Funcionalidades
- [ ] ✅ Login funciona no navegador
- [ ] ✅ Cadastro de empresa funciona
- [ ] ✅ Upload de certificado A1 (.pfx) funciona
- [ ] ✅ Sincronização manual funciona
- [ ] ✅ XMLs são baixados e salvos em `volumes/xmls/`
- [ ] ✅ Logs aparecem no Supabase Dashboard

### Backup e Monitoramento
- [ ] ✅ Script de backup criado: `/usr/local/bin/backup-sefaz.sh`
- [ ] ✅ Crontab configurado para backup diário
- [ ] ✅ Backup manual testado e verificado
- [ ] ✅ Monitoramento via Portainer configurado

---

## 🎉 Deploy Completo!

Sua aplicação está rodando em produção com:

✅ **URL:** https://downloadsefaz.dibs.com.br  
✅ **HTTPS:** Certificado SSL automático (Let's Encrypt)  
✅ **Renovação:** Automática (Traefik cuida disso)  
✅ **Backup:** Diário via cron  
✅ **Monitoramento:** Portainer + Docker Stats  
✅ **Segurança:** RLS no Supabase, env vars protegidas  

**Próximos Passos Recomendados:**
1. ✅ Configurar monitoramento externo (Uptime Robot, Pingdom)
2. ✅ Configurar alertas de erro via email/Slack
3. ✅ Documentar procedimento de rollback
4. ✅ Treinar usuários na plataforma
5. ✅ Configurar backup remoto (AWS S3, Backblaze, etc.)

---

## 📞 Comandos Úteis - Referência Rápida

```bash
# Ver status geral
docker ps -a
docker stats

# Logs em tempo real
docker logs sefaz-xml-sync -f
docker logs traefik -f

# Reiniciar container
docker compose -f docker-compose.production.yml restart

# Rebuild completo
docker compose -f docker-compose.production.yml down
docker build -f Dockerfile.production -t sefaz-xml-sync:1.0.0 .
docker compose -f docker-compose.production.yml up -d

# Backup manual
tar -czf backup-$(date +%Y%m%d).tar.gz volumes/

# Limpar sistema Docker
docker system prune -a
```

---

**Última Atualização:** Novembro 2025  
**Versão:** 1.0.0  
**Infraestrutura:** Docker + Traefik + Portainer
