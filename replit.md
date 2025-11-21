# SEFAZ XML Sync - Sistema de Download Automático de XMLs

## ⚠️ CRITICAL DATABASE REQUIREMENT
**THIS SYSTEM USES SUPABASE PRODUCTION DATABASE EXCLUSIVELY - NEVER LOCAL DATABASE**
- All database operations target Supabase Production
- All schema changes are applied directly in Supabase Dashboard SQL Editor
- All queries and storage operations use Supabase client
- Development/local database tools are NOT used
- This is a non-negotiable architectural decision

## Overview
This web application automates the download of XMLs (nfeProc) from SEFAZ, offering hourly synchronization for multiple registered companies. It provides a robust, multi-tenant solution for managing fiscal documents, aiming to streamline compliance and data access for businesses, reducing manual effort. Key features include automated manifestation of recipient events, hybrid storage options, and comprehensive handling of SEFAZ regulations, promising efficiency in fiscal document management. The project's ambition is to provide a reliable and efficient system for fiscal document management, reducing manual effort and ensuring compliance for businesses.

## Recent Changes (November 2024)

### 🔧 PENDING: Apply Rate Limiting Migrations in Supabase Production
**Date**: November 21, 2025  
**Status**: **⚠️ ACTION REQUIRED - MIGRATIONS NOT YET APPLIED**

**Critical Issue**: 
- The application is falsely blocking all manifestations with "Rate limit excedido" because the `sefaz_rate_limit` table and RPC functions don't exist
- This prevents testing of the recent cStat 404 fix (namespace prefix removal)

**Required Actions**:
1. **Open Supabase Dashboard** → SQL Editor
2. **Execute `supabase-migration-rate-limit-status.sql`** (creates `sefaz_rate_limit` table + RPC functions)
3. **Verify execution**: Run `SELECT * FROM sefaz_rate_limit LIMIT 5;` (should return empty table, not error)
4. **Test manifestation**: System will now properly enforce 20 queries/hour limit instead of blocking everything

**Files to Apply**:
- `supabase-migration-rate-limit-status.sql` - Main rate limiting infrastructure (REQUIRED)
- `supabase-migration-rate-limits.sql` - Alternative implementation (optional, for reference)

---

### ✅ XML Digital Signature - Namespace Prefix Fix (cStat 404 FIX)
**Date**: November 21, 2025  
**Status**: IMPLEMENTED - Pending Test (blocked by missing migrations above)

**Problem Identified**: 
- Manifestation requests returning cStat 404 ("Rejeição: Uso de prefixo de namespace nao permitido")
- Root cause: SEFAZ Ambiente Nacional rejects XML signatures with `ds:` namespace prefixes (`<ds:Signature>`)

**Solution Implemented**:
1. **Modified `signXmlEvento`** (`server/sefaz-service.ts` lines 77-114):
   - Changed `sig.computeSignature()` to use `prefix: ''` (empty string) instead of `prefix: 'ds'`
   - This generates `<Signature>`, `<SignedInfo>`, `<SignatureValue>` **without** `ds:` prefixes
   - Complies with SEFAZ Ambiente Nacional requirements per web research findings

**Verification**: Cannot test yet due to rate limiting blocking all manifestations. After applying migrations above, expect cStat 135/573 (success) or 422/655 (other validation errors).

---

### ✅ XML Digital Signature - Algorithm Correction (cStat 225 FIX)
**Date**: November 21, 2025  
**Status**: IMPLEMENTED - Pending Validation

**Problem Identified**: 
- Manifestation requests returning cStat 225 ("Rejeição: Falha no Schema XML do lote de NFe")
- Root cause: **SEFAZ XSD `xmldsig-core-schema_v1.01.xsd` MANDATES classic algorithms** (SHA-1, C14N), rejecting modern algorithms (SHA-256, Exclusive C14N)
- Analysis confirmed signature structure was correct, but algorithm URIs were non-compliant with SEFAZ schema

**Solution Implemented**:
1. **Corrected `signXmlEvento`** (`server/sefaz-service.ts` lines 80-124):
   - **SignatureMethod**: `rsa-sha256` → `rsa-sha1` ✅
   - **CanonicalizationMethod**: `xml-exc-c14n` → `xml-c14n-20010315` (classic C14N) ✅
   - **DigestMethod**: `sha256` → `sha1` ✅
   - **Transform[1]**: `xml-exc-c14n` → `xml-c14n-20010315` (classic C14N) ✅
   - **Maintained**: `prefix: ''` to avoid cStat 404 (namespace prefix rejection)

