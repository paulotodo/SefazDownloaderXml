# SEFAZ XML Sync - Sistema de Download Automático de XMLs

## Overview
This web application automates the download of XMLs (nfeProc) from SEFAZ, offering hourly synchronization for multiple registered companies. It provides a robust, multi-tenant solution for managing fiscal documents, aiming to streamline compliance and data access for businesses, reducing manual effort. Key features include automated manifestation of recipient events, hybrid storage options, and comprehensive handling of SEFAZ regulations, promising efficiency in fiscal document management.

## Recent Major Features (November 19, 2025)

### FASE 1.1 - Sistema de Manifestação do Destinatário (NT 2020.001)
- **Feature**: Sistema completo de manifestação do destinatário conforme NT 2020.001
- **Schema Changes**:
  - Nova tabela `manifestacoes` com 18 campos (chaveNFe, tipoEvento, status, dataAutorizacaoNFe, dataManifestacao, prazoLegal, nsuEvento, protocoloEvento, cStat, xMotivo, justificativa, tentativas, ultimoErro, createdAt, updatedAt)
  - Novos campos em `empresas`: `tipoArmazenamento` ("local" | "supabase") e `manifestacaoAutomatica` (boolean)
- **Storage**: 8 métodos CRUD implementados para manifestações
- **Tipos de Evento**: 210200 (Confirmação), 210210 (Ciência), 210220 (Desconhecimento), 210240 (Não Realizada)
- **Files**: `shared/schema.ts`, `server/storage.ts`, `server/supabase-storage.ts`

### FASE 1.2 - Storage Híbrido (Local + Supabase)
- **Feature**: Storage híbrido configurável por empresa
- **Storage Types**: "local" (filesystem) ou "supabase" (Supabase Storage)
- **Implementation**: Novo serviço `XmlStorageService` com métodos saveXml, getXml, existsXml, deleteXml. Bucket "xmls" criado automaticamente
- **Path Normalization**: Caminhos sempre salvos como relativos (ex: "NFe/CNPJ/2025/11/12345.xml")
- **Files**: `server/xml-storage.ts`, `server/sefaz-service.ts`, `server/routes.ts`, `server/index.ts`

### FASE 2 - Consulta por Chave de Acesso (NT 2014.002 §3.6)
- **Feature**: Método `consultarChave` para buscar XML completo via chave de acesso (44 dígitos)
- **SOAP Envelope**: `buildSOAPEnvelopeConsChNFe` para serviço NFeConsultaProtocolo v4.00
- **Tratamento de cStat**: 100 (autorizada), 101 (cancelada), 217 (não consta), 562 (sem permissão)
- **Persistência**: Salva nfeProc ou resNFe dependendo do cStat
- **Files**: `server/sefaz-service.ts`

### FASE 3 - Manifestação do Destinatário - Backend Completo

#### FASE 3.1 - SOAP Envelope de Manifestação
- **Feature**: `buildSOAPEnvelopeManifestacao` para NFeRecepcaoEvento v4.00
- **Timestamp dhEvento**: Usa `Intl.DateTimeFormat` com `timeZoneName:'shortOffset'` para offset dinâmico (America/Sao_Paulo), independente de timezone do servidor e DST
- **Helper getTipoEventoDescricao**: Converte código de evento em descrição legível
- **Validações**: Justificativa obrigatória (min 15 chars) para evento 210240
- **Files**: `server/sefaz-service.ts`

#### FASE 3.2 - Execução de Manifestação
- **Feature**: `callRecepcaoEvento` e `manifestarEvento` para envio de eventos à SEFAZ
- **Método callRecepcaoEvento**: HTTPS POST para AN, parsing de resposta, tratamento de cStat (135=sucesso, 573=duplicata)
- **Método manifestarEvento**: Orquestra todo fluxo - valida inputs, chama SEFAZ, persiste via `createManifestacao`
- **Tipos de Evento**: 210200 (Confirmação), 210210 (Ciência), 210220 (Desconhecimento), 210240 (Não Realizada)
- **Persistência**: Tabela `manifestacoes` com status, nsuEvento, protocoloEvento, cStat, xMotivo
- **Files**: `server/sefaz-service.ts`

### FASE 4 - Manifestação Automática Integrada
- **Feature**: Manifestação automática de Ciência (210210) integrada no fluxo de sincronização
- **Trigger**: Quando `empresa.manifestacaoAutomatica === true` e resNFe é recebido
- **Validação Crítica**: Verifica se empresa é DESTINATÁRIO (compara CNPJ/CPF do resNFe) antes de manifestar
- **Prevenção de Duplicatas**: Verifica `getManifestacaoByChave` antes de manifestar
- **Tratamento Graceful**: Erros NÃO interrompem sincronização (log warning)
- **Integration**: Adicionado no método `saveResNFe` após persistência do resumo
- **Files**: `server/sefaz-service.ts`

### FASE 5 - API e Interface de Manifestações

