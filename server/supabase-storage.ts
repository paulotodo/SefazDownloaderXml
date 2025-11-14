import { supabaseAdmin } from "./supabase";
import type { IStorage } from "./storage";
import type {
  Empresa,
  InsertEmpresa,
  Sincronizacao,
  InsertSincronizacao,
  Xml,
  InsertXml,
  Log,
  InsertLog,
} from "@shared/schema";

// ========== FUNÇÕES DE PARSE (snake_case → camelCase) ==========

function parseEmpresa(raw: any): Empresa {
  return {
    id: raw.id,
    userId: raw.user_id,
    cnpj: raw.cnpj,
    razaoSocial: raw.razao_social,
    uf: raw.uf,
    ambiente: raw.ambiente,
    certificadoPath: raw.certificado_path,
    certificadoSenha: raw.certificado_senha,
    ativo: raw.ativo,
    ultimoNSU: raw.ultimo_nsu,
    bloqueadoAte: raw.bloqueado_ate ? new Date(raw.bloqueado_ate) : null,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}

function parseSincronizacao(raw: any): Sincronizacao {
  return {
    id: raw.id,
    userId: raw.user_id,
    empresaId: raw.empresa_id,
    dataInicio: raw.data_inicio,
    dataFim: raw.data_fim,
    status: raw.status,
    nsuInicial: raw.nsu_inicial,
    nsuFinal: raw.nsu_final,
    xmlsBaixados: raw.xmls_baixados,
    mensagemErro: raw.mensagem_erro,
    createdAt: raw.created_at,
  };
}

function parseXml(raw: any): Xml {
  return {
    id: raw.id,
    userId: raw.user_id,
    empresaId: raw.empresa_id,
    sincronizacaoId: raw.sincronizacao_id,
    chaveNFe: raw.chave_nfe,
    numeroNF: raw.numero_nf,
    dataEmissao: raw.data_emissao,
    caminhoArquivo: raw.caminho_arquivo,
    tamanhoBytes: raw.tamanho_bytes,
    createdAt: raw.created_at,
  };
}

function parseLog(raw: any): Log {
  return {
    id: raw.id,
    userId: raw.user_id,
    empresaId: raw.empresa_id,
    sincronizacaoId: raw.sincronizacao_id,
    nivel: raw.nivel,
    mensagem: raw.mensagem,
    detalhes: raw.detalhes,
    timestamp: raw.timestamp,
  };
}

export class SupabaseStorage implements IStorage {
  // ========== EMPRESAS ==========

  async getEmpresas(userId?: string): Promise<Empresa[]> {
    let query = supabaseAdmin.from("empresas").select("*").order("created_at", { ascending: false });
    
    if (userId) {
      query = query.eq("user_id", userId);
    }

    const { data, error } = await query;

    if (error) throw new Error(`Erro ao buscar empresas: ${error.message}`);
    return (data || []).map(parseEmpresa);
  }

  async getEmpresa(id: string, userId?: string): Promise<Empresa | null> {
    let query = supabaseAdmin.from("empresas").select("*").eq("id", id);
    
    if (userId) {
      query = query.eq("user_id", userId);
    }

    const { data, error } = await query.single();

    if (error) {
      if (error.code === "PGRST116") return null; // Not found
      throw new Error(`Erro ao buscar empresa: ${error.message}`);
    }

    return parseEmpresa(data);
  }

  async getEmpresaByCNPJ(cnpj: string, userId?: string): Promise<Empresa | null> {
    let query = supabaseAdmin.from("empresas").select("*").eq("cnpj", cnpj);
    
    if (userId) {
      query = query.eq("user_id", userId);
    }

    const { data, error } = await query.maybeSingle();

    if (error) throw new Error(`Erro ao buscar empresa por CNPJ: ${error.message}`);
    return data ? parseEmpresa(data) : null;
  }

  async getEmpresasAtivas(userId?: string): Promise<Empresa[]> {
    let query = supabaseAdmin.from("empresas").select("*").eq("ativo", true);
    
    if (userId) {
      query = query.eq("user_id", userId);
    }

    const { data, error } = await query;

    if (error) throw new Error(`Erro ao buscar empresas ativas: ${error.message}`);
    return (data || []).map(parseEmpresa);
  }

  async createEmpresa(empresa: InsertEmpresa & { userId: string }): Promise<Empresa> {
    const { data, error } = await supabaseAdmin
      .from("empresas")
      .insert({
        user_id: empresa.userId,
        cnpj: empresa.cnpj,
        razao_social: empresa.razaoSocial,
        uf: empresa.uf,
        ambiente: empresa.ambiente,
        certificado_path: empresa.certificadoPath,
        certificado_senha: empresa.certificadoSenha,
        ativo: empresa.ativo ?? true,
      })
      .select()
      .single();

    if (error) throw new Error(`Erro ao criar empresa: ${error.message}`);
    return parseEmpresa(data);
  }

  async updateEmpresa(id: string, updates: Partial<Empresa>, userId?: string): Promise<Empresa | null> {
    const updateData: any = {};
    
    if (updates.razaoSocial !== undefined) updateData.razao_social = updates.razaoSocial;
    if (updates.uf !== undefined) updateData.uf = updates.uf;
    if (updates.ambiente !== undefined) updateData.ambiente = updates.ambiente;
    if (updates.certificadoPath !== undefined) updateData.certificado_path = updates.certificadoPath;
    if (updates.certificadoSenha !== undefined) updateData.certificado_senha = updates.certificadoSenha;
    if (updates.ativo !== undefined) updateData.ativo = updates.ativo;
    if (updates.ultimoNSU !== undefined) updateData.ultimo_nsu = updates.ultimoNSU;
    if (updates.bloqueadoAte !== undefined) updateData.bloqueado_ate = updates.bloqueadoAte;

    let query = supabaseAdmin.from("empresas").update(updateData).eq("id", id);
    
    if (userId) {
      query = query.eq("user_id", userId);
    }

    const { data, error } = await query.select().single();

    if (error) {
      if (error.code === "PGRST116") return null;
      throw new Error(`Erro ao atualizar empresa: ${error.message}`);
    }

    return parseEmpresa(data);
  }

  async deleteEmpresa(id: string, userId?: string): Promise<boolean> {
    let query = supabaseAdmin.from("empresas").delete().eq("id", id);
    
    if (userId) {
      query = query.eq("user_id", userId);
    }

    const { error } = await query;

    if (error) throw new Error(`Erro ao deletar empresa: ${error.message}`);
    return true;
  }

  // ========== SINCRONIZAÇÕES ==========

  async getSincronizacoes(userId?: string): Promise<Sincronizacao[]> {
    let query = supabaseAdmin.from("sincronizacoes").select("*").order("created_at", { ascending: false });
    
    if (userId) {
      query = query.eq("user_id", userId);
    }

    const { data, error } = await query;

    if (error) throw new Error(`Erro ao buscar sincronizações: ${error.message}`);
    return (data || []).map(parseSincronizacao);
  }

  async getSincronizacao(id: string, userId?: string): Promise<Sincronizacao | null> {
    let query = supabaseAdmin.from("sincronizacoes").select("*").eq("id", id);
    
    if (userId) {
      query = query.eq("user_id", userId);
    }

    const { data, error } = await query.single();

    if (error) {
      if (error.code === "PGRST116") return null;
      throw new Error(`Erro ao buscar sincronização: ${error.message}`);
    }

    return parseSincronizacao(data);
  }

  async getSincronizacoesEmAndamento(userId?: string): Promise<Sincronizacao[]> {
    let query = supabaseAdmin.from("sincronizacoes").select("*").eq("status", "em_andamento");
    
    if (userId) {
      query = query.eq("user_id", userId);
    }

    const { data, error } = await query;

    if (error) throw new Error(`Erro ao buscar sincronizações em andamento: ${error.message}`);
    return (data || []).map(parseSincronizacao);
  }

  async createSincronizacao(sincronizacao: InsertSincronizacao & { userId: string }): Promise<Sincronizacao> {
    const { data, error } = await supabaseAdmin
      .from("sincronizacoes")
      .insert({
        user_id: sincronizacao.userId,
        empresa_id: sincronizacao.empresaId,
        data_inicio: sincronizacao.dataInicio,
        data_fim: sincronizacao.dataFim || null,
        status: sincronizacao.status,
        nsu_inicial: sincronizacao.nsuInicial,
        nsu_final: sincronizacao.nsuFinal || null,
        xmls_baixados: sincronizacao.xmlsBaixados || 0,
        mensagem_erro: sincronizacao.mensagemErro || null,
      })
      .select()
      .single();

    if (error) throw new Error(`Erro ao criar sincronização: ${error.message}`);
    return parseSincronizacao(data);
  }

  async updateSincronizacao(id: string, updates: Partial<Sincronizacao>, userId?: string): Promise<Sincronizacao | null> {
    const updateData: any = {};
    
    if (updates.dataFim !== undefined) updateData.data_fim = updates.dataFim;
    if (updates.status !== undefined) updateData.status = updates.status;
    if (updates.nsuFinal !== undefined) updateData.nsu_final = updates.nsuFinal;
    if (updates.xmlsBaixados !== undefined) updateData.xmls_baixados = updates.xmlsBaixados;
    if (updates.mensagemErro !== undefined) updateData.mensagem_erro = updates.mensagemErro;

    let query = supabaseAdmin
      .from("sincronizacoes")
      .update(updateData)
      .eq("id", id);

    // CRÍTICO: Adiciona filtro de userId para segurança multi-tenant
    if (userId) {
      query = query.eq("user_id", userId);
    }

    const { data, error } = await query.select().single();

    if (error) {
      if (error.code === "PGRST116") return null;
      throw new Error(`Erro ao atualizar sincronização: ${error.message}`);
    }

    return parseSincronizacao(data);
  }

  // ========== XMLs ==========

  async getXmls(userId?: string): Promise<Xml[]> {
    let query = supabaseAdmin.from("xmls").select("*").order("created_at", { ascending: false });
    
    if (userId) {
      query = query.eq("user_id", userId);
    }

    const { data, error } = await query;

    if (error) throw new Error(`Erro ao buscar XMLs: ${error.message}`);
    return (data || []).map(parseXml);
  }

  async getXml(id: string, userId?: string): Promise<Xml | null> {
    let query = supabaseAdmin.from("xmls").select("*").eq("id", id);
    
    if (userId) {
      query = query.eq("user_id", userId);
    }

    const { data, error } = await query.single();

    if (error) {
      if (error.code === "PGRST116") return null;
      throw new Error(`Erro ao buscar XML: ${error.message}`);
    }

    return parseXml(data);
  }

  async getXmlsHoje(userId?: string): Promise<number> {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    let query = supabaseAdmin
      .from("xmls")
      .select("id", { count: "exact", head: true })
      .gte("created_at", hoje.toISOString());
    
    if (userId) {
      query = query.eq("user_id", userId);
    }

    const { count, error } = await query;

    if (error) throw new Error(`Erro ao contar XMLs de hoje: ${error.message}`);
    return count || 0;
  }

  async getXmlsRecentes(limit: number = 10, userId?: string): Promise<Xml[]> {
    let query = supabaseAdmin
      .from("xmls")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    
    if (userId) {
      query = query.eq("user_id", userId);
    }

    const { data, error } = await query;

    if (error) throw new Error(`Erro ao buscar XMLs recentes: ${error.message}`);
    return (data || []).map(parseXml);
  }

  async getXmlByChave(chaveNFe: string, userId?: string): Promise<Xml | null> {
    let query = supabaseAdmin.from("xmls").select("*").eq("chave_nfe", chaveNFe);
    
    if (userId) {
      query = query.eq("user_id", userId);
    }

    const { data, error } = await query.single();

    if (error) {
      if (error.code === "PGRST116") return null;
      throw new Error(`Erro ao buscar XML por chave: ${error.message}`);
    }

    return parseXml(data);
  }

  async createXml(xml: InsertXml & { userId: string }): Promise<Xml> {
    const { data, error } = await supabaseAdmin
      .from("xmls")
      .insert({
        user_id: xml.userId,
        empresa_id: xml.empresaId,
        sincronizacao_id: xml.sincronizacaoId || null,
        chave_nfe: xml.chaveNFe,
        numero_nf: xml.numeroNF,
        data_emissao: xml.dataEmissao,
        caminho_arquivo: xml.caminhoArquivo,
        tamanho_bytes: xml.tamanhoBytes,
      })
      .select()
      .single();

    if (error) throw new Error(`Erro ao criar XML: ${error.message}`);
    return parseXml(data);
  }

  // ========== LOGS ==========

  async getLogs(userId?: string): Promise<Log[]> {
    let query = supabaseAdmin.from("logs").select("*").order("timestamp", { ascending: false }).limit(100);
    
    if (userId) {
      query = query.or(`user_id.eq.${userId},user_id.is.null`);
    }

    const { data, error } = await query;

    if (error) throw new Error(`Erro ao buscar logs: ${error.message}`);
    return (data || []).map(parseLog);
  }

  async getLogsRecentes(limit: number = 10, userId?: string): Promise<Log[]> {
    let query = supabaseAdmin.from("logs").select("*").order("timestamp", { ascending: false }).limit(limit);
    
    if (userId) {
      query = query.or(`user_id.eq.${userId},user_id.is.null`);
    }

    const { data, error } = await query;

    if (error) throw new Error(`Erro ao buscar logs recentes: ${error.message}`);
    return (data || []).map(parseLog);
  }

  async createLog(log: InsertLog & { userId?: string }): Promise<Log> {
    const { data, error } = await supabaseAdmin
      .from("logs")
      .insert({
        user_id: log.userId || null,
        empresa_id: log.empresaId || null,
        sincronizacao_id: log.sincronizacaoId || null,
        nivel: log.nivel,
        mensagem: log.mensagem,
        detalhes: log.detalhes || null,
      })
      .select()
      .single();

    if (error) throw new Error(`Erro ao criar log: ${error.message}`);
    return parseLog(data);
  }
}

export const supabaseStorage = new SupabaseStorage();
