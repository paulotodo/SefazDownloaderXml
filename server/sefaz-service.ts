import https from "https";
import crypto from "crypto";
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { XMLParser } from "fast-xml-parser";
import * as pako from "pako";
import { storage } from "./storage";
import type { Empresa } from "@shared/schema";
import { loadPKCS12Certificate } from "./cert-loader";

const UF_CODE_MAP: Record<string, number> = {
  AC: 12, AL: 27, AM: 13, AP: 16, BA: 29, CE: 23,
  DF: 53, ES: 32, GO: 52, MA: 21, MG: 31, MS: 50,
  MT: 51, PA: 15, PB: 25, PE: 26, PI: 22, PR: 41,
  RJ: 33, RN: 24, RO: 11, RR: 14, RS: 43, SC: 42,
  SE: 28, SP: 35, TO: 17,
};

const ENDPOINTS = {
  prod: "https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx",
  hom: "https://hom1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx",
};

interface SefazResponse {
  cStat: string;
  xMotivo: string;
  ultNSU?: string;
  maxNSU?: string;
  docZips?: Array<{
    NSU: string;
    schema: string;
    content: string;
  }>;
}

export class SefazService {
  private parser: XMLParser;
  private xmlDestPath: string;

  constructor() {
    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "",
    });
    this.xmlDestPath = process.env.XML_DEST_PATH || "./xmls";
  }

  /**
   * Monta SOAP envelope usando consNSU (consulta por NSU específico)
   * Usado apenas para compatibilidade com código legado
   * ATENÇÃO: Preferir buildSOAPEnvelopeDistNSU para seguir NT 2014.002
   */
  private buildSOAPEnvelope(cnpj: string, uf: string, ambiente: string, nsu: string): string {
    const cufAutor = UF_CODE_MAP[uf.toUpperCase()] || 35;
    const tpAmb = ambiente.toLowerCase().startsWith("prod") ? "1" : "2";
    const nsu15 = nsu.padStart(15, "0");

    return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"
                 xmlns:nfe="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">
  <soap12:Body>
    <nfe:nfeDistDFeInteresse>
      <nfe:nfeDadosMsg>
        <distDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01">
          <tpAmb>${tpAmb}</tpAmb>
          <cUFAutor>${cufAutor}</cUFAutor>
          <CNPJ>${cnpj}</CNPJ>
          <consNSU><NSU>${nsu15}</NSU></consNSU>
        </distDFeInt>
      </nfe:nfeDadosMsg>
    </nfe:nfeDistDFeInteresse>
  </soap12:Body>
</soap12:Envelope>`;
  }

  /**
   * Monta SOAP envelope usando distNSU (distribuição por ultNSU)
   * Conforme NT 2014.002 - Regra oficial da SEFAZ
   * 
   * IMPORTANTE: Este é o método correto para consultas NFeDistribuicaoDFe
   * - Usa <distNSU><ultNSU> em vez de <consNSU><NSU>
   * - Permite que SEFAZ retorne documentos após o ultNSU informado
   * - Evita rejeição cStat=656 (uso indevido do serviço)
   * 
   * @param cnpj - CNPJ da empresa
   * @param uf - UF de autorização (ex: 'SP', 'MG')
   * @param ambiente - Ambiente ('producao' ou 'homologacao')
   * @param ultNSU - Último NSU já consultado (use "0" apenas na primeira consulta)
   */
  private buildSOAPEnvelopeDistNSU(cnpj: string, uf: string, ambiente: string, ultNSU: string): string {
    const cufAutor = UF_CODE_MAP[uf.toUpperCase()] || 35;
    const tpAmb = ambiente.toLowerCase().startsWith("prod") ? "1" : "2";
    const ultNSU15 = ultNSU.padStart(15, "0");

    return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"
                 xmlns:nfe="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">
  <soap12:Body>
    <nfe:nfeDistDFeInteresse>
      <nfe:nfeDadosMsg>
        <distDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01">
          <tpAmb>${tpAmb}</tpAmb>
          <cUFAutor>${cufAutor}</cUFAutor>
          <CNPJ>${cnpj}</CNPJ>
          <distNSU><ultNSU>${ultNSU15}</ultNSU></distNSU>
        </distDFeInt>
      </nfe:nfeDadosMsg>
    </nfe:nfeDistDFeInteresse>
  </soap12:Body>
</soap12:Envelope>`;
  }

  private async callDistDFe(
    empresa: Empresa,
    envelope: string
  ): Promise<string> {
    return new Promise(async (resolve, reject) => {
      try {
        const url = new URL(ENDPOINTS[empresa.ambiente as "prod" | "hom"]);

        // Carrega e converte certificado PKCS12 para PEM usando node-forge
        // Isto resolve o problema "Unsupported PKCS12 PFX data" com certificados A1 brasileiros
        // que usam algoritmos legados (DES/3DES) não suportados por OpenSSL 3.x
        let certData;
        try {
          certData = await loadPKCS12Certificate(
            empresa.certificadoPath,
            empresa.certificadoSenha
          );
        } catch (error: any) {
          // Erros do cert-loader já são formatados adequadamente
          throw error;
        }

        // Cria agente HTTPS com certificado em formato PEM
        // PEM é suportado nativamente pelo OpenSSL 3.x, evitando problemas com algoritmos legados
        const agent = new https.Agent({
          key: certData.key,
          cert: certData.cert,
          ca: certData.ca.length > 0 ? certData.ca : undefined,
          rejectUnauthorized: true, // Validar certificados SSL
          secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT,
          minVersion: 'TLSv1.2' as any, // Mínimo TLS 1.2
          maxVersion: 'TLSv1.3' as any, // Máximo TLS 1.3
        });

        const options: https.RequestOptions = {
          hostname: url.hostname,
          port: 443,
          path: url.pathname,
          method: "POST",
          headers: {
            "Content-Type": "application/soap+xml; charset=utf-8; action=\"http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe/nfeDistDFeInteresse\"",
            "Content-Length": Buffer.byteLength(envelope),
            "SOAPAction": "http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe/nfeDistDFeInteresse",
          },
          agent,
        };

        const req = https.request(options, (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            if (res.statusCode && res.statusCode >= 400) {
              reject(new Error(`HTTP ${res.statusCode}: ${data}`));
            } else {
              resolve(data);
            }
          });
        });

        req.on("error", (error) => {
          reject(new Error(`Erro na requisição HTTPS: ${error.message}`));
        });

        req.write(envelope);
        req.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  private parseSOAPResponse(xmlResponse: string): SefazResponse {
    const parsed = this.parser.parse(xmlResponse);

    // Navega pela estrutura SOAP - suporta múltiplos namespaces
    const envelope = 
      parsed["soap12:Envelope"] || 
      parsed["soap:Envelope"] ||
      parsed["Envelope"];
    
    if (!envelope) {
      console.error('❌ Envelope SOAP não encontrado');
      return { cStat: "", xMotivo: "Envelope SOAP não encontrado", docZips: [] };
    }
    
    const body = 
      envelope["soap12:Body"] || 
      envelope["soap:Body"] ||
      envelope["Body"];
    
    if (!body) {
      console.error('❌ Body SOAP não encontrado');
      return { cStat: "", xMotivo: "Body SOAP não encontrado", docZips: [] };
    }
    
    const response =
      body["nfeDistDFeInteresseResponse"] ||
      body["nfe:nfeDistDFeInteresseResponse"];
    
    if (!response) {
      console.error('❌ nfeDistDFeInteresseResponse não encontrada');
      return { cStat: "", xMotivo: "Response não encontrada", docZips: [] };
    }
    
    const result = 
      response["nfeDistDFeInteresseResult"] || 
      response["nfe:nfeDistDFeInteresseResult"];
    
    if (!result) {
      console.error('❌ nfeDistDFeInteresseResult não encontrado');
      return { cStat: "", xMotivo: "Result não encontrado", docZips: [] };
    }
    
    // Tenta encontrar retDistDFeInt em várias estruturas possíveis
    const retDistDFeInt = 
      result["retDistDFeInt"] || 
      result["nfe:retDistDFeInt"] ||
      body["retDistDFeInt"] ||
      body["nfe:retDistDFeInt"] ||
      parsed["retDistDFeInt"];

    if (!retDistDFeInt) {
      console.error('❌ retDistDFeInt não encontrado');
      return { cStat: "", xMotivo: "retDistDFeInt não encontrado", docZips: [] };
    }

    const cStat = String(retDistDFeInt.cStat || "");
    const xMotivo = String(retDistDFeInt.xMotivo || "");
    const ultNSU = String(retDistDFeInt.ultNSU || "");
    const maxNSU = String(retDistDFeInt.maxNSU || "");

    let docZips: Array<{ NSU: string; schema: string; content: string }> = [];
    const lote = retDistDFeInt.loteDistDFeInt;

    if (lote?.docZip) {
      const docs = Array.isArray(lote.docZip) ? lote.docZip : [lote.docZip];
      docZips = docs.map((doc: any) => ({
        NSU: doc.NSU || doc["@_NSU"] || "",
        schema: doc.schema || doc["@_schema"] || "",
        content: doc["#text"] || doc["_text"] || "",
      }));
    }

    return { cStat, xMotivo, ultNSU, maxNSU, docZips };
  }

  private decompressDocZip(base64Content: string): string {
    try {
      const buffer = Buffer.from(base64Content, "base64");
      const decompressed = pako.ungzip(buffer, { to: "string" });
      return decompressed;
    } catch (error) {
      // Se falhar descompactação, talvez já esteja descompactado
      return Buffer.from(base64Content, "base64").toString("utf-8");
    }
  }

  private async saveNFeProc(
    xmlContent: string,
    empresa: Empresa,
    sincronizacaoId: string
  ): Promise<void> {
    const parsed = this.parser.parse(xmlContent);
    const nfeProc = parsed.nfeProc;

    if (!nfeProc) {
      throw new Error("XML não é um nfeProc");
    }

    // Extrai informações
    const protNFe = nfeProc.protNFe;
    const NFe = nfeProc.NFe;
    const infNFe = NFe?.infNFe;
    const ide = infNFe?.ide;

    const chNFe = protNFe?.infProt?.chNFe || "";
    const numeroNF = ide?.nNF || "";
    const dhEmi = ide?.dhEmi || ide?.dEmi || new Date().toISOString();

    if (!chNFe || !numeroNF) {
      throw new Error("Não foi possível extrair chave ou número da NF-e");
    }

    // Verifica se já existe
    const existing = await storage.getXmlByChave(chNFe, empresa.userId);
    if (existing) {
      console.log(`XML já existe: ${chNFe}`);
      return;
    }

    // Organiza por CNPJ/Ano/Mês
    const dataEmissao = new Date(dhEmi);
    const ano = dataEmissao.getFullYear();
    const mes = (dataEmissao.getMonth() + 1).toString().padStart(2, "0");

    const destDir = path.join(this.xmlDestPath, empresa.cnpj, `${ano}`, mes);
    await fs.mkdir(destDir, { recursive: true });

    const filename = `${parseInt(numeroNF)}.xml`;
    const filepath = path.join(destDir, filename);

    await fs.writeFile(filepath, xmlContent, "utf-8");

    const stats = await fs.stat(filepath);

    // Salva no storage
    await storage.createXml({
      userId: empresa.userId,
      empresaId: empresa.id,
      sincronizacaoId,
      chaveNFe: chNFe,
      numeroNF: numeroNF.toString(),
      dataEmissao,
      caminhoArquivo: filepath,
      tamanhoBytes: stats.size,
    });

    await storage.createLog({
      userId: empresa.userId,
      empresaId: empresa.id,
      sincronizacaoId,
      nivel: "info",
      mensagem: `XML salvo: NF-e ${numeroNF}`,
      detalhes: JSON.stringify({ chNFe, filepath }),
    });
  }

  async sincronizarEmpresa(empresa: Empresa): Promise<number> {
    // Verifica se empresa está bloqueada (cStat 656)
    if (empresa.bloqueadoAte && new Date() < empresa.bloqueadoAte) {
      const tempoRestante = Math.ceil((empresa.bloqueadoAte.getTime() - Date.now()) / 1000 / 60);
      const mensagemBloqueio = `Empresa bloqueada pela SEFAZ (erro 656) até ${empresa.bloqueadoAte.toLocaleString('pt-BR')}. Tempo restante: ${tempoRestante} minutos. Aguarde o desbloqueio automático.`;
      
      await storage.createLog({
        userId: empresa.userId,
        empresaId: empresa.id,
        sincronizacaoId: null,
        nivel: "warning",
        mensagem: "Tentativa de sincronização bloqueada",
        detalhes: JSON.stringify({ 
          bloqueadoAte: empresa.bloqueadoAte.toISOString(),
          tempoRestanteMinutos: tempoRestante,
          observacao: "Aguarde o desbloqueio automático. Verifique se há outro sistema consultando este CNPJ."
        }),
      });
      
      throw new Error(mensagemBloqueio);
    }

    const sincronizacao = await storage.createSincronizacao({
      userId: empresa.userId,
      empresaId: empresa.id,
      dataInicio: new Date(),
      dataFim: null,
      status: "em_andamento",
      nsuInicial: empresa.ultimoNSU,
      nsuFinal: null,
      xmlsBaixados: 0,
      mensagemErro: null,
    });

    await storage.createLog({
      userId: empresa.userId,
      empresaId: empresa.id,
      sincronizacaoId: sincronizacao.id,
      nivel: "info",
      mensagem: `Iniciando sincronização para ${empresa.razaoSocial}`,
      detalhes: JSON.stringify({ cnpj: empresa.cnpj, nsuInicial: empresa.ultimoNSU }),
    });

    let xmlsBaixados = 0;
    let nsuAtual = empresa.ultimoNSU;
    let maxNSU = "0";
    let alinhamentoCompleto = false;
    const MAX_ITERACOES = 200; // Safety guard para sincronização

    try {
      // Loop até atingir maxNSU conforme NT 2014.002
      for (let iteracao = 0; iteracao < MAX_ITERACOES; iteracao++) {
        // Usa distNSU conforme NT 2014.002 (não consNSU)
        const envelope = this.buildSOAPEnvelopeDistNSU(empresa.cnpj, empresa.uf, empresa.ambiente, nsuAtual);
        
        await storage.createLog({
          userId: empresa.userId,
          empresaId: empresa.id,
          sincronizacaoId: sincronizacao.id,
          nivel: "info",
          mensagem: `Sincronização - Consultando SEFAZ`,
          detalhes: JSON.stringify({ iteracao: iteracao + 1, ultNSUEnviado: nsuAtual }),
        });
        
        let responseXml: string;
        try {
          responseXml = await this.callDistDFe(empresa, envelope);
        } catch (error) {
          // Loga o erro real e retorna para tratamento
          const errorMsg = `Erro ao chamar SEFAZ: ${error}`;
          
          await storage.createLog({
            userId: empresa.userId,
            empresaId: empresa.id,
            sincronizacaoId: sincronizacao.id,
            nivel: "error",
            mensagem: errorMsg,
            detalhes: JSON.stringify({ 
              iteracao: iteracao + 1,
              ultNSUEnviado: nsuAtual,
              error: String(error), 
              stack: (error as Error).stack 
            }),
          });

          // Em ambiente de desenvolvimento (sem certificado válido), permite simulação
          if (process.env.ALLOW_SEFAZ_SIMULATION === "true") {
            console.warn(`${errorMsg} (usando simulação)`);
            responseXml = `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <retDistDFeInt xmlns="http://www.portalfiscal.inf.br/nfe">
      <cStat>137</cStat>
      <xMotivo>Nenhum documento localizado (simulação)</xMotivo>
      <ultNSU>${nsuAtual}</ultNSU>
      <maxNSU>${nsuAtual}</maxNSU>
    </retDistDFeInt>
  </soap12:Body>
</soap12:Envelope>`;
          } else {
            // Em produção, propaga o erro
            throw error;
          }
        }

        const response = this.parseSOAPResponse(responseXml);
        
        await storage.createLog({
          userId: empresa.userId,
          empresaId: empresa.id,
          sincronizacaoId: sincronizacao.id,
          nivel: "info",
          mensagem: `Sincronização - Resposta SEFAZ`,
          detalhes: JSON.stringify({ 
            iteracao: iteracao + 1,
            cStat: response.cStat,
            xMotivo: response.xMotivo,
            ultNSURetornado: response.ultNSU,
            maxNSURetornado: response.maxNSU
          }),
        });

        if (response.cStat === "137") {
          // 137: Nenhum documento localizado neste lote
          // IMPORTANTE: Não para aqui! Continua até ultNSU === maxNSU
          nsuAtual = response.ultNSU || nsuAtual;
          maxNSU = response.maxNSU || nsuAtual;
        } else if (response.cStat === "138") {
          // 138: Tem documentos - processa e salva
          for (const docZip of response.docZips || []) {
            if (docZip.schema.includes("nfeProc")) {
              try {
                const xmlContent = this.decompressDocZip(docZip.content);
                await this.saveNFeProc(xmlContent, empresa, sincronizacao.id);
                xmlsBaixados++;
              } catch (error) {
                console.error("Erro ao processar docZip:", error);
                await storage.createLog({
                  userId: empresa.userId,
                  empresaId: empresa.id,
                  sincronizacaoId: sincronizacao.id,
                  nivel: "warning",
                  mensagem: `Erro ao processar documento NSU ${docZip.NSU}`,
                  detalhes: JSON.stringify({ error: String(error) }),
                });
              }
            }
          }

          nsuAtual = response.ultNSU || nsuAtual;
          maxNSU = response.maxNSU || nsuAtual;
        } else {
          // Erro 656: Bloqueio temporário ou NSU desatualizado
          if (response.cStat === "656") {
            // Calcula bloqueio: 61 minutos a partir de agora
            const bloqueadoAte = new Date(Date.now() + 61 * 60 * 1000);
            
            // Atualiza empresa com timestamp de bloqueio
            await storage.updateEmpresa(empresa.id, { bloqueadoAte }, empresa.userId);

            // Log detalhado para diagnóstico
            await storage.createLog({
              userId: empresa.userId,
              empresaId: empresa.id,
              sincronizacaoId: sincronizacao.id,
              nivel: "error",
              mensagem: `Erro 656 - Bloqueio SEFAZ ativado`,
              detalhes: JSON.stringify({ 
                iteracao: iteracao + 1,
                ultNSUEnviado: nsuAtual,
                cStat: "656",
                xMotivo: response.xMotivo,
                bloqueadoAte: bloqueadoAte.toISOString(),
                diagnostico: iteracao === 0 
                  ? "Erro na primeira consulta: NSU pode estar desatualizado ou outro sistema está consultando este CNPJ"
                  : "Erro em consulta subsequente",
                solucao: "Sistema bloqueado até " + bloqueadoAte.toLocaleString('pt-BR') + ". Verifique se há outro sistema (ERP, contador) consultando o mesmo CNPJ."
              }),
            });

            const mensagemClara = `Bloqueio SEFAZ (cStat 656): ${response.xMotivo}. Empresa bloqueada até ${bloqueadoAte.toLocaleString('pt-BR')}. ${iteracao === 0 ? 'ATENÇÃO: Possível conflito com outro sistema consultando este CNPJ. Verifique ERPs/contadores.' : 'Aguarde o desbloqueio automático.'}`;
            
            throw new Error(mensagemClara);
          }
          throw new Error(`Erro SEFAZ: ${response.cStat} - ${response.xMotivo}`);
        }

        // Verifica alinhamento completo (conforme NT 2014.002)
        if (nsuAtual === maxNSU) {
          alinhamentoCompleto = true;
          console.log(`[Sincronização] Alinhamento completo: ultNSU === maxNSU (${nsuAtual})`);
          break;
        }

        // Delay para evitar rate limiting (apenas se vai continuar)
        await new Promise(resolve => setTimeout(resolve, 300));
      }

      // Verifica se o alinhamento foi completado
      if (!alinhamentoCompleto) {
        const mensagemErro = `Limite de segurança atingido (${MAX_ITERACOES} iterações) sem alcançar maxNSU. ultNSU=${nsuAtual}, maxNSU=${maxNSU}`;
        
        await storage.createLog({
          userId: empresa.userId,
          empresaId: empresa.id,
          sincronizacaoId: sincronizacao.id,
          nivel: "error",
          mensagem: mensagemErro,
          detalhes: JSON.stringify({ 
            nsuInicial: empresa.ultimoNSU,
            nsuAtual,
            maxNSU,
            xmlsBaixados,
            observacao: "Backlog muito grande - considere aumentar MAX_ITERACOES ou executar reconciliação"
          }),
        });

        throw new Error(mensagemErro);
      }

      // Atualiza empresa com novo NSU e limpa bloqueio (se houver)
      await storage.updateEmpresa(empresa.id, { 
        ultimoNSU: nsuAtual,
        bloqueadoAte: null // Limpa bloqueio após sincronização bem-sucedida
      }, empresa.userId);

      // Finaliza sincronização
      await storage.updateSincronizacao(sincronizacao.id, {
        dataFim: new Date(),
        status: "concluida",
        nsuFinal: nsuAtual,
        xmlsBaixados,
      }, empresa.userId);

      await storage.createLog({
        userId: empresa.userId,
        empresaId: empresa.id,
        sincronizacaoId: sincronizacao.id,
        nivel: "info",
        mensagem: `Sincronização concluída: ${xmlsBaixados} XML(s) baixado(s)`,
        detalhes: JSON.stringify({ xmlsBaixados, nsuFinal: nsuAtual }),
      });

      return xmlsBaixados;
    } catch (error) {
      await storage.updateSincronizacao(sincronizacao.id, {
        dataFim: new Date(),
        status: "erro",
        mensagemErro: String(error),
      }, empresa.userId);

      await storage.createLog({
        userId: empresa.userId,
        empresaId: empresa.id,
        sincronizacaoId: sincronizacao.id,
        nivel: "error",
        mensagem: `Erro na sincronização: ${String(error)}`,
        detalhes: JSON.stringify({ 
          error: String(error),
          stack: (error as Error).stack,
          nsuInicial: empresa.ultimoNSU,
          nsuAtual,
          xmlsBaixados
        }),
      });

      console.error(`Erro crítico ao sincronizar ${empresa.razaoSocial}:`, error);
      // Não propaga - erro já registrado, permite continuar outras empresas
      return 0;
    }
  }

  async sincronizarTodasEmpresas(): Promise<void> {
    const empresasAtivas = await storage.getEmpresasAtivas();

    await storage.createLog({
      empresaId: null,
      sincronizacaoId: null,
      nivel: "info",
      mensagem: `Iniciando sincronização automática de ${empresasAtivas.length} empresa(s)`,
      detalhes: null,
    });

    for (const empresa of empresasAtivas) {
      try {
        await this.sincronizarEmpresa(empresa);
      } catch (error) {
        console.error(`Erro ao sincronizar ${empresa.razaoSocial}:`, error);
        // Continua com as próximas empresas mesmo se uma falhar
      }
    }

    await storage.createLog({
      empresaId: null,
      sincronizacaoId: null,
      nivel: "info",
      mensagem: `Sincronização automática finalizada`,
      detalhes: null,
    });
  }

  /**
   * Reconcilia o último NSU consultado seguindo NT 2014.002 da SEFAZ
   * 
   * Avança o ponteiro NSU sequencialmente até atingir maxNSU (alinhamento completo).
   * IMPORTANTE: Segue regras da Nota Técnica 2014.002 para evitar cStat=656 (uso indevido).
   * 
   * Algoritmo conforme documentação SEFAZ:
   * 1. Começa do ultimoNSU atual da empresa (NUNCA usa NSU=0 exceto primeira consulta)
   * 2. Faz loop sequencial usando distNSU com ultNSU (não consNSU)
   * 3. Continua até ultNSU === maxNSU (sincronização completa)
   * 4. NÃO baixa XMLs (apenas avança ponteiro)
   * 5. Atualiza banco apenas com valores retornados pela SEFAZ
   * 
   * @param empresa - Empresa a ser reconciliada
   * @returns NSU final alinhado e quantidade de chamadas realizadas
   */
  async reconciliarUltimoNSU(empresa: Empresa): Promise<{
    nsuFinal: string;
    chamadas: number;
    intervalo: { min: string; max: string };
  }> {
    // Verifica se empresa está bloqueada (cStat 656)
    if (empresa.bloqueadoAte && new Date() < empresa.bloqueadoAte) {
      const tempoRestante = Math.ceil((empresa.bloqueadoAte.getTime() - Date.now()) / 1000 / 60);
      const mensagemBloqueio = `Empresa bloqueada pela SEFAZ (erro 656) até ${empresa.bloqueadoAte.toLocaleString('pt-BR')}. Tempo restante: ${tempoRestante} minutos. Aguarde o desbloqueio automático.`;
      
      await storage.createLog({
        userId: empresa.userId,
        empresaId: empresa.id,
        sincronizacaoId: null,
        nivel: "warning",
        mensagem: "Tentativa de reconciliação bloqueada",
        detalhes: JSON.stringify({ 
          bloqueadoAte: empresa.bloqueadoAte.toISOString(),
          tempoRestanteMinutos: tempoRestante,
          observacao: "Aguarde o desbloqueio automático. Verifique se há outro sistema consultando este CNPJ."
        }),
      });
      
      throw new Error(mensagemBloqueio);
    }

    const nsuInicial = empresa.ultimoNSU;
    
    // VALIDAÇÃO CRÍTICA: Não permitir reconciliação de empresas novas (NSU=0)
    // A SEFAZ rejeita com cStat=656 se tentar usar ultNSU=0 em empresa que já consultou antes
    if (nsuInicial === "000000000000000" || nsuInicial === "0") {
      const mensagemErro = "Reconciliação não disponível para empresas sem NSU configurado. Use 'Sincronizar' primeiro para inicializar o NSU.";
      
      await storage.createLog({
        userId: empresa.userId,
        empresaId: empresa.id,
        sincronizacaoId: null,
        nivel: "warning",
        mensagem: mensagemErro,
        detalhes: JSON.stringify({ 
          cnpj: empresa.cnpj,
          ultimoNSU: nsuInicial,
          observacao: "Para empresas novas, execute Sincronização normal primeiro"
        }),
      });

      throw new Error(mensagemErro);
    }
    
    await storage.createLog({
      userId: empresa.userId,
      empresaId: empresa.id,
      sincronizacaoId: null,
      nivel: "info",
      mensagem: `Iniciando alinhamento de NSU para ${empresa.razaoSocial}`,
      detalhes: JSON.stringify({ 
        cnpj: empresa.cnpj, 
        nsuAtual: nsuInicial,
        observacao: "Seguindo NT 2014.002 - loop sequencial até maxNSU"
      }),
    });

    let chamadas = 0;
    const MAX_ITERACOES = 100; // Safety guard: limite de segurança

    try {
      let nsuAtual = nsuInicial;
      let maxNSU = "0";
      let alinhamentoCompleto = false;

      // Loop sequencial seguindo regras da SEFAZ
      // Continua até ultNSU === maxNSU (alinhamento completo)
      for (let i = 0; i < MAX_ITERACOES; i++) {
        // Monta envelope usando distNSU com ultNSU (conforme NT 2014.002)
        const envelope = this.buildSOAPEnvelopeDistNSU(
          empresa.cnpj,
          empresa.uf,
          empresa.ambiente,
          nsuAtual
        );
        chamadas++;

        await storage.createLog({
          userId: empresa.userId,
          empresaId: empresa.id,
          sincronizacaoId: null,
          nivel: "info",
          mensagem: `Reconciliação - Consultando SEFAZ`,
          detalhes: JSON.stringify({ iteracao: i + 1, ultNSUEnviado: nsuAtual }),
        });

        let xmlResponse: string;
        try {
          xmlResponse = await this.callDistDFe(empresa, envelope);
        } catch (error) {
          // Loga erro com contexto de NSU e iteração
          await storage.createLog({
            userId: empresa.userId,
            empresaId: empresa.id,
            sincronizacaoId: null,
            nivel: "error",
            mensagem: `Reconciliação - Erro ao chamar SEFAZ: ${error}`,
            detalhes: JSON.stringify({ 
              iteracao: i + 1,
              ultNSUEnviado: nsuAtual,
              error: String(error), 
              stack: (error as Error).stack 
            }),
          });
          throw error; // Re-lança para catch externo
        }

        const response = this.parseSOAPResponse(xmlResponse);

        await storage.createLog({
          userId: empresa.userId,
          empresaId: empresa.id,
          sincronizacaoId: null,
          nivel: "info",
          mensagem: `Reconciliação - Resposta SEFAZ`,
          detalhes: JSON.stringify({ 
            iteracao: i + 1,
            cStat: response.cStat,
            xMotivo: response.xMotivo,
            ultNSURetornado: response.ultNSU,
            maxNSURetornado: response.maxNSU
          }),
        });

        // Valida resposta SEFAZ
        if (response.cStat !== "137" && response.cStat !== "138") {
          // Erro 656: Bloqueio temporário - mensagem mais clara
          if (response.cStat === "656") {
            const mensagemClara = `Bloqueio temporário da SEFAZ (cStat 656): ${response.xMotivo}. Aguarde 1 hora antes de tentar novamente. Isso ocorre quando há múltiplas tentativas com NSU inválido.`;
            throw new Error(mensagemClara);
          }
          throw new Error(`SEFAZ retornou cStat ${response.cStat}: ${response.xMotivo}`);
        }

        const ultNSU = response.ultNSU || "0";
        maxNSU = response.maxNSU || ultNSU;

        // Log de progresso
        console.log(`[Alinhamento NSU] Iteração ${i + 1}: ultNSU=${ultNSU}, maxNSU=${maxNSU}`);

        // Atualiza nsuAtual com valor retornado pela SEFAZ (NUNCA valores arbitrários)
        nsuAtual = ultNSU;

        // Verifica se atingiu maxNSU (alinhamento completo)
        if (ultNSU === maxNSU) {
          alinhamentoCompleto = true;
          await storage.createLog({
            userId: empresa.userId,
            empresaId: empresa.id,
            sincronizacaoId: null,
            nivel: "info",
            mensagem: `Alinhamento completo: ultNSU === maxNSU`,
            detalhes: JSON.stringify({ ultNSU, maxNSU, iteracoes: i + 1, chamadas }),
          });
          break; // Sucesso: alinhamento completo
        }

        // Delay para evitar rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Verifica se o alinhamento foi completado
      if (!alinhamentoCompleto) {
        const mensagemErro = `Limite de segurança atingido (${MAX_ITERACOES} iterações) sem alcançar maxNSU. ultNSU=${nsuAtual}, maxNSU=${maxNSU}`;
        
        await storage.createLog({
          userId: empresa.userId,
          empresaId: empresa.id,
          sincronizacaoId: null,
          nivel: "error",
          mensagem: mensagemErro,
          detalhes: JSON.stringify({ 
            nsuInicial,
            nsuAtual,
            maxNSU,
            chamadas,
            observacao: "Intervenção manual necessária - backlog muito grande"
          }),
        });

        throw new Error(mensagemErro);
      }

      // Atualiza empresa com NSU final alinhado
      await storage.updateEmpresa(empresa.id, { ultimoNSU: nsuAtual }, empresa.userId);

      await storage.createLog({
        userId: empresa.userId,
        empresaId: empresa.id,
        sincronizacaoId: null,
        nivel: "info",
        mensagem: `Alinhamento concluído com sucesso (NT 2014.002)`,
        detalhes: JSON.stringify({ 
          nsuInicial,
          nsuFinal: nsuAtual,
          maxNSU,
          chamadas,
          estrategia: "loop_sequencial_distNSU"
        }),
      });

      return {
        nsuFinal: nsuAtual,
        chamadas,
        intervalo: { min: nsuInicial, max: nsuAtual },
      };

    } catch (error) {
      await storage.createLog({
        userId: empresa.userId,
        empresaId: empresa.id,
        sincronizacaoId: null,
        nivel: "error",
        mensagem: `Erro no alinhamento de NSU: ${String(error)}`,
        detalhes: JSON.stringify({ error: String(error), chamadas }),
      });

      throw error;
    }
  }
}

export const sefazService = new SefazService();
