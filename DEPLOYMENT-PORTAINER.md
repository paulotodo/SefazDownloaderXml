# 🚀 Deploy SEFAZ XML Sync - Portainer + Traefik

## Guia Completo Passo a Passo

---

## 📋 Pré-requisitos (Já Instalados)

✅ Docker instalado  
✅ Portainer rodando  
✅ Traefik configurado com Let's Encrypt  

### Verificar rede do Traefik

```bash
# Listar redes Docker
docker network ls | grep traefik

# Deve mostrar algo como:
# xxxxx   traefik-proxy   bridge    local
```

Se a rede do Traefik tem outro nome (ex: `traefik_default`), você precisará ajustar no `docker-compose.portainer.yml` na seção `networks`.

---

## 🗂️ Passo 1: Preparar Diretórios no Servidor

### 1.1. Conectar ao servidor

```bash
ssh root@SEU_IP_SERVIDOR
```

### 1.2. Criar estrutura de diretórios

```bash
# Criar diretórios para a aplicação
mkdir -p /opt/sefaz-xml-sync
cd /opt/sefaz-xml-sync

# Criar diretórios para dados persistentes
mkdir -p certificados xmls

# Definir permissões
chmod 700 certificados
chmod 755 xmls
```

---

## 📦 Passo 2: Transferir Código para o Servidor

### Opção A: Via Git (Recomendado)

```bash
cd /opt/sefaz-xml-sync

# Instalar Git (se necessário)
apt install -y git

# Clonar repositório
git clone https://github.com/SEU_USUARIO/sefaz-xml-sync.git tmp
mv tmp/* tmp/.* . 2>/dev/null || true
rm -rf tmp

# OU apenas fazer pull se já existe
git pull origin main
```

### Opção B: Via SCP (Upload manual)

**No seu computador local:**

```bash
# Compactar projeto (excluindo node_modules e build)
tar -czf sefaz-xml-sync.tar.gz \
  --exclude=node_modules \
  --exclude=client/dist \
  --exclude=.git \
  .

# Enviar para servidor
scp sefaz-xml-sync.tar.gz root@SEU_IP:/opt/sefaz-xml-sync/

# No servidor, extrair
cd /opt/sefaz-xml-sync
tar -xzf sefaz-xml-sync.tar.gz
rm sefaz-xml-sync.tar.gz
```

### Opção C: Build local e push para registry (Avançado)

```bash
# No seu computador local
docker build -t seu-usuario/sefaz-xml-sync:latest .
docker push seu-usuario/sefaz-xml-sync:latest

# No docker-compose.portainer.yml, trocar:
# build: . 
# Por:
# image: seu-usuario/sefaz-xml-sync:latest
```

---

## 🔐 Passo 3: Preparar Variáveis de Ambiente

### 3.1. Copiar arquivo de exemplo

```bash
cd /opt/sefaz-xml-sync
cp .env.portainer .env
```

### 3.2. Editar e preencher valores reais

```bash
nano .env
```

**Preencha com seus valores:**

```env
# Seu domínio
DOMAIN=sefaz.seudominio.com

# Certificado resolver do Traefik (verificar no Traefik)
CERT_RESOLVER=le

# Credenciais Supabase
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Gerar SESSION_SECRET
SESSION_SECRET=$(openssl rand -base64 32)

# Paths no host
CERTIFICADOS_PATH=/opt/sefaz-xml-sync/certificados
XMLS_PATH=/opt/sefaz-xml-sync/xmls

# Produção
ALLOW_SEFAZ_SIMULATION=false
```

**Salvar:** `Ctrl+O` → `Enter` → `Ctrl+X`

### 3.3. Gerar SESSION_SECRET

```bash
# Gerar secret aleatório
openssl rand -base64 32

# Copiar o resultado e colar no .env
```

### 3.4. Verificar nome do cert resolver do Traefik

```bash
# Inspecionar container do Traefik
docker inspect traefik | grep -i certresolver

# OU verificar docker-compose do Traefik
# Procure por: --certificatesresolvers.NOME.acme...
# O NOME é o que você deve usar (geralmente 'le' ou 'letsencrypt')
```

---

## 🌐 Passo 4: Configurar DNS

### 4.1. Adicionar registro DNS tipo A

No seu provedor de domínio (ex: Cloudflare, GoDaddy, etc):

