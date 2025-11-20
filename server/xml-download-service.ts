/**
 * Serviço de Download Automático de XMLs Completos
 * 
 * Este serviço gerencia o download automático de XMLs completos (nfeProc)
 * a partir de resumos (resNFe) usando consulta por chave de acesso.
 * 
 * Fluxo:
 * 1. Busca XMLs com status_download='pendente' ou 'erro' (com retry)
 * 2. Para cada XML, tenta consultar chave na SEFAZ
 * 3. Se obtiver XML completo, substitui o resumo e marca como 'completo'
 * 4. Se falhar, incrementa tentativas e marca como 'erro'
 */

import { storage } from "./storage";
import { sefazService } from "./sefaz-service";
import type { Xml, Empresa } from "@shared/schema";
import path from "path";
import { xmlStorageService } from "./xml-storage";

export class XmlDownloadService {
  private readonly MAX_TENTATIVAS = 5;
  private readonly BATCH_SIZE = 10; // Processa 10 XMLs por vez
  private readonly LOCK_TIMEOUT = 3 * 60 * 1000; // 3 minutos (menos que intervalo do cron de 5min)
  private lockAcquired: boolean = false; // Flag se lock foi adquirido

  /**
   * Adquire lock distribuído usando PostgreSQL + tabela dedicada
   * ATÔMICO: INSERT ON CONFLICT garante exclusão mútua real
   */
  private async acquireLock(): Promise<boolean> {
    try {
      // Tenta adquirir lock distribuído
      const acquired = await storage.tryAcquireDownloadLock();
      
      if (!acquired) {
        console.log("[Download Service] Lock já ocupado por outro processo");
        return false;
      }

      console.log("[Download Service] Lock adquirido com sucesso");
      this.lockAcquired = true;
      
      // Log para auditoria (não para controle de lock)
      await storage.createLog({
        nivel: "info",
        mensagem: "Download Service - Lock Acquired",
        detalhes: JSON.stringify({ 
          timestamp: new Date().toISOString(),
          pid: process.pid 
        }),
      });

      return true;
    } catch (error) {
      console.error("[Download Service] Erro ao adquirir lock:", error);
      return false;
    }
  }

  /**
   * Libera lock distribuído
   */
  private async releaseLock(): Promise<void> {
    if (!this.lockAcquired) return;
    
    try {
      await storage.releaseDownloadLock();
      
      console.log("[Download Service] Lock liberado com sucesso");
      
      // Log para auditoria
      await storage.createLog({
        nivel: "info",
        mensagem: "Download Service - Lock Released",
        detalhes: JSON.stringify({ 
          timestamp: new Date().toISOString(),
          pid: process.pid 
        }),
      });
      
      this.lockAcquired = false;
    } catch (error) {
      console.error("[Download Service] Erro ao liberar lock:", error);
    }
  }

  /**
   * Processa downloads pendentes de todos os usuários
   * Chamado periodicamente pelo cron job
   */
  async processarDownloadsPendentes(): Promise<void> {
    console.log("[Download Service] Iniciando processamento de downloads pendentes...");

    // CRÍTICO: Tenta adquirir lock para evitar concorrência
    const lockAcquired = await this.acquireLock();
    if (!lockAcquired) {
      console.log("[Download Service] Lock ativo - outro processo está executando. Pulando esta execução.");
      return;
    }

    try {
      // Busca XMLs pendentes (sem filtro de usuário - processa todos)
      const xmlsPendentes = await storage.getXmlsPendentesDownload(undefined, this.BATCH_SIZE);
      
      // Busca XMLs com erro que precisam retry
      const xmlsComErro = await storage.getXmlsComErroDownload(undefined, this.BATCH_SIZE);

      const todosXmls = [...xmlsPendentes, ...xmlsComErro];

      if (todosXmls.length === 0) {
        console.log("[Download Service] Nenhum XML pendente de download");
        return;
      }

      // CRÍTICO: Filtra novamente para garantir que apenas resNFe seja processado
      // Isso previne race conditions onde XML pode ter sido convertido entre query e processamento
      const xmlsValidos = todosXmls.filter(xml => {
        if (xml.tipoDocumento !== "resNFe") {
          console.warn(`[Download Service] Pulando XML ${xml.id} - já é ${xml.tipoDocumento}`);
          return false;
        }
        if (xml.statusDownload === "completo") {
          console.warn(`[Download Service] Pulando XML ${xml.id} - status já é completo`);
          return false;
        }
        const tentativas = xml.tentativasDownload ?? 0;
        if (tentativas >= this.MAX_TENTATIVAS) {
          console.warn(`[Download Service] Pulando XML ${xml.id} - já atingiu ${tentativas} tentativas`);
          return false;
        }
        return true;
      });

      if (xmlsValidos.length === 0) {
        console.log("[Download Service] Nenhum XML válido para processar após filtros");
        return;
      }

      console.log(`[Download Service] Encontrados ${xmlsValidos.length} XMLs válidos para processar (de ${todosXmls.length} retornados)`);
      console.log(`  - Pendentes: ${xmlsPendentes.length}`);
      console.log(`  - Com erro (retry): ${xmlsComErro.length}`);

      // Agrupa XMLs por empresa para otimizar certificados
      const xmlsPorEmpresa = this.agruparPorEmpresa(xmlsValidos);

      for (const [empresaId, xmls] of Array.from(xmlsPorEmpresa.entries())) {
        await this.processarXmlsDaEmpresa(empresaId, xmls);
      }

      console.log("[Download Service] Processamento concluído");
    } catch (error: any) {
      console.error("[Download Service] Erro no processamento:", error.message);
      await storage.createLog({
        nivel: "error",
        mensagem: "Erro no processamento de downloads automáticos",
        detalhes: JSON.stringify({ erro: error.message }),
      });
    } finally {
      // CRÍTICO: Sempre libera lock, mesmo em caso de erro
      await this.releaseLock();
    }
  }

