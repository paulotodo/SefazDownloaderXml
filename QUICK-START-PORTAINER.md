# ⚡ Quick Start - Portainer + Traefik

## 🎯 Checklist Rápido

### ✅ Pré-requisitos
- [ ] Docker instalado e rodando
- [ ] Portainer acessível (https://portainer.seudominio.com)
- [ ] Traefik configurado com Let's Encrypt
- [ ] Rede `traefik-proxy` existe (verificar: `docker network ls`)
- [ ] Domínio apontando para o servidor (DNS tipo A)
- [ ] Projeto Supabase configurado

---

## 🚀 Deploy em 5 Minutos

### 1️⃣ Preparar servidor

```bash
# Criar diretórios
mkdir -p /opt/sefaz-xml-sync/{certificados,xmls}
cd /opt/sefaz-xml-sync

# Clonar código
git clone https://github.com/SEU_USUARIO/sefaz-xml-sync.git .
```

### 2️⃣ Configurar variáveis

```bash
# Copiar template
cp .env.portainer .env

# Editar (substitua pelos valores reais)
nano .env
```

**Mínimo necessário:**
```env
DOMAIN=sefaz.seudominio.com
CERT_RESOLVER=le
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SESSION_SECRET=$(openssl rand -base64 32)
CERTIFICADOS_PATH=/opt/sefaz-xml-sync/certificados
XMLS_PATH=/opt/sefaz-xml-sync/xmls
```

### 3️⃣ Deploy no Portainer

1. **Stacks** → **+ Add stack**
2. **Name:** `sefaz-xml-sync`
3. **Build method:** Web editor
4. Cole conteúdo de: `docker-compose.portainer.yml`
5. **Environment variables:** Upload `.env`
6. **Deploy the stack**

### 4️⃣ Verificar

```bash
# Ver logs
docker logs sefaz-xml-sync -f

# Acessar
# https://sefaz.seudominio.com
```

---

## 🔧 Verificações Importantes

### Rede do Traefik
```bash
docker network ls | grep traefik
# Deve mostrar: traefik-proxy (ou o nome que você usa)
```

Se o nome for diferente, editar em `docker-compose.portainer.yml`:
```yaml
networks:
  traefik-proxy:  # <-- Trocar pelo nome correto
    external: true
```

### Certificate Resolver
```bash
docker inspect traefik | grep certresolver
# Anote o nome (ex: 'le', 'letsencrypt', etc)
```

Use esse nome em `.env`:
```env
CERT_RESOLVER=le  # <-- Nome que você encontrou
```

---

## 📋 Variáveis de Ambiente (Referência)

| Variável | Exemplo | Obrigatório |
|----------|---------|-------------|
| `DOMAIN` | `sefaz.example.com` | ✅ Sim |
| `CERT_RESOLVER` | `le` | ✅ Sim |
| `SUPABASE_URL` | `https://xxx.supabase.co` | ✅ Sim |
| `SUPABASE_ANON_KEY` | `eyJhbG...` | ✅ Sim |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbG...` | ✅ Sim |
| `SESSION_SECRET` | (gerar novo) | ✅ Sim |
| `CERTIFICADOS_PATH` | `/opt/sefaz-xml-sync/certificados` | ✅ Sim |
| `XMLS_PATH` | `/opt/sefaz-xml-sync/xmls` | ✅ Sim |
| `ALLOW_SEFAZ_SIMULATION` | `false` | ⚠️ Produção: false |

---

## 🎨 Labels do Traefik (Resumo)

```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.services.sefaz-xml-sync.loadbalancer.server.port=5000"
  - "traefik.http.routers.sefaz-xml-sync.rule=Host(`sefaz.example.com`)"
  - "traefik.http.routers.sefaz-xml-sync.entrypoints=websecure"
  - "traefik.http.routers.sefaz-xml-sync.tls.certresolver=le"
```

**O que fazem:**
- ✅ Habilita Traefik
- ✅ Define porta interna (5000)
- ✅ Roteia domínio → container
- ✅ Força HTTPS (websecure)
- ✅ SSL automático (Let's Encrypt)

---

## 🐛 Troubleshooting Rápido

### Container não inicia
```bash
docker logs sefaz-xml-sync
# Verificar erros de env vars ou conexão Supabase
```

### SSL não funciona
```bash
# 1. DNS OK?
dig sefaz.seudominio.com

# 2. Traefik vê o container?
docker logs traefik | grep sefaz

# 3. Aguarde 1-2 min para emissão do certificado
```

### Não acessa pelo domínio
```bash
# Firewall
ufw allow 80/tcp
ufw allow 443/tcp

# Verificar roteamento
docker inspect sefaz-xml-sync | grep -A 20 Labels
```

---

## 🔄 Comandos Úteis

```bash
# Ver logs
docker logs -f sefaz-xml-sync

# Reiniciar
docker restart sefaz-xml-sync

# Status
docker ps | grep sefaz

# Recursos
docker stats sefaz-xml-sync

# Executar comando no container
docker exec -it sefaz-xml-sync sh
```

---

## 📖 Documentação Completa

- **Passo a passo detalhado:** `DEPLOYMENT-PORTAINER.md`
- **Troubleshooting completo:** Ver seção no guia acima
- **Backup automático:** Scripts incluídos no guia

---

## ✅ Deploy Concluído!

**Acesse:** `https://sefaz.seudominio.com`

**Primeira vez:**
1. Criar conta (Registrar)
2. Confirmar email (se ativado)
3. Fazer login
4. Cadastrar empresas
5. Upload certificados .pfx
6. Aguardar sincronização automática (1h) ou iniciar manual

---

**Dúvidas?** Consulte o guia completo: `DEPLOYMENT-PORTAINER.md`
