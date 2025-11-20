import {
  type Empresa,
  type InsertEmpresa,
  type Sincronizacao,
  type InsertSincronizacao,
  type Xml,
  type InsertXml,
  type Log,
  type InsertLog,
  type Manifestacao,
  type InsertManifestacao,
  type Configuracao,
  type InsertConfiguracao,
  type UpdateConfiguracao,
} from "@shared/schema";

export interface IStorage {
  // Empresas
  getEmpresas(userId?: string): Promise<Empresa[]>;
  getEmpresa(id: string, userId?: string): Promise<Empresa | null>;
  getEmpresaByCNPJ(cnpj: string, userId?: string): Promise<Empresa | null>;
  createEmpresa(empresa: InsertEmpresa & { userId: string }): Promise<Empresa>;
  updateEmpresa(id: string, updates: Partial<Empresa>, userId?: string): Promise<Empresa | null>;
  deleteEmpresa(id: string, userId?: string): Promise<boolean>;
  getEmpresasAtivas(userId?: string): Promise<Empresa[]>;

  // Sincronizações
  getSincronizacoes(userId?: string): Promise<Sincronizacao[]>;
  getSincronizacao(id: string, userId?: string): Promise<Sincronizacao | null>;
  createSincronizacao(sinc: InsertSincronizacao & { userId: string }): Promise<Sincronizacao>;
  updateSincronizacao(id: string, updates: Partial<Sincronizacao>, userId?: string): Promise<Sincronizacao | null>;
  getSincronizacoesEmAndamento(userId?: string): Promise<Sincronizacao[]>;

  // XMLs
  getXmls(userId?: string): Promise<Xml[]>;
  getXml(id: string, userId?: string): Promise<Xml | null>;
  getXmlByChave(chaveNFe: string, userId?: string): Promise<Xml | null>;
  createXml(xml: InsertXml & { userId: string }): Promise<Xml>;
  updateXml(id: string, updates: Partial<Xml>, userId?: string): Promise<Xml | null>;
  getXmlsRecentes(limit?: number, userId?: string): Promise<Xml[]>;
  getXmlsHoje(userId?: string): Promise<number>;
  getXmlsPendentesDownload(userId?: string, limit?: number): Promise<Xml[]>;
  getXmlsComErroDownload(userId?: string, limit?: number): Promise<Xml[]>;
  getXmlsComErroDefinitivo(userId?: string, limit?: number): Promise<Xml[]>;

  // Logs
  getLogs(userId?: string): Promise<Log[]>;
  createLog(log: InsertLog & { userId?: string }): Promise<Log>;
  getLogsRecentes(limit?: number, userId?: string): Promise<Log[]>;

  // Manifestações do Destinatário (NT 2020.001)
  getManifestacoes(userId?: string): Promise<Manifestacao[]>;
  getManifestacao(id: string, userId?: string): Promise<Manifestacao | null>;
  getManifestacaoByChave(chaveNFe: string, userId?: string): Promise<Manifestacao | null>;
  getManifestacoesByEmpresa(empresaId: string, userId?: string): Promise<Manifestacao[]>;
  getManifestacoesPendentes(empresaId: string, userId?: string): Promise<Manifestacao[]>;
  createManifestacao(manifestacao: InsertManifestacao & { userId: string }): Promise<Manifestacao>;
  updateManifestacao(id: string, updates: Partial<Manifestacao>, userId?: string): Promise<Manifestacao | null>;
  getManifestacoesRecentes(limit?: number, userId?: string): Promise<Manifestacao[]>;

  // Configurações
  getConfiguracao(userId: string): Promise<Configuracao | null>;
  createConfiguracao(config: InsertConfiguracao & { userId: string }): Promise<Configuracao>;
  updateConfiguracao(userId: string, updates: UpdateConfiguracao): Promise<Configuracao>;

  // Distributed Locks (PostgreSQL advisory locks via tabela dedicada)
  tryAcquireDownloadLock(): Promise<boolean>;
  releaseDownloadLock(): Promise<boolean>;
}

// Exporta SupabaseStorage como implementação única
import { supabaseStorage } from "./supabase-storage";
export const storage: IStorage = supabaseStorage;
