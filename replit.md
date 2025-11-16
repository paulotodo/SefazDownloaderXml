# SEFAZ XML Sync - Sistema de Download Automático de XMLs

## Overview
This web application automates the download of XMLs (nfeProc) from SEFAZ, offering hourly synchronization for multiple registered companies. It provides a robust, multi-tenant solution for managing fiscal documents, aiming to streamline compliance and data access for businesses. The project integrates a modern web stack with secure authentication and a reliable system for interacting with government services, promising efficiency and reduced manual effort in fiscal document management.

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
-   **File Storage**: Supabase Storage for secure storage of PFX certificates and XML files.
-   **Certificate Handling**: `node-forge` is used for robust handling and validation of legacy PKCS12 certificates.

### Feature Specifications
-   **Multi-tenant Support**: Data isolation per user via RLS.
-   **Automated Synchronization**: Hourly fetching of XMLs from SEFAZ using `distNSU` (batch mode, up to 50 docs/call).
-   **Advanced Search by Period**: Manual search for specific NSUs using `consNSU` with 20 queries/hour limit (NT 2014.002).
-   **Certificate Management**: Secure upload, storage, and validation of `.pfx` digital certificates, including expiration checks.
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