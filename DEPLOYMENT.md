# 🚀 Guia Completo de Deploy - SEFAZ XML Sync
## Deploy com Docker em VPS Hetzner

---

## 📋 Pré-requisitos

### 1. VPS Hetzner
- Servidor Ubuntu 22.04 ou 24.04 LTS
- Mínimo: 2GB RAM, 1 vCPU (CX11 - ~€4.51/mês)
- Recomendado: 4GB RAM, 2 vCPU (CX21 - ~€5.83/mês)
- IP público fixo

### 2. Domínio
- Domínio próprio configurado apontando para o IP do servidor
- Registros DNS tipo A:
  ```
  @ (ou seu-dominio.com) → IP_DO_SERVIDOR
  www → IP_DO_SERVIDOR
  ```

### 3. Conta Supabase
- Projeto criado em https://supabase.com
- Database schema executado (ver `supabase-schema.sql`)
- RLS (Row-Level Security) configurado
- Anon Key e Service Role Key disponíveis

---

## 🔧 Passo 1: Configurar VPS Hetzner

### 1.1. Criar servidor no Hetzner Cloud

```bash
# Acesse: https://console.hetzner.cloud/
# 1. Criar projeto
# 2. Add Server
# 3. Location: Escolha mais próxima (ex: Ashburn, Frankfurt)
# 4. Image: Ubuntu 24.04
# 5. Type: CX21 (4GB RAM recomendado)
# 6. Networking: IPv4 + IPv6
# 7. SSH Keys: Adicione sua chave pública
# 8. Create & Buy now
```

### 1.2. Conectar ao servidor

```bash
# Substitua pelo IP real do seu servidor
ssh root@SEU_IP_AQUI
```

### 1.3. Atualizar sistema

```bash
apt update && apt upgrade -y
```

### 1.4. Instalar Docker e Docker Compose

```bash
# Instalar dependências
apt install -y ca-certificates curl gnupg lsb-release

# Adicionar chave GPG do Docker
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg

# Adicionar repositório Docker
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null

# Instalar Docker
apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Verificar instalação
docker --version
docker compose version

# Habilitar Docker no boot
systemctl enable docker
systemctl start docker
```

### 1.5. Configurar Firewall (UFW)

```bash
# Habilitar UFW
ufw enable

# Permitir SSH
ufw allow 22/tcp

# Permitir HTTP/HTTPS
ufw allow 80/tcp
ufw allow 443/tcp

# Recarregar
ufw reload
ufw status
```

---

## 📦 Passo 2: Preparar Aplicação

### 2.1. Clonar/Transferir projeto para servidor

**Opção A: Via Git (recomendado)**
```bash
# Instalar Git
apt install -y git

# Criar diretório
mkdir -p /opt/apps
cd /opt/apps

# Clonar seu repositório
git clone https://github.com/SEU_USUARIO/sefaz-xml-sync.git
cd sefaz-xml-sync
```

**Opção B: Upload manual via SCP**
```bash
# No seu computador local:
scp -r /caminho/do/projeto root@SEU_IP:/opt/apps/sefaz-xml-sync
```

### 2.2. Criar diretórios necessários

```bash
cd /opt/apps/sefaz-xml-sync

# Criar estrutura de diretórios
mkdir -p certificados xmls nginx/conf.d certbot/conf certbot/www
```

### 2.3. Configurar variáveis de ambiente

```bash
# Copiar exemplo
cp .env.example .env

# Editar com seus valores reais
nano .env
```

**Preencha com:**
```env
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_ANON_KEY=sua-anon-key-real
SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key-real
SESSION_SECRET=$(openssl rand -base64 32)
NODE_ENV=production
PORT=5000
XML_DEST_PATH=/app/xmls
ALLOW_SEFAZ_SIMULATION=false
```

**Gerar SESSION_SECRET:**
```bash
openssl rand -base64 32
```

### 2.4. Editar configuração do Nginx

```bash
nano nginx/conf.d/default.conf
```

**Substituir `seu-dominio.com` pelo seu domínio real** em todas as linhas:
- `server_name seu-dominio.com www.seu-dominio.com;`
- Caminhos dos certificados SSL