  /**
   * Processa downloads de XMLs de uma empresa específica
   */
  private async processarXmlsDaEmpresa(empresaId: string, xmls: Xml[]): Promise<void> {
    console.log(`[Download Service] Processando ${xmls.length} XMLs da empresa ${empresaId}`);

    // Busca dados da empresa
    const empresa = await storage.getEmpresa(empresaId);
    if (!empresa) {
      console.error(`[Download Service] Empresa ${empresaId} não encontrada`);
      return;
    }

    if (!empresa.ativo) {
      console.log(`[Download Service] Empresa ${empresaId} está inativa, ignorando`);
      return;
    }

    // Processa cada XML
    for (const xml of xmls) {
      await this.tentarDownloadXml(xml, empresa);
      
      // Pequeno delay entre downloads para não sobrecarregar SEFAZ
      await this.sleep(2000); // 2 segundos entre downloads
    }
  }

  /**
   * Tenta fazer download do XML completo via consulta por chave
   */
  private async tentarDownloadXml(xml: Xml, empresa: Empresa): Promise<void> {
    // CRÍTICO: Garante que tentativasDownload é número, não NaN
    const tentativaAtual = xml.tentativasDownload ?? 0;
    const novaTentativa = tentativaAtual + 1;
    console.log(`[Download Service] Tentando download: ${xml.chaveNFe} (tentativa ${novaTentativa}/${this.MAX_TENTATIVAS})`);

    // Verifica rate limit ANTES de consultar SEFAZ (máx 20 consultas/hora)
    const podeConsultar = await storage.checkRateLimit(empresa.id, "consultaChave", empresa.userId);
    if (!podeConsultar) {
      console.warn(`[Download Service] Rate limit excedido para empresa ${empresa.id} - pulando XML (retry automático após janela)`);
      
      // NÃO grava erro nem incrementa tentativas - rate limit é temporário
      // XML continuará com statusDownload="pendente" e será retentado automaticamente
      // quando janela de 1h resetar e rate limiter permitir novamente
      return;
    }

    // Atualiza tentativa ANTES de consultar
    await storage.updateXml(xml.id, {
      tentativasDownload: novaTentativa,
      ultimaTentativaDownload: new Date(),
    });

    try {
      // Consulta XML completo via chave de acesso
      const resultado = await sefazService.consultarChave(xml.chaveNFe, empresa);

      if (!resultado || !resultado.xmlContent) {
        throw new Error("SEFAZ retornou sem XML completo");
      }

      // Salva XML completo substituindo o resumo
      await this.salvarXmlCompleto(xml, empresa, resultado.xmlContent, resultado.cStat);

      console.log(`[Download Service] ✓ Download bem-sucedido: ${xml.chaveNFe}`);
      
      await storage.createLog({
        userId: xml.userId,
        empresaId: xml.empresaId,
        nivel: "info",
        mensagem: `Download automático concluído: NF-e ${xml.numeroNF}`,
        detalhes: JSON.stringify({ 
          chaveNFe: xml.chaveNFe,
          tentativas: novaTentativa,
          cStat: resultado.cStat
        }),
      });
    } catch (error: any) {
      console.error(`[Download Service] ✗ Erro ao baixar ${xml.chaveNFe}:`, error.message);

      // Se atingiu limite, marca como erro permanente. Senão, mantém pendente para retry
      const novoStatus = novaTentativa >= this.MAX_TENTATIVAS ? "erro" : "pendente";

      await storage.updateXml(xml.id, {
        statusDownload: novoStatus,
        erroDownload: error.message.substring(0, 500), // Limita tamanho do erro
      });

      if (novoStatus === "erro") {
        await storage.createLog({
          userId: xml.userId,
          empresaId: xml.empresaId,
          nivel: "warning",
          mensagem: `Falha no download automático após ${this.MAX_TENTATIVAS} tentativas: NF-e ${xml.numeroNF}`,
          detalhes: JSON.stringify({ 
            chaveNFe: xml.chaveNFe,
            ultimoErro: error.message.substring(0, 500),
            tentativas: this.MAX_TENTATIVAS
          }),
        });
      }
    }
  }

