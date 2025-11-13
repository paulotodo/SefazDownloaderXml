#!/bin/bash

# Script de deploy rápido
# Uso: ./deploy.sh [build|restart|logs|stop]

set -e

echo "🚀 SEFAZ XML Sync - Deploy Script"
echo "=================================="

case "$1" in
  build)
    echo "📦 Construindo imagens Docker..."
    docker compose build --no-cache
    echo "✅ Build concluído!"
    ;;
    
  start)
    echo "🟢 Iniciando containers..."
    docker compose up -d
    echo "✅ Aplicação iniciada!"
    docker compose ps
    ;;
    
  restart)
    echo "🔄 Reiniciando aplicação..."
    docker compose down
    docker compose up -d
    echo "✅ Aplicação reiniciada!"
    docker compose ps
    ;;
    
  logs)
    echo "📋 Mostrando logs (Ctrl+C para sair)..."
    docker compose logs -f app
    ;;
    
  stop)
    echo "🛑 Parando aplicação..."
    docker compose down
    echo "✅ Aplicação parada!"
    ;;
    
  update)
    echo "🔄 Atualizando aplicação..."
    git pull
    docker compose down
    docker compose build --no-cache
    docker compose up -d
    echo "✅ Atualização concluída!"
    docker compose ps
    ;;
    
  status)
    echo "📊 Status dos containers:"
    docker compose ps
    echo ""
    echo "💾 Uso de recursos:"
    docker stats --no-stream
    ;;
    
  backup)
    echo "💾 Criando backup..."
    BACKUP_DIR="./backups"
    mkdir -p $BACKUP_DIR
    DATE=$(date +%Y%m%d_%H%M%S)
    
    tar -czf $BACKUP_DIR/xmls-$DATE.tar.gz ./xmls
    tar -czf $BACKUP_DIR/certificados-$DATE.tar.gz ./certificados
    
    echo "✅ Backup criado em $BACKUP_DIR/"
    ls -lh $BACKUP_DIR/ | tail -2
    ;;
    
  *)
    echo "Uso: $0 {build|start|restart|logs|stop|update|status|backup}"
    echo ""
    echo "Comandos:"
    echo "  build    - Reconstrói as imagens Docker"
    echo "  start    - Inicia os containers"
    echo "  restart  - Reinicia os containers"
    echo "  logs     - Mostra logs em tempo real"
    echo "  stop     - Para os containers"
    echo "  update   - Baixa código + rebuild + restart"
    echo "  status   - Mostra status e uso de recursos"
    echo "  backup   - Cria backup de XMLs e certificados"
    exit 1
    ;;
esac