**Technical Justification**:
- SEFAZ NF-e uses fixed XSD schema that **only accepts** these specific algorithm URIs
- SHA-1 usage is **mandated by SEFAZ compliance**, not a security vulnerability in this context
- All modern cryptographic libraries support legacy SHA-1 for backward compatibility requirements

**Verification**: Awaiting next manifestation cycle to confirm cStat changes from 225 to 135/573 (success)

---

### ✅ Retry Infinito para XMLs com Erro (INFINITE RETRY FIX)
**Date**: November 21, 2025  
**Status**: ✅ IMPLEMENTED & APPROVED

**Problem Identified**: 
- XMLs que falhavam múltiplas vezes ficavam marcados como `status_download="erro"` permanentemente
- Sistema limitava a 2 tentativas (`MAX_TENTATIVAS = 2`)
- XMLs com erro definitivo não eram retentados automaticamente nas próximas sincronizações

**Solution Implemented**:

**1. Removido Limite de Tentativas** (`server/xml-download-service.ts`):
   - `MAX_TENTATIVAS` aumentado de 2 → 999 (equivalente a infinito)
   - Removido check que marcava erro permanente após limite (linhas 270-275)
   - Catch block sempre mantém `status_download="pendente"` ao invés de "erro" (linhas 322-340)

**2. Reset Automático de XMLs com Erro** (linhas 181-198):
   - Detecta `statusDownload === "erro"` ao processar
   - Reseta para `status_download="pendente"`, `tentativasDownload=0`, `erroDownload=null`
   - **CRÍTICO**: Cálculo de tentativas movido para APÓS reset (evita uso de valor antigo)

**3. Query Otimizada** (`server/supabase-storage.ts` linhas 537-556):
   - `getXmlsComErroDownload` agora busca apenas `status_download="erro"` (sem filtro de tentativas)
   - Removido `.gt("tentativas_download", 0)` que excluía XMLs resetados
   - XMLs com `status_download="pendente"` processados por `getXmlsPendentesDownload`

**4. Manifestação com Retry Infinito** (linhas 207-208):
   - Removido limite de tentativas de manifestação
   - Sistema sempre tenta manifestar, independente de falhas anteriores

**Fluxo Garantido:**
1. Cron a cada 5 min busca XMLs com `status="pendente"` OU `status="erro"`
2. XMLs com erro são resetados para `pendente` com `tentativasDownload=0`
3. Tenta manifestar (sem limite)
4. Tenta download (sem limite)
5. Se falhar, mantém como `pendente` (não marca erro)
6. Rate limit (20/hora) é única proteção - mas não desiste permanentemente

**Benefits:**
✅ Retry infinito verdadeiro - XMLs nunca são abandonados
✅ Rate limit respeitado (evita cStat 656)
✅ Manifestação automática sempre retentada
✅ Nenhum XML fica órfão no sistema
✅ Logs registram tentativas para debugging

---

## User Preferences
I prefer clear and direct communication. When making changes or suggesting improvements, please explain the "why" behind them, focusing on the benefits and potential impact. I value iterative development and would like to be consulted before any major architectural shifts or significant code refactoring. Please ensure that all suggestions are actionable and provide code examples where appropriate. I prefer a coding style that emphasizes readability and maintainability, utilizing TypeScript's type safety effectively.

## System Architecture

### UI/UX Decisions
The frontend is built with React, TypeScript, Tailwind CSS, and Shadcn UI, ensuring a modern and responsive user experience. Navigation is managed by Wouter, and data fetching/caching is handled by React Query. The design prioritizes clarity and ease of use, with a dashboard for real-time statistics, intuitive interfaces for managing companies and XMLs, and a clear log viewer. Visual badges indicate the status of XML manifestations and download progress.

