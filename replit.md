# SEFAZ XML Sync - Sistema de Download Automático de XMLs

## Visão Geral
Aplicativo web para download automático de XMLs (nfeProc) da SEFAZ com sincronização a cada hora para múltiplas empresas cadastradas.

## Tecnologias
- **Frontend**: React, TypeScript, Tailwind CSS, Shadcn UI, React Query, Wouter
- **Backend**: Node.js, Express, TypeScript
- **Agendamento**: node-cron (execução a cada 1 hora)
- **Processamento**: fast-xml-parser, pako (gzip)
- **Upload**: multer (certificados .pfx)
- **Storage**: In-memory (MemStorage)

## Arquitetura

### Frontend
- **Dashboard**: Estatísticas em tempo real (total de empresas, XMLs hoje, última sincronização)
- **Empresas**: Lista com busca, cadastro com upload de certificado, exclusão e sincronização manual
- **XMLs**: Navegador em árvore (CNPJ > Ano > Mês > Arquivos)
- **Logs**: Visualizador filtrado por nível (info/warning/error)
- **Configurações**: Tabs para geral, agendamento e notificações
- **Sidebar**: Navegação principal com ícones lucide-react

### Backend
- **Storage** (`server/storage.ts`): Interface IStorage com MemStorage para empresas, XMLs, sincronizações e logs
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
- **empresas**: id, cnpj, razaoSocial, uf, ambiente, certificadoPath, certificadoSenha, ativo, ultimoNSU
- **sincronizacoes**: id, empresaId, dataInicio, dataFim, status, nsuInicial, nsuFinal, xmlsBaixados
- **xmls**: id, empresaId, sincronizacaoId, chaveNFe, numeroNF, dataEmissao, caminhoArquivo, tamanhoBytes
- **logs**: id, empresaId, sincronizacaoId, nivel, mensagem, detalhes, timestamp

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
- Certificados .pfx armazenados em `./certificados/`
- Senhas criptografadas no storage (implementar hash em produção)
- Validação com Zod em todas as entradas
- HTTPS obrigatório para SEFAZ
- Confirmação modal para exclusão de empresas

## Deploy
- Configurar variáveis de ambiente: `XML_DEST_PATH`
- Upload inicial de certificados válidos
- Garantir diretórios `./certificados` e `./xmls` com permissões adequadas
- Em produção: usar banco PostgreSQL ao invés de MemStorage

## Melhorias Futuras
- Notificações por email quando novos XMLs forem baixados
- Exportação de relatórios em PDF/Excel
- Backup automático para S3/Google Drive
- Dashboard com gráficos de evolução
- Filtros avançados por período de emissão
- Autenticação de usuário
- Retry exponencial com backoff
- Rate limiting para proteção da API SEFAZ

## Última Atualização
13 de novembro de 2025
