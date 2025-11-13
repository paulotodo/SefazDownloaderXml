# Multi-stage build para produção otimizada

# Stage 1: Build do frontend React
FROM node:20-alpine AS frontend-build

WORKDIR /app/client

# Copia package files do frontend
COPY client/package*.json ./
RUN npm ci --frozen-lockfile

# Copia código fonte do frontend
COPY client/ ./

# Build de produção do React
RUN npm run build

# Stage 2: Preparar backend
FROM node:20-alpine AS backend-deps

WORKDIR /app

# Copia package files do projeto completo
COPY package*.json ./
RUN npm ci --only=production --frozen-lockfile

# Stage 3: Imagem final de produção
FROM node:20-alpine

ENV NODE_ENV=production

WORKDIR /app

# Instala OpenSSL para certificados digitais
RUN apk add --no-cache openssl

# Copia dependências do backend
COPY --from=backend-deps /app/node_modules ./node_modules

# Copia código fonte do servidor
COPY server/ ./server/
COPY shared/ ./shared/
COPY package*.json ./
COPY tsconfig.json ./

# Copia build do frontend
COPY --from=frontend-build /app/client/dist ./client/dist

# Cria diretórios necessários
RUN mkdir -p /app/certificados /app/xmls

# Expõe porta
EXPOSE 5000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Inicia aplicação
CMD ["node", "--loader", "tsx", "server/index.ts"]
