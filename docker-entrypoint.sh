#!/bin/sh
# ============================================================================
# Docker Entrypoint - SEFAZ XML Sync
# Corrige permissões dos volumes antes de iniciar a aplicação
# ============================================================================

set -e

echo "🔧 Verificando permissões dos volumes..."

# Função para corrigir permissões de um diretório
fix_permissions() {
    local dir="$1"
    
    if [ -d "$dir" ]; then
        # Verifica se o diretório é gravável pelo usuário nodejs (uid=1001)
        if ! su-exec nodejs test -w "$dir" 2>/dev/null; then
            echo "⚠️  Corrigindo permissões de: $dir"
            chown -R nodejs:nodejs "$dir"
            chmod -R 755 "$dir"
        else
            echo "✅ Permissões OK: $dir"
        fi
    else
        echo "⚠️  Criando diretório: $dir"
        mkdir -p "$dir"
        chown -R nodejs:nodejs "$dir"
        chmod -R 755 "$dir"
    fi
}

# Corrige permissões dos volumes
fix_permissions "/app/xmls"
fix_permissions "/app/certificados"

echo "✅ Permissões verificadas!"
echo ""

# Inicia a aplicação como usuário nodejs
exec su-exec nodejs "$@"
