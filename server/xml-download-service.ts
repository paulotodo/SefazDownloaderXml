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
  private isProcessing = false;
  private readonly MAX_TENTATIVAS = 5;
  private readonly BATCH_SIZE = 10; // Processa 10 XMLs por vez

  /**
   * Processa downloads pendentes de todos os usuários
   * Chamado periodicamente pelo cron job
   */
  async processarDownloadsPendentes(): Promise<void> {
    if (this.isProcessing) {
      console.log("[Download Service] Já há um processamento em andamento, aguardando...");
      return;
    }

    this.isProcessing = true;
    console.log("[Download Service] Iniciando processamento de downloads pendentes...");

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

      console.log(`[Download Service] Encontrados ${todosXmls.length} XMLs para processar`);
      console.log(`  - Pendentes: ${xmlsPendentes.length}`);
      console.log(`  - Com erro (retry): ${xmlsComErro.length}`);

      // Agrupa XMLs por empresa para otimizar certificados
      const xmlsPorEmpresa = this.agruparPorEmpresa(todosXmls);

      for (const [empresaId, xmls] of xmlsPorEmpresa.entries()) {
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
      this.isProcessing = false;
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
    const novaTentativa = xml.tentativasDownload + 1;
    console.log(`[Download Service] Tentando download: ${xml.chaveNFe} (tentativa ${novaTentativa}/${this.MAX_TENTATIVAS})`);

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

    // Atualiza registro com XML completo
    await storage.updateXml(xmlOriginal.id, {
      tipoDocumento: "nfeProc", // Agora é XML completo
      caminhoArquivo: caminhoCompleto, // Novo caminho
      tamanhoBytes, // Novo tamanho
      statusDownload: "completo",
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