```
Tipo: A
Nome: sefaz (ou @, se usar domínio raiz)
Valor: IP_DO_SEU_SERVIDOR
TTL: Auto ou 300
```

### 4.2. Verificar propagação DNS

```bash
# Verificar se DNS está resolvendo
dig sefaz.seudominio.com

# OU
nslookup sefaz.seudominio.com

# Deve retornar o IP do seu servidor
```

---

## 🐳 Passo 5: Deploy via Portainer

### 5.1. Acessar Portainer

Abra: `https://seu-portainer.com` (ou `http://IP:9000`)

### 5.2. Criar novo Stack

1. Menu lateral: **Stacks**
2. Botão: **+ Add stack**
3. **Name:** `sefaz-xml-sync`

### 5.3. Adicionar Docker Compose

**Opção A: Web editor (Copiar/Colar)**

1. Selecione: **Web editor**
2. Cole o conteúdo de `docker-compose.portainer.yml`:

```bash
# No servidor, copiar conteúdo
cat /opt/sefaz-xml-sync/docker-compose.portainer.yml
```

3. Copie TODO o conteúdo e cole no editor do Portainer

**Opção B: Repository (Git - Recomendado para produção)**

1. Selecione: **Repository**
2. **Repository URL:** `https://github.com/SEU_USUARIO/sefaz-xml-sync`
3. **Repository reference:** `main`
4. **Compose path:** `docker-compose.portainer.yml`
5. (Opcional) Se repositório privado:
   - Habilite **Authentication**
   - Adicione **Username** e **Personal Access Token**

### 5.4. Adicionar Variáveis de Ambiente

**Role até a seção: Environment variables**

**Opção A: Upload do arquivo .env**

1. Clique: **Load variables from .env file**
2. Selecione o arquivo `.env` que você editou
3. Upload

**Opção B: Adicionar manualmente (uma por vez)**

1. Clique: **+ Add environment variable**
2. Preencha:
   ```
   Name: DOMAIN
   Value: sefaz.seudominio.com
   ```
3. Repita para cada variável:
   - `CERT_RESOLVER`
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SESSION_SECRET`
   - `CERTIFICADOS_PATH`
   - `XMLS_PATH`
   - `ALLOW_SEFAZ_SIMULATION`

**Opção C: Bulk editor (Mais rápido)**

1. Clique: **Advanced mode**
2. Cole todas as variáveis no formato:
   ```
   DOMAIN=sefaz.seudominio.com
   CERT_RESOLVER=le
   SUPABASE_URL=https://...
   SUPABASE_ANON_KEY=eyJhbGc...
   SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
   SESSION_SECRET=sua-secret-aqui
   CERTIFICADOS_PATH=/opt/sefaz-xml-sync/certificados
   XMLS_PATH=/opt/sefaz-xml-sync/xmls
   ALLOW_SEFAZ_SIMULATION=false
   ```

### 5.5. Deploy!

1. Role até o final
2. Clique: **Deploy the stack**
3. Aguarde o build e deploy (pode levar 2-5 minutos)

---

## ✅ Passo 6: Verificar Deploy

### 6.1. Verificar logs no Portainer

1. **Stacks** → `sefaz-xml-sync`
2. Clique no container: `sefaz-xml-sync`
3. Aba: **Logs**
4. Procure por:
   ```
   ✓ Supabase configurado com sucesso
   ✓ Agendamento configurado: sincronização a cada 1 hora
   serving on port 5000
   ```

### 6.2. Verificar via linha de comando

```bash
# Ver containers rodando
docker ps | grep sefaz

# Ver logs
docker logs sefaz-xml-sync -f

# Verificar health
docker inspect sefaz-xml-sync | grep -A 5 Health
```

### 6.3. Testar endpoint de saúde

```bash
# Testar internamente
curl http://localhost:5000/api/health

# Deve retornar:
# {"status":"ok","timestamp":"2025-11-13T..."}
```

### 6.4. Acessar via navegador

Abra: **`https://sefaz.seudominio.com`**

- Deve carregar a página de login
- Deve ter certificado SSL válido (cadeado verde)
- Certificado emitido por Let's Encrypt

---

## 🎯 Passo 7: Configuração Inicial da Aplicação

### 7.1. Criar primeiro usuário

1. Acesse: `https://sefaz.seudominio.com`
2. Clique: **Registrar**
3. Preencha:
   - Email válido
   - Nome completo
   - Senha segura
4. (Se email confirmation estiver habilitado) Confirme email
5. Faça login

