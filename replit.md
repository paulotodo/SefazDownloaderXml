# SEFAZ XML Sync - Sistema de Download Automático de XMLs

## Visão Geral
Aplicativo web para download automático de XMLs (nfeProc) da SEFAZ com sincronização a cada hora para múltiplas empresas cadastradas.

## Tecnologias
- **Frontend**: React, TypeScript, Tailwind CSS, Shadcn UI, React Query, Wouter
- **Backend**: Node.js, Express, TypeScript
- **Banco de Dados**: Supabase PostgreSQL com Row-Level Security (RLS)
- **Autenticação**: Supabase Auth com JWT
- **Agendamento**: node-cron (execução a cada 1 hora)
- **Processamento**: fast-xml-parser, pako (gzip)
- **Upload**: multer (certificados .pfx)
- **Storage**: SupabaseStorage (substituiu MemStorage)

## Arquitetura

### Frontend
- **Autenticação** (`client/src/contexts/AuthContext.tsx`):
  - Context Provider para gerenciamento global de autenticação
  - Persistência de sessão no localStorage (com proteção SSR)
  - Auto-refresh de tokens expirados
  - Injeção automática de Bearer token em requests (via queryClient)
  - Rotas protegidas e públicas com redirecionamento
- **Dashboard**: Estatísticas em tempo real (total de empresas, XMLs hoje, última sincronização)
- **Empresas**: Lista com busca, cadastro com upload de certificado, exclusão e sincronização manual
- **XMLs**: Navegador em árvore (CNPJ > Ano > Mês > Arquivos)
- **Logs**: Visualizador filtrado por nível (info/warning/error)
- **Configurações**: Tabs para geral, agendamento e notificações
- **Sidebar**: Navegação principal com ícones lucide-react

### Backend
- **Autenticação** (`server/auth-routes.ts` e `server/auth-middleware.ts`):
  - Registro e login via Supabase Auth
  - Middleware JWT protegendo todas as rotas da API
  - Validação server-side com `supabaseAdmin.auth.getUser(token)`
  - Refresh de tokens automático
  - Isolamento de dados por usuário
- **Storage** (`server/supabase-storage.ts`): 
  - Implementação IStorage com PostgreSQL via Supabase
  - Funções de parse (snake_case → camelCase)
  - Todas as queries filtradas por userId para isolamento multi-tenant
  - Service role key para cron bypass RLS
- **SEFAZ Service** (`server/sefaz-service.ts`): 
  - Integração SOAP com NFeDistribuicaoDFe
  - Autenticação com certificados PKCS12
  - Controle de NSU por empresa
  - Descompactação gzip/base64
  - Salvamento organizado: `xmls/CNPJ/Ano/Mês/numeroNF.xml`
- **Routes** (`server/routes.ts`):
  - `/api/dashboard/*`: Estatísticas e feeds recentes
  - `/api/empresas`: CRUD com upload multipart
  - `/api/xmls`: Listagem e download
  - `/api/logs`: Logs filtráveis
  - `/api/sincronizacoes`: Execução manual
  - Agendamento: `cron.schedule("0 * * * *")` - a cada hora

### Schema (`shared/schema.ts`)
- **profiles**: id (UUID), email, nomeCompleto, createdAt, updatedAt (extends auth.users)
- **empresas**: id, userId (FK), cnpj, razaoSocial, uf, ambiente, certificadoPath, certificadoSenha, ativo, ultimoNSU, createdAt, updatedAt
- **sincronizacoes**: id, userId (FK), empresaId (FK), dataInicio, dataFim, status, nsuInicial, nsuFinal, xmlsBaixados, mensagemErro, createdAt
- **xmls**: id, userId (FK), empresaId (FK), sincronizacaoId (FK), chaveNFe, numeroNF, dataEmissao, caminhoArquivo, tamanhoBytes, createdAt
- **logs**: id, userId (FK), empresaId (FK), sincronizacaoId (FK), nivel, mensagem, detalhes, timestamp

