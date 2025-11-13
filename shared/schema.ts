import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, boolean, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Tabela de Perfis de Usuário (extends auth.users)
export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(), // references auth.users(id)
  email: text("email").notNull(),
  nomeCompleto: text("nome_completo"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
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
  userId: true, // Preenchido pelo backend baseado no usuário autenticado
  createdAt: true,
  updatedAt: true,
  ultimoNSU: true,
});

export type InsertEmpresa = z.infer<typeof insertEmpresaSchema>;
export type Empresa = typeof empresas.$inferSelect;

// Tabela de Sincronizações
export const sincronizacoes = pgTable("sincronizacoes", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(), // references auth.users(id)
  empresaId: uuid("empresa_id").notNull().references(() => empresas.id, { onDelete: "cascade" }),
  dataInicio: timestamp("data_inicio").notNull(),
  dataFim: timestamp("data_fim"),
  status: text("status").notNull(), // "em_andamento", "concluida", "erro"
  nsuInicial: text("nsu_inicial").notNull(),
  nsuFinal: text("nsu_final"),
  xmlsBaixados: integer("xmls_baixados").notNull().default(0),
  mensagemErro: text("mensagem_erro"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
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
  dataEmissao: timestamp("data_emissao").notNull(),
  caminhoArquivo: text("caminho_arquivo").notNull(),
  tamanhoBytes: integer("tamanho_bytes").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
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
  timestamp: timestamp("timestamp").notNull().defaultNow(),
});

export const insertLogSchema = createInsertSchema(logs).omit({
  id: true,
  userId: true,
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