### 7.2. Upload de certificados digitais

**Via interface web:**

1. Menu: **Empresas**
2. Botão: **Nova Empresa**
3. Preencha dados da empresa
4. Upload do arquivo `.pfx`
5. Senha do certificado
6. Salvar

**Via SCP (se preferir upload em massa):**

```bash
# Do seu computador local
scp certificado1.pfx root@SEU_IP:/opt/sefaz-xml-sync/certificados/
scp certificado2.pfx root@SEU_IP:/opt/sefaz-xml-sync/certificados/

# No servidor, ajustar permissões
chmod 600 /opt/sefaz-xml-sync/certificados/*.pfx
```

### 7.3. Verificar sincronização automática

- **Agendamento:** A cada 1 hora (automático)
- **Manual:** Menu Empresas → Botão de sincronizar (ícone nuvem)
- **Logs:** Menu Logs para acompanhar

---

## 🔄 Passo 8: Atualização da Aplicação

### Opção A: Via Portainer (se usou Repository)

1. **Stacks** → `sefaz-xml-sync`
2. Botão: **Pull and redeploy**
3. Aguardar rebuild

### Opção B: Rebuild manual

1. No servidor:
   ```bash
   cd /opt/sefaz-xml-sync
   git pull
   ```

2. No Portainer:
   - **Stacks** → `sefaz-xml-sync`
   - Botão: **Editor**
   - Botão: **Update the stack**
   - Marque: **Re-pull image and redeploy**
   - Confirmar

### Opção C: Webhooks (CI/CD Automático)

1. No Portainer Stack, criar webhook
2. Copiar URL do webhook
3. Configurar GitHub/GitLab para chamar webhook em push

---

## 💾 Passo 9: Backup

### 9.1. Script de backup automático

```bash
# Criar diretório de scripts
mkdir -p /opt/scripts

# Criar script de backup
nano /opt/scripts/backup-sefaz.sh
```

**Conteúdo do script:**

```bash
#!/bin/bash
set -e

BACKUP_DIR="/backup/sefaz-xml-sync"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

echo "=== Backup SEFAZ XML Sync - $DATE ==="

# Backup XMLs
echo "Backup de XMLs..."
tar -czf $BACKUP_DIR/xmls-$DATE.tar.gz /opt/sefaz-xml-sync/xmls

# Backup Certificados
echo "Backup de Certificados..."
tar -czf $BACKUP_DIR/certificados-$DATE.tar.gz /opt/sefaz-xml-sync/certificados

# Manter apenas últimos 30 dias
find $BACKUP_DIR -type f -mtime +30 -delete

echo "✓ Backup concluído: $BACKUP_DIR/"
ls -lh $BACKUP_DIR/ | tail -5
```

### 9.2. Tornar executável

```bash
chmod +x /opt/scripts/backup-sefaz.sh

# Testar
/opt/scripts/backup-sefaz.sh
```

### 9.3. Agendar backup diário (Cron)

```bash
# Editar crontab
crontab -e

# Adicionar linha (backup diário às 3h da manhã)
0 3 * * * /opt/scripts/backup-sefaz.sh >> /var/log/backup-sefaz.log 2>&1
```

### 9.4. Restaurar backup

```bash
# Restaurar XMLs
cd /opt/sefaz-xml-sync
tar -xzf /backup/sefaz-xml-sync/xmls-YYYYMMDD_HHMMSS.tar.gz --strip-components=3

# Restaurar Certificados
tar -xzf /backup/sefaz-xml-sync/certificados-YYYYMMDD_HHMMSS.tar.gz --strip-components=3
```

---

## 🔧 Troubleshooting

### Problema: Container não inicia

**Verificar logs:**
```bash
docker logs sefaz-xml-sync
```

**Causas comuns:**
- Variáveis de ambiente faltando/incorretas
- Erro de conexão com Supabase
- Porta 5000 já em uso

**Solução:**
```bash
# Verificar variáveis
docker exec sefaz-xml-sync env | grep SUPABASE

# Reiniciar container
docker restart sefaz-xml-sync
```

### Problema: SSL não funciona

**Verificar:**
```bash
# DNS está resolvendo?
dig sefaz.seudominio.com

# Traefik está reconhecendo o serviço?
docker logs traefik | grep sefaz

# Labels corretos?
docker inspect sefaz-xml-sync | grep -A 20 Labels
```

