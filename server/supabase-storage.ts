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
  Manifestacao,
  InsertManifestacao,
  Configuracao,
  InsertConfiguracao,
  UpdateConfiguracao,
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
    tipoArmazenamento: raw.tipo_armazenamento || "local",
    manifestacaoAutomatica: raw.manifestacao_automatica !== undefined ? raw.manifestacao_automatica : true,
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
    modelo: raw.modelo,
    tipoDocumento: raw.tipo_documento,
    dataEmissao: raw.data_emissao,
    caminhoArquivo: raw.caminho_arquivo,
    tamanhoBytes: raw.tamanho_bytes,
    statusDownload: raw.status_download || 'pendente',
    tentativasDownload: raw.tentativas_download || 0,
    ultimaTentativaDownload: raw.ultima_tentativa_download || undefined,
    erroDownload: raw.erro_download || undefined,
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

function parseManifestacao(raw: any): Manifestacao {
  return {
    id: raw.id,
    userId: raw.user_id,
    empresaId: raw.empresa_id,
    chaveNFe: raw.chave_nfe,
    tipoEvento: raw.tipo_evento,
    status: raw.status,
    dataAutorizacaoNFe: new Date(raw.data_autorizacao_nfe),
    dataManifestacao: raw.data_manifestacao ? new Date(raw.data_manifestacao) : null,
    prazoLegal: new Date(raw.prazo_legal),
    nsuEvento: raw.nsu_evento,
    protocoloEvento: raw.protocolo_evento,
    cStat: raw.c_stat,
    xMotivo: raw.x_motivo,
    justificativa: raw.justificativa,
    tentativas: raw.tentativas,
    ultimoErro: raw.ultimo_erro,
    createdAt: new Date(raw.created_at),
    updatedAt: new Date(raw.updated_at),
  };
}