---

## 🔐 Passo 3: Configurar SSL/HTTPS

### 3.1. Preparar script de inicialização

```bash
# Tornar script executável
chmod +x deploy-scripts/init-letsencrypt.sh

# Editar script
nano deploy-scripts/init-letsencrypt.sh
```

**Modificar:**
```bash
domains=(seu-dominio.com www.seu-dominio.com)  # Seu domínio real
email="seu-email@exemplo.com"  # Seu email real
staging=0  # Deixe 0 para produção (use 1 para testes)
```

### 3.2. Executar script (primeira vez)

```bash
./deploy-scripts/init-letsencrypt.sh
```

**O script irá:**
1. Baixar parâmetros TLS recomendados
2. Criar certificado temporário
3. Iniciar Nginx
4. Solicitar certificado real do Let's Encrypt
5. Configurar renovação automática

---

## 🚀 Passo 4: Deploy da Aplicação

### 4.1. Build das imagens Docker

```bash
docker compose build
```

### 4.2. Iniciar containers

```bash
docker compose up -d
```

### 4.3. Verificar status

```bash
# Ver containers rodando
docker compose ps

# Ver logs
docker compose logs -f app

# Logs específicos
docker compose logs -f nginx
docker compose logs -f certbot
```

### 4.4. Verificar saúde da aplicação

```bash
# Testar endpoint de saúde
curl http://localhost:5000/api/health

# Verificar via navegador
# https://seu-dominio.com
```

---

## 📁 Passo 5: Upload de Certificados Digitais

### 5.1. Transferir certificados .pfx para servidor

**Do seu computador local:**
```bash
scp /caminho/certificado.pfx root@SEU_IP:/opt/apps/sefaz-xml-sync/certificados/
```

**Ou via SFTP/WinSCP (Windows)**

### 5.2. Verificar permissões

```bash
# No servidor
cd /opt/apps/sefaz-xml-sync
chmod 600 certificados/*.pfx
```

---

## 🔄 Passo 6: Configurar Backup Automático

### 6.1. Criar script de backup

```bash
nano /opt/scripts/backup-sefaz.sh
```

```bash
#!/bin/bash
BACKUP_DIR="/backup/sefaz-xml-sync"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# Backup XMLs e certificados
tar -czf $BACKUP_DIR/xmls-$DATE.tar.gz /opt/apps/sefaz-xml-sync/xmls
tar -czf $BACKUP_DIR/certificados-$DATE.tar.gz /opt/apps/sefaz-xml-sync/certificados

# Manter apenas últimos 7 dias
find $BACKUP_DIR -type f -mtime +7 -delete

echo "Backup realizado: $DATE"
```

### 6.2. Tornar executável e agendar

```bash
chmod +x /opt/scripts/backup-sefaz.sh

# Adicionar ao crontab (diário às 3h da manhã)
crontab -e

# Adicione:
0 3 * * * /opt/scripts/backup-sefaz.sh >> /var/log/backup-sefaz.log 2>&1
```

---

## 📊 Passo 7: Monitoramento

### 7.1. Ver logs em tempo real

```bash
# Logs da aplicação
docker compose logs -f app

# Logs do Nginx
docker compose logs -f nginx

# Todos os logs
docker compose logs -f
```

### 7.2. Monitorar recursos

```bash
# Status dos containers
docker stats

# Uso de disco
df -h

# Memória
free -h
```

### 7.3. Instalar Portainer (opcional - GUI para Docker)

```bash
docker volume create portainer_data

docker run -d \
  -p 9000:9000 -p 9443:9443 \
  --name=portainer \
  --restart=always \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v portainer_data:/data \
  portainer/portainer-ce:latest
```

Acesse: `https://SEU_IP:9443`

---

## 🔄 Comandos Úteis

### Gerenciamento Docker

```bash
# Parar aplicação
docker compose down

# Reiniciar aplicação
docker compose restart

# Reconstruir após mudanças
docker compose up -d --build

# Ver logs
docker compose logs -f app

# Limpar containers antigos
docker system prune -a
```

### Atualização da aplicação

