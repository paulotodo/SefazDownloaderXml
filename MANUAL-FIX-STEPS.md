# 🔧 Correção Manual do Deploy - Passo a Passo

Execute cada bloco de comando **NO SERVIDOR** via SSH.

---

## 📦 **PASSO 1: Corrigir package.json**

```bash
cd /var/lib/downloadsefaz/SefazDownloaderXml

node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
if (pkg.devDependencies?.vite) {
  pkg.dependencies.vite = pkg.devDependencies.vite;
  delete pkg.devDependencies.vite;
  console.log('✅ vite movido');
}
if (pkg.devDependencies?.['@vitejs/plugin-react']) {
  pkg.dependencies['@vitejs/plugin-react'] = pkg.devDependencies['@vitejs/plugin-react'];
  delete pkg.devDependencies['@vitejs/plugin-react'];
  console.log('✅ plugin-react movido');
}
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
console.log('✅ Corrigido!');
"
```

---

## 🐳 **PASSO 2: Adicionar Porta no Traefik**

```bash
# Verificar se já existe
grep "loadbalancer.server.port" docker-compose.production.yml

# Se NÃO existir, adicionar:
nano docker-compose.production.yml
```

**Encontre a seção `labels:` e adicione:**

```yaml
labels:
  - "traefik.enable=true"
  - "traefik.docker.network=downloadsefaz"
  - "traefik.http.routers.sefaz-xml-sync.rule=Host(`downloadsefaz.dibs.com.br`)"
  - "traefik.http.routers.sefaz-xml-sync.entrypoints=websecure"
  - "traefik.http.routers.sefaz-xml-sync.tls=true"
  - "traefik.http.routers.sefaz-xml-sync.tls.certresolver=leresolver"
  - "traefik.http.routers.sefaz-xml-sync.service=sefaz-xml-sync"
  - "traefik.http.services.sefaz-xml-sync.loadbalancer.server.port=5000"  # ← ADICIONE ESTA LINHA
  - "traefik.http.middlewares.compress.compress=true"
  - "traefik.http.routers.sefaz-xml-sync.middlewares=compress@docker"
```

**Salvar:** `Ctrl+O` → `Enter` → `Ctrl+X`

---

## 🔨 **PASSO 3: Build do Frontend**

```bash
npm install
npm run build

# Verificar se buildou
ls -la dist/public/
```

**Deve mostrar:**
```
index.html
favicon.png
assets/
```

---

## 🐋 **PASSO 4: Rebuild da Imagem**

```bash
docker build -f Dockerfile.production -t sefaz-xml-sync:1.0.0 .
```

**Aguarde 2-5 minutos** (dependendo do servidor).

---

## 🔄 **PASSO 5: Recriar Container**

```bash
docker stop sefaz-xml-sync
docker rm sefaz-xml-sync
docker compose -f docker-compose.production.yml up -d
```

---

## ⏳ **PASSO 6: Aguardar Inicialização**

```bash
sleep 30
docker logs sefaz-xml-sync --tail 20
```

---

## 🧪 **PASSO 7: Testar**

```bash
# Teste 1: Health Check
curl -I http://localhost:5000/api/health

# Teste 2: Frontend (raiz)
curl -I http://localhost:5000/

# Teste 3: HTTPS Público
curl -I https://downloadsefaz.dibs.com.br/
```

**Deve retornar `HTTP/1.1 200 OK` ou `HTTP/2 200`** em todos os testes!

---

## ✅ **SE FUNCIONAR:**

Abra no navegador: **https://downloadsefaz.dibs.com.br**

---

## ❌ **SE AINDA DER 404:**

```bash
# Ver erros nos logs
docker logs sefaz-xml-sync | grep -i "error\|fail"

# Verificar NODE_ENV
docker exec sefaz-xml-sync printenv NODE_ENV

# Verificar arquivos no container
docker exec sefaz-xml-sync ls -la /app/dist/public/

# Ver logs do Traefik
docker logs traefik | grep -i "sefaz\|error"
```

Me envie a saída desses comandos!
