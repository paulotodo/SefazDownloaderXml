import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Tabela de Empresas
export const empresas = pgTable("empresas", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  cnpj: text("cnpj").notNull().unique(),
  razaoSocial: text("razao_social").notNull(),
  uf: text("uf").notNull(),
  ambiente: text("ambiente").notNull().default("prod"), // "prod" ou "hom"
  certificadoPath: text("certificado_path").notNull(), // caminho do arquivo .pfx
  certificadoSenha: text("certificado_senha").notNull(), // senha do certificado (criptografada)
  ativo: boolean("ativo").notNull().default(true),
  ultimoNSU: text("ultimo_nsu").notNull().default("000000000000000"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertEmpresaSchema = createInsertSchema(empresas, {
  cnpj: z.string().regex(/^\d{14}$/, "CNPJ deve conter 14 dígitos"),
  razaoSocial: z.string().min(1, "Razão social é obrigatória"),
  uf: z.string().length(2, "UF deve ter 2 caracteres"),
  ambiente: z.enum(["prod", "hom"]),
  certificadoSenha: z.string().min(1, "Senha do certificado é obrigatória"),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  ultimoNSU: true,
});

export type InsertEmpresa = z.infer<typeof insertEmpresaSchema>;
export type Empresa = typeof empresas.$inferSelect;

// Tabela de Sincronizações
export const sincronizacoes = pgTable("sincronizacoes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  empresaId: varchar("empresa_id").notNull().references(() => empresas.id, { onDelete: "cascade" }),
  dataInicio: timestamp("data_inicio").notNull(),
  dataFim: timestamp("data_fim"),
  status: text("status").notNull(), // "em_andamento", "concluida", "erro"
  nsuInicial: text("nsu_inicial").notNull(),
  nsuFinal: text("nsu_final"),
  xmlsBaixados: integer("xmls_baixados").notNull().default(0),
  mensagemErro: text("mensagem_erro"),
});

export const insertSincronizacaoSchema = createInsertSchema(sincronizacoes).omit({
  id: true,
});

export type InsertSincronizacao = z.infer<typeof insertSincronizacaoSchema>;
export type Sincronizacao = typeof sincronizacoes.$inferSelect;

// Tabela de XMLs
export const xmls = pgTable("xmls", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  empresaId: varchar("empresa_id").notNull().references(() => empresas.id, { onDelete: "cascade" }),
  sincronizacaoId: varchar("sincronizacao_id").references(() => sincronizacoes.id, { onDelete: "set null" }),
  chaveNFe: text("chave_nfe").notNull(),
  numeroNF: text("numero_nf").notNull(),
  dataEmissao: timestamp("data_emissao").notNull(),
  caminhoArquivo: text("caminho_arquivo").notNull(),
  tamanhoBytes: integer("tamanho_bytes").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertXmlSchema = createInsertSchema(xmls).omit({
  id: true,
  createdAt: true,
});

export type InsertXml = z.infer<typeof insertXmlSchema>;
export type Xml = typeof xmls.$inferSelect;

// Tabela de Logs
export const logs = pgTable("logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  empresaId: varchar("empresa_id").references(() => empresas.id, { onDelete: "cascade" }),
  sincronizacaoId: varchar("sincronizacao_id").references(() => sincronizacoes.id, { onDelete: "cascade" }),
  nivel: text("nivel").notNull(), // "info", "warning", "error"
  mensagem: text("mensagem").notNull(),
  detalhes: text("detalhes"), // JSON com detalhes adicionais
  timestamp: timestamp("timestamp").notNull().defaultNow(),
});

export const insertLogSchema = createInsertSchema(logs).omit({
  id: true,
  timestamp: true,
});

export type InsertLog = z.infer<typeof insertLogSchema>;
export type Log = typeof logs.$inferSelect;

// Schema para upload de certificado (multipart form)
export const uploadCertificadoSchema = z.object({
  cnpj: z.string().regex(/^\d{14}$/, "CNPJ deve conter 14 dígitos"),
  razaoSocial: z.string().min(1, "Razão social é obrigatória"),
  uf: z.string().length(2, "UF deve ter 2 caracteres"),
  ambiente: z.enum(["prod", "hom"]),
  certificadoSenha: z.string().min(1, "Senha do certificado é obrigatória"),
});

export type UploadCertificado = z.infer<typeof uploadCertificadoSchema>;

// UFs do Brasil
export const UFS = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA",
  "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR", "RJ", "RN",
  "RO", "RR", "RS", "SC", "SE", "SP", "TO"
] as const;

export type UF = typeof UFS[number];
