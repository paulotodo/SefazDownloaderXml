import https from "https";
import fs from "fs/promises";
import path from "path";
import { XMLParser } from "fast-xml-parser";
import * as pako from "pako";
import { storage } from "./storage";
import type { Empresa } from "@shared/schema";

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

  private async callDistDFe(
    empresa: Empresa,
    envelope: string
  ): Promise<string> {
    return new Promise(async (resolve, reject) => {
      try {
        const url = new URL(ENDPOINTS[empresa.ambiente as "prod" | "hom"]);

        // Carrega o certificado .pfx
        let pfxBuffer: Buffer;
        try {
          pfxBuffer = await fs.readFile(empresa.certificadoPath);
        } catch (error) {
          throw new Error(`Erro ao ler certificado: ${error}`);
        }

        // Cria agente HTTPS com certificado
        const agent = new https.Agent({
          pfx: pfxBuffer,
          passphrase: empresa.certificadoSenha,
          rejectUnauthorized: true, // Validar certificados SSL
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

    // Navega pela estrutura SOAP
    const envelope = parsed["soap12:Envelope"] || parsed["Envelope"];
    const body = envelope["soap12:Body"] || envelope["Body"];
    const response =
      body["nfeDistDFeInteresseResponse"] ||
      body["nfe:nfeDistDFeInteresseResponse"];
    const result = response?.["nfeDistDFeInteresseResult"] || response?.["nfe:nfeDistDFeInteresseResult"];
    const retDistDFeInt = result?.["retDistDFeInt"] || parsed["retDistDFeInt"];

    const cStat = retDistDFeInt?.cStat || "";
    const xMotivo = retDistDFeInt?.xMotivo || "";
    const ultNSU = retDistDFeInt?.ultNSU;
    const maxNSU = retDistDFeInt?.maxNSU;

    let docZips: Array<{ NSU: string; schema: string; content: string }> = [];
    const lote = retDistDFeInt?.loteDistDFeInt;

    if (lote?.docZip) {
      const docs = Array.isArray(lote.docZip) ? lote.docZip : [lote.docZip];
      docZips = docs.map((doc) => ({
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
    let continuar = true;

    try {
      while (continuar) {
        const envelope = this.buildSOAPEnvelope(empresa.cnpj, empresa.uf, empresa.ambiente, nsuAtual);
        
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
            detalhes: JSON.stringify({ error: String(error), stack: (error as Error).stack }),
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

        if (response.cStat === "137") {
          // 137: Nenhum documento localizado
          continuar = false;
          nsuAtual = response.ultNSU || nsuAtual;
        } else if (response.cStat === "138") {
          // 138: Tem documentos
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
          
          if (response.ultNSU === response.maxNSU) {
            continuar = false;
          }
        } else {
          throw new Error(`Erro SEFAZ: ${response.cStat} - ${response.xMotivo}`);
        }
      }

      // Atualiza empresa com novo NSU
      await storage.updateEmpresa(empresa.id, { ultimoNSU: nsuAtual }, empresa.userId);

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
}

export const sefazService = new SefazService();
