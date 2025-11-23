#!/bin/bash
# =============================================================================
# Script Completo para Corrigir Deploy em Produção
# Uso: bash fix-production-deploy.sh
# =============================================================================

set -e  # Parar se houver erro

echo "🚀 SEFAZ XML Sync - Correção de Deploy em Produção"
echo "=================================================="
echo ""

# =============================================================================
# PASSO 1: Mover Vite para dependencies
# =============================================================================
echo "📦 [1/6] Corrigindo package.json (vite → dependencies)..."
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

// Mover vite
if (pkg.devDependencies && pkg.devDependencies.vite) {
  pkg.dependencies.vite = pkg.devDependencies.vite;
  delete pkg.devDependencies.vite;
  console.log('  ✅ Movido: vite');
}

// Mover @vitejs/plugin-react
if (pkg.devDependencies && pkg.devDependencies['@vitejs/plugin-react']) {
  pkg.dependencies['@vitejs/plugin-react'] = pkg.devDependencies['@vitejs/plugin-react'];
  delete pkg.devDependencies['@vitejs/plugin-react'];
  console.log('  ✅ Movido: @vitejs/plugin-react');
}

fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
console.log('  ✅ package.json atualizado!');
"

# =============================================================================
# PASSO 2: Corrigir docker-compose (adicionar porta Traefik)
# =============================================================================
echo ""
echo "🐳 [2/6] Corrigindo docker-compose.production.yml (Traefik port)..."

# Verificar se a label já existe
if grep -q "traefik.http.services.sefaz-xml-sync.loadbalancer.server.port" docker-compose.production.yml; then
  echo "  ℹ️  Label de porta já existe, pulando..."
else
  # Adicionar label antes da última linha das labels
  sed -i '/traefik.http.routers.sefaz-xml-sync.service=sefaz-xml-sync/a\      - "traefik.http.services.sefaz-xml-sync.loadbalancer.server.port=5000"' docker-compose.production.yml
  echo "  ✅ Label de porta adicionada!"
fi

# =============================================================================
# PASSO 3: Build do frontend
# =============================================================================
echo ""
echo "🔨 [3/6] Instalando dependências e buildando frontend..."
npm install
npm run build

echo "  ✅ Build concluído!"
echo "  📁 Verificando dist/public/:"
ls -lah dist/public/ | head -n 10

# =============================================================================
# PASSO 4: Rebuild da imagem Docker
# =============================================================================
echo ""
echo "🐋 [4/6] Rebuilding imagem Docker..."
docker build -f Dockerfile.production -t sefaz-xml-sync:1.0.0 .

# =============================================================================
# PASSO 5: Parar e remover container antigo
# =============================================================================
echo ""
echo "🛑 [5/6] Parando container antigo..."
docker stop sefaz-xml-sync 2>/dev/null || echo "  ℹ️  Container já estava parado"
docker rm sefaz-xml-sync 2>/dev/null || echo "  ℹ️  Container já removido"

# =============================================================================
# PASSO 6: Recriar container
# =============================================================================
echo ""
echo "🚀 [6/6] Recriando container..."
docker compose -f docker-compose.production.yml up -d

# =============================================================================
# AGUARDAR INICIALIZAÇÃO
# =============================================================================
echo ""
echo "⏳ Aguardando 30 segundos para inicialização..."
sleep 30

# =============================================================================
# VERIFICAR STATUS
# =============================================================================
echo ""
echo "=================================================="
echo "📊 VERIFICAÇÃO FINAL"
echo "=================================================="
echo ""

echo "🐳 Status do Container:"
docker ps | grep sefaz || echo "❌ Container não encontrado!"

echo ""
echo "📝 Últimas 15 linhas de log:"
docker logs sefaz-xml-sync --tail 15

echo ""
echo "🔍 Verificar NODE_ENV:"
docker exec sefaz-xml-sync printenv NODE_ENV

echo ""
echo "🧪 Teste 1: Health Check (API)"
curl -s -I http://localhost:5000/api/health | head -n 1

echo ""
echo "🧪 Teste 2: Frontend (raiz)"
curl -s -I http://localhost:5000/ | head -n 1

echo ""
echo "🧪 Teste 3: HTTPS Público"
curl -s -I https://downloadsefaz.dibs.com.br/ | head -n 1

echo ""
echo "=================================================="
echo "✅ DEPLOY CONCLUÍDO!"
echo "=================================================="
echo ""
echo "🌐 Acesse: https://downloadsefaz.dibs.com.br"
echo ""
echo "Se ainda der erro 404:"
echo "  1. Ver logs completos: docker logs sefaz-xml-sync -f"
echo "  2. Ver logs do Traefik: docker logs traefik -f"
echo "  3. Testar diretamente: curl http://localhost:5000/"
echo ""
