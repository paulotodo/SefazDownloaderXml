# SEFAZ XML Sync - Sistema de Download Automático de XMLs

## Overview
This web application automates the download of XMLs (nfeProc) from SEFAZ, offering hourly synchronization for multiple registered companies. It provides a robust, multi-tenant solution for managing fiscal documents, aiming to streamline compliance and data access for businesses. The project integrates a modern web stack with secure authentication and a reliable system for interacting with government services, promising efficiency and reduced manual effort in fiscal document management.

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
-   **Certificate Handling**: `node-forge` is used for robust handling and validation of legacy PKCS12 certificates, ensuring compatibility and security.

### Feature Specifications
-   **Multi-tenant Support**: Data isolation per user via RLS.
-   **Automated Synchronization**: Hourly fetching of XMLs from SEFAZ.
-   **Certificate Management**: Secure upload, storage, and validation of `.pfx` digital certificates, including expiration checks and clear error messages.
-   **NSU Reconciliation**: Automatic discovery and alignment of the last NSU (Número Sequencial Único) with SEFAZ.
-   **Comprehensive Logging**: Detailed logs for all synchronization activities, filterable by level.
-   **API Endpoints**: Dedicated routes for dashboard metrics, company management (CRUD), XML access, logs, and manual synchronization triggers.

### System Design Choices
-   **Secure Authentication**: JWT-based authentication with server-side validation and automatic token refresh.
-   **Data Isolation**: Strict multi-tenant data separation enforced by Supabase RLS policies and user-specific queries.
-   **Robust SEFAZ Integration**: Utilizes PKCS12 certificates for SOAP communication, handles various SEFAZ response codes, and supports gzip decompression.
-   **Scalable Storage**: XMLs are saved in a structured path (`xmls/CNPJ/Ano/Mês/numeroNF.xml`) within Supabase Storage.
-   **Deployment**: Optimized for Docker with `docker-compose`, Nginx for reverse proxy and SSL, and Certbot for automated Let's Encrypt certificates.

## External Dependencies
-   **Supabase**: Provides PostgreSQL database, Authentication (Supabase Auth), and Storage services.
-   **SEFAZ Web Service (NFeDistribuicaoDFe)**: External government service for distributing fiscal documents, accessed via SOAP.
-   **node-cron**: For scheduling recurring tasks.
-   **fast-xml-parser**: For efficient XML parsing.
-   **pako**: For decompressing gzipped data from SEFAZ.
-   **multer**: For handling multipart form data, specifically certificate uploads.
-   **node-forge**: Used for parsing and validating PKCS12 digital certificates, especially legacy formats.
-   **Let's Encrypt**: For automated SSL certificate provisioning via Certbot.

## Recent Changes

### ✅ Adequação à NT 2014.002 da SEFAZ (14/11/2025) - CRITICAL
**Objetivo:** Adequar todas as consultas à SEFAZ conforme Nota Técnica 2014.002 para evitar rejeição cStat=656 (uso indevido do serviço).

**Mudanças implementadas:**

#### 1. Novo método `buildSOAPEnvelopeDistNSU` (`server/sefaz-service.ts`)
- **ANTES**: Usava `<consNSU><NSU>` (método legado incompatível com NT 2014.002)
- **AGORA**: Usa `<distNSU><ultNSU>` (método oficial conforme documentação SEFAZ)
- **Benefício**: Evita rejeição cStat=656 e segue 100% as regras oficiais

#### 2. Reconciliação de NSU reformulada
- **ANTES**: Busca binária com NSUs arbitrários (violava NT 2014.002)
- **AGORA**: Loop sequencial usando APENAS valores retornados pela SEFAZ
- **Algoritmo NT 2014.002:**
  - Começa do `ultimoNSU` atual da empresa (NUNCA NSU=0 exceto primeira consulta)
  - Loop até `ultNSU === maxNSU` (alinhamento completo obrigatório)
  - NÃO baixa XMLs (apenas avança ponteiro NSU)
  - Safety guard: 100 iterações máximas
  - Lança erro se não completar alinhamento
  - Delay de 500ms entre chamadas (rate limiting)
  - Logs detalhados de progresso e conclusão

