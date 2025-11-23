#!/bin/bash
# Script para corrigir dependências do Vite no package.json
# Uso: bash fix-vite-deps.sh

echo "🔧 Corrigindo package.json - Movendo Vite para dependencies..."

# Criar backup
cp package.json package.json.backup
echo "✅ Backup criado: package.json.backup"

# Usar Node.js para editar JSON de forma segura
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

// Mover vite
if (pkg.devDependencies.vite) {
  pkg.dependencies.vite = pkg.devDependencies.vite;
  delete pkg.devDependencies.vite;
  console.log('✅ Movido: vite');
}

// Mover @vitejs/plugin-react
if (pkg.devDependencies['@vitejs/plugin-react']) {
  pkg.dependencies['@vitejs/plugin-react'] = pkg.devDependencies['@vitejs/plugin-react'];
  delete pkg.devDependencies['@vitejs/plugin-react'];
  console.log('✅ Movido: @vitejs/plugin-react');
}

// Salvar com formatação
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
console.log('✅ package.json atualizado!');
"

echo ""
echo "🎯 Próximos passos:"
echo "1. Reinstalar dependências: npm install"
echo "2. Rebuild imagem Docker: docker build -f Dockerfile.production -t sefaz-xml-sync:1.0.0 ."
echo "3. Redeploy: docker compose -f docker-compose.production.yml up -d --force-recreate"
