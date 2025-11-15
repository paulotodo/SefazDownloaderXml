/**
 * Configuração Centralizada do Sistema
 * Conforme especificação MOC 7.0 e NT 2014.002
 * 
 * IMPORTANTE: Todas as variáveis sensíveis (senhas, certificados) devem estar em variáveis de ambiente
 */

export interface AppConfig {
  // Ambiente de execução
  nodeEnv: string;
  port: number;
  
  // Modelos de documento suportados (MOC 7.0 §2.2)
  modelos: {
    nfe: string;    // Modelo 55
    nfce: string;   // Modelo 65
  };
  
  // Endpoints SEFAZ NFeDistribuicaoDFe (NT 2014.002)
  sefaz: {
    endpoints: {
      producao: string;
      homologacao: string;
    };
    versao: string; // Versão do schema distDFeInt
  };
  
  // Schemas XML suportados (NT 2014.002 §3.3)
  schemas: {
    nfeProc: string;      // XML completo de NF-e/NFC-e
    resNFe: string;       // Resumo de NF-e/NFC-e
    procEventoNFe: string; // Eventos (cancelamento, CCe, manifestação)
    resEvento: string;    // Resumo de eventos
  };
  
  // Armazenamento
  storage: {
    xmlPath: string;      // Diretório raiz para XMLs
    logPath: string;      // Diretório para logs em arquivo
    maxLogFiles: number;  // Quantidade máxima de arquivos de log
  };
  
  // Sincronização automática
  sync: {
    cronExpression: string; // Expressão cron (padrão: a cada hora)
    maxIterations: number;  // Limite de segurança para loops
    delayBetweenRequests: number; // Delay entre requests (ms)
    bloqueioMinutos: number; // Minutos de bloqueio após erro 656/137
  };
  
  // Supabase
  supabase: {
    url: string;
    anonKey: string;
    serviceRoleKey: string;
  };
}

/**
 * Carrega configuração a partir de variáveis de ambiente
 */
export function loadConfig(): AppConfig {
  // Validação de variáveis obrigatórias
  const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Variáveis de ambiente obrigatórias faltando: ${missing.join(', ')}`);
  }
  
  return {
    // Ambiente
    nodeEnv: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '5000', 10),
    
    // Modelos suportados (MOC 7.0 §2.2)
    modelos: {
      nfe: '55',   // NF-e
      nfce: '65',  // NFC-e
    },
    
    // Endpoints SEFAZ (NT 2014.002)
    sefaz: {
      endpoints: {
        producao: 'https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx',
        homologacao: 'https://hom1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx',
      },
      versao: '1.01', // Versão do schema distDFeInt
    },
    
    // Schemas XML (NT 2014.002 §3.3)
    schemas: {
      nfeProc: 'http://www.portalfiscal.inf.br/nfe/nfeProc',
      resNFe: 'http://www.portalfiscal.inf.br/nfe/resNFe',
      procEventoNFe: 'http://www.portalfiscal.inf.br/nfe/procEventoNFe',
      resEvento: 'http://www.portalfiscal.inf.br/nfe/resEvento',
    },
    
    // Armazenamento
    storage: {
      xmlPath: process.env.XML_DEST_PATH || './xmls',
      logPath: process.env.LOG_PATH || './logs',
      maxLogFiles: parseInt(process.env.MAX_LOG_FILES || '30', 10), // 30 dias
    },
    
    // Sincronização
    sync: {
      cronExpression: process.env.SYNC_CRON || '0 * * * *', // Padrão: a cada hora (minuto 0)
      maxIterations: parseInt(process.env.MAX_ITERATIONS || '200', 10),
      delayBetweenRequests: parseInt(process.env.DELAY_MS || '300', 10),
      bloqueioMinutos: parseInt(process.env.BLOQUEIO_MINUTOS || '65', 10), // Margem de segurança conforme NT
    },
    
    // Supabase
    supabase: {
      url: process.env.SUPABASE_URL!,
      anonKey: process.env.SUPABASE_ANON_KEY!,
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    },
  };
}

// Singleton: carrega configuração uma única vez
export const config = loadConfig();

/**
 * Tipos de Evento (MOC 7.0 e NT 2014.002)
 */
export const TIPOS_EVENTO = {
  CARTA_CORRECAO: '110110',
  CANCELAMENTO: '110111',
  CONFIRMACAO_OPERACAO: '210200',
  CIENCIA_OPERACAO: '210210',
  DESCONHECIMENTO_OPERACAO: '210220',
  OPERACAO_NAO_REALIZADA: '210240',
} as const;

/**
 * Descrições dos tipos de evento
 */
export const DESCRICOES_EVENTO: Record<string, string> = {
  [TIPOS_EVENTO.CARTA_CORRECAO]: 'Carta de Correção',
  [TIPOS_EVENTO.CANCELAMENTO]: 'Cancelamento',
  [TIPOS_EVENTO.CONFIRMACAO_OPERACAO]: 'Confirmação da Operação',
  [TIPOS_EVENTO.CIENCIA_OPERACAO]: 'Ciência da Operação',
  [TIPOS_EVENTO.DESCONHECIMENTO_OPERACAO]: 'Desconhecimento da Operação',
  [TIPOS_EVENTO.OPERACAO_NAO_REALIZADA]: 'Operação não Realizada',
};

/**
 * Códigos de Status SEFAZ (NT 2014.002)
 */
export const STATUS_SEFAZ = {
  SUCESSO: '138',                    // Documentos encontrados
  SEM_DOCUMENTOS: '137',             // Nenhum documento localizado
  CONSUMO_INDEVIDO: '656',           // Rejeição: Consumo indevido
} as const;
