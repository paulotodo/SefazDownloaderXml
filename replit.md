# SEFAZ XML Sync - Sistema de Download Automático de XMLs

## Overview
This web application automates the download of XMLs (nfeProc) from SEFAZ, offering hourly synchronization for multiple registered companies. It provides a robust, multi-tenant solution for managing fiscal documents, aiming to streamline compliance and data access for businesses. The project integrates a modern web stack with secure authentication and a reliable system for interacting with government services, promising efficiency and reduced manual effort in fiscal document management.

## Recent Major Features (November 19, 2025)
### FASE 1.1 - Sistema de Manifestação do Destinatário (NT 2020.001)
- **Feature**: Implementado sistema completo de manifestação do destinatário conforme NT 2020.001
- **Schema Changes**:
  - Nova tabela `manifestacoes` com 18 campos (chaveNFe, tipoEvento, status, dataAutorizacaoNFe, dataManifestacao, prazoLegal, nsuEvento, protocoloEvento, cStat, xMotivo, justificativa, tentativas, ultimoErro, createdAt, updatedAt)
  - Novos campos em `empresas`: `tipoArmazenamento` ("local" | "supabase") e `manifestacaoAutomatica` (boolean)
- **Storage**: 8 métodos CRUD implementados para manifestações:
  - `getManifestacoes`, `getManifestacao`, `getManifestacaoByChave`, `getManifestacoesByEmpresa`
  - `getManifestacoesPendentes`, `createManifestacao`, `updateManifestacao`, `getManifestacoesRecentes`
- **Tipos de Evento**: 210200 (Confirmação), 210210 (Ciência), 210220 (Desconhecimento), 210240 (Não Realizada)
- **Files**: `shared/schema.ts`, `server/storage.ts`, `server/supabase-storage.ts`

### FASE 1.2 - Storage Híbrido (Local + Supabase)
- **Feature**: Implementado storage híbrido configurável por empresa
- **Storage Types**:
  - `"local"`: Filesystem local (./xmls/) - Rápido mas não persistente no Replit
  - `"supabase"`: Supabase Storage - Persistente, escalável e com backup automático
- **Implementation**:
  - Novo serviço `XmlStorageService` com métodos `saveXml`, `getXml`, `existsXml`, `deleteXml`
  - Bucket "xmls" criado automaticamente no Supabase Storage na inicialização
  - Todos os 4 métodos de salvamento modificados (saveNFeProc, saveResNFe, saveProcEvento, saveResEvento)
  - Rota de download `/api/xmls/:id/download` adaptada com backward compatibility
- **Path Normalization**: Caminhos sempre salvos como relativos (ex: "NFe/CNPJ/2025/11/12345.xml")
- **Backward Compatibility**: Suporta caminhos absolutos antigos, relativos e Supabase URLs
- **Files**: `server/xml-storage.ts`, `server/sefaz-service.ts`, `server/routes.ts`, `server/index.ts`

## Recent Critical Fixes (November 17, 2025)
### 6. Correção de Erro de Duplicação de XMLs
- **Problem**: Erro `duplicate key value violates unique constraint "xmls_empresa_id_chave_nfe_key"` em resEvento e procEventoNFe
- **Root Cause**: 
  - Métodos `saveResEvento` e `saveProcEvento` não verificavam duplicatas antes de inserir
  - Race condition possível mesmo com verificação (check-then-insert não é atômico)
  - Constraint única existe no Supabase mas não estava sendo tratada corretamente
- **Solution**: 
  - Implementado tratamento de erro PostgreSQL 23505 (unique violation) em `createXml`
  - Quando detecta duplicata, busca e retorna o XML existente em vez de falhar
  - Removidas verificações redundantes de `saveNFeProc` e `saveResNFe` (melhoria de performance)
- **Behavior**: Sistema agora ignora silenciosamente tentativas de inserir XMLs duplicados
- **Files**: `server/supabase-storage.ts`, `server/sefaz-service.ts`

## Recent Critical Fixes (November 16, 2025)
### 3. Download de XMLs Implementado (Autenticado)
- **Problem**: Botão de download não tinha função onClick e window.location.href não envia headers de autenticação
- **Solution**: Implementado download via fetch com token Bearer, criando blob para download automático
- **Behavior**: Download funciona com autenticação JWT, nome do arquivo = numeroNF.xml
- **Files**: `client/src/pages/xmls.tsx`

### 4. Filtro de XMLs Completos (nfeProc)
- **Problem**: Interface mostrava todos os tipos de documento (nfeProc, resNFe, resEvento, procEventoNFe)
- **Solution**: Filtro automático para exibir apenas `tipoDocumento === "nfeProc"` (XMLs completos)
- **Behavior**: Apenas XMLs completos aparecem na listagem. Resumos (resEvento, resNFe) são salvos no banco mas não exibidos
- **Files**: `client/src/pages/xmls.tsx`

### 5. ~~Filesystem Local (Não Persistente)~~ **[RESOLVIDO em Nov 19]**
- **Status Antigo**: XMLs salvos em `./xmls/` (filesystem local)
- **Limitação**: Arquivos eram perdidos quando servidor reiniciava no Replit
- **Solução**: Implementado storage híbrido (FASE 1.2) - agora configurável por empresa

## Recent Critical Fixes (November 15, 2025)
### 1. XML Parser Configuration (chNFe Precision Loss)
- **Problem**: Parser was converting 44-digit chNFe to `number`, causing precision loss (e.g., `42251149531261...` → `4.2251149531261e+43`)
- **Solution**: Configured `fast-xml-parser` with `parseTagValue: false` to maintain ALL values as strings, preserving complete 44-digit chNFe keys
- **Files**: `server/sefaz-service.ts` (constructor)

