import {
  type Empresa,
  type InsertEmpresa,
  type Sincronizacao,
  type InsertSincronizacao,
  type Xml,
  type InsertXml,
  type Log,
  type InsertLog,
} from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // Empresas
  getEmpresas(): Promise<Empresa[]>;
  getEmpresa(id: string): Promise<Empresa | undefined>;
  getEmpresaByCNPJ(cnpj: string): Promise<Empresa | undefined>;
  createEmpresa(empresa: InsertEmpresa): Promise<Empresa>;
  updateEmpresa(id: string, updates: Partial<Empresa>): Promise<Empresa | undefined>;
  deleteEmpresa(id: string): Promise<boolean>;
  getEmpresasAtivas(): Promise<Empresa[]>;

  // Sincronizações
  getSincronizacoes(): Promise<Sincronizacao[]>;
  getSincronizacao(id: string): Promise<Sincronizacao | undefined>;
  getSincronizacoesByEmpresa(empresaId: string): Promise<Sincronizacao[]>;
  createSincronizacao(sinc: InsertSincronizacao): Promise<Sincronizacao>;
  updateSincronizacao(id: string, updates: Partial<Sincronizacao>): Promise<Sincronizacao | undefined>;
  getSincronizacoesEmAndamento(): Promise<Sincronizacao[]>;

  // XMLs
  getXmls(): Promise<Xml[]>;
  getXml(id: string): Promise<Xml | undefined>;
  getXmlsByEmpresa(empresaId: string): Promise<Xml[]>;
  getXmlByChave(chaveNFe: string): Promise<Xml | undefined>;
  createXml(xml: InsertXml): Promise<Xml>;
  getXmlsRecentes(limit?: number): Promise<Xml[]>;
  getXmlsHoje(): Promise<number>;

  // Logs
  getLogs(): Promise<Log[]>;
  getLog(id: string): Promise<Log | undefined>;
  getLogsByEmpresa(empresaId: string): Promise<Log[]>;
  createLog(log: InsertLog): Promise<Log>;
  getLogsRecentes(limit?: number): Promise<Log[]>;
}

export class MemStorage implements IStorage {
  private empresas: Map<string, Empresa>;
  private sincronizacoes: Map<string, Sincronizacao>;
  private xmls: Map<string, Xml>;
  private logs: Map<string, Log>;

  constructor() {
    this.empresas = new Map();
    this.sincronizacoes = new Map();
    this.xmls = new Map();
    this.logs = new Map();
  }

