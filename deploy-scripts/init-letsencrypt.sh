#!/bin/bash

# Script para inicializar certificado SSL com Let's Encrypt
# Baseado em: https://github.com/wmnnd/nginx-certbot

if ! [ -x "$(command -v docker-compose)" ]; then
  echo 'Error: docker-compose is not installed.' >&2
  exit 1
fi

# CONFIGURAÇÕES - EDITE AQUI
domains=(seu-dominio.com www.seu-dominio.com)
rsa_key_size=4096
data_path="./certbot"
email="seu-email@exemplo.com" # Email para notificações
staging=0 # Set to 1 if you're testing to avoid rate limits!

echo "### Preparando diretórios..."
mkdir -p "$data_path/conf"
mkdir -p "$data_path/www"

if [ -d "$data_path/conf/live/${domains[0]}" ]; then
  read -p "Certificado existente encontrado. Deseja substituir? (y/N) " decision
  if [ "$decision" != "Y" ] && [ "$decision" != "y" ]; then
    exit
  fi
fi

# Download recommended TLS parameters
echo "### Baixando parâmetros TLS recomendados..."
curl -s https://raw.githubusercontent.com/certbot/certbot/master/certbot-nginx/certbot_nginx/_internal/tls_configs/options-ssl-nginx.conf > "$data_path/conf/options-ssl-nginx.conf"
curl -s https://raw.githubusercontent.com/certbot/certbot/master/certbot/certbot/ssl-dhparams.pem > "$data_path/conf/ssl-dhparams.pem"

echo "### Criando certificado dummy para Nginx iniciar..."
path="/etc/letsencrypt/live/${domains[0]}"
mkdir -p "$data_path/conf/live/${domains[0]}"
docker-compose run --rm --entrypoint "\
  openssl req -x509 -nodes -newkey rsa:$rsa_key_size -days 1\
    -keyout '$path/privkey.pem' \
    -out '$path/fullchain.pem' \
    -subj '/CN=localhost'" certbot
echo

echo "### Iniciando Nginx..."
docker-compose up --force-recreate -d nginx
echo

echo "### Removendo certificado dummy..."
docker-compose run --rm --entrypoint "\
  rm -Rf /etc/letsencrypt/live/${domains[0]} && \
  rm -Rf /etc/letsencrypt/archive/${domains[0]} && \
  rm -Rf /etc/letsencrypt/renewal/${domains[0]}.conf" certbot
echo

echo "### Solicitando certificado Let's Encrypt..."
domain_args=""
for domain in "${domains[@]}"; do
  domain_args="$domain_args -d $domain"
done

# Select appropriate email arg
case "$email" in
  "") email_arg="--register-unsafely-without-email" ;;
  *) email_arg="--email $email" ;;
esac

# Enable staging mode if needed
if [ $staging != "0" ]; then staging_arg="--staging"; fi

docker-compose run --rm --entrypoint "\
  certbot certonly --webroot -w /var/www/certbot \
    $staging_arg \
    $email_arg \
    $domain_args \
    --rsa-key-size $rsa_key_size \
    --agree-tos \
    --force-renewal" certbot
echo

echo "### Recarregando Nginx..."
docker-compose exec nginx nginx -s reload
echo

echo "### Certificado SSL configurado com sucesso!"
echo "### Edite nginx/conf.d/default.conf e substitua 'seu-dominio.com' pelo seu domínio real"