  /**
   * Salva XML completo no storage e atualiza registro do banco
   * CRÍTICO: Persiste o arquivo XML no disco/Supabase Storage
   */
  private async salvarXmlCompleto(
    xmlOriginal: Xml,
    empresa: Empresa,
    xmlContent: string,
    cStat: string
  ): Promise<void> {
    // Extrai informações do XML completo
    const dataEmissao = xmlOriginal.dataEmissao;
    const ano = dataEmissao.getFullYear();
    const mes = (dataEmissao.getMonth() + 1).toString().padStart(2, "0");
    const tipoDoc = xmlOriginal.modelo === "65" ? "NFCe" : "NFe";

    // Caminho para XML completo (diferente do resumo - sem pasta "Resumos")
    const filename = `${parseInt(xmlOriginal.numeroNF)}.xml`;
    const relativePath = path.join(tipoDoc, empresa.cnpj, `${ano}`, mes, filename);

    // CRÍTICO: Salva XML completo no storage (disco ou Supabase)
    const caminhoCompleto = await xmlStorageService.saveXml(
      empresa.tipoArmazenamento,
      relativePath,
      xmlContent
    );

    const tamanhoBytes = Buffer.byteLength(xmlContent, "utf-8");

    // Deleta arquivo resNFe antigo para liberar espaço
    try {
      if (xmlOriginal.caminhoArquivo !== caminhoCompleto) {
        await xmlStorageService.deleteXml(empresa.tipoArmazenamento, xmlOriginal.caminhoArquivo);
        console.log(`[Download Service] Arquivo resNFe antigo deletado: ${xmlOriginal.caminhoArquivo}`);
      }
    } catch (err) {
      // Não falha se não conseguir deletar (arquivo pode já ter sido deletado)
      console.warn(`[Download Service] Não foi possível deletar resNFe antigo:`, err);
    }

    // Determina status da NFe baseado em cStat da SEFAZ
    let statusNfe = "autorizada"; // Default
    switch (cStat) {
      case "100":
        statusNfe = "autorizada";
        break;
      case "101":
        statusNfe = "cancelada";
        console.log(`[Download Service] NFe ${xmlOriginal.numeroNF} está CANCELADA (cStat 101)`);
        break;
      case "110":
      case "301":
      case "302":
        statusNfe = "denegada";
        console.log(`[Download Service] NFe ${xmlOriginal.numeroNF} está DENEGADA (cStat ${cStat})`);
        break;
      case "217":
        // NF-e não consta na base da SEFAZ (pode ter sido inutilizada ou erro)
        statusNfe = "autorizada"; // Mantém default mas pode ser ajustado
        console.warn(`[Download Service] NFe ${xmlOriginal.numeroNF} não consta (cStat 217)`);
        break;
    }

    // Atualiza registro com XML completo E status da NFe
    await storage.updateXml(xmlOriginal.id, {
      tipoDocumento: "nfeProc", // Agora é XML completo
      caminhoArquivo: caminhoCompleto, // Novo caminho
      tamanhoBytes, // Novo tamanho
      statusDownload: "completo",
      statusNfe, // Status baseado em cStat
      erroDownload: undefined, // Limpa erro anterior
    });
  }

  /**
   * Agrupa XMLs por empresa para otimizar processamento
   */
  private agruparPorEmpresa(xmls: Xml[]): Map<string, Xml[]> {
    const grupos = new Map<string, Xml[]>();

    for (const xml of xmls) {
      const lista = grupos.get(xml.empresaId) || [];
      lista.push(xml);
      grupos.set(xml.empresaId, lista);
    }

    return grupos;
  }

  /**
   * Utilitário para delay
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Processa downloads pendentes de uma empresa específica (endpoint manual)
   */
  async processarDownloadsEmpresa(empresaId: string, userId?: string): Promise<{ processados: number; sucesso: number; erro: number }> {
    console.log(`[Download Service] Processamento manual para empresa ${empresaId}`);

    // Busca empresa
    const empresa = await storage.getEmpresa(empresaId, userId);
    if (!empresa) {
      throw new Error("Empresa não encontrada");
    }

    // Busca XMLs pendentes da empresa
    const xmlsPendentes = await storage.getXmlsPendentesDownload(userId);
    const xmlsEmpresa = xmlsPendentes.filter(x => x.empresaId === empresaId);

    if (xmlsEmpresa.length === 0) {
      return { processados: 0, sucesso: 0, erro: 0 };
    }

    let sucesso = 0;
    let erro = 0;

    for (const xml of xmlsEmpresa) {
      try {
        await this.tentarDownloadXml(xml, empresa);
        sucesso++;
      } catch (err) {
        erro++;
      }
      
      await this.sleep(2000);
    }

    return {
      processados: xmlsEmpresa.length,
      sucesso,
      erro
    };
  }
}

// Singleton
export const xmlDownloadService = new XmlDownloadService();
