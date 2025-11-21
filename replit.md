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

### ✅ XML Digital Signature Implementation (cStat 215 FIX)
**Date**: November 21, 2025  
**Status**: COMPLETE - Architect Reviewed and Approved

**Problem Identified**: 
- Manifestation requests were returning cStat 215 ("Rejeição: Falha no Schema XML do lote de evento")
- Root cause: Missing XML digital signature in recipient manifestation events (NT 2020.001 § 6.3 requirement)

**Solution Implemented**:
1. **Refactored `buildSOAPEnvelopeManifestacao`** (`server/sefaz-service.ts` lines 420-471):
   - Generates unsigned evento XML structure
   - Signs XML using `signXmlEvento` with RSA-SHA256 and exclusive canonicalization
   - Extracts signed content with `<Signature>` block (now without ds: prefix)
   - Embeds signed evento into SOAP envelope

2. **Modified `manifestarEvento`** (`server/sefaz-service.ts` lines 1371-1392):
   - Loads PKCS#12 certificate via `loadPKCS12Certificate`
   - Passes privateKey and certificate to `buildSOAPEnvelopeManifestacao` for signing

**Verification**: Architect confirmed implementation is fully compliant with NT 2020.001 specifications, uses correct cryptographic algorithms (RSA-SHA256), and has no security issues.

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