function parseConfiguracao(raw: any): Configuracao {
  return {
    id: raw.id,
    userId: raw.user_id,
    intervaloSincronizacao: raw.intervalo_sincronizacao,
    sincronizacaoAutomatica: raw.sincronizacao_automatica,
    sincronizarAoIniciar: raw.sincronizar_ao_iniciar,
    retryAutomatico: raw.retry_automatico,
    maxRetries: raw.max_retries,
    timeoutRequisicao: raw.timeout_requisicao,
    validarSSL: raw.validar_ssl,
    logsDetalhados: raw.logs_detalhados,
    notificarNovosXmls: raw.notificar_novos_xmls,
    notificarErros: raw.notificar_erros,
    relatorioDiario: raw.relatorio_diario,
    emailNotificacoes: raw.email_notificacoes,
    createdAt: new Date(raw.created_at),
    updatedAt: new Date(raw.updated_at),
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
        tipo_armazenamento: empresa.tipoArmazenamento ?? "local",
        manifestacao_automatica: empresa.manifestacaoAutomatica ?? true,
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
    if (updates.tipoArmazenamento !== undefined) updateData.tipo_armazenamento = updates.tipoArmazenamento;
    if (updates.manifestacaoAutomatica !== undefined) updateData.manifestacao_automatica = updates.manifestacaoAutomatica;
    
    updateData.updated_at = new Date().toISOString();

    let query = supabaseAdmin.from("empresas").update(updateData).eq("id", id);
    
    if (userId) {
      query = query.eq("user_id", userId);
    }

    // Não usa .select() para evitar erro de cache do PostgREST
    // Busca os dados atualizados em seguida
    const { error } = await query;

    if (error) {
      if (error.code === "PGRST116") return null;
      throw new Error(`Erro ao atualizar empresa: ${error.message}`);
    }

    // Busca empresa atualizada
    return this.getEmpresa(id, userId);
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
    const insertData: any = {
      user_id: xml.userId,
      empresa_id: xml.empresaId,
      sincronizacao_id: xml.sincronizacaoId || null,
      chave_nfe: xml.chaveNFe,
      numero_nf: xml.numeroNF,
      modelo: xml.modelo,
      tipo_documento: xml.tipoDocumento,
      data_emissao: xml.dataEmissao,
      caminho_arquivo: xml.caminhoArquivo,
      tamanho_bytes: xml.tamanhoBytes,
      status_download: (xml as any).statusDownload || 'pendente',
      tentativas_download: (xml as any).tentativasDownload || 0,
    };

    const { data, error } = await supabaseAdmin
      .from("xmls")
      .insert(insertData)
      .select()
      .single();

    // Se erro de duplicata (constraint unique violation), busca XML existente
    if (error) {
      if (error.code === "23505") { // PostgreSQL unique violation
        console.log(`XML duplicado detectado (ignorado): ${xml.chaveNFe}`);
        const existing = await this.getXmlByChave(xml.chaveNFe, xml.userId);
        if (existing) return existing;
      }
      throw new Error(`Erro ao criar XML: ${error.message}`);
    }
    
    return parseXml(data);
  }

  async updateXml(id: string, updates: Partial<Xml>, userId?: string): Promise<Xml | null> {
    const updateData: any = {};
    
    if (updates.statusDownload !== undefined) updateData.status_download = updates.statusDownload;
    if (updates.tentativasDownload !== undefined) updateData.tentativas_download = updates.tentativasDownload;
    if (updates.ultimaTentativaDownload !== undefined) updateData.ultima_tentativa_download = updates.ultimaTentativaDownload;
    if (updates.erroDownload !== undefined) updateData.erro_download = updates.erroDownload;
    if (updates.caminhoArquivo !== undefined) updateData.caminho_arquivo = updates.caminhoArquivo;
    if (updates.tamanhoBytes !== undefined) updateData.tamanho_bytes = updates.tamanhoBytes;
    if (updates.tipoDocumento !== undefined) updateData.tipo_documento = updates.tipoDocumento;

    let query = supabaseAdmin.from("xmls").update(updateData).eq("id", id);
    
    if (userId) {
      query = query.eq("user_id", userId);
    }

    const { error } = await query;

    if (error) {
      if (error.code === "PGRST116") return null;
      throw new Error(`Erro ao atualizar XML: ${error.message}`);
    }

    return this.getXml(id, userId);
  }

  async getXmlsPendentesDownload(userId?: string, limit: number = 50): Promise<Xml[]> {
    let query = supabaseAdmin
      .from("xmls")
      .select("*")
      .eq("status_download", "pendente")
      .eq("tipo_documento", "resNFe") // CRÍTICO: Apenas resNFe (resumos) devem ser baixados
      .order("created_at", { ascending: true })
      .limit(limit);
    
    if (userId) {
      query = query.eq("user_id", userId);
    }

    const { data, error } = await query;

    if (error) throw new Error(`Erro ao buscar XMLs pendentes: ${error.message}`);
    return (data || []).map(parseXml);
  }

  async getXmlsComErroDownload(userId?: string, limit: number = 50, maxTentativas: number = 5): Promise<Xml[]> {
    let query = supabaseAdmin
      .from("xmls")
      .select("*")
      .eq("status_download", "pendente") // Busca pendentes com retry
      .eq("tipo_documento", "resNFe") // CRÍTICO: Apenas resNFe (resumos)
      .gt("tentativas_download", 0) // Que já tiveram pelo menos uma tentativa
      .lt("tentativas_download", maxTentativas) // Que ainda não atingiram o limite
      .order("ultima_tentativa_download", { ascending: true })
      .limit(limit);
    
    if (userId) {
      query = query.eq("user_id", userId);
    }

    const { data, error } = await query;

    if (error) throw new Error(`Erro ao buscar XMLs com erro: ${error.message}`);
    return (data || []).map(parseXml);
  }

  async getXmlsComErroDefinitivo(userId?: string, limit: number = 100): Promise<Xml[]> {
    let query = supabaseAdmin
      .from("xmls")
      .select("*")
      .eq("status_download", "erro") // XMLs que falharam permanentemente
      .eq("tipo_documento", "resNFe") // Apenas resNFe
      .order("updated_at", { ascending: false })
      .limit(limit);
    
    if (userId) {
      query = query.eq("user_id", userId);
    }

    const { data, error } = await query;

    if (error) throw new Error(`Erro ao buscar XMLs com erro definitivo: ${error.message}`);
    return (data || []).map(parseXml);
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
    const { data, error} = await supabaseAdmin
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

  // ========== MANIFESTAÇÕES DO DESTINATÁRIO (NT 2020.001) ==========

  async getManifestacoes(userId?: string): Promise<Manifestacao[]> {
    let query = supabaseAdmin.from("manifestacoes").select("*").order("created_at", { ascending: false });
    
    if (userId) {
      query = query.eq("user_id", userId);
    }

    const { data, error } = await query;

    if (error) throw new Error(`Erro ao buscar manifestações: ${error.message}`);
    return (data || []).map(parseManifestacao);
  }

  async getManifestacao(id: string, userId?: string): Promise<Manifestacao | null> {
    let query = supabaseAdmin.from("manifestacoes").select("*").eq("id", id);
    
    if (userId) {
      query = query.eq("user_id", userId);
    }

    const { data, error } = await query.single();

    if (error) {
      if (error.code === "PGRST116") return null;
      throw new Error(`Erro ao buscar manifestação: ${error.message}`);
    }

    return parseManifestacao(data);
  }

  async getManifestacaoByChave(chaveNFe: string, userId?: string): Promise<Manifestacao | null> {
    let query = supabaseAdmin.from("manifestacoes").select("*").eq("chave_nfe", chaveNFe);
    
    if (userId) {
      query = query.eq("user_id", userId);
    }

    const { data, error } = await query.maybeSingle();

    if (error) throw new Error(`Erro ao buscar manifestação por chave: ${error.message}`);
    return data ? parseManifestacao(data) : null;
  }

  async getManifestacoesByEmpresa(empresaId: string, userId?: string): Promise<Manifestacao[]> {
    let query = supabaseAdmin.from("manifestacoes").select("*").eq("empresa_id", empresaId).order("created_at", { ascending: false });
    
    if (userId) {
      query = query.eq("user_id", userId);
    }

    const { data, error } = await query;

    if (error) throw new Error(`Erro ao buscar manifestações por empresa: ${error.message}`);
    return (data || []).map(parseManifestacao);
  }

  async getManifestacoesPendentes(empresaId: string, userId?: string): Promise<Manifestacao[]> {
    let query = supabaseAdmin
      .from("manifestacoes")
      .select("*")
      .eq("empresa_id", empresaId)
      .eq("status", "pendente")
      .order("prazo_legal", { ascending: true });
    
    if (userId) {
      query = query.eq("user_id", userId);
    }

    const { data, error } = await query;

    if (error) throw new Error(`Erro ao buscar manifestações pendentes: ${error.message}`);
    return (data || []).map(parseManifestacao);
  }

  async createManifestacao(manifestacao: InsertManifestacao & { userId: string }): Promise<Manifestacao> {
    const { data, error } = await supabaseAdmin
      .from("manifestacoes")
      .insert({
        user_id: manifestacao.userId,
        empresa_id: manifestacao.empresaId,
        chave_nfe: manifestacao.chaveNFe,
        tipo_evento: manifestacao.tipoEvento,
        status: manifestacao.status || "pendente",
        data_autorizacao_nfe: manifestacao.dataAutorizacaoNFe,
        data_manifestacao: manifestacao.dataManifestacao || null,
        prazo_legal: manifestacao.prazoLegal,
        nsu_evento: manifestacao.nsuEvento || null,
        protocolo_evento: manifestacao.protocoloEvento || null,
        c_stat: manifestacao.cStat || null,
        x_motivo: manifestacao.xMotivo || null,
        justificativa: manifestacao.justificativa || null,
        tentativas: manifestacao.tentativas || 0,
        ultimo_erro: manifestacao.ultimoErro || null,
      })
      .select()
      .single();

    if (error) throw new Error(`Erro ao criar manifestação: ${error.message}`);
    return parseManifestacao(data);
  }

  async updateManifestacao(id: string, updates: Partial<Manifestacao>, userId?: string): Promise<Manifestacao | null> {
    const updateData: any = {};
    
    if (updates.status !== undefined) updateData.status = updates.status;
    if (updates.dataManifestacao !== undefined) updateData.data_manifestacao = updates.dataManifestacao;
    if (updates.nsuEvento !== undefined) updateData.nsu_evento = updates.nsuEvento;
    if (updates.protocoloEvento !== undefined) updateData.protocolo_evento = updates.protocoloEvento;
    if (updates.cStat !== undefined) updateData.c_stat = updates.cStat;
    if (updates.xMotivo !== undefined) updateData.x_motivo = updates.xMotivo;
    if (updates.tentativas !== undefined) updateData.tentativas = updates.tentativas;
    if (updates.ultimoErro !== undefined) updateData.ultimo_erro = updates.ultimoErro;

    updateData.updated_at = new Date().toISOString();

    let query = supabaseAdmin.from("manifestacoes").update(updateData).eq("id", id);
    
    if (userId) {
      query = query.eq("user_id", userId);
    }

    const { data, error } = await query.select().single();

    if (error) {
      if (error.code === "PGRST116") return null;
      throw new Error(`Erro ao atualizar manifestação: ${error.message}`);
    }

    return parseManifestacao(data);
  }

  async getManifestacoesRecentes(limit: number = 10, userId?: string): Promise<Manifestacao[]> {
    let query = supabaseAdmin.from("manifestacoes").select("*").order("created_at", { ascending: false }).limit(limit);
    
    if (userId) {
      query = query.eq("user_id", userId);
    }

    const { data, error } = await query;

    if (error) throw new Error(`Erro ao buscar manifestações recentes: ${error.message}`);
    return (data || []).map(parseManifestacao);
  }

  // ========== CONFIGURAÇÕES ==========

  async getConfiguracao(userId: string): Promise<Configuracao | null> {
    const { data, error } = await supabaseAdmin
      .from("configuracoes")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw new Error(`Erro ao buscar configuração: ${error.message}`);
    return data ? parseConfiguracao(data) : null;
  }

  async createConfiguracao(config: InsertConfiguracao & { userId: string }): Promise<Configuracao> {
    const { data, error } = await supabaseAdmin
      .from("configuracoes")
      .insert({
        user_id: config.userId,
        intervalo_sincronizacao: config.intervaloSincronizacao || "1h",
        sincronizacao_automatica: config.sincronizacaoAutomatica !== undefined ? config.sincronizacaoAutomatica : true,
        sincronizar_ao_iniciar: config.sincronizarAoIniciar !== undefined ? config.sincronizarAoIniciar : true,
        retry_automatico: config.retryAutomatico !== undefined ? config.retryAutomatico : true,
        max_retries: config.maxRetries || 3,
        timeout_requisicao: config.timeoutRequisicao || 60,
        validar_ssl: config.validarSSL !== undefined ? config.validarSSL : true,
        logs_detalhados: config.logsDetalhados !== undefined ? config.logsDetalhados : false,
        notificar_novos_xmls: config.notificarNovosXmls !== undefined ? config.notificarNovosXmls : true,
        notificar_erros: config.notificarErros !== undefined ? config.notificarErros : true,
        relatorio_diario: config.relatorioDiario !== undefined ? config.relatorioDiario : false,
        email_notificacoes: config.emailNotificacoes || null,
      })
      .select()
      .single();

    if (error) throw new Error(`Erro ao criar configuração: ${error.message}`);
    return parseConfiguracao(data);
  }

  async updateConfiguracao(userId: string, updates: UpdateConfiguracao): Promise<Configuracao> {
    const updateData: any = {};
    
    if (updates.intervaloSincronizacao !== undefined) updateData.intervalo_sincronizacao = updates.intervaloSincronizacao;
    if (updates.sincronizacaoAutomatica !== undefined) updateData.sincronizacao_automatica = updates.sincronizacaoAutomatica;
    if (updates.sincronizarAoIniciar !== undefined) updateData.sincronizar_ao_iniciar = updates.sincronizarAoIniciar;
    if (updates.retryAutomatico !== undefined) updateData.retry_automatico = updates.retryAutomatico;
    if (updates.maxRetries !== undefined) updateData.max_retries = updates.maxRetries;
    if (updates.timeoutRequisicao !== undefined) updateData.timeout_requisicao = updates.timeoutRequisicao;
    if (updates.validarSSL !== undefined) updateData.validar_ssl = updates.validarSSL;
    if (updates.logsDetalhados !== undefined) updateData.logs_detalhados = updates.logsDetalhados;
    if (updates.notificarNovosXmls !== undefined) updateData.notificar_novos_xmls = updates.notificarNovosXmls;
    if (updates.notificarErros !== undefined) updateData.notificar_erros = updates.notificarErros;
    if (updates.relatorioDiario !== undefined) updateData.relatorio_diario = updates.relatorioDiario;
    if (updates.emailNotificacoes !== undefined) updateData.email_notificacoes = updates.emailNotificacoes || null;

    updateData.updated_at = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from("configuracoes")
      .update(updateData)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) throw new Error(`Erro ao atualizar configuração: ${error.message}`);
    return parseConfiguracao(data);
  }

  // ========== DISTRIBUTED LOCKS ==========
  
  // Owner UUID único e estável para esta instância do processo
  private lockOwnerUuid: string | null = null;

  /**
   * Obtém ou gera owner UUID estável para locks distribuídos
   */
  private getLockOwnerUuid(): string {
    if (!this.lockOwnerUuid) {
      // Usa UUID da variável de ambiente ou gera novo (estável durante vida do processo)
      this.lockOwnerUuid = process.env.LOCK_OWNER_UUID || crypto.randomUUID();
      console.log(`[SupabaseStorage] Lock owner UUID: ${this.lockOwnerUuid}`);
    }
    return this.lockOwnerUuid;
  }

  /**
   * Tenta adquirir lock de download distribuído usando função PostgreSQL
   * Retorna true se conseguiu adquirir, false se já ocupado por outro owner
   */
  async tryAcquireDownloadLock(): Promise<boolean> {
    try {
      const lockName = "xml-download-service";
      const ownerUuid = this.getLockOwnerUuid();
      
      // Chama função PostgreSQL via RPC
      const { data, error } = await supabaseAdmin.rpc('acquire_download_lock', {
        p_name: lockName,
        p_owner: ownerUuid,
        p_ttl_seconds: 180 // 3 minutos
      });

      if (error) {
        console.error("[SupabaseStorage] Erro ao adquirir lock:", error.message);
        return false;
      }

      const acquired = !!data;
      console.log(`[SupabaseStorage] Lock "${lockName}" acquire: ${acquired ? 'SUCCESS' : 'FAIL (já ocupado)'}`);
      return acquired;
    } catch (error: any) {
      console.error("[SupabaseStorage] Exceção ao adquirir lock:", error.message);
      return false;
    }
  }

  /**
   * Libera lock de download distribuído
   * Retorna true se liberou, false se não era o owner
   */
  async releaseDownloadLock(): Promise<boolean> {
    try {
      const lockName = "xml-download-service";
      const ownerUuid = this.getLockOwnerUuid();
      
      const { data, error } = await supabaseAdmin.rpc('release_download_lock', {
        p_name: lockName,
        p_owner: ownerUuid
      });

      if (error) {
        console.error("[SupabaseStorage] Erro ao liberar lock:", error.message);
        return false;
      }

      const released = !!data;
      console.log(`[SupabaseStorage] Lock "${lockName}" release: ${released ? 'SUCCESS' : 'FAIL (não era o owner)'}`);
      return released;
    } catch (error: any) {
      console.error("[SupabaseStorage] Exceção ao liberar lock:", error.message);
      return false;
    }
  }
}

export const supabaseStorage = new SupabaseStorage();