**Soluções:**
1. Verificar se `CERT_RESOLVER` está correto
2. Verificar se rede `traefik-proxy` existe
3. Aguardar 1-2 minutos para Let's Encrypt emitir certificado
4. Verificar logs do Traefik para erros ACME

### Problema: Não consegue acessar pelo domínio

**Verificar:**
```bash
# DNS propagou?
nslookup sefaz.seudominio.com

# Traefik está roteando?
docker logs traefik | grep -i sefaz

# Firewall bloqueando?
ufw status
```

**Solução:**
```bash
# Abrir portas (se necessário)
ufw allow 80/tcp
ufw allow 443/tcp
ufw reload
```

### Problema: Certificado PKCS12 inválido

**No modo desenvolvimento:**
- `ALLOW_SEFAZ_SIMULATION=true` permite simular SEFAZ

**Em produção:**
```bash
# Verificar certificado
openssl pkcs12 -info -in /opt/sefaz-xml-sync/certificados/cert.pfx

# Verificar permissões
ls -la /opt/sefaz-xml-sync/certificados/
# Devem ser 600 (rw-------)

# Corrigir permissões
chmod 600 /opt/sefaz-xml-sync/certificados/*.pfx
```

### Problema: Container consome muita memória

**Limitar recursos no docker-compose:**

```yaml
services:
  app:
    # ... outras configs
    deploy:
      resources:
        limits:
          memory: 1G
          cpus: '1.0'
        reservations:
          memory: 512M
```

---

## 📊 Monitoramento

### Via Portainer

1. **Containers** → `sefaz-xml-sync`
2. Aba: **Stats** (uso de CPU, RAM, Rede)

### Via linha de comando

```bash
# Uso de recursos
docker stats sefaz-xml-sync

# Logs em tempo real
docker logs -f sefaz-xml-sync

# Health status
docker inspect sefaz-xml-sync | grep -A 10 Health
```

### Logs persistentes

```bash
# Ver todos os logs
docker logs sefaz-xml-sync

# Últimas 100 linhas
docker logs --tail 100 sefaz-xml-sync

# Desde 1 hora atrás
docker logs --since 1h sefaz-xml-sync

# Salvar logs em arquivo
docker logs sefaz-xml-sync > /tmp/sefaz-debug.log
```

---

## 🔒 Checklist de Segurança

- [ ] Firewall (UFW) configurado
- [ ] SSL/HTTPS funcionando (Let's Encrypt via Traefik)
- [ ] Variáveis sensíveis NÃO commitadas no Git
- [ ] `.env` com permissões 600
- [ ] Certificados .pfx com permissões 600
- [ ] Backup automático configurado
- [ ] RLS habilitado no Supabase
- [ ] `ALLOW_SEFAZ_SIMULATION=false` em produção
- [ ] Portainer com senha forte
- [ ] SSH com chave pública (não senha)

---

## 📝 Comandos Úteis

```bash
# Reiniciar aplicação
docker restart sefaz-xml-sync

# Parar aplicação
docker stop sefaz-xml-sync

# Iniciar aplicação
docker start sefaz-xml-sync

# Remover e recriar (cuidado!)
docker rm -f sefaz-xml-sync
# Depois redeploy via Portainer

# Ver rede do Traefik
docker network inspect traefik-proxy

# Executar comando dentro do container
docker exec -it sefaz-xml-sync sh

# Verificar certificados Let's Encrypt
docker exec traefik cat /acme.json | jq
```

---

## 🎉 Conclusão

Sua aplicação SEFAZ XML Sync agora está rodando em produção com:

- ✅ HTTPS automático via Traefik + Let's Encrypt
- ✅ Deploy gerenciado pelo Portainer
- ✅ Sincronização automática a cada 1 hora
- ✅ Backup automático diário
- ✅ Isolamento multi-tenant (RLS)
- ✅ Health checks configurados
- ✅ Auto-restart em falhas

**Acesso:** `https://sefaz.seudominio.com`

---

## 📞 Suporte

**Logs importantes:**
- Aplicação: `docker logs sefaz-xml-sync`
- Traefik: `docker logs traefik`
- Portainer: Interface web em `https://portainer.seudominio.com`

**Recursos:**
- Portainer Docs: https://docs.portainer.io
- Traefik Docs: https://doc.traefik.io
- Supabase Docs: https://supabase.com/docs

---

**Bom trabalho! 🚀**