### 2. NT 2014.002 §3.11.4 Compliance (cStat 656 Prevention)
- **Problem**: System was triggering cStat=656 (Consumo Indevido) repeatedly by consulting SEFAZ when `ultNSU == maxNSU` without mandatory 1-hour wait
- **Solution**: Implemented automatic 65-minute blocking when `ultNSU == maxNSU` is detected, preventing invalid subsequent requests
- **Behavior**: System now correctly stops querying and waits 1 hour when fully synchronized, as mandated by SEFAZ regulations
- **Files**: `server/sefaz-service.ts` (lines 911-940, 968-974)

## User Preferences
I prefer clear and direct communication. When making changes or suggesting improvements, please explain the "why" behind them, focusing on the benefits and potential impact. I value iterative development and would like to be consulted before any major architectural shifts or significant code refactoring. Please ensure that all suggestions are actionable and provide code examples where appropriate. I prefer a coding style that emphasizes readability and maintainability, utilizing TypeScript's type safety effectively.

## System Architecture

### UI/UX Decisions
The frontend is built with React, TypeScript, Tailwind CSS, and Shadcn UI, ensuring a modern and responsive user experience. Navigation is managed by Wouter, and data fetching/caching is handled by React Query. The design prioritizes clarity and ease of use, with a dashboard for real-time statistics, intuitive interfaces for managing companies and XMLs, and a clear log viewer.

### Technical Implementations
The application uses a modern full-stack approach:
-   **Frontend**: React, TypeScript, Tailwind CSS, Shadcn UI, React Query, Wouter for a dynamic and responsive user interface.
-   **Backend**: Node.js with Express and TypeScript, providing a scalable and maintainable API.
-   **Database**: Supabase PostgreSQL with Row-Level Security (RLS) for secure multi-tenant data isolation.
-   **Authentication**: Supabase Auth with JWT for secure user management, including refresh tokens and protected routes.
-   **Scheduling**: `node-cron` for hourly automatic synchronization tasks.
-   **XML Processing**: `fast-xml-parser` and `pako` (for gzip decompression) handle XML data.
-   **File Storage**: Hybrid storage system - Local filesystem (fast, non-persistent) or Supabase Storage (persistent, scalable) configurable per company. Automatic bucket creation and path normalization.
-   **Certificate Handling**: `node-forge` is used for robust handling and validation of legacy PKCS12 certificates.

### Feature Specifications
-   **Multi-tenant Support**: Data isolation per user via RLS.
-   **Automated Synchronization**: Hourly fetching of XMLs from SEFAZ using `distNSU` (batch mode, up to 50 docs/call).
-   **Advanced Search by Period**: Manual search for specific NSUs using `consNSU` with 20 queries/hour limit (NT 2014.002).
-   **Certificate Management**: Secure upload, storage, and validation of `.pfx` digital certificates, including expiration checks.
-   **Manifestação do Destinatário (NT 2020.001)**: Complete manifestation system with 4 event types (210200 Confirmação, 210210 Ciência, 210220 Desconhecimento, 210240 Não Realizada), automatic tracking of legal deadlines (10 days for awareness, 180 days for conclusive events), and configurable automatic manifestation.
-   **Hybrid Storage**: Configurable XML storage per company - local filesystem (fast, ephemeral) or Supabase Storage (persistent, backed up). Automatic path normalization and backward compatibility with legacy paths.
-   **NSU Reconciliation**: Automatic discovery and alignment of the last NSU (Número Sequencial Único) with SEFAZ, adhering strictly to NT 2014.002 to prevent cStat=656 errors.
-   **Comprehensive Logging**: Detailed logs for all synchronization activities, filterable by level.
-   **API Endpoints**: Dedicated routes for dashboard metrics, company management (CRUD), XML access, logs, manual synchronization triggers, and advanced period search.
-   **Automated Blocking**: Implements a persistent blocking mechanism for companies that trigger cStat=137 or cStat=656, preventing repeated queries until the cooldown period expires, as per SEFAZ guidelines (60 or 65 minutes).

### System Design Choices
-   **Secure Authentication**: JWT-based authentication with server-side validation and automatic token refresh.
-   **Data Isolation**: Strict multi-tenant data separation enforced by Supabase RLS policies and user-specific queries.
-   **Robust SEFAZ Integration**: Utilizes PKCS12 certificates for SOAP communication, handles various SEFAZ response codes, supports gzip decompression, and conforms to NT 2014.002 for NSU management to avoid "improper use" errors (cStat=656).
-   **Scalable Storage**: XMLs are saved in a structured path (`xmls/CNPJ/Ano/Mês/numeroNF.xml`) within Supabase Storage.
-   **Deployment**: Optimized for Docker with `docker-compose`, Nginx for reverse proxy and SSL, and Certbot for automated Let's Encrypt certificates.

## External Dependencies
-   **Supabase**: Provides PostgreSQL database, Authentication (Supabase Auth), and Storage services.
-   **SEFAZ Web Service (NFeDistribuicaoDFe)**: External government service for distributing fiscal documents, accessed via SOAP.
-   **node-cron**: For scheduling recurring tasks.
-   **fast-xml-parser**: For efficient XML parsing.
-   **pako**: For decompressing gzipped data from SEFAZ.
-   **multer**: For handling multipart form data, specifically certificate uploads.
-   **node-forge**: Used for parsing and validating PKCS12 digital certificates.
-   **Let's Encrypt**: For automated SSL certificate provisioning via Certbot.