  // ========== EMPRESAS ==========
  async getEmpresas(): Promise<Empresa[]> {
    return Array.from(this.empresas.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async getEmpresa(id: string): Promise<Empresa | undefined> {
    return this.empresas.get(id);
  }

  async getEmpresaByCNPJ(cnpj: string): Promise<Empresa | undefined> {
    return Array.from(this.empresas.values()).find((e) => e.cnpj === cnpj);
  }

  async createEmpresa(insertEmpresa: InsertEmpresa): Promise<Empresa> {
    const id = randomUUID();
    const now = new Date();
    const empresa: Empresa = {
      ...insertEmpresa,
      id,
      ultimoNSU: "000000000000000",
      createdAt: now,
      updatedAt: now,
    };
    this.empresas.set(id, empresa);
    return empresa;
  }

  async updateEmpresa(id: string, updates: Partial<Empresa>): Promise<Empresa | undefined> {
    const empresa = this.empresas.get(id);
    if (!empresa) return undefined;

    const updated: Empresa = {
      ...empresa,
      ...updates,
      id: empresa.id,
      updatedAt: new Date(),
    };
    this.empresas.set(id, updated);
    return updated;
  }

  async deleteEmpresa(id: string): Promise<boolean> {
    return this.empresas.delete(id);
  }

  async getEmpresasAtivas(): Promise<Empresa[]> {
    return Array.from(this.empresas.values()).filter((e) => e.ativo);
  }

  // ========== SINCRONIZAÇÕES ==========
  async getSincronizacoes(): Promise<Sincronizacao[]> {
    return Array.from(this.sincronizacoes.values()).sort(
      (a, b) => new Date(b.dataInicio).getTime() - new Date(a.dataInicio).getTime()
    );
  }

  async getSincronizacao(id: string): Promise<Sincronizacao | undefined> {
    return this.sincronizacoes.get(id);
  }

  async getSincronizacoesByEmpresa(empresaId: string): Promise<Sincronizacao[]> {
    return Array.from(this.sincronizacoes.values())
      .filter((s) => s.empresaId === empresaId)
      .sort((a, b) => new Date(b.dataInicio).getTime() - new Date(a.dataInicio).getTime());
  }

  async createSincronizacao(insertSinc: InsertSincronizacao): Promise<Sincronizacao> {
    const id = randomUUID();
    const sinc: Sincronizacao = { ...insertSinc, id };
    this.sincronizacoes.set(id, sinc);
    return sinc;
  }

  async updateSincronizacao(
    id: string,
    updates: Partial<Sincronizacao>
  ): Promise<Sincronizacao | undefined> {
    const sinc = this.sincronizacoes.get(id);
    if (!sinc) return undefined;

    const updated: Sincronizacao = { ...sinc, ...updates, id: sinc.id };
    this.sincronizacoes.set(id, updated);
    return updated;
  }

  async getSincronizacoesEmAndamento(): Promise<Sincronizacao[]> {
    return Array.from(this.sincronizacoes.values()).filter(
      (s) => s.status === "em_andamento"
    );
  }

  // ========== XMLs ==========
  async getXmls(): Promise<Xml[]> {
    return Array.from(this.xmls.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async getXml(id: string): Promise<Xml | undefined> {
    return this.xmls.get(id);
  }

  async getXmlsByEmpresa(empresaId: string): Promise<Xml[]> {
    return Array.from(this.xmls.values())
      .filter((x) => x.empresaId === empresaId)
      .sort((a, b) => new Date(b.dataEmissao).getTime() - new Date(a.dataEmissao).getTime());
  }

  async getXmlByChave(chaveNFe: string): Promise<Xml | undefined> {
    return Array.from(this.xmls.values()).find((x) => x.chaveNFe === chaveNFe);
  }

  async createXml(insertXml: InsertXml): Promise<Xml> {
    const id = randomUUID();
    const xml: Xml = {
      ...insertXml,
      id,
      createdAt: new Date(),
    };
    this.xmls.set(id, xml);
    return xml;
  }

  async getXmlsRecentes(limit: number = 10): Promise<Xml[]> {
    const sorted = Array.from(this.xmls.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    return sorted.slice(0, limit);
  }

  async getXmlsHoje(): Promise<number> {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    
    return Array.from(this.xmls.values()).filter((x) => {
      const createdAt = new Date(x.createdAt);
      createdAt.setHours(0, 0, 0, 0);
      return createdAt.getTime() === hoje.getTime();
    }).length;
  }

  // ========== LOGS ==========
  async getLogs(): Promise<Log[]> {
    return Array.from(this.logs.values()).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  async getLog(id: string): Promise<Log | undefined> {
    return this.logs.get(id);
  }

  async getLogsByEmpresa(empresaId: string): Promise<Log[]> {
    return Array.from(this.logs.values())
      .filter((l) => l.empresaId === empresaId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  async createLog(insertLog: InsertLog): Promise<Log> {
    const id = randomUUID();
    const log: Log = {
      ...insertLog,
      id,
      timestamp: new Date(),
    };
    this.logs.set(id, log);
    return log;
  }

  async getLogsRecentes(limit: number = 10): Promise<Log[]> {
    const sorted = Array.from(this.logs.values()).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    return sorted.slice(0, limit);
  }
}

export const storage = new MemStorage();
