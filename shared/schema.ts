import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, boolean, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Tabela de Perfis de Usuário (extends auth.users)
export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(), // references auth.users(id)
  email: text("email").notNull(),
  nomeCompleto: text("nome_completo"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export type Profile = typeof profiles.$inferSelect;

// Tabela de Empresas
export const empresas = pgTable("empresas", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(), // references auth.users(id)
  cnpj: text("cnpj").notNull(),
  razaoSocial: text("razao_social").notNull(),
  uf: text("uf").notNull(),
  ambiente: text("ambiente").notNull().default("prod"), // "prod" ou "hom"
  certificadoPath: text("certificado_path").notNull(), // caminho do arquivo .pfx
  certificadoSenha: text("certificado_senha").notNull(), // senha do certificado (criptografada)
  ativo: boolean("ativo").notNull().default(true),
  ultimoNSU: text("ultimo_nsu").notNull().default("000000000000000"),
  bloqueadoAte: timestamp("bloqueado_ate", { withTimezone: true, mode: 'date' }), // Bloqueio temporário SEFAZ (cStat 656) até este timestamp (UTC)
  tipoArmazenamento: text("tipo_armazenamento").notNull().default("local"), // "local" (filesystem) ou "supabase" (Supabase Storage)
  manifestacaoAutomatica: boolean("manifestacao_automatica").notNull().default(true), // Manifestar automaticamente com evento 210210 (Ciência)
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export const insertEmpresaSchema = createInsertSchema(empresas, {
  cnpj: z.string().regex(/^\d{14}$/, "CNPJ deve conter 14 dígitos"),
  razaoSocial: z.string().min(1, "Razão social é obrigatória"),
  uf: z.string().length(2, "UF deve ter 2 caracteres"),
  ambiente: z.enum(["prod", "hom"]),
  certificadoSenha: z.string().min(1, "Senha do certificado é obrigatória"),
  tipoArmazenamento: z.enum(["local", "supabase"]).optional(),
  manifestacaoAutomatica: z.boolean().optional(),
}).omit({
  id: true,
  userId: true, // Preenchido pelo backend baseado no usuário autenticado
  createdAt: true,
  updatedAt: true,
  ultimoNSU: true,
  bloqueadoAte: true, // Gerenciado automaticamente pelo sistema
});

export type InsertEmpresa = z.infer<typeof insertEmpresaSchema>;
export type Empresa = typeof empresas.$inferSelect;

// Tabela de Sincronizações
export const sincronizacoes = pgTable("sincronizacoes", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(), // references auth.users(id)
  empresaId: uuid("empresa_id").notNull().references(() => empresas.id, { onDelete: "cascade" }),
  dataInicio: timestamp("data_inicio", { withTimezone: true, mode: 'date' }).notNull(),
  dataFim: timestamp("data_fim", { withTimezone: true, mode: 'date' }),
  status: text("status").notNull(), // "em_andamento", "concluida", "erro"
  nsuInicial: text("nsu_inicial").notNull(),
  nsuFinal: text("nsu_final"),
  xmlsBaixados: integer("xmls_baixados").notNull().default(0),
  mensagemErro: text("mensagem_erro"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export const insertSincronizacaoSchema = createInsertSchema(sincronizacoes).omit({
  id: true,
  userId: true,
  createdAt: true,
});

export type InsertSincronizacao = z.infer<typeof insertSincronizacaoSchema>;
export type Sincronizacao = typeof sincronizacoes.$inferSelect;

// Tabela de XMLs
export const xmls = pgTable("xmls", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(), // references auth.users(id)
  empresaId: uuid("empresa_id").notNull().references(() => empresas.id, { onDelete: "cascade" }),
  sincronizacaoId: uuid("sincronizacao_id").references(() => sincronizacoes.id, { onDelete: "set null" }),
  chaveNFe: text("chave_nfe").notNull(),
  numeroNF: text("numero_nf").notNull(),
  modelo: text("modelo").notNull().default("55"), // "55" (NF-e) ou "65" (NFC-e) - MOC 7.0 §2.2
  tipoDocumento: text("tipo_documento").notNull().default("nfeProc"), // "nfeProc", "resNFe", "procEventoNFe", "resEvento" - NT 2014.002 §3.3
  dataEmissao: timestamp("data_emissao", { withTimezone: true, mode: 'date' }).notNull(),
  caminhoArquivo: text("caminho_arquivo").notNull(),
  tamanhoBytes: integer("tamanho_bytes").notNull(),
  // Controle de download automático de XML completo
  statusDownload: text("status_download").notNull().default("pendente"), // "pendente", "completo", "erro"
  tentativasDownload: integer("tentativas_download").notNull().default(0),
  ultimaTentativaDownload: timestamp("ultima_tentativa_download", { withTimezone: true, mode: 'date' }),
  erroDownload: text("erro_download"), // Mensagem do último erro ao tentar download
  // Status da NFe (baseado em cStat da SEFAZ)
  statusNfe: text("status_nfe").notNull().default("autorizada"), // "autorizada" (100), "cancelada" (101), "denegada" (110/301/302), "inutilizada", "uso_denegado"
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export const insertXmlSchema = createInsertSchema(xmls).omit({
  id: true,
  userId: true,
  createdAt: true,
});

export type InsertXml = z.infer<typeof insertXmlSchema>;
export type Xml = typeof xmls.$inferSelect;

// Tabela de Logs
export const logs = pgTable("logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id"), // nullable - logs do sistema não têm usuário
  empresaId: uuid("empresa_id").references(() => empresas.id, { onDelete: "cascade" }),
  sincronizacaoId: uuid("sincronizacao_id").references(() => sincronizacoes.id, { onDelete: "cascade" }),
  nivel: text("nivel").notNull(), // "info", "warning", "error"
  mensagem: text("mensagem").notNull(),
  detalhes: text("detalhes"), // JSON com detalhes adicionais
  timestamp: timestamp("timestamp", { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export const insertLogSchema = createInsertSchema(logs).omit({
  id: true,
  userId: true,
  timestamp: true,
});

export type InsertLog = z.infer<typeof insertLogSchema>;
export type Log = typeof logs.$inferSelect;

// Tabela de Manifestações do Destinatário (NT 2020.001)
export const manifestacoes = pgTable("manifestacoes", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(), // references auth.users(id)
  empresaId: uuid("empresa_id").notNull().references(() => empresas.id, { onDelete: "cascade" }),
  chaveNFe: text("chave_nfe").notNull(),
  tipoEvento: text("tipo_evento").notNull(), // "210200" (Confirmação), "210210" (Ciência), "210220" (Desconhecimento), "210240" (Operação Não Realizada)
  status: text("status").notNull().default("pendente"), // "pendente", "enviado", "confirmado", "erro", "expirado"
  dataAutorizacaoNFe: timestamp("data_autorizacao_nfe", { withTimezone: true, mode: 'date' }).notNull(), // Data de autorização da NF-e
  dataManifestacao: timestamp("data_manifestacao", { withTimezone: true, mode: 'date' }), // Data em que o evento foi enviado à SEFAZ
  prazoLegal: timestamp("prazo_legal", { withTimezone: true, mode: 'date' }).notNull(), // Prazo limite para manifestar (calculado conforme NT 2020.001 §4)
  nsuEvento: text("nsu_evento"), // NSU do evento de manifestação quando retornado pela SEFAZ
  protocoloEvento: text("protocolo_evento"), // Protocolo de autorização do evento
  cStat: text("c_stat"), // Código de status de retorno da SEFAZ
  xMotivo: text("x_motivo"), // Descrição do status de retorno
  justificativa: text("justificativa"), // Justificativa (obrigatória para 210220 e 210240)
  tentativas: integer("tentativas").notNull().default(0), // Contador de tentativas de envio
  ultimoErro: text("ultimo_erro"), // Mensagem do último erro
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export const insertManifestacaoSchema = createInsertSchema(manifestacoes).omit({
  id: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertManifestacao = z.infer<typeof insertManifestacaoSchema>;
export type Manifestacao = typeof manifestacoes.$inferSelect;

// Schema para upload de certificado (multipart form)
export const uploadCertificadoSchema = z.object({
  cnpj: z.string().regex(/^\d{14}$/, "CNPJ deve conter 14 dígitos"),
  razaoSocial: z.string().min(1, "Razão social é obrigatória"),
  uf: z.string().length(2, "UF deve ter 2 caracteres"),
  ambiente: z.enum(["prod", "hom"]),
  certificadoSenha: z.string().min(1, "Senha do certificado é obrigatória"),
  tipoArmazenamento: z.enum(["local", "supabase"]).optional().default("local"),
  manifestacaoAutomatica: z.string().optional().transform(val => val === "true").default("false"),
});

export type UploadCertificado = z.infer<typeof uploadCertificadoSchema>;

// Schema para atualização de empresa (sem certificado obrigatório)
export const updateEmpresaSchema = z.object({
  razaoSocial: z.string().min(1, "Razão social é obrigatória").optional(),
  uf: z.string().length(2, "UF deve ter 2 caracteres").optional(),
  ambiente: z.enum(["prod", "hom"]).optional(),
  certificadoSenha: z.string().min(1, "Senha do certificado é obrigatória").optional(),
  tipoArmazenamento: z.enum(["local", "supabase"]).optional(),
  manifestacaoAutomatica: z.boolean().optional(),
  ativo: z.boolean().optional(),
});

export type UpdateEmpresa = z.infer<typeof updateEmpresaSchema>;

// UFs do Brasil
export const UFS = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA",
  "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR", "RJ", "RN",
  "RO", "RR", "RS", "SC", "SE", "SP", "TO"
] as const;

export type UF = typeof UFS[number];

// Schemas de Autenticação
export const registerSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "Senha deve ter no mínimo 6 caracteres"),
  nomeCompleto: z.string().min(1, "Nome completo é obrigatório"),
});

export const loginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(1, "Senha é obrigatória"),
});

export type RegisterData = z.infer<typeof registerSchema>;
export type LoginData = z.infer<typeof loginSchema>;

// Schema para manifestação manual
export const manifestacaoManualSchema = z.object({
  chaveNFe: z.string().length(44, "Chave de acesso deve ter 44 caracteres"),
  tipoEvento: z.enum(["210200", "210210", "210220", "210240"], {
    errorMap: () => ({ message: "Tipo de evento inválido" })
  }),
  justificativa: z.string().min(15, "Justificativa deve ter no mínimo 15 caracteres").optional(),
}).refine(
  (data) => {
    // Justificativa é obrigatória para Desconhecimento (210220) e Operação Não Realizada (210240)
    if ((data.tipoEvento === "210220" || data.tipoEvento === "210240") && !data.justificativa) {
      return false;
    }
    return true;
  },
  {
    message: "Justificativa é obrigatória para eventos de Desconhecimento e Operação Não Realizada",
    path: ["justificativa"],
  }
);

export type ManifestacaoManual = z.infer<typeof manifestacaoManualSchema>;

// Tipos de Evento de Manifestação (NT 2020.001 §3)
export const TIPOS_EVENTO_MANIFESTACAO = {
  CONFIRMACAO_OPERACAO: "210200",
  CIENCIA_OPERACAO: "210210",
  DESCONHECIMENTO_OPERACAO: "210220",
  OPERACAO_NAO_REALIZADA: "210240",
} as const;

export const DESCRICAO_EVENTOS_MANIFESTACAO: Record<string, string> = {
  "210200": "Confirmação da Operação",
  "210210": "Ciência da Operação",
  "210220": "Desconhecimento da Operação",
  "210240": "Operação não Realizada",
};

// Tabela de Configurações do Usuário
export const configuracoes = pgTable("configuracoes", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().unique(), // references auth.users(id) - uma config por usuário
  intervaloSincronizacao: text("intervalo_sincronizacao").notNull().default("1h"), // "15m", "30m", "1h", "2h", "6h", "12h", "24h"
  sincronizacaoAutomatica: boolean("sincronizacao_automatica").notNull().default(true),
  sincronizarAoIniciar: boolean("sincronizar_ao_iniciar").notNull().default(true),
  retryAutomatico: boolean("retry_automatico").notNull().default(true),
  maxRetries: integer("max_retries").notNull().default(3),
  timeoutRequisicao: integer("timeout_requisicao").notNull().default(60), // segundos
  validarSSL: boolean("validar_ssl").notNull().default(true),
  logsDetalhados: boolean("logs_detalhados").notNull().default(false),
  notificarNovosXmls: boolean("notificar_novos_xmls").notNull().default(true),
  notificarErros: boolean("notificar_erros").notNull().default(true),
  relatorioDiario: boolean("relatorio_diario").notNull().default(false),
  emailNotificacoes: text("email_notificacoes"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export const insertConfiguracaoSchema = createInsertSchema(configuracoes).omit({
  id: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
});

export const updateConfiguracaoSchema = z.object({
  intervaloSincronizacao: z.enum(["15m", "30m", "1h", "2h", "6h", "12h", "24h"]).optional(),
  sincronizacaoAutomatica: z.boolean().optional(),
  sincronizarAoIniciar: z.boolean().optional(),
  retryAutomatico: z.boolean().optional(),
  maxRetries: z.number().int().min(1).max(10).optional(),
  timeoutRequisicao: z.number().int().min(30).max(300).optional(),
  validarSSL: z.boolean().optional(),
  logsDetalhados: z.boolean().optional(),
  notificarNovosXmls: z.boolean().optional(),
  notificarErros: z.boolean().optional(),
  relatorioDiario: z.boolean().optional(),
  emailNotificacoes: z.string().email().optional().or(z.literal("")),
});

export type InsertConfiguracao = z.infer<typeof insertConfiguracaoSchema>;
export type UpdateConfiguracao = z.infer<typeof updateConfiguracaoSchema>;
export type Configuracao = typeof configuracoes.$inferSelect;