```bash
cd /opt/apps/sefaz-xml-sync

# Baixar código atualizado
git pull

# Reconstruir e reiniciar
docker compose down
docker compose build --no-cache
docker compose up -d

# Verificar
docker compose ps
docker compose logs -f app
```

### Renovação manual de certificado SSL

```bash
# Renovar certificado
docker compose run --rm certbot renew

# Recarregar Nginx
docker compose exec nginx nginx -s reload
```

### Backup manual

```bash
# XMLs
tar -czf backup-xmls-$(date +%Y%m%d).tar.gz /opt/apps/sefaz-xml-sync/xmls

# Certificados
tar -czf backup-certificados-$(date +%Y%m%d).tar.gz /opt/apps/sefaz-xml-sync/certificados

# Database (Supabase faz backup automático, mas você pode exportar)
```

---

## 🐛 Troubleshooting

### Aplicação não inicia

```bash
# Ver logs detalhados
docker compose logs app

# Verificar variáveis de ambiente
docker compose exec app env | grep SUPABASE

# Reiniciar container
docker compose restart app
```

### Erro de SSL/HTTPS

```bash
# Verificar certificados
docker compose exec nginx ls -la /etc/letsencrypt/live/

# Verificar configuração Nginx
docker compose exec nginx nginx -t

# Recarregar Nginx
docker compose exec nginx nginx -s reload
```

### Certificado PKCS12 inválido

```bash
# Verificar certificado
openssl pkcs12 -info -in certificados/seu-certificado.pfx

# Verificar permissões
ls -la certificados/
```

### Erro de conexão Supabase

```bash
# Testar conexão
docker compose exec app node -e "
const { createClient } = require('@supabase/supabase-js');
const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
console.log('Conectado!');
"
```

### Container consumindo muita memória

```bash
# Ver uso de memória
docker stats

# Limitar memória no docker-compose.yml
# Adicione em services.app:
deploy:
  resources:
    limits:
      memory: 1G
```

---

## 📈 Otimizações de Produção

### 1. Limitar logs

```bash
# Editar docker-compose.yml, adicionar em cada serviço:
logging:
  driver: "json-file"
  options:
    max-size: "10m"
    max-file: "3"
```

### 2. Health checks customizados

Já incluídos no `Dockerfile` e `docker-compose.yml`

### 3. Auto-restart

Já configurado com `restart: unless-stopped`

### 4. Monitoramento avançado (opcional)

```bash
# Instalar Prometheus + Grafana
# (Guia separado se necessário)
```

---

## 🔒 Checklist de Segurança

- [ ] Firewall (UFW) configurado
- [ ] SSH com chave pública (não senha)
- [ ] HTTPS com certificado válido
- [ ] Variáveis sensíveis em .env (não commitadas)
- [ ] RLS habilitado no Supabase
- [ ] Backup automático configurado
- [ ] Logs com rotação
- [ ] Certificados .pfx com permissões 600
- [ ] Fail2ban instalado (opcional):
  ```bash
  apt install -y fail2ban
  systemctl enable fail2ban
  ```

---

## 📞 Suporte

### Logs importantes:
- Aplicação: `/var/log/app.log` (dentro do container)
- Nginx: `docker compose logs nginx`
- Certbot: `docker compose logs certbot`

### Recursos:
- Docker: https://docs.docker.com
- Nginx: https://nginx.org/en/docs/
- Let's Encrypt: https://letsencrypt.org/docs/
- Supabase: https://supabase.com/docs

---

## 🎉 Conclusão

Sua aplicação agora está rodando em produção com:
- ✅ HTTPS automático com Let's Encrypt
- ✅ Renovação automática de certificados
- ✅ Sincronização automática a cada 1 hora
- ✅ Backup configurado
- ✅ Monitoramento básico
- ✅ Isolamento multi-tenant (RLS)

**Acesse:** `https://seu-dominio.com`

**Login inicial:**
1. Criar conta via interface
2. Confirmar email (se ativado no Supabase)
3. Fazer login
4. Cadastrar empresas com certificados
5. Aguardar sincronização automática ou iniciar manualmente