#### FASE 5.1 - Endpoints REST
- **GET /api/manifestacoes**: Lista manifestações (query params: empresaId, status)
- **POST /api/manifestacoes/manifestar**: Dispara manifestação manual
  - Body: empresaId, chaveNFe, tipoEvento, justificativa
  - Validações: campos obrigatórios, tipoEvento válido, justificativa para 210240
- **Files**: `server/routes.ts`

#### FASE 5.2 - Interface Read-Only
- **Feature**: Badge visual de status de manifestação na página de XMLs
- **Query**: Busca manifestações via GET /api/manifestacoes
- **Map Lookup**: manifestacoesMap (chaveNFe → Manifestacao) para performance
- **Badges Visuais** (theme-safe):
  - Pendente: Badge outline + Clock icon
  - Manifestado: Badge default + CheckCircle2 icon
  - Erro: Badge destructive + XCircle icon
- **Files**: `client/src/pages/xmls.tsx`

## User Preferences
I prefer clear and direct communication. When making changes or suggesting improvements, please explain the "why" behind them, focusing on the benefits and potential impact. I value iterative development and would like to be consulted before any major architectural shifts or significant code refactoring. Please ensure that all suggestions are actionable and provide code examples where appropriate. I prefer a coding style that emphasizes readability and maintainability, utilizing TypeScript's type safety effectively.

## System Architecture

### UI/UX Decisions
The frontend is built with React, TypeScript, Tailwind CSS, and Shadcn UI, ensuring a modern and responsive user experience. Navigation is managed by Wouter, and data fetching/caching is handled by React Query. The design prioritizes clarity and ease of use, with a dashboard for real-time statistics, intuitive interfaces for managing companies and XMLs, and a clear log viewer. Visual badges indicate the status of XML manifestations.

### Technical Implementations
The application uses a modern full-stack approach:
-   **Frontend**: React, TypeScript, Tailwind CSS, Shadcn UI, React Query, Wouter.
-   **Backend**: Node.js with Express and TypeScript.
-   **Database**: Supabase PostgreSQL with Row-Level Security (RLS).
-   **Authentication**: Supabase Auth with JWT.
-   **Scheduling**: `node-cron` for hourly synchronization.
-   **XML Processing**: `fast-xml-parser` and `pako`.
-   **File Storage**: Hybrid storage system configurable per company, supporting local filesystem or Supabase Storage, with automatic bucket creation and path normalization.
-   **Certificate Handling**: `node-forge` for PKCS12 certificate validation.

### Feature Specifications
-   **Multi-tenant Support**: Data isolation per user via RLS.
-   **Automated Synchronization**: Hourly fetching of XMLs from SEFAZ using `distNSU` (batch mode).
-   **Advanced Search**: Manual search for specific NSUs using `consNSU`.
-   **Certificate Management**: Secure upload, storage, and validation of `.pfx` digital certificates.
-   **Manifestação do Destinatário (NT 2020.001)**: Complete system for recipient manifestation with 4 event types, automatic tracking of legal deadlines, and configurable automatic manifestation, including logic to prevent invalid manifestations by verifying the recipient.
-   **Hybrid Storage**: Configurable XML storage per company (local or Supabase Storage).
-   **NSU Reconciliation**: Automatic discovery and alignment of the last NSU with SEFAZ, adhering to NT 2014.002 to prevent cStat=656 errors by implementing automatic 65-minute blocking.
-   **Comprehensive Logging**: Detailed logs for all synchronization activities.
-   **API Endpoints**: Dedicated routes for dashboard metrics, company management, XML access, logs, manual synchronization, and manifestation triggers.
-   **Robust XML Handling**: Configures `fast-xml-parser` to maintain all values as strings, preserving 44-digit `chNFe` keys.
-   **Duplicate XML Handling**: Gracefully handles attempts to insert duplicate XMLs by returning the existing record, preventing unique constraint violations.

### System Design Choices
-   **Secure Authentication**: JWT-based authentication with server-side validation and automatic token refresh.
-   **Data Isolation**: Strict multi-tenant data separation enforced by Supabase RLS.
-   **Robust SEFAZ Integration**: Utilizes PKCS12 certificates for SOAP communication, handles various SEFAZ response codes, supports gzip decompression, and conforms to NT 2014.002 for NSU management.
-   **Scalable Storage**: XMLs are saved in a structured path (`xmls/CNPJ/Ano/Mês/numeroNF.xml`).
-   **Deployment**: Optimized for Docker with `docker-compose`, Nginx, and Certbot.

## External Dependencies
-   **Supabase**: PostgreSQL database, Authentication (Supabase Auth), and Storage services.
-   **SEFAZ Web Service (NFeDistribuicaoDFe)**: External government service for distributing fiscal documents, accessed via SOAP.
-   **node-cron**: For scheduling recurring tasks.
-   **fast-xml-parser**: For efficient XML parsing.
-   **pako**: For decompressing gzipped data from SEFAZ.
-   **multer**: For handling multipart form data (certificate uploads).
-   **node-forge**: Used for parsing and validating PKCS12 digital certificates.
-   **Let's Encrypt**: For automated SSL certificate provisioning via Certbot.