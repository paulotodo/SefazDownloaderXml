# Sistema de Download Automático de NF-e e NFC-e (NFeDistribuicaoDFe)

Sistema robusto e compliant com **MOC 7.0** e **NT 2014.002** para download automático de XMLs fiscais (NF-e modelo 55 e NFC-e modelo 65) via Web Service **NFeDistribuicaoDFe** da SEFAZ.

---

## 📋 **Funcionalidades**

### ✅ **Conformidade Total**
- **MOC 7.0** (Manual de Orientação do Contribuinte NF-e/NFC-e)
- **NT 2014.002** (Web Service de Distribuição de DF-e de Interesse dos Atores da NF-e)
- Suporte completo para **NF-e (modelo 55)** e **NFC-e (modelo 65)**
- Processa TODOS os schemas: `nfeProc`, `resNFe`, `procEventoNFe`, `resEvento`

### 🔄 **Modos de Execução**
1. **Agendado (Automático)**: Cron job executa sincronização a cada hora
2. **Manual**: Interface web ou endpoint HTTP para execução sob demanda

### 🔐 **Segurança**
- Certificado Digital A1 (PKCS12) armazenado de forma segura
- Autenticação JWT com Supabase Auth
- Multi-tenant com isolamento via Row-Level Security (RLS)
- Variáveis de ambiente para dados sensíveis

### 📊 **Controle Rigoroso de NSU**
- Persiste último NSU processado
- Implementa bloqueio automático conforme NT 2014.002:
  - **cStat=137**: Bloqueio de 65min (sem documentos)
  - **cStat=656**: Bloqueio de 65min (consumo indevido)
- Detecção automática de concorrência com outros sistemas (ERP)
- Reconciliação de NSU para backlogs grandes

### 📁 **Armazenamento Organizado**
```
xmls/
├── NFe/                          # Nota Fiscal Eletrônica (modelo 55)
│   └── CNPJ/
│       └── ANO/
│           └── MES/
│               ├── numeroNF.xml                    # nfeProc (XML completo)
│               ├── Resumos/
│               │   └── CHAVE_nsuXXX.xml           # resNFe (resumo)
│               └── Eventos/
│                   ├── CHAVE_tpEvento_seq_nsu.xml # procEventoNFe
│                   └── Resumos/
│                       └── CHAVE_tpEvento_nsu.xml # resEvento
└── NFCe/                         # NFC-e (modelo 65) - mesma estrutura
```

### 📝 **Logs Completos**
- **Console**: Logs coloridos em tempo real
- **Arquivo**: `logs/app-YYYY-MM-DD.log` (rotação automática)
- **Banco de dados**: Logs detalhados com rastreabilidade

---

## 🚀 **Instalação e Configuração**

### **1. Pré-requisitos**
- Node.js 20+
- Conta Supabase (PostgreSQL + Auth + Storage)
- Certificado Digital A1 (.pfx ou .p12)
- CNPJ autorizado na SEFAZ

### **2. Variáveis de Ambiente**

Crie um arquivo `.env` na raiz do projeto:

```env
# Ambiente
NODE_ENV=production
PORT=5000

# Supabase (OBRIGATÓRIO)
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_ANON_KEY=sua-chave-anon
SUPABASE_SERVICE_ROLE_KEY=sua-chave-service-role

# Sessão (OBRIGATÓRIO)
SESSION_SECRET=sua-chave-secreta-aleatoria-aqui

# Armazenamento (OPCIONAL - padrões funcionam bem)
XML_DEST_PATH=./xmls           # Diretório para salvar XMLs
LOG_PATH=./logs                # Diretório para logs em arquivo
MAX_LOG_FILES=30               # Quantidade de arquivos de log (30 dias)

# Sincronização (OPCIONAL - padrões conforme NT 2014.002)
SYNC_CRON=0 * * * *            # Cron: a cada hora (minuto 0)
MAX_ITERATIONS=200             # Limite de segurança para loops
DELAY_MS=300                   # Delay entre requests (ms)
BLOQUEIO_MINUTOS=65            # Bloqueio após erro 656/137 (margem de segurança)

# Simulação SEFAZ em Desenvolvimento (OPCIONAL)
ALLOW_SEFAZ_SIMULATION=true    # Permite testar sem SEFAZ real
```

### **3. Migração do Banco de Dados**

Execute o script SQL no **Supabase Dashboard** → **SQL Editor**:

```bash
cat migrations/add_modelo_tipodocumento.sql
```

Ou copie e cole o conteúdo de `migrations/add_modelo_tipodocumento.sql`.

### **4. Executar o Sistema**

```bash
# Instalar dependências
npm install

# Modo desenvolvimento (com hot-reload)
npm run dev

# Modo produção
npm start
```

O sistema estará disponível em `http://localhost:5000`

---

## 📖 **Como Usar**

### **Modo 1: Interface Web (Recomendado)**

1. **Acesse**: `http://localhost:5000`
2. **Registre-se** ou faça **Login**
3. **Cadastre Empresa**:
   - CNPJ
   - Razão Social
   - UF
   - Ambiente (Produção ou Homologação)
   - Upload do certificado A1 (.pfx)
   - Senha do certificado
4. **Sincronizar**:
   - **Play (▶️)**: Baixa XMLs novos
   - **RefreshCw (🔄)**: Alinha NSU (sem baixar XMLs)
5. **Visualizar**:
   - Dashboard com estatísticas
   - Lista de XMLs baixados
   - Logs detalhados

### **Modo 2: HTTP Endpoint (Automação)**

Execute sincronização manual via API:

```bash
# 1. Obter token de autenticação
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"seu@email.com","password":"sua-senha"}'

# Resposta: { "access_token": "JWT_TOKEN_AQUI" }

# 2. Disparar sincronização manual
curl -X POST http://localhost:5000/api/sincronizacoes/executar \
  -H "Authorization: Bearer JWT_TOKEN_AQUI"

# Resposta: { "message": "Sincronização de todas as empresas iniciada" }
```

### **Modo 3: Agendamento Automático (Padrão)**

O sistema executa automaticamente **a cada hora** (configurável via `SYNC_CRON`).

**Para alterar o intervalo:**

```env
# A cada 30 minutos
SYNC_CRON=*/30 * * * *

# Às 3h, 9h, 15h e 21h
SYNC_CRON=0 3,9,15,21 * * *

# A cada 2 horas
SYNC_CRON=0 */2 * * *
```

---

## 🔧 **Configurações Avançadas**

### **Ambientes SEFAZ**

O sistema suporta:
- **Produção**: `https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx`
- **Homologação**: `https://hom1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx`

Configure por empresa na interface web.

### **Schemas Processados**

Conforme **NT 2014.002 §3.3**:

| Schema | Descrição | Quando |
|--------|-----------|--------|
| `nfeProc` | XML completo de NF-e/NFC-e | Destinatário tem direito ao XML completo |
| `resNFe` | Resumo de NF-e/NFC-e | Destinatário só tem direito ao resumo |
| `procEventoNFe` | Eventos (Cancelamento, CCe, Manifestação) | Sempre que houver evento |
| `resEvento` | Resumo de evento | Resumo de evento disponível |

### **Tipos de Eventos**

| Código | Descrição |
|--------|-----------|
| 110110 | Carta de Correção (CCe) |
| 110111 | Cancelamento |
| 210200 | Confirmação da Operação |
| 210210 | Ciência da Operação |
| 210220 | Desconhecimento da Operação |
| 210240 | Operação não Realizada |

---

## 📂 **Estrutura do Projeto**

```
.
├── server/
│   ├── config/
│   │   └── index.ts              # Configuração centralizada
│   ├── sefaz-service.ts          # Cliente SEFAZ NFeDistribuicaoDFe
│   ├── cert-loader.ts            # Gerenciador de certificados A1
│   ├── routes.ts                 # Endpoints da API
│   ├── storage.ts                # Interface de Storage
│   ├── supabase-storage.ts       # Implementação Supabase
│   ├── logger.ts                 # Sistema de logs (console + arquivo)
│   └── auth-middleware.ts        # Autenticação JWT
├── client/
│   └── src/
│       ├── pages/                # Páginas React
│       └── components/           # Componentes reutilizáveis
├── shared/
│   └── schema.ts                 # Schemas TypeScript + Zod
├── migrations/
│   └── add_modelo_tipodocumento.sql  # Migração banco de dados
├── xmls/                         # XMLs baixados (criado automaticamente)
├── logs/                         # Logs em arquivo (criado automaticamente)
└── certificados/                 # Certificados A1 (criado automaticamente)
```

---

## 🐛 **Troubleshooting**

### **Erro 656 (Consumo Indevido)**

**Causa**: NSU desatualizado ou consultas muito frequentes  
**Solução**:
1. Aguarde 1 hora (bloqueio automático)
2. Use "Alinhar NSU" (🔄) após desbloqueio
3. Verifique se há outro sistema (ERP/contador) consultando simultaneamente

### **Erro 137 (Sem Documentos)**

**Normal!** Significa que não há novos documentos naquele momento.  
O sistema bloqueia automaticamente por 1h conforme NT 2014.002.

### **Certificado Inválido**

Verifique:
- Certificado é A1 (.pfx ou .p12)?
- Senha está correta?
- Certificado não está expirado?
- CNPJ do certificado corresponde ao CNPJ cadastrado?

### **Logs em Branco**

Arquivos de log estão em `logs/app-YYYY-MM-DD.log`. Se não existir:
1. Verifique permissões do diretório `logs/`
2. Verifique `LOG_PATH` no `.env`

---

## 🛠️ **Stack Tecnológica**

### Frontend
- React 18 + TypeScript
- Tailwind CSS + Shadcn UI
- React Query (TanStack Query)
- Wouter (roteamento)
- Vite

### Backend
- Node.js + Express + TypeScript
- Supabase (PostgreSQL + Auth)
- node-cron (agendamento)
- fast-xml-parser (processamento XML)
- multer (upload de arquivos)
- node-forge (certificados PKCS12)

### Deploy
- Docker + Docker Compose
- Nginx + Certbot (standalone)
- Traefik + Portainer (alternativo)

---

## 📚 **Referências Oficiais**

- [MOC 7.0 - Manual de Orientação do Contribuinte](https://www.nfe.fazenda.gov.br/portal/listaConteudo.aspx?tipoConteudo=/fBxKhVZPDA=)
- [NT 2014.002 - Web Service NFeDistribuicaoDFe](https://www.nfe.fazenda.gov.br/portal/exibirArquivo.aspx?conteudo=wLVBlKchUb4%3D)
- [Portal Nacional NF-e](https://www.nfe.fazenda.gov.br/)
- [Schemas XSD Oficiais](https://www.nfe.fazenda.gov.br/portal/listaConteudo.aspx?tipoConteudo=BMPFMBoln3w=)

---

## 📄 **Licença**

Este projeto é privado e proprietário.

---

## 💡 **Suporte**

Para dúvidas ou problemas:
1. Verifique os **logs** em `logs/app-YYYY-MM-DD.log`
2. Consulte a aba **Logs** na interface web
3. Verifique a documentação oficial da SEFAZ
4. Ver documentação adicional: `TROUBLESHOOTING-CERTIFICADOS.md`, `DEPLOYMENT.md`

---

**Desenvolvido com conformidade total à legislação fiscal brasileira 🇧🇷**