### Technical Implementations
The application uses a modern full-stack approach:
-   **Frontend**: React, TypeScript, Tailwind CSS, Shadcn UI, React Query, Wouter.
-   **Backend**: Node.js with Express and TypeScript.
-   **Database**: Supabase PostgreSQL with Row-Level Security (RLS).
-   **Authentication**: Supabase Auth with JWT.
-   **Scheduling**: `node-cron` for hourly synchronization and download processing.
-   **XML Processing**: `fast-xml-parser` and `pako`.
-   **File Storage**: Hybrid storage system configurable per company, supporting local filesystem or Supabase Storage, with automatic bucket creation and path normalization.
-   **Certificate Handling**: `node-forge` for PKCS12 certificate validation.

### Feature Specifications
-   **Multi-tenant Support**: Data isolation per user via RLS.
-   **Automated XML Download**: Hourly fetching of XMLs from SEFAZ, supporting `distNSU` and `consNSU` for full XML retrieval from summaries (resNFe to nfeProc).
-   **Recipient Manifestation (NT 2020.001)**: Complete system for recipient manifestation with 4 event types, automatic tracking of legal deadlines, and configurable automatic manifestation with recipient validation.
-   **Ordered Processing Flow (Nov 2024)**: Download service now follows strict order: (1) Check if XML is manifested, (2) If not manifested, manifest first (Ciência 210210), (3) Only then attempt XML download, (4) All operations respect 20 queries/hour rate limit per company.
-   **Hybrid Storage**: Configurable XML storage per company (local or Supabase Storage).
-   **NSU Reconciliation**: Automatic discovery and alignment of the last NSU with SEFAZ, adhering to NT 2014.002 to prevent cStat=656 errors.
-   **Comprehensive Logging**: Detailed logs for all synchronization activities.
-   **API Endpoints**: Dedicated routes for dashboard metrics, company management, XML access, logs, manual synchronization, manifestation triggers, and configuration management.
-   **Robust XML Handling**: Configures `fast-xml-parser` to maintain all values as strings, preserving 44-digit `chNFe` keys.
-   **Duplicate XML Handling**: Gracefully handles attempts to insert duplicate XMLs by returning the existing record.
-   **User Configuration Management**: Persisted user-specific settings for synchronization intervals, automatic processes, retries, timeouts, and notifications.
-   **Company Management**: Full CRUD operations for companies, including certificate upload and configuration of automatic manifestation and storage type.
-   **Automatic XML Download**: Service for processing pending XML downloads, including retry logic, batch processing, and PostgreSQL-based distributed locks. Now includes pre-download manifestation verification.

### System Design Choices
-   **CRITICAL - Database Architecture**: 
    -   **SUPABASE PRODUCTION ONLY**: All database operations target Supabase Production database
    -   **NO LOCAL DATABASE**: Development/local PostgreSQL is NOT used
    -   **Schema Management**: All migrations are SQL scripts executed directly in Supabase Dashboard SQL Editor
    -   **No Drizzle Direct Connections**: Application uses Supabase client exclusively, never direct Drizzle connections
-   **Secure Authentication**: JWT-based authentication with server-side validation and automatic token refresh.
-   **Data Isolation**: Strict multi-tenant data separation enforced by Supabase RLS.
-   **Robust SEFAZ Integration**: Utilizes PKCS12 certificates for SOAP communication, handles various SEFAZ response codes, supports gzip decompression, and conforms to NT 2014.002 for NSU management.
-   **Scalable Storage**: XMLs are saved in a structured path (`xmls/CNPJ/Ano/Mês/numeroNF.xml`).
-   **Distributed Locks**: Implemented using PostgreSQL functions for atomic locking in multi-instance environments, particularly for XML download control.
-   **Deployment**: Optimized for Docker with `docker-compose`, Nginx, and Certbot.

## External Dependencies
-   **Supabase**: PostgreSQL database, Authentication (Supabase Auth), and Storage services.
-   **SEFAZ Web Service (NFeDistribuicaoDFe, NFeConsultaProtocolo, NFeRecepcaoEvento)**: External government services for distributing fiscal documents, consulting protocols, and receiving events, accessed via SOAP.
-   **node-cron**: For scheduling recurring tasks.
-   **fast-xml-parser**: For efficient XML parsing.
-   **pako**: For decompressing gzipped data from SEFAZ.
-   **multer**: For handling multipart form data (certificate uploads).
-   **node-forge**: Used for parsing and validating PKCS12 digital certificates.
-   **Let's Encrypt**: For automated SSL certificate provisioning via Certbot.