#### 3. Sincronização normal atualizada
- **ANTES**: Usava `buildSOAPEnvelope` (consNSU) e parava em cStat=137
- **AGORA**: 
  - Usa `buildSOAPEnvelopeDistNSU` (distNSU com ultNSU)
  - Loop até `ultNSU === maxNSU` mesmo em cStat=137
  - Safety guard: 200 iterações máximas
  - Só persiste NSU quando alinhamento completo
  - Delay de 300ms entre chamadas
- **Benefício**: Elimina desalinhamento de NSU em backlogs grandes

#### 4. Empresas novas
- `ultimoNSU` inicia em "000000000000000" (15 zeros)
- Primeira consulta usa ultNSU=0 (permitido pela SEFAZ uma única vez)
- Após primeira resposta, NUNCA mais usa NSU=0
- Sempre usa valores retornados pela SEFAZ (nunca valores arbitrários)

**Regras da NT 2014.002 implementadas:**
- ✅ Sempre enviar ultNSU do último consultado
- ✅ Usar `<distNSU><ultNSU>` (não consNSU)
- ✅ Nunca fabricar NSUs arbitrários
- ✅ Avançar sequencialmente apenas com valores da SEFAZ
- ✅ Garantir ultNSU === maxNSU antes de persistir
- ✅ Evitar rejeição cStat=656 (uso indevido)

**Fontes da documentação:**
- [NT 2014.002 - Portal Nacional NF-e](https://www.nfe.fazenda.gov.br/portal/exibirArquivo.aspx?conteudo=wLVBlKchUb4%3D)
- [Tecnospeed: Regras de sincronização](https://atendimento.tecnospeed.com.br/hc/pt-br/articles/10794811536791)
- [NetCPA: Atualização das regras de uso indevido](https://netcpa.com.br/colunas/nf-e-04032022-atualizacao-das-regras-de-uso-indevido-do-web-service-nfedistribuicaodfe-nt-2014002/13214)
- [OOBJ: O que é NSU](https://oobj.com.br/bc/nsu-o-que-e/)
- [MOC SPED/PR: Documentação técnica](https://moc.sped.fazenda.pr.gov.br/NFeDistribuicaoDFe.html)

**Benefícios:**
- ✅ Evita rejeição cStat=656 (uso indevido do serviço)
- ✅ Conformidade 100% com NT 2014.002
- ✅ Alinhamento completo do NSU garantido
- ✅ Logs detalhados para auditoria e troubleshooting
- ✅ Safety guards para backlogs muito grandes
- ✅ Sistema production-ready conforme regras oficiais

**Interface de usuário (reconciliação manual):**
- **API**: Endpoint `POST /api/empresas/:id/reconciliar-nsu` protegido
- **Frontend**: Botão com ícone RefreshCw ao lado de "Sincronizar"
  - **Visível apenas** para empresas que já sincronizaram (ultimoNSU != 0)
  - Oculto para empresas novas (previne cStat=656)
- **UX**: Apenas 1 reconciliação por vez (previne concorrência)
- **Toast**: Feedback com NSU atualizado e quantidade de consultas
- **Validação**: Rejeita reconciliação de empresas com NSU=0 (exige sincronização primeiro)

**Quando usar cada funcionalidade:**
- **Sincronizar** (botão ▶️ Play): 
  - Para empresas novas (primeira vez)
  - Quando quer baixar XMLs
  - Sincronização completa com download de documentos
- **Alinhar NSU** (botão 🔄 RefreshCw):
  - Apenas para empresas que já sincronizaram antes
  - Quando quer apenas atualizar o ponteiro NSU sem baixar XMLs
  - Útil quando há backlog grande e você quer avançar rapidamente

**Bloqueio temporário (cStat=656):**
- A SEFAZ aplica bloqueio de 1 hora quando detecta consumo indevido
- Causas: Múltiplas tentativas com NSU inválido ou violação da NT 2014.002
- Solução: Aguardar 1 hora antes de nova tentativa
- Logs detalhados mostram NSU enviado e resposta SEFAZ para diagnóstico
- Ver `SEFAZ-BLOQUEIO-TEMPORARIO.md` para detalhes completos