## Fluxo de Sincronização
1. Cron executa `sefazService.sincronizarTodasEmpresas()` a cada hora
2. Para cada empresa ativa:
   - Cria registro de sincronização com status "em_andamento"
   - Constrói envelope SOAP com CNPJ, UF, ambiente e NSU atual
   - Chama serviço SEFAZ com certificado PKCS12
   - Processa resposta: descompacta docZips, filtra nfeProc
   - Salva XMLs na estrutura de pastas
   - Atualiza NSU da empresa
   - Registra logs de info/warning/error
   - Finaliza sincronização com status "concluida" ou "erro"

## Segurança
- **Autenticação JWT**: Tokens validados server-side com service role key
- **Isolamento Multi-Tenant**: Row-Level Security (RLS) no Supabase para separação de dados por usuário
- **Proteção de Rotas**: Middleware `authenticateUser` em todas as rotas da API
- **Service Role para Cron**: Sincronizações automáticas usam service role key para bypass RLS
- Certificados .pfx armazenados em `./certificados/`
- Senhas de certificados criptografadas (implementar hash em produção)
- Validação com Zod em todas as entradas
- HTTPS obrigatório para SEFAZ
- Confirmação modal para exclusão de empresas

### Configuração Supabase

#### Configurações Obrigatórias:

**OPÇÃO A - Sem Confirmação de Email (Recomendado para apps internos):**
1. Acesse: Supabase Dashboard > Authentication > Providers > Email
2. Desabilite: "Confirm email" 
3. **Motivo**: Sistema interno onde validação ocorre via certificado digital
4. **Resultado**: Login imediato após registro

**OPÇÃO B - Com Confirmação de Email (Se exigido pela organização):**
1. Acesse: Supabase Dashboard > Authentication > URL Configuration
2. Configure "Site URL" como: `https://seu-dominio.replit.app` (ou seu domínio customizado)
3. Configure "Redirect URLs" adicionando: `https://seu-dominio.replit.app/auth/confirm`
4. **Resultado**: Usuário recebe email → clica no link → é redirecionado para /auth/confirm → login automático

**IMPORTANTE**: Se escolher Opção B, certifique-se de que:
- A URL de callback `/auth/confirm` está implementada (já incluída no código)
- O domínio configurado no Supabase corresponde exatamente ao domínio do seu app
- Em desenvolvimento local, use: `http://localhost:5000/auth/confirm`

#### Secrets Necessárias:
- **Anon Key**: Usado para operações do usuário (login, register, refresh)
- **Service Role Key**: Usado para validação server-side e cron jobs

#### Segurança:
- **RLS Policies**: Implementadas em todas as tabelas filtrando por userId
- **Nota**: Supabase pode bloquear emails de domínios de teste (example.com) - use domínios reais para testes

## Deploy
- Configurar variáveis de ambiente: 
  - `SUPABASE_URL`: URL do projeto Supabase
  - `SUPABASE_ANON_KEY`: Anon key para operações do usuário
  - `SUPABASE_SERVICE_ROLE_KEY`: Service role key para server-side e cron
  - `SESSION_SECRET`: Secret para sessões Express
  - `XML_DEST_PATH`: Caminho para salvar XMLs
- Upload inicial de certificados válidos
- Garantir diretórios `./certificados` e `./xmls` com permissões adequadas
- Executar schema SQL no Supabase (`supabase-schema.sql`)
- Configurar RLS policies no Supabase
- Em produção: migrar certificados para Supabase Storage

## Melhorias Futuras
- Notificações por email quando novos XMLs forem baixados
- Exportação de relatórios em PDF/Excel
- Backup automático para S3/Google Drive (ou Supabase Storage)
- Dashboard com gráficos de evolução
- Filtros avançados por período de emissão
- Retry exponencial com backoff para SEFAZ
- Rate limiting para proteção da API
- Migrar certificados .pfx para Supabase Storage
- Implementar 2FA (Two-Factor Authentication)
- Logs de auditoria para ações críticas

## Status do Projeto
✅ **Sistema 100% funcional** com autenticação multi-usuário completa:
- ✅ Registro e login via Supabase Auth (JWT)
- ✅ Email confirmation flow implementado (opcional)
- ✅ Auto-login após confirmação de email
- ✅ Persistência de sessão com auto-refresh
- ✅ Row-Level Security (RLS) para isolamento multi-tenant
- ✅ Error handling robusto com mensagens claras
- ✅ Rate limiting detection
- ✅ Limpeza de tokens sensíveis da URL

## Última Atualização
13 de novembro de 2025
