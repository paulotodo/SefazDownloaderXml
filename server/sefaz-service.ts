import https from "https";
import crypto from "crypto";
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { XMLParser } from "fast-xml-parser";
import * as pako from "pako";
import { SignedXml } from "xml-crypto";
import { DOMParser, XMLSerializer } from "xmldom";
import { storage } from "./storage";
import type { Empresa } from "@shared/schema";
import { loadPKCS12Certificate } from "./cert-loader";
import { 
  formatarDataBrasilCompleta, 
  calcularMinutosRestantes, 
  estaBloqueado, 
  criarBloqueio 
} from "./utils/timezone";
import { xmlStorageService } from "./xml-storage";

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

// Endpoints para NFeRecepcaoEvento (Manifestação do Destinatário)
// NT 2020.001: Usa SEFAZ Virtual RS para todos os Estados
const ENDPOINTS_RECEPCAO_EVENTO = {
  prod: "https://nfe.svrs.rs.gov.br/ws/recepcaoevento/recepcaoevento4.asmx",
  hom: "https://nfe-homologacao.svrs.rs.gov.br/ws/recepcaoevento/recepcaoevento4.asmx",
};

// Endpoints para NfeDownloadNF (Download de XML Completo)
// Endpoint Nacional conforme documentação SEFAZ
const ENDPOINTS_DOWNLOAD_NF = {
  prod: "https://www.nfe.fazenda.gov.br/NfeDownloadNF/NfeDownloadNF.asmx",
  hom: "https://hom.nfe.fazenda.gov.br/NfeDownloadNF/NfeDownloadNF.asmx",
};

// Tipos de Evento de Manifestação do Destinatário (NT 2020.001)
export const TIPOS_MANIFESTACAO = {
  CONFIRMACAO: "210200", // Confirmação da Operação
  CIENCIA: "210210",     // Ciência da Operação
  DESCONHECIMENTO: "210220", // Desconhecimento da Operação
  NAO_REALIZADA: "210240",   // Operação não Realizada
} as const;

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

/**
 * Assina digitalmente o XML do evento conforme padrão XML Signature
 * NT 2020.001 exige assinatura digital em todos os eventos de manifestação
 * 
 * @param xmlEvento - XML do elemento <evento> (sem assinatura)
 * @param privateKey - Chave privada em formato PEM
 * @param certificate - Certificado em formato PEM
 * @returns XML do evento assinado (com tag <Signature>)
 */
function signXmlEvento(xmlEvento: string, privateKey: string, certificate: string): string {
  try {
    console.log('[signXmlEvento] 🔍 PrivateKey recebida:', privateKey ? `SIM (${privateKey.substring(0, 50)}...)` : 'NÃO');
    console.log('[signXmlEvento] 🔍 Certificate recebido:', certificate ? `SIM (${certificate.substring(0, 50)}...)` : 'NÃO');
    
    // Criar assinatura com xml-crypto v6.x API
    // Conforme documentação oficial: privateKey pode ser string PEM ou Buffer
    const sig = new SignedXml({
      privateKey: privateKey,  // String PEM diretamente conforme docs
      publicCert: certificate,  // Será incluído em <KeyInfo><X509Certificate>
      signatureAlgorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
      canonicalizationAlgorithm: 'http://www.w3.org/2001/10/xml-exc-c14n#'
    });
    
    // Adicionar referência ao elemento infEvento (que possui atributo Id)
    sig.addReference({
      xpath: "//*[local-name()='infEvento']",
      transforms: [
        'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
        'http://www.w3.org/2001/10/xml-exc-c14n#'
      ],
      digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256'
    });
    
    // Computar assinatura e inserir no final de <evento>
    // publicCert já configura automaticamente <KeyInfo><X509Certificate>
    sig.computeSignature(xmlEvento, {
      prefix: 'ds',
      location: { reference: "//*[local-name()='evento']", action: 'append' }
    });
    
    // Retornar XML assinado
    return sig.getSignedXml();
  } catch (error: any) {
    console.error('[Assinatura XML] Erro ao assinar evento:', error.message);
    throw new Error(`Falha na assinatura digital do evento: ${error.message}`);
  }
}

export class SefazService {
  private parser: XMLParser;
  private xmlDestPath: string;

  constructor() {
    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "",
      parseTagValue: false, // CRÍTICO: Mantém TODOS os valores como string (preserva chaves de 44 dígitos)
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

  /**
   * Monta SOAP envelope para consulta por chave de acesso (consChNFe)
   * Conforme NT 2014.002 §3.6
   * 
   * IMPORTANTE: Usa <consChNFe> para buscar XML completo por chave
   * - Permite baixar nfeProc quando só temos resNFe (resumo)
   * - Essencial para manifestação do destinatário (só pode manifestar com XML completo)
   * 
   * @param cnpj - CNPJ da empresa
   * @param uf - UF de autorização (ex: 'SP', 'MG')
   * @param ambiente - Ambiente ('producao' ou 'homologacao')
   * @param chaveNFe - Chave de acesso de 44 dígitos da NF-e/NFC-e
   */
  /**
   * Monta SOAP envelope para NfeDownloadNF (Download de XML Completo)
   * Conforme exemplo funcional fornecido - usa endpoint NfeDownloadNF.asmx
   * 
   * IMPORTANTE: Este é o método CORRETO para download de XML completo após manifestação
   * - Endpoint: NfeDownloadNF.asmx (não NFeDistribuicaoDFe)
   * - SOAP 1.2 com namespace soap (não soap12)
   * - Header com nfeCabecMsg contendo cUF e versaoDados
   * - Body com downloadNFe contendo tpAmb, xServ, CNPJ, chNFe
   * 
   * @param cnpj - CNPJ da empresa destinatária
   * @param uf - UF de autorização (ex: 'SP', 'MG')
   * @param ambiente - Ambiente ('producao' ou 'homologacao')
   * @param chaveNFe - Chave de acesso da NF-e (44 dígitos)
   */
  private buildSOAPEnvelopeDownloadNFe(cnpj: string, uf: string, ambiente: string, chaveNFe: string): string {
    const cUF = UF_CODE_MAP[uf.toUpperCase()] || 35;
    const tpAmb = ambiente.toLowerCase().startsWith("prod") ? "1" : "2";

    if (!chaveNFe || chaveNFe.length !== 44) {
      throw new Error(`Chave de acesso inválida: ${chaveNFe} (deve ter 44 dígitos)`);
    }

    // SOAP envelope conforme exemplo funcional fornecido
    return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
    <soap:Header>
        <nfeCabecMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NfeDownloadNF">
            <cUF>${cUF}</cUF>
            <versaoDados>1.00</versaoDados>
        </nfeCabecMsg>
    </soap:Header>
    <soap:Body>
        <nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NfeDownloadNF">
            <downloadNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00">
                <tpAmb>${tpAmb}</tpAmb>
                <xServ>DOWNLOAD NFE</xServ>
                <CNPJ>${cnpj}</CNPJ>
                <chNFe>${chaveNFe}</chNFe>
            </downloadNFe>
        </nfeDadosMsg>
    </soap:Body>
</soap:Envelope>`;
  }

  /**
   * MÉTODO OFICIAL - Download de XML completo via NFeDistribuicaoDFe
   * Conforme NT 2014.002 e documentação oficial da Fazenda
   * 
   * Usa consulta por chave (consChNFe) que retorna o XML completo
   * em formato <docZip> (Base64 + GZip)
   * 
   * @param cnpj - CNPJ do interessado (deve bater com certificado)
   * @param uf - UF autora da consulta
   * @param ambiente - Ambiente ('producao' ou 'homologacao')
   * @param chaveNFe - Chave de acesso de 44 dígitos
   */
  private buildSOAPEnvelopeConsChNFe(cnpj: string, uf: string, ambiente: string, chaveNFe: string): string {
    const cUFAutor = UF_CODE_MAP[uf.toUpperCase()] || 35;
    const tpAmb = ambiente.toLowerCase().startsWith("prod") ? "1" : "2";

    if (!chaveNFe || chaveNFe.length !== 44) {
      throw new Error(`Chave de acesso inválida: ${chaveNFe} (deve ter 44 dígitos)`);
    }

    // SOAP 1.2 conforme documentação oficial NT 2014.002
    return `<?xml version="1.0" encoding="UTF-8"?>
<soap12:Envelope
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns:xsd="http://www.w3.org/2001/XMLSchema"
    xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Header>
    <nfeCabecMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">
      <cUF>91</cUF>
      <versaoDados>1.01</versaoDados>
    </nfeCabecMsg>
  </soap12:Header>
  <soap12:Body>
    <nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">
      <nfeDadosMsg>
        <distDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01">
          <tpAmb>${tpAmb}</tpAmb>
          <cUFAutor>${cUFAutor}</cUFAutor>
          <CNPJ>${cnpj}</CNPJ>
          <consChNFe>
            <chNFe>${chaveNFe}</chNFe>
          </consChNFe>
        </distDFeInt>
      </nfeDadosMsg>
    </nfeDistDFeInteresse>
  </soap12:Body>
</soap12:Envelope>`;
  }

  /**
   * Monta SOAP envelope para Manifestação do Destinatário (NFeRecepcaoEvento v4.00)
   * Conforme NT 2020.001
   * 
   * Eventos disponíveis:
   * - 210200: Confirmação da Operação
   * - 210210: Ciência da Operação (manifestação automática padrão)
   * - 210220: Desconhecimento da Operação
   * - 210240: Operação não Realizada (requer justificativa)
   * 
   * IMPORTANTE: Assina digitalmente o evento usando certificado A1/A3
   * 
   * @param cnpj - CNPJ do destinatário manifestante
   * @param chaveNFe - Chave de acesso de 44 dígitos da NF-e
   * @param tpEvento - Tipo de evento (210200, 210210, 210220, 210240)
   * @param nSeqEvento - Número sequencial do evento (sempre 1 para manifestação)
   * @param ambiente - Ambiente ('producao' ou 'homologacao')
   * @param justificativa - Justificativa (obrigatória para 210240, opcional para outros)
   * @param privateKey - Chave privada do certificado (PEM)
   * @param certificate - Certificado digital (PEM)
   */
  private buildSOAPEnvelopeManifestacao(
    cnpj: string,
    chaveNFe: string,
    tpEvento: string,
    nSeqEvento: number,
    ambiente: string,
    justificativa: string | undefined,
    privateKey: string,
    certificate: string
  ): string {
    const tpAmb = ambiente.toLowerCase().startsWith("prod") ? "1" : "2";
    
    if (!chaveNFe || chaveNFe.length !== 44) {
      throw new Error(`Chave de acesso inválida: ${chaveNFe} (deve ter 44 dígitos)`);
    }

    // NT 2020.001: 210240 (Operação não Realizada) requer justificativa (min 15 caracteres)
    if (tpEvento === TIPOS_MANIFESTACAO.NAO_REALIZADA) {
      if (!justificativa || justificativa.length < 15) {
        throw new Error("Evento 210240 (Operação não Realizada) requer justificativa de no mínimo 15 caracteres");
      }
    }

    // Data/hora do evento em horário de Brasília com offset dinâmico
    // Formato: YYYY-MM-DDTHH:MM:SS±HH:MM (ex: 2025-11-19T14:30:00-03:00)
    // CORREÇÃO DEFINITIVA: Usa timeZoneName:'shortOffset' para obter offset real
    const now = new Date();
    
    // Formata data/hora em timezone America/Sao_Paulo
    const brasiliaFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    
    const parts = brasiliaFormatter.formatToParts(now);
    const partsMap = parts.reduce((acc, part) => {
      if (part.type !== 'literal') acc[part.type] = part.value;
      return acc;
    }, {} as Record<string, string>);
    
    // Obtém offset dinâmico usando timeZoneName:'shortOffset' (ex: "GMT-3")
    const offsetFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Sao_Paulo',
      timeZoneName: 'shortOffset',
    });
    
    const offsetParts = offsetFormatter.formatToParts(now);
    const offsetPart = offsetParts.find(p => p.type === 'timeZoneName');
    let offsetStr = '-03:00'; // Fallback padrão para Brasília
    
    if (offsetPart && offsetPart.value.startsWith('GMT')) {
      // Converte "GMT-3" ou "GMT+0" para formato "±HH:MM"
      const offsetMatch = offsetPart.value.match(/GMT([+-])(\d+)/);
      if (offsetMatch) {
        const sign = offsetMatch[1];
        const hours = offsetMatch[2].padStart(2, '0');
        offsetStr = `${sign}${hours}:00`;
      }
    }
    
    // Monta timestamp final: YYYY-MM-DDTHH:MM:SS±HH:MM
    const dhEvento = `${partsMap.year}-${partsMap.month}-${partsMap.day}T${partsMap.hour}:${partsMap.minute}:${partsMap.second}${offsetStr}`;

    // ID do evento: "ID" + tpEvento + chNFe + nSeqEvento (2 dígitos)
    const idEvento = `ID${tpEvento}${chaveNFe}${nSeqEvento.toString().padStart(2, "0")}`;
    
    // DEBUG: Verificar comprimentos
    console.log(`[DEBUG ID] tpEvento: ${tpEvento} (${tpEvento.length} chars)`);
    console.log(`[DEBUG ID] chaveNFe: ${chaveNFe} (${chaveNFe.length} chars)`);
    console.log(`[DEBUG ID] nSeqEvento: ${nSeqEvento.toString().padStart(2, "0")} (${nSeqEvento.toString().padStart(2, "0").length} chars)`);
    console.log(`[DEBUG ID] idEvento: ${idEvento} (${idEvento.length} chars, esperado 54)`);

    // Descrição do evento conforme tipo
    const descEvento = this.getTipoEventoDescricao(tpEvento);

    // XML do evento (detEvento) - CORREÇÃO: adicionar xJust dentro de detEvento inline
    // Conforme NT 2020.001, detEvento precisa estar dentro de infEvento
    const xJustXML = justificativa ? `<xJust>${justificativa}</xJust>` : '';

    // PASSO 1: Montar XML do evento (sem assinatura)
    // IMPORTANTE: nSeqEvento no elemento é "1", mas no Id é "01" (com padStart)
    const xmlEventoSemAssinatura = `<?xml version="1.0" encoding="utf-8"?>
<evento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00">
  <infEvento Id="${idEvento}">
    <cOrgao>91</cOrgao>
    <tpAmb>${tpAmb}</tpAmb>
    <CNPJ>${cnpj}</CNPJ>
    <chNFe>${chaveNFe}</chNFe>
    <dhEvento>${dhEvento}</dhEvento>
    <tpEvento>${tpEvento}</tpEvento>
    <nSeqEvento>${nSeqEvento}</nSeqEvento>
    <verEvento>1.00</verEvento>
    <detEvento versao="1.00">
      <descEvento>${descEvento}</descEvento>${xJustXML}
    </detEvento>
  </infEvento>
</evento>`;

    // PASSO 2: Assinar XML do evento (conforme NT 2020.001 P91)
    console.log('[buildSOAPEnvelopeManifestacao] 🔍 Verificando parâmetros de assinatura...');
    console.log('[buildSOAPEnvelopeManifestacao] privateKey recebida:', privateKey ? `SIM (${privateKey.substring(0, 50)}...)` : 'NÃO');
    console.log('[buildSOAPEnvelopeManifestacao] certificate recebido:', certificate ? `SIM (${certificate.substring(0, 50)}...)` : 'NÃO');
    
    // Assinar XML (agora sempre obrigatório)
    console.log('[Manifestação] 🔐 Assinando XML do evento com certificado digital...');
    const xmlEventoAssinado = signXmlEvento(xmlEventoSemAssinatura, privateKey, certificate);
    console.log('[Manifestação] ✅ Assinatura digital aplicada com sucesso');

    // PASSO 3: Extrair tag <evento> COMPLETA (incluindo xmlns) do XML assinado
    // Remove apenas declaração <?xml...?> mas PRESERVA <evento xmlns="...">
    // CORREÇÃO cStat 215: NT 2020.001 §6.3.1 exige xmlns em <evento>
    const eventoCompletoMatch = xmlEventoAssinado.match(/<evento[\s\S]*<\/evento>/);
    if (!eventoCompletoMatch) {
      throw new Error('Erro ao processar XML assinado: tag <evento> não encontrada');
    }
    const eventoCompleto = eventoCompletoMatch[0];

    // PASSO 4: Embutir evento assinado COMPLETO no SOAP envelope
    // Preserva namespace xmlns="http://www.portalfiscal.inf.br/nfe" do <evento>
    return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                 xmlns:xsd="http://www.w3.org/2001/XMLSchema"
                 xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4">
      <envEvento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00">
        <idLote>1</idLote>
        ${eventoCompleto}
      </envEvento>
    </nfeDadosMsg>
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
        // IMPORTANTE: NÃO passamos 'ca' para preservar a trust store padrão do Node.js
        // HTTPS Agent com certificado cliente A1/A3
        // IMPORTANTE: rejectUnauthorized=false para aceitar certificados auto-assinados SEFAZ
        // O certificado do servidor SEFAZ é validado pela raiz ICP-Brasil
        const agent = new https.Agent({
          key: certData.key,
          cert: certData.cert,
          rejectUnauthorized: false, // Desabilita validação SSL para SEFAZ
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

  /**
   * Envia requisição SOAP para NfeDownloadNF (Download de XML Completo)
   * Endpoint específico para download de XMLs após manifestação
   */
  private async callDownloadNFe(
    empresa: Empresa,
    envelope: string
  ): Promise<string> {
    return new Promise(async (resolve, reject) => {
      try {
        const url = new URL(ENDPOINTS_DOWNLOAD_NF[empresa.ambiente as "prod" | "hom"]);

        let certData;
        try {
          certData = await loadPKCS12Certificate(
            empresa.certificadoPath,
            empresa.certificadoSenha
          );
        } catch (error: any) {
          throw error;
        }

        // HTTPS Agent com certificado cliente A1/A3
        // IMPORTANTE: rejectUnauthorized=false para aceitar certificados auto-assinados SEFAZ
        const agent = new https.Agent({
          key: certData.key,
          cert: certData.cert,
          rejectUnauthorized: false,
          secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT,
          minVersion: 'TLSv1.2' as any,
          maxVersion: 'TLSv1.3' as any,
        });

        const options: https.RequestOptions = {
          hostname: url.hostname,
          port: 443,
          path: url.pathname,
          method: "POST",
          headers: {
            "Content-Type": "application/soap+xml; charset=utf-8",
            "Content-Length": Buffer.byteLength(envelope),
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
          reject(new Error(`Erro na requisição HTTPS NfeDownloadNF: ${error.message}`));
        });

        req.write(envelope);
        req.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Envia requisição SOAP para NFeRecepcaoEvento (Manifestação do Destinatário)
   * Conforme NT 2020.001
   */
  private async callRecepcaoEvento(
    empresa: Empresa,
    envelope: string
  ): Promise<string> {
    return new Promise(async (resolve, reject) => {
      try {
        const url = new URL(ENDPOINTS_RECEPCAO_EVENTO[empresa.ambiente as "prod" | "hom"]);

        let certData;
        try {
          certData = await loadPKCS12Certificate(
            empresa.certificadoPath,
            empresa.certificadoSenha
          );
        } catch (error: any) {
          throw error;
        }

        // HTTPS Agent com certificado cliente A1/A3
        // IMPORTANTE: rejectUnauthorized=false para aceitar certificados auto-assinados SEFAZ
        const agent = new https.Agent({
          key: certData.key,
          cert: certData.cert,
          rejectUnauthorized: false, // Desabilita validação SSL para SEFAZ
          secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT,
          minVersion: 'TLSv1.2' as any,
          maxVersion: 'TLSv1.3' as any,
        });

        const options: https.RequestOptions = {
          hostname: url.hostname,
          port: 443,
          path: url.pathname,
          method: "POST",
          headers: {
            "Content-Type": "application/soap+xml; charset=utf-8; action=\"http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4/nfeRecepcaoEvento\"",
            "Content-Length": Buffer.byteLength(envelope),
            "SOAPAction": "http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4/nfeRecepcaoEvento",
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
      console.log(`[Descompressão] Base64 → Buffer: ${buffer.length} bytes`);
      
      // CRÍTICO: pako.ungzip retorna Uint8Array, precisamos converter para string
      const decompressed = pako.ungzip(buffer);
      const xmlString = Buffer.from(decompressed).toString("utf-8");
      
      console.log(`[Descompressão] GZIP → XML: ${xmlString.length} caracteres`);
      console.log(`[Descompressão] Primeiros 100 chars: ${xmlString.substring(0, 100)}`);
      
      return xmlString;
    } catch (error) {
      console.warn(`[Descompressão] ERRO pako.ungzip: ${error} - tentando decode base64 direto`);
      // Se falhar descompactação, talvez já esteja descompactado
      const decoded = Buffer.from(base64Content, "base64").toString("utf-8");
      console.log(`[Descompressão] Base64 direto: ${decoded.length} caracteres`);
      console.log(`[Descompressão] Primeiros 100 chars: ${decoded.substring(0, 100)}`);
      return decoded;
    }
  }

  /**
   * Processa e salva documento baseado no schema (nfeProc, resNFe, procEventoNFe, resEvento)
   * Conforme NT 2014.002 §3.3 e MOC 7.0 §2.2
   * 
   * IMPORTANTE: SEFAZ retorna schemas SEM namespace (ex: "resNFe" não "http://...resNFe")
   */
  private async processDocument(
    xmlContent: string,
    schema: string,
    empresa: Empresa,
    sincronizacaoId: string,
    nsu: string
  ): Promise<void> {
    const parsed = this.parser.parse(xmlContent);

    // Schema normalization: SEFAZ retorna apenas nome sem namespace
    const schemaLower = schema.toLowerCase();
    
    if (schemaLower.includes("nfeproc")) {
      await this.saveNFeProc(parsed, xmlContent, empresa, sincronizacaoId);
    } else if (schemaLower.includes("resnfe")) {
      await this.saveResNFe(parsed, xmlContent, empresa, sincronizacaoId, nsu);
    } else if (schemaLower.includes("proceventonfe")) {
      await this.saveProcEvento(parsed, xmlContent, empresa, sincronizacaoId, nsu);
    } else if (schemaLower.includes("resevento")) {
      await this.saveResEvento(parsed, xmlContent, empresa, sincronizacaoId, nsu);
    } else {
      console.warn(`Schema desconhecido: ${schema} - NSU ${nsu}`);
      await storage.createLog({
        userId: empresa.userId,
        empresaId: empresa.id,
        sincronizacaoId,
        nivel: "warning",
        mensagem: `Schema XML não reconhecido`,
        detalhes: JSON.stringify({ schema, nsu }),
      });
    }
  }

  /**
   * Salva XML completo de NF-e/NFC-e (nfeProc)
   * MOC 7.0 §2.2: Modelo 55 (NF-e) e Modelo 65 (NFC-e)
   */
  private async saveNFeProc(
    parsed: any,
    xmlContent: string,
    empresa: Empresa,
    sincronizacaoId: string
  ): Promise<void> {
    const nfeProc = parsed.nfeProc;
    if (!nfeProc) throw new Error("XML não é um nfeProc");

    const protNFe = nfeProc.protNFe;
    const NFe = nfeProc.NFe;
    const infNFe = NFe?.infNFe;
    const ide = infNFe?.ide;

    const chNFe = protNFe?.infProt?.chNFe || "";
    const numeroNF = ide?.nNF || "";
    const dhEmi = ide?.dhEmi || ide?.dEmi || new Date().toISOString();
    const modelo = ide?.mod || "55"; // MOC 7.0 §2.2: 55=NF-e, 65=NFC-e

    if (!chNFe || !numeroNF) {
      throw new Error("Não foi possível extrair chave ou número da NF-e/NFC-e");
    }

    // Estrutura: xmls/NFe|NFCe/CNPJ/ANO/MES/numeroNF.xml
    const dataEmissao = new Date(dhEmi);
    const ano = dataEmissao.getFullYear();
    const mes = (dataEmissao.getMonth() + 1).toString().padStart(2, "0");
    const tipoDoc = modelo === "65" ? "NFCe" : "NFe";

    const filename = `${parseInt(numeroNF)}.xml`;
    const relativePath = path.join(tipoDoc, empresa.cnpj, `${ano}`, mes, filename);

    console.log(`[Salvamento] Salvando XML: ${relativePath} (${empresa.tipoArmazenamento})`);
    console.log(`[Salvamento] Tamanho do conteúdo: ${xmlContent.length} caracteres`);
    
    // Salva usando storage híbrido (local ou supabase)
    const caminhoCompleto = await xmlStorageService.saveXml(
      empresa.tipoArmazenamento,
      relativePath,
      xmlContent
    );
    
    const tamanhoBytes = Buffer.byteLength(xmlContent, "utf-8");
    console.log(`[Salvamento] Arquivo salvo: ${tamanhoBytes} bytes em ${caminhoCompleto}`);

    await storage.createXml({
      userId: empresa.userId,
      empresaId: empresa.id,
      sincronizacaoId,
      chaveNFe: chNFe,
      numeroNF: numeroNF.toString(),
      modelo: modelo.toString(),
      tipoDocumento: "nfeProc",
      dataEmissao,
      caminhoArquivo: caminhoCompleto,
      tamanhoBytes,
      statusDownload: "completo", // XML completo já obtido
      tentativasDownload: 0,
    });

    await storage.createLog({
      userId: empresa.userId,
      empresaId: empresa.id,
      sincronizacaoId,
      nivel: "info",
      mensagem: `XML salvo: ${tipoDoc} ${numeroNF}`,
      detalhes: JSON.stringify({ 
        chNFe, 
        caminhoArquivo: caminhoCompleto,
        modelo,
        tamanhoBytes,
        tipoArmazenamento: empresa.tipoArmazenamento
      }),
    });
  }

  /**
   * Salva resumo de NF-e/NFC-e (resNFe)
   * NT 2014.002 §3.3: Quando destinatário não tem direito ao XML completo
   * 
   * IMPORTANTE: Modelo é extraído da CHAVE NFe (posições 20-22), NÃO do tpNF!
   * - tpNF = tipo operação (0=entrada, 1=saída)
   * - Modelo na chave: posições 20-22 (55=NF-e, 65=NFC-e)
   */
  private async saveResNFe(
    parsed: any,
    xmlContent: string,
    empresa: Empresa,
    sincronizacaoId: string,
    nsu: string
  ): Promise<void> {
    const resNFe = parsed.resNFe;
    if (!resNFe) throw new Error("XML não é um resNFe");

    // FIX: Garantir que chNFe seja sempre string (pode vir como array, objeto ou NÚMERO do parser XML)
    const chNFeRaw = resNFe.chNFe;
    let chNFe = "";
    
    if (Array.isArray(chNFeRaw)) {
      chNFe = String(chNFeRaw[0] || "");
    } else if (typeof chNFeRaw === "number") {
      // CRÍTICO: Parser XML converte chaves grandes em number (notação científica)
      chNFe = chNFeRaw.toFixed(0);
    } else {
      chNFe = String(chNFeRaw || "");
    }
    
    const dhEmi = resNFe.dhEmi || new Date().toISOString();
    
    if (!chNFe || chNFe.length < 44) {
      console.error("[ERRO resNFe] chNFe inválido:", { chNFe, length: chNFe.length, chNFeRaw, tipo: typeof chNFeRaw });
      throw new Error(`Chave de acesso inválida no resNFe (recebido: "${chNFe}", length: ${chNFe.length})`);
    }

    // Extrai modelo da chave (posições 20-22): "55" ou "65"
    // Formato chave: UF(2) + AAMM(6) + CNPJ(14) + MOD(2) + ...
    const modelo = chNFe.substring(20, 22) || "55";

    // Estrutura: xmls/NFe|NFCe/CNPJ/ANO/MES/Resumos/CHAVEnsu_NSU.xml
    const dataEmissao = new Date(dhEmi);
    const ano = dataEmissao.getFullYear();
    const mes = (dataEmissao.getMonth() + 1).toString().padStart(2, "0");
    const tipoDoc = modelo === "65" ? "NFCe" : "NFe";

    const filename = `${chNFe}_nsu${nsu}.xml`;
    const relativePath = path.join(tipoDoc, empresa.cnpj, `${ano}`, mes, "Resumos", filename);

    const caminhoCompleto = await xmlStorageService.saveXml(
      empresa.tipoArmazenamento,
      relativePath,
      xmlContent
    );
    const tamanhoBytes = Buffer.byteLength(xmlContent, "utf-8");

    // Salva resNFe e marca como pendente para download do XML completo
    await storage.createXml({
      userId: empresa.userId,
      empresaId: empresa.id,
      sincronizacaoId,
      chaveNFe: chNFe,
      numeroNF: chNFe.substring(25, 34), // Extrai número da chave
      modelo: modelo.toString(),
      tipoDocumento: "resNFe",
      dataEmissao,
      caminhoArquivo: caminhoCompleto,
      tamanhoBytes,
      statusDownload: "pendente", // Marca para download automático do XML completo
      tentativasDownload: 0,
    });

    await storage.createLog({
      userId: empresa.userId,
      empresaId: empresa.id,
      sincronizacaoId,
      nivel: "info",
      mensagem: `Resumo salvo: ${tipoDoc} (resNFe)`,
      detalhes: JSON.stringify({ chNFe, caminhoArquivo: caminhoCompleto, modelo, nsu }),
    });

    // FASE 4: Manifestação automática do destinatário (NT 2020.001)
    // Se manifestacaoAutomatica está ativa, manifesta Ciência (210210) automaticamente
    // IMPORTANTE: Só manifesta se empresa for o DESTINATÁRIO (não emitente)
    if (empresa.manifestacaoAutomatica) {
      try {
        // Validação crítica: Empresa deve ser o destinatário (CNPJ/CPF deve coincidir)
        const cnpjDest = String(resNFe.CNPJ || "");
        const cpfDest = String(resNFe.CPF || "");
        const empresaCNPJ = empresa.cnpj.replace(/\D/g, ""); // Remove formatação
        
        const isDestinatario = cnpjDest === empresaCNPJ || cpfDest === empresaCNPJ;
        
        if (!isDestinatario) {
          console.log(`[Manifestação Automática] SKIPPED - Empresa não é destinatária (chave ${chNFe})`);
          await storage.createLog({
            userId: empresa.userId,
            empresaId: empresa.id,
            sincronizacaoId,
            nivel: "debug",
            mensagem: `Manifestação automática não aplicável - empresa não é destinatária`,
            detalhes: JSON.stringify({ 
              chNFe,
              cnpjEmpresa: empresaCNPJ,
              cnpjDest,
              cpfDest,
              observacao: "resNFe não representa operação onde empresa é destinatária"
            }),
          });
          return; // Sai do método sem manifestar
        }
        
        console.log(`[Manifestação Automática] Empresa é destinatária - iniciando Ciência para chave ${chNFe}`);
        
        // Verifica se já foi manifestada antes
        const manifestacaoExistente = await storage.getManifestacaoByChave(chNFe, empresa.userId);
        
        if (manifestacaoExistente) {
          console.log(`[Manifestação Automática] Chave ${chNFe} já possui manifestação (${manifestacaoExistente.tipoEvento})`);
        } else {
          // Manifesta Ciência da Operação (210210)
          await this.manifestarEvento(
            empresa,
            chNFe,
            TIPOS_MANIFESTACAO.CIENCIA,
            undefined // Ciência não requer justificativa
          );
          
          console.log(`[Manifestação Automática] ✅ Ciência manifestada com sucesso para ${chNFe}`);
        }
      } catch (error) {
        // Erro na manifestação NÃO deve interromper sincronização
        console.error(`[Manifestação Automática] ❌ Erro ao manifestar ${chNFe}:`, error);
        
        await storage.createLog({
          userId: empresa.userId,
          empresaId: empresa.id,
          sincronizacaoId,
          nivel: "warning",
          mensagem: `Erro na manifestação automática para chave ${chNFe}`,
          detalhes: JSON.stringify({ 
            chNFe, 
            error: String(error),
            observacao: "Erro não interrompeu sincronização. Manifestação pode ser feita manualmente."
          }),
        });
      }
    }
  }

  /**
   * Salva evento de NF-e/NFC-e (procEventoNFe)
   * NT 2014.002 §3.3: Cancelamento, CCe, Manifestação, etc
   */
  private async saveProcEvento(
    parsed: any,
    xmlContent: string,
    empresa: Empresa,
    sincronizacaoId: string,
    nsu: string
  ): Promise<void> {
    const procEvento = parsed.procEventoNFe;
    if (!procEvento) throw new Error("XML não é um procEventoNFe");

    const evento = procEvento.evento;
    const infEvento = evento?.infEvento;
    
    // FIX: Garantir que chNFe seja sempre string (pode vir como array, objeto ou NÚMERO do parser XML)
    const chNFeRaw = infEvento?.chNFe;
    let chNFe = "";
    
    if (Array.isArray(chNFeRaw)) {
      chNFe = String(chNFeRaw[0] || "");
    } else if (typeof chNFeRaw === "number") {
      // CRÍTICO: Parser XML converte chaves grandes em number (notação científica)
      chNFe = chNFeRaw.toFixed(0);
    } else {
      chNFe = String(chNFeRaw || "");
    }
    
    const tpEvento = String(infEvento?.tpEvento || "");
    const dhEvento = infEvento?.dhEvento || new Date().toISOString();
    const nSeqEvento = String(infEvento?.nSeqEvento || "1");

    if (!chNFe || chNFe.length < 44) {
      console.error("[ERRO procEventoNFe] chNFe inválido:", { chNFe, length: chNFe.length, chNFeRaw, tipo: typeof chNFeRaw });
      throw new Error(`Chave de acesso inválida no procEventoNFe (recebido: "${chNFe}", length: ${chNFe.length})`);
    }

    // Estrutura: xmls/NFe|NFCe/CNPJ/ANO/MES/Eventos/CHAVE_tpEvento_seq.xml
    const dataEmissao = new Date(dhEvento);
    const ano = dataEmissao.getFullYear();
    const mes = (dataEmissao.getMonth() + 1).toString().padStart(2, "0");
    
    // Detecta modelo pela chave (posição 20-21)
    const modelo = chNFe.substring(20, 22) || "55";
    const tipoDoc = modelo === "65" ? "NFCe" : "NFe";

    const filename = `${chNFe}_${tpEvento}_seq${nSeqEvento}_nsu${nsu}.xml`;
    const relativePath = path.join(tipoDoc, empresa.cnpj, `${ano}`, mes, "Eventos", filename);

    const caminhoCompleto = await xmlStorageService.saveXml(
      empresa.tipoArmazenamento,
      relativePath,
      xmlContent
    );
    const tamanhoBytes = Buffer.byteLength(xmlContent, "utf-8");

    await storage.createXml({
      userId: empresa.userId,
      empresaId: empresa.id,
      sincronizacaoId,
      chaveNFe: chNFe,
      numeroNF: chNFe.substring(25, 34), // Extrai número da chave
      modelo: modelo.toString(),
      tipoDocumento: "procEventoNFe",
      dataEmissao,
      caminhoArquivo: caminhoCompleto,
      tamanhoBytes,
    });

    await storage.createLog({
      userId: empresa.userId,
      empresaId: empresa.id,
      sincronizacaoId,
      nivel: "info",
      mensagem: `Evento salvo: ${tipoDoc} (${this.getTipoEventoDescricao(tpEvento)})`,
      detalhes: JSON.stringify({ chNFe, tpEvento, caminhoArquivo: caminhoCompleto, nsu }),
    });
  }

  /**
   * Salva resumo de evento (resEvento)
   * NT 2014.002 §3.3
   */
  private async saveResEvento(
    parsed: any,
    xmlContent: string,
    empresa: Empresa,
    sincronizacaoId: string,
    nsu: string
  ): Promise<void> {
    const resEvento = parsed.resEvento;
    if (!resEvento) throw new Error("XML não é um resEvento");

    // FIX: Garantir que chNFe seja sempre string (pode vir como array, objeto ou NÚMERO do parser XML)
    const chNFeRaw = resEvento.chNFe;
    let chNFe = "";
    
    if (Array.isArray(chNFeRaw)) {
      chNFe = String(chNFeRaw[0] || "");
    } else if (typeof chNFeRaw === "number") {
      // CRÍTICO: Parser XML converte chaves grandes em number (notação científica)
      // Exemplo: 42251149531261000107... vira 4.2251149531261e+43
      // Solução: usar toFixed(0) para preservar TODOS os dígitos
      chNFe = chNFeRaw.toFixed(0);
    } else {
      chNFe = String(chNFeRaw || "");
    }
    
    const tpEvento = String(resEvento.tpEvento || "");
    const dhEvento = resEvento.dhEvento || resEvento.dhRecbto || new Date().toISOString();

    if (!chNFe || chNFe.length < 44) {
      console.error("[ERRO resEvento] chNFe inválido:", { chNFe, length: chNFe.length, chNFeRaw, tipo: typeof chNFeRaw });
      throw new Error(`Chave de acesso inválida no resEvento (recebido: "${chNFe}", length: ${chNFe.length})`);
    }

    // Estrutura: xmls/NFe|NFCe/CNPJ/ANO/MES/Eventos/Resumos/CHAVE_tpEvento_nsu.xml
    const dataEmissao = new Date(dhEvento);
    const ano = dataEmissao.getFullYear();
    const mes = (dataEmissao.getMonth() + 1).toString().padStart(2, "0");
    
    const modelo = chNFe.substring(20, 22) || "55";
    const tipoDoc = modelo === "65" ? "NFCe" : "NFe";

    const filename = `${chNFe}_${tpEvento}_nsu${nsu}.xml`;
    const relativePath = path.join(tipoDoc, empresa.cnpj, `${ano}`, mes, "Eventos", "Resumos", filename);

    const caminhoCompleto = await xmlStorageService.saveXml(
      empresa.tipoArmazenamento,
      relativePath,
      xmlContent
    );
    const tamanhoBytes = Buffer.byteLength(xmlContent, "utf-8");

    await storage.createXml({
      userId: empresa.userId,
      empresaId: empresa.id,
      sincronizacaoId,
      chaveNFe: chNFe,
      numeroNF: chNFe.substring(25, 34),
      modelo: modelo.toString(),
      tipoDocumento: "resEvento",
      dataEmissao,
      caminhoArquivo: caminhoCompleto,
      tamanhoBytes,
    });

    await storage.createLog({
      userId: empresa.userId,
      empresaId: empresa.id,
      sincronizacaoId,
      nivel: "info",
      mensagem: `Resumo de evento salvo: ${tipoDoc} (${this.getTipoEventoDescricao(tpEvento)})`,
      detalhes: JSON.stringify({ chNFe, tpEvento, caminhoArquivo: caminhoCompleto, nsu }),
    });
  }

  /**
   * Retorna descrição oficial do tipo de evento
   * CORREÇÃO CRÍTICA: Exemplos oficiais usam SEM ACENTOS mesmo que NT 2020.001 Tabela 3.1 mostre com acentos
   * Causa raiz cStat 215: Schema XSD valida contra strings EXATAS sem acentuação
   */
  private getTipoEventoDescricao(tpEvento: string): string {
    const tipos: Record<string, string> = {
      "110110": "Carta de Correcao",
      "110111": "Cancelamento",
      "210200": "Confirmacao da Operacao",
      "210210": "Ciencia da Operacao",
      "210220": "Desconhecimento da Operacao",
      "210240": "Operacao nao Realizada",
    };
    return tipos[tpEvento] || `Evento ${tpEvento}`;
  }

  /**
   * Baixa XML completo usando NFeDistribuicaoDFe (consChNFe)
   * Conforme NT 2014.002 e documentação oficial da Fazenda
   * 
   * Uso: Baixar XML completo (nfeProc) quando só temos resumo (resNFe)
   * Retorna o XML em formato <docZip> (Base64 + GZip) que é descompactado automaticamente
   * 
   * @param chaveNFe - Chave de acesso de 44 dígitos
   * @param empresa - Dados da empresa
   * @returns Objeto com xmlContent e cStat, ou null se não encontrado
   */
  async consultarChave(chaveNFe: string, empresa: Empresa): Promise<{ xmlContent: string; cStat: string } | null> {
    try {
      console.log(`[consultarChave] Baixando XML completo ${chaveNFe} para empresa ${empresa.cnpj}`);

      // Usa método oficial: NFeDistribuicaoDFe com consChNFe
      const envelope = this.buildSOAPEnvelopeConsChNFe(
        empresa.cnpj,
        empresa.uf,
        empresa.ambiente,
        chaveNFe
      );

      // Usa endpoint NFeDistribuicaoDFe (mesmo da sincronização)
      const responseXML = await this.callDistDFe(empresa, envelope);
      
      // Log da resposta completa para debug
      console.log(`[consultarChave] Resposta SOAP recebida (primeiros 500 chars): ${responseXML.substring(0, 500)}`);
      
      const parsed = this.parser.parse(responseXML);

      // Extrai retorno do NFeDistribuicaoDFe
      // Estrutura: soap12:Envelope > soap12:Body > nfeDistDFeInteresseResponse > nfeDistDFeInteresseResult > retDistDFeInt
      const envelope_soap = parsed["soap12:Envelope"] || parsed["soap:Envelope"] || parsed["Envelope"];
      if (!envelope_soap) {
        console.error('[consultarChave] ❌ Envelope SOAP não encontrado. Keys:', Object.keys(parsed));
        throw new Error("Resposta SEFAZ inválida: Envelope SOAP não encontrado");
      }
      
      const body = envelope_soap["soap12:Body"] || envelope_soap["soap:Body"] || envelope_soap["Body"];
      if (!body) {
        console.error('[consultarChave] ❌ Body SOAP não encontrado. Keys envelope:', Object.keys(envelope_soap));
        throw new Error("Resposta SEFAZ inválida: Body SOAP não encontrado");
      }
      
      // Busca nfeDistDFeInteresseResult
      const nfeDistDFeInteresseResult = 
        body["nfeDistDFeInteresseResult"] || 
        body["nfeDistDFeInteresseResponse"]?.["nfeDistDFeInteresseResult"];
      
      if (!nfeDistDFeInteresseResult) {
        console.error('[consultarChave] ❌ nfeDistDFeInteresseResult não encontrado. Keys body:', Object.keys(body));
        throw new Error("Resposta SEFAZ inválida: nfeDistDFeInteresseResult não encontrado");
      }
      
      const retDistDFeInt = nfeDistDFeInteresseResult["retDistDFeInt"];
      if (!retDistDFeInt) {
        console.error('[consultarChave] ❌ retDistDFeInt não encontrado. Keys:', Object.keys(nfeDistDFeInteresseResult));
        throw new Error("Resposta SEFAZ inválida: retDistDFeInt não encontrado");
      }
      
      const cStat = String(retDistDFeInt.cStat || "");
      const xMotivo = String(retDistDFeInt.xMotivo || "");

      await storage.createLog({
        userId: empresa.userId,
        empresaId: empresa.id,
        nivel: "info",
        mensagem: `consultarChave: ${cStat} - ${xMotivo}`,
        detalhes: JSON.stringify({ chaveNFe, cStat }),
      });

      // cStat 138: Documento localizado (XML completo disponível)
      if (cStat === "138" && retDistDFeInt.loteDistDFeInt) {
        const lote = retDistDFeInt.loteDistDFeInt;
        const docZip = lote.docZip;
        
        if (!docZip) {
          console.error('[consultarChave] ❌ docZip não encontrado em loteDistDFeInt');
          return null;
        }

        // docZip vem como Base64 + GZip
        // 1. Decodifica Base64
        const gzipBuffer = Buffer.from(docZip, 'base64');
        
        // 2. Descompacta GZip
        const xmlContent = pako.ungzip(gzipBuffer, { to: 'string' });
        
        const parsedXML = this.parser.parse(xmlContent);

        // Verifica se é nfeProc (XML completo)
        if (parsedXML.nfeProc) {
          console.log(`[consultarChave] ✓ XML completo baixado para chave ${chaveNFe}`);
          return { xmlContent, cStat };
        } else {
          console.warn(`[consultarChave] Chave ${chaveNFe} retornou documento que não é nfeProc:`, Object.keys(parsedXML));
          return null;
        }
      }

      // cStat 137: Nenhum documento encontrado
      // cStat 656: Consumo indevido (já consultado antes)
      console.log(`[consultarChave] Chave ${chaveNFe} não retornou nfeProc (cStat=${cStat}: ${xMotivo})`);
      return null;
    } catch (error) {
      await storage.createLog({
        userId: empresa.userId,
        empresaId: empresa.id,
        nivel: "error",
        mensagem: `Erro em consultarChave: ${String(error)}`,
        detalhes: JSON.stringify({ chaveNFe, error: String(error) }),
      });
      throw error;
    }
  }

  /**
   * Manifestar evento do destinatário para NF-e (NFeRecepcaoEvento v4.00)
   * Conforme NT 2020.001
   * 
   * @param empresa - Dados da empresa manifestante
   * @param chaveNFe - Chave de acesso de 44 dígitos
   * @param tpEvento - Tipo de evento (210200, 210210, 210220, 210240)
   * @param justificativa - Justificativa (obrigatória para 210240)
   * @returns Dados da manifestação registrada
   */
  async manifestarEvento(
    empresa: Empresa,
    chaveNFe: string,
    tpEvento: string,
    justificativa?: string
  ): Promise<any> {
    try {
      console.log(`[Manifestação] Iniciando ${this.getTipoEventoDescricao(tpEvento)} para chave ${chaveNFe}`);

      // Validação: 210240 requer justificativa
      if (tpEvento === TIPOS_MANIFESTACAO.NAO_REALIZADA && (!justificativa || justificativa.length < 15)) {
        throw new Error("Evento 210240 (Operação não Realizada) requer justificativa de no mínimo 15 caracteres");
      }

      // Carrega certificado para assinatura digital (NT 2020.001 exige assinatura)
      let certData;
      try {
        certData = await loadPKCS12Certificate(
          empresa.certificadoPath,
          empresa.certificadoSenha
        );
        console.log('[Manifestação] ✅ Certificado carregado com sucesso');
        console.log('[Manifestação] 🔑 PrivateKey presente:', certData.key ? 'SIM' : 'NÃO');
        console.log('[Manifestação] 📜 Certificate presente:', certData.cert ? 'SIM' : 'NÃO');
      } catch (error: any) {
        throw new Error(`Falha ao carregar certificado para manifestação: ${error.message}`);
      }

      // Monta envelope SOAP com assinatura digital
      const envelope = this.buildSOAPEnvelopeManifestacao(
        empresa.cnpj,
        chaveNFe,
        tpEvento,
        1, // nSeqEvento sempre 1 para primeira manifestação
        empresa.ambiente,
        justificativa,
        certData.key,       // privateKey em PEM
        certData.cert       // certificate em PEM
      );

      // DEBUG: Mostra envelope completo sendo enviado
      console.log(`[Manifestação] 📤 ENVELOPE SOAP ENVIANDO:\n${envelope}`);

      // Envia para SEFAZ
      const responseXML = await this.callRecepcaoEvento(empresa, envelope);
      
      // Log da resposta completa para debug
      console.log(`[Manifestação] Resposta SOAP recebida (primeiros 500 chars): ${responseXML.substring(0, 500)}`);
      
      const parsed = this.parser.parse(responseXML);

      // Extrai retEvento da resposta SOAP
      // Estrutura: soap:Envelope > soap:Body > nfeRecepcaoEventoResult > retEnvEvento > retEvento
      const envelope_soap = parsed["soap12:Envelope"] || parsed["soap:Envelope"] || parsed["Envelope"];
      if (!envelope_soap) {
        console.error('[Manifestação] ❌ Envelope SOAP não encontrado. Keys:', Object.keys(parsed));
        throw new Error("Resposta SEFAZ inválida: Envelope SOAP não encontrado");
      }
      
      const body = envelope_soap["soap12:Body"] || envelope_soap["soap:Body"] || envelope_soap["Body"];
      if (!body) {
        console.error('[Manifestação] ❌ Body SOAP não encontrado. Keys envelope:', Object.keys(envelope_soap));
        throw new Error("Resposta SEFAZ inválida: Body SOAP não encontrado");
      }
      
      // CORREÇÃO: Busca nfeResultMsg (tag correta conforme NT 2020.001)
      const nfeResultMsg = 
        body["nfeResultMsg"] || 
        body["nfeRecepcaoEventoResult"] || 
        body["nfe:nfeResultMsg"];
      
      if (!nfeResultMsg) {
        console.error('[Manifestação] ❌ nfeResultMsg não encontrado. Keys body:', Object.keys(body));
        throw new Error("Resposta SEFAZ inválida: nfeResultMsg não encontrado");
      }
      
      const retEnvEvento = nfeResultMsg["retEnvEvento"];
      if (!retEnvEvento) {
        console.error('[Manifestação] ❌ retEnvEvento não encontrado. Keys:', Object.keys(nfeResultMsg));
        throw new Error("Resposta SEFAZ inválida: retEnvEvento não encontrado");
      }
      
      const retEvento = retEnvEvento["retEvento"];
      if (!retEvento || !retEvento.infEvento) {
        console.error('[Manifestação] ❌ retEvento/infEvento não encontrado. Keys retEnvEvento:', Object.keys(retEnvEvento));
        console.error('[Manifestação] retEnvEvento completo:', JSON.stringify(retEnvEvento, null, 2));
        throw new Error("Resposta SEFAZ inválida: retEvento não encontrado");
      }

      const infEvento = retEvento.infEvento;
      const cStat = String(infEvento.cStat || "");
      const xMotivo = String(infEvento.xMotivo || "");
      const nProt = String(infEvento.nProt || "");
      const dhRegEvento = String(infEvento.dhRegEvento || "");

      await storage.createLog({
        userId: empresa.userId,
        empresaId: empresa.id,
        nivel: "info",
        mensagem: `Manifestação ${this.getTipoEventoDescricao(tpEvento)}: ${cStat} - ${xMotivo}`,
        detalhes: JSON.stringify({ chaveNFe, tpEvento, cStat, nProt, dhRegEvento }),
      });

      // CRÍTICO: Calcular datas obrigatórias para evitar erro de NOT NULL
      // dataAutorizacaoNFe: tenta extrair do dhRegEvento, senão usa data atual
      let dataAutorizacaoNFe = new Date();
      if (dhRegEvento) {
        const tentativaData = new Date(dhRegEvento);
        // CRÍTICO: new Date() não lança exceção com input inválido, retorna Invalid Date
        // Precisa validar explicitamente com isNaN(date.getTime())
        if (!Number.isNaN(tentativaData.getTime())) {
          dataAutorizacaoNFe = tentativaData;
          console.log(`[Manifestação] Data autorização NFe extraída: ${dhRegEvento}`);
        } else {
          console.warn(`[Manifestação] dhRegEvento inválido "${dhRegEvento}", usando data atual`);
        }
      } else {
        console.warn(`[Manifestação] dhRegEvento não fornecido pela SEFAZ, usando data atual`);
      }

      // Valida dataAutorizacaoNFe antes de calcular prazoLegal
      if (Number.isNaN(dataAutorizacaoNFe.getTime())) {
        console.error(`[Manifestação] dataAutorizacaoNFe inválida, forçando data atual`);
        dataAutorizacaoNFe = new Date();
      }

      // prazoLegal: NT 2020.001 §4 - 180 dias corridos a partir da autorização
      const prazoLegal = new Date(dataAutorizacaoNFe);
      prazoLegal.setDate(prazoLegal.getDate() + 180);

      console.log(`[Manifestação] Dados calculados - dataAutorizacao: ${dataAutorizacaoNFe.toISOString()}, prazoLegal: ${prazoLegal.toISOString()}`);

      // Cria/atualiza registro de manifestação
      let manifestacao;
      try {
        manifestacao = await storage.createManifestacao({
          userId: empresa.userId,
          empresaId: empresa.id,
          chaveNFe,
          tipoEvento: tpEvento,
          status: cStat === "135" ? "autorizado" : "rejeitado", // cStat 135 = Evento registrado
          dataAutorizacaoNFe,
          dataManifestacao: new Date(),
          prazoLegal,
          nsuEvento: null,
          protocoloEvento: nProt || null,
          cStat,
          xMotivo,
          justificativa: justificativa || null,
          tentativas: 1,
          ultimoErro: cStat === "135" ? null : xMotivo,
        });

        console.log(`[Manifestação] ✅ Registro salvo no banco: ${manifestacao.id}`);
      } catch (dbError: any) {
        console.error(`[Manifestação] ❌ ERRO ao salvar no banco:`, dbError);
        await storage.createLog({
          userId: empresa.userId,
          empresaId: empresa.id,
          nivel: "error",
          mensagem: `Erro ao salvar manifestação no banco`,
          detalhes: JSON.stringify({ 
            chaveNFe, 
            tpEvento, 
            cStat, 
            erro: dbError.message,
            stack: dbError.stack 
          }),
        });
        throw new Error(`Erro ao salvar manifestação no banco: ${dbError.message}`);
      }

      console.log(`[Manifestação] ${cStat === "135" ? "✅ Sucesso" : "❌ Rejeitado"}: ${xMotivo}`);
      return manifestacao;
    } catch (error) {
      await storage.createLog({
        userId: empresa.userId,
        empresaId: empresa.id,
        nivel: "error",
        mensagem: `Erro ao manifestar evento: ${String(error)}`,
        detalhes: JSON.stringify({ chaveNFe, tpEvento, error: String(error) }),
      });
      throw error;
    }
  }

  async sincronizarEmpresa(empresa: Empresa): Promise<number> {
    // CRÍTICO: Recarregar empresa do banco para pegar valor atualizado de bloqueadoAte
    // Isso evita usar dados em cache quando o bloqueio já expirou
    const empresaAtualizada = await storage.getEmpresa(empresa.id, empresa.userId);
    if (!empresaAtualizada) {
      throw new Error("Empresa não encontrada");
    }
    empresa = empresaAtualizada; // Usa dados frescos do banco
    
    // Verifica se empresa está bloqueada (cStat 656)
    if (estaBloqueado(empresa.bloqueadoAte)) {
      const tempoRestante = calcularMinutosRestantes(empresa.bloqueadoAte);
      const horarioBrasil = formatarDataBrasilCompleta(empresa.bloqueadoAte);
      const mensagemBloqueio = `Empresa bloqueada pela SEFAZ (erro 656) até ${horarioBrasil}. Tempo restante: ${tempoRestante} minutos. Aguarde o desbloqueio automático.`;
      
      await storage.createLog({
        userId: empresa.userId,
        empresaId: empresa.id,
        sincronizacaoId: null,
        nivel: "warning",
        mensagem: "Tentativa de sincronização bloqueada",
        detalhes: JSON.stringify({ 
          bloqueadoAte: empresa.bloqueadoAte?.toISOString(),
          bloqueadoAteHorarioBrasil: horarioBrasil,
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
          // 137: Nenhum documento localizado
          // NT 2014.002 §3.11.4: AGUARDAR 1 HORA antes de nova consulta
          nsuAtual = response.ultNSU || nsuAtual;
          maxNSU = response.maxNSU || nsuAtual;
          
          // PERSISTIR bloqueio de 65min (margem de segurança conforme NT 2014.002)
          const bloqueadoAte = criarBloqueio(65);
          await storage.updateEmpresa(empresa.id, { bloqueadoAte }, empresa.userId);
          
          const proximaConsultaHorarioBrasil = formatarDataBrasilCompleta(bloqueadoAte);
          
          await storage.createLog({
            userId: empresa.userId,
            empresaId: empresa.id,
            sincronizacaoId: sincronizacao.id,
            nivel: "info",
            mensagem: `cStat=137: Sem novos documentos neste momento`,
            detalhes: JSON.stringify({ 
              ultNSU: nsuAtual,
              maxNSU,
              bloqueadoAte: bloqueadoAte.toISOString(),
              proximaConsultaHorarioBrasil,
              motivo: "SEFAZ retornou cStat=137 (nenhum documento localizado)",
              acaoAutomatica: "Sistema aguardará 1h antes de tentar novamente conforme NT 2014.002 §3.11.4",
              observacao: "Bloqueio preventivo até " + proximaConsultaHorarioBrasil + ". Próxima sincronização automática via cron."
            }),
          });
          
          alinhamentoCompleto = true; // Marca como completo para sair do loop
          break; // Para o loop IMEDIATAMENTE
        } else if (response.cStat === "138") {
          // 138: Tem documentos - processa TODOS os schemas conforme NT 2014.002 §3.3
          for (const docZip of response.docZips || []) {
            try {
              const xmlContent = this.decompressDocZip(docZip.content);
              await this.processDocument(xmlContent, docZip.schema, empresa, sincronizacao.id, docZip.NSU);
              xmlsBaixados++;
            } catch (error) {
              console.error("Erro ao processar docZip:", error);
              await storage.createLog({
                userId: empresa.userId,
                empresaId: empresa.id,
                sincronizacaoId: sincronizacao.id,
                nivel: "warning",
                mensagem: `Erro ao processar documento NSU ${docZip.NSU} (${docZip.schema})`,
                detalhes: JSON.stringify({ 
                  error: String(error),
                  schema: docZip.schema,
                  nsu: docZip.NSU
                }),
              });
            }
          }

          nsuAtual = response.ultNSU || nsuAtual;
          maxNSU = response.maxNSU || nsuAtual;
        } else {
          // Erro 656: Bloqueio temporário ou NSU desatualizado
          if (response.cStat === "656") {
            // NT 2014.002 v1.14: SEFAZ retorna ultNSU correto na rejeição 656
            // CRÍTICO: Atualizar NSU ANTES de lançar erro para evitar loop infinito!
            const nsuRetornadoPelaSefaz = response.ultNSU && response.ultNSU.trim() !== "" && response.ultNSU !== "0" ? response.ultNSU : null;
            
            // Calcula diferença usando BigInt para preservar zeros à esquerda
            const diferenca = nsuRetornadoPelaSefaz 
              ? Number(BigInt(nsuRetornadoPelaSefaz) - BigInt(nsuAtual))
              : 0;
            
            // Calcula bloqueio: 65 minutos (margem de segurança conforme NT)
            const bloqueadoAte = criarBloqueio(65);
            
            // ATUALIZA empresa com NSU correto + bloqueio (conforme NT 2014.002 v1.14)
            // Só atualiza ultimoNSU se SEFAZ retornou valor válido
            const updatePayload = nsuRetornadoPelaSefaz
              ? { ultimoNSU: nsuRetornadoPelaSefaz, bloqueadoAte }
              : { bloqueadoAte };
              
            await storage.updateEmpresa(empresa.id, updatePayload, empresa.userId);

            // Log detalhado para diagnóstico (exibe em horário do Brasil)
            const horarioBrasilBloqueio = formatarDataBrasilCompleta(bloqueadoAte);
            
            // Detecta concorrência com outros sistemas (ERP/contador)
            const nivelLog = diferenca > 1 ? "warning" : "error";
            const mensagemConcorrencia = diferenca > 1 
              ? `ATENÇÃO: NSU avançou ${diferenca} posições! Possível outro sistema consultando este CNPJ.`
              : "NSU atualizado conforme retorno da SEFAZ.";
            
            await storage.createLog({
              userId: empresa.userId,
              empresaId: empresa.id,
              sincronizacaoId: sincronizacao.id,
              nivel: nivelLog,
              mensagem: `cStat=656: Consumo indevido detectado pela SEFAZ`,
              detalhes: JSON.stringify({ 
                iteracao: iteracao + 1,
                ultNSUEnviado: nsuAtual,
                ultNSURetornadoPelaSefaz: nsuRetornadoPelaSefaz || "não retornado",
                diferencaNSU: diferenca,
                nsuAtualizado: nsuRetornadoPelaSefaz || nsuAtual,
                cStat: "656",
                xMotivo: response.xMotivo,
                bloqueadoAte: bloqueadoAte.toISOString(),
                bloqueadoAteHorarioBrasil: horarioBrasilBloqueio,
                motivo: "SEFAZ aplicou bloqueio temporário por violação das regras de consulta (NT 2014.002)",
                causaProvavel: diferenca > 1
                  ? "Outro sistema (ERP/contador) está consultando este CNPJ simultaneamente"
                  : iteracao === 0 
                    ? "NSU desatualizado ou primeira consulta após bloqueio anterior"
                    : "Múltiplas consultas em sequência ou NSU fora de ordem",
                acaoTomada: nsuRetornadoPelaSefaz
                  ? `NSU atualizado de ${nsuAtual} para ${nsuRetornadoPelaSefaz} conforme retorno da SEFAZ (NT 2014.002 v1.14)`
                  : `SEFAZ não retornou ultNSU válido - NSU mantido em ${nsuAtual}`,
                acaoNecessaria: "AGUARDAR desbloqueio automático - NÃO tentar novamente antes de " + horarioBrasilBloqueio,
                orientacao: mensagemConcorrencia
              }),
            });

            const mensagemClara = nsuRetornadoPelaSefaz
              ? `Bloqueio SEFAZ (cStat 656): ${response.xMotivo}. NSU atualizado para ${nsuRetornadoPelaSefaz}. Empresa bloqueada até ${horarioBrasilBloqueio}. ${diferenca > 1 ? 'ATENÇÃO: Detectada concorrência com outro sistema!' : 'Aguarde o desbloqueio automático.'}`
              : `Bloqueio SEFAZ (cStat 656): ${response.xMotivo}. SEFAZ não retornou ultNSU válido. Empresa bloqueada até ${horarioBrasilBloqueio}. Aguarde o desbloqueio automático.`;
            
            throw new Error(mensagemClara);
          }
          throw new Error(`Erro SEFAZ: ${response.cStat} - ${response.xMotivo}`);
        }

        // Verifica alinhamento completo (conforme NT 2014.002)
        if (nsuAtual === maxNSU) {
          alinhamentoCompleto = true;
          
          // NT 2014.002 §3.11.4: Quando ultNSU == maxNSU, BLOQUEAR por 1 hora
          const bloqueadoAte = criarBloqueio(65);
          await storage.updateEmpresa(empresa.id, { bloqueadoAte }, empresa.userId);
          
          const proximaConsultaHorarioBrasil = formatarDataBrasilCompleta(bloqueadoAte);
          
          await storage.createLog({
            userId: empresa.userId,
            empresaId: empresa.id,
            sincronizacaoId: sincronizacao.id,
            nivel: "info",
            mensagem: `Alinhamento completo: ultNSU == maxNSU`,
            detalhes: JSON.stringify({ 
              ultNSU: nsuAtual,
              maxNSU,
              bloqueadoAte: bloqueadoAte.toISOString(),
              proximaConsultaHorarioBrasil,
              motivo: "Sistema está totalmente sincronizado (ultNSU == maxNSU)",
              acaoAutomatica: "Bloqueio de 1h conforme NT 2014.002 §3.11.4 para evitar cStat=656",
              observacao: "Próxima sincronização automática via cron após " + proximaConsultaHorarioBrasil
            }),
          });
          
          console.log(`[Sincronização] Alinhamento completo: ultNSU === maxNSU (${nsuAtual}). Bloqueado até ${proximaConsultaHorarioBrasil}`);
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

      // Atualiza empresa com novo NSU
      // IMPORTANTE: NÃO limpa bloqueio se foi aplicado por ultNSU==maxNSU ou cStat=137
      // O bloqueio só deve ser limpo automaticamente após expirar o prazo
      await storage.updateEmpresa(empresa.id, { 
        ultimoNSU: nsuAtual
        // bloqueadoAte mantém valor existente (pode ter sido setado em ultNSU==maxNSU ou cStat=137)
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
    // CRÍTICO: Recarregar empresa do banco para pegar valor atualizado de bloqueadoAte
    const empresaAtualizada = await storage.getEmpresa(empresa.id, empresa.userId);
    if (!empresaAtualizada) {
      throw new Error("Empresa não encontrada");
    }
    empresa = empresaAtualizada; // Usa dados frescos do banco
    
    // Verifica se empresa está bloqueada (cStat 656)
    if (estaBloqueado(empresa.bloqueadoAte)) {
      const tempoRestante = calcularMinutosRestantes(empresa.bloqueadoAte);
      const horarioBrasil = formatarDataBrasilCompleta(empresa.bloqueadoAte);
      const mensagemBloqueio = `Empresa bloqueada pela SEFAZ (erro 656) até ${horarioBrasil}. Tempo restante: ${tempoRestante} minutos. Aguarde o desbloqueio automático.`;
      
      await storage.createLog({
        userId: empresa.userId,
        empresaId: empresa.id,
        sincronizacaoId: null,
        nivel: "warning",
        mensagem: "Tentativa de reconciliação bloqueada",
        detalhes: JSON.stringify({ 
          bloqueadoAte: empresa.bloqueadoAte?.toISOString(),
          bloqueadoAteHorarioBrasil: horarioBrasil,
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
        if (response.cStat === "137") {
          // 137: Sem documentos - NT 2014.002 exige aguardar 1h
          const ultNSU = response.ultNSU || "0";
          maxNSU = response.maxNSU || ultNSU;
          
          // PERSISTIR bloqueio de 65min (margem de segurança conforme NT 2014.002)
          const bloqueadoAte = criarBloqueio(65);
          await storage.updateEmpresa(empresa.id, { bloqueadoAte }, empresa.userId);
          
          const proximaConsultaHorarioBrasil = formatarDataBrasilCompleta(bloqueadoAte);
          
          await storage.createLog({
            userId: empresa.userId,
            empresaId: empresa.id,
            sincronizacaoId: null,
            nivel: "info",
            mensagem: `cStat=137: Sem novos documentos na reconciliação`,
            detalhes: JSON.stringify({ 
              ultNSU,
              maxNSU,
              bloqueadoAte: bloqueadoAte.toISOString(),
              proximaConsultaHorarioBrasil,
              motivo: "SEFAZ retornou cStat=137 (nenhum documento localizado) durante alinhamento de NSU",
              acaoAutomatica: "Sistema aguardará 1h antes de tentar novamente conforme NT 2014.002 §3.11.4",
              observacao: "Bloqueio preventivo até " + proximaConsultaHorarioBrasil + ". Tente novamente após esse horário."
            }),
          });
          
          // Atualiza NSU atual e para o loop IMEDIATAMENTE
          nsuAtual = ultNSU;
          alinhamentoCompleto = true;
          break;
        } else if (response.cStat === "138") {
          // 138: Documentos encontrados - avança NSU
          const ultNSU = response.ultNSU || "0";
          maxNSU = response.maxNSU || ultNSU;
          nsuAtual = ultNSU;
        } else {
          // Erro 656 ou outro erro
          if (response.cStat === "656") {
            // NT 2014.002 v1.14: SEFAZ retorna ultNSU correto na rejeição 656
            // CRÍTICO: Atualizar NSU ANTES de lançar erro para evitar loop infinito!
            const ultNSU = response.ultNSU || "0";
            const nsuRetornadoPelaSefaz = ultNSU && ultNSU.trim() !== "" && ultNSU !== "0" ? ultNSU : null;
            
            // Calcula diferença usando BigInt para preservar zeros à esquerda
            const diferenca = nsuRetornadoPelaSefaz 
              ? Number(BigInt(nsuRetornadoPelaSefaz) - BigInt(nsuAtual))
              : 0;
            
            // Calcula bloqueio: 65 minutos (margem de segurança conforme NT)
            const bloqueadoAte = criarBloqueio(65);
            
            // ATUALIZA empresa com NSU correto + bloqueio (conforme NT 2014.002 v1.14)
            // Só atualiza ultimoNSU se SEFAZ retornou valor válido
            const updatePayload = nsuRetornadoPelaSefaz
              ? { ultimoNSU: nsuRetornadoPelaSefaz, bloqueadoAte }
              : { bloqueadoAte };
              
            await storage.updateEmpresa(empresa.id, updatePayload, empresa.userId);
            
            const horarioBrasilBloqueio = formatarDataBrasilCompleta(bloqueadoAte);
            
            // Detecta concorrência com outros sistemas (ERP/contador)
            const nivelLog = diferenca > 1 ? "warning" : "error";
            const mensagemConcorrencia = diferenca > 1 
              ? `ATENÇÃO: NSU avançou ${diferenca} posições durante reconciliação! Possível outro sistema consultando este CNPJ.`
              : "NSU atualizado conforme retorno da SEFAZ.";
            
            await storage.createLog({
              userId: empresa.userId,
              empresaId: empresa.id,
              sincronizacaoId: null,
              nivel: nivelLog,
              mensagem: `cStat=656: Consumo indevido durante reconciliação`,
              detalhes: JSON.stringify({ 
                iteracao: i + 1,
                ultNSUEnviado: nsuAtual,
                ultNSURetornadoPelaSefaz: nsuRetornadoPelaSefaz || "não retornado",
                diferencaNSU: diferenca,
                nsuAtualizado: nsuRetornadoPelaSefaz || nsuAtual,
                cStat: "656",
                xMotivo: response.xMotivo,
                bloqueadoAte: bloqueadoAte.toISOString(),
                bloqueadoAteHorarioBrasil: horarioBrasilBloqueio,
                motivo: "SEFAZ aplicou bloqueio temporário durante alinhamento de NSU (NT 2014.002)",
                causaProvavel: diferenca > 1
                  ? "Outro sistema (ERP/contador) está consultando este CNPJ simultaneamente"
                  : "NSU fora de sequência ou primeira consulta após bloqueio anterior",
                acaoTomada: nsuRetornadoPelaSefaz
                  ? `NSU atualizado de ${nsuAtual} para ${nsuRetornadoPelaSefaz} conforme retorno da SEFAZ (NT 2014.002 v1.14)`
                  : `SEFAZ não retornou ultNSU válido - NSU mantido em ${nsuAtual}`,
                acaoNecessaria: "AGUARDAR desbloqueio automático - NÃO tentar novamente antes de " + horarioBrasilBloqueio,
                orientacao: mensagemConcorrencia
              }),
            });

            const mensagemClara = nsuRetornadoPelaSefaz
              ? `Bloqueio SEFAZ (cStat 656): ${response.xMotivo}. NSU atualizado para ${nsuRetornadoPelaSefaz}. Empresa bloqueada até ${horarioBrasilBloqueio}. ${diferenca > 1 ? 'ATENÇÃO: Detectada concorrência com outro sistema!' : 'Aguarde o desbloqueio automático.'}`
              : `Bloqueio SEFAZ (cStat 656): ${response.xMotivo}. SEFAZ não retornou ultNSU válido. Empresa bloqueada até ${horarioBrasilBloqueio}. Aguarde o desbloqueio automático.`;
            throw new Error(mensagemClara);
          }
          throw new Error(`SEFAZ retornou cStat ${response.cStat}: ${response.xMotivo}`);
        }

        // Log de progresso
        console.log(`[Alinhamento NSU] Iteração ${i + 1}: ultNSU=${nsuAtual}, maxNSU=${maxNSU}`);

        // Verifica se atingiu maxNSU (alinhamento completo)
        if (nsuAtual === maxNSU) {
          alinhamentoCompleto = true;
          await storage.createLog({
            userId: empresa.userId,
            empresaId: empresa.id,
            sincronizacaoId: null,
            nivel: "info",
            mensagem: `Alinhamento completo: ultNSU === maxNSU`,
            detalhes: JSON.stringify({ ultNSU: nsuAtual, maxNSU, iteracoes: i + 1, chamadas }),
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

  /**
   * Busca avançada de XMLs por período usando consNSU
   * NT 2014.002: LIMITADO a 20 consultas por hora por CNPJ
   * 
   * @param empresa - Empresa para buscar
   * @param nsuInicial - NSU inicial do intervalo
   * @param nsuFinal - NSU final do intervalo
   * @param maxConsultas - Limite de consultas (máx 20)
   * @returns Estatísticas da busca
   */
  async buscarPorPeriodo(
    empresa: Empresa,
    nsuInicial: string,
    nsuFinal: string,
    maxConsultas: number = 20
  ): Promise<{
    xmlsEncontrados: number;
    consultasRealizadas: number;
    nsuConsultados: string[];
  }> {
    // Validação: máximo 20 consultas/hora conforme NT 2014.002
    if (maxConsultas > 20) {
      throw new Error("Limite máximo de 20 consultas por hora (NT 2014.002)");
    }

    const nsuInicialNum = parseInt(nsuInicial);
    const nsuFinalNum = parseInt(nsuFinal);

    if (nsuInicialNum >= nsuFinalNum) {
      throw new Error("NSU inicial deve ser menor que NSU final");
    }

    const totalNSUs = nsuFinalNum - nsuInicialNum + 1;
    if (totalNSUs > maxConsultas) {
      throw new Error(`Intervalo muito grande: ${totalNSUs} NSUs. Máximo permitido: ${maxConsultas} consultas.`);
    }

    await storage.createLog({
      userId: empresa.userId,
      empresaId: empresa.id,
      sincronizacaoId: null,
      nivel: "info",
      mensagem: `Iniciando busca avançada por período`,
      detalhes: JSON.stringify({
        nsuInicial,
        nsuFinal,
        totalNSUs,
        maxConsultas,
        observacao: "Busca pontual usando consNSU (limite 20/hora)"
      }),
    });

    let xmlsEncontrados = 0;
    let consultasRealizadas = 0;
    const nsuConsultados: string[] = [];

    try {
      // Loop por cada NSU no intervalo
      for (let nsu = nsuInicialNum; nsu <= nsuFinalNum && consultasRealizadas < maxConsultas; nsu++) {
        const nsuStr = nsu.toString().padStart(15, "0");
        
        // Monta envelope consNSU para consulta pontual
        const envelope = this.buildSOAPEnvelope(
          empresa.cnpj,
          empresa.uf,
          empresa.ambiente,
          nsuStr
        );

        await storage.createLog({
          userId: empresa.userId,
          empresaId: empresa.id,
          sincronizacaoId: null,
          nivel: "info",
          mensagem: `Busca avançada - Consultando NSU ${nsuStr}`,
          detalhes: JSON.stringify({
            nsu: nsuStr,
            consulta: consultasRealizadas + 1,
            total: maxConsultas
          }),
        });

        let responseXml: string;
        try {
          responseXml = await this.callDistDFe(empresa, envelope);
          consultasRealizadas++;
          nsuConsultados.push(nsuStr);
        } catch (error) {
          await storage.createLog({
            userId: empresa.userId,
            empresaId: empresa.id,
            sincronizacaoId: null,
            nivel: "error",
            mensagem: `Busca avançada - Erro ao consultar NSU ${nsuStr}`,
            detalhes: JSON.stringify({
              error: String(error),
              nsu: nsuStr
            }),
          });
          
          // Incrementa contador mesmo em erro
          consultasRealizadas++;
          nsuConsultados.push(nsuStr);
          continue;
        }

        const response = this.parseSOAPResponse(responseXml);

        if (response.cStat === "138") {
          // Documento encontrado - processa
          for (const docZip of response.docZips || []) {
            try {
              const xmlContent = this.decompressDocZip(docZip.content);
              await this.processDocument(xmlContent, docZip.schema, empresa, null as any, docZip.NSU);
              xmlsEncontrados++;
              
              await storage.createLog({
                userId: empresa.userId,
                empresaId: empresa.id,
                sincronizacaoId: null,
                nivel: "info",
                mensagem: `Busca avançada - XML encontrado no NSU ${nsuStr}`,
                detalhes: JSON.stringify({
                  nsu: nsuStr,
                  schema: docZip.schema
                }),
              });
            } catch (error) {
              await storage.createLog({
                userId: empresa.userId,
                empresaId: empresa.id,
                sincronizacaoId: null,
                nivel: "warning",
                mensagem: `Busca avançada - Erro ao processar documento NSU ${nsuStr}`,
                detalhes: JSON.stringify({
                  error: String(error),
                  schema: docZip.schema,
                  nsu: nsuStr
                }),
              });
            }
          }
        } else if (response.cStat === "656") {
          // Limite de consultas atingido - para imediatamente
          await storage.createLog({
            userId: empresa.userId,
            empresaId: empresa.id,
            sincronizacaoId: null,
            nivel: "warning",
            mensagem: `Busca avançada - Limite de consultas atingido (cStat 656)`,
            detalhes: JSON.stringify({
              nsu: nsuStr,
              consultasRealizadas,
              xMotivo: response.xMotivo,
              observacao: "Aguarde 1 hora para novas consultas"
            }),
          });
          break;
        }

        // Delay entre consultas (respeito à SEFAZ)
        if (nsu < nsuFinalNum && consultasRealizadas < maxConsultas) {
          await new Promise(resolve => setTimeout(resolve, 2000)); // 2 segundos
        }
      }

      await storage.createLog({
        userId: empresa.userId,
        empresaId: empresa.id,
        sincronizacaoId: null,
        nivel: "info",
        mensagem: `Busca avançada concluída`,
        detalhes: JSON.stringify({
          nsuInicial,
          nsuFinal,
          consultasRealizadas,
          xmlsEncontrados,
          nsuConsultados
        }),
      });

      return {
        xmlsEncontrados,
        consultasRealizadas,
        nsuConsultados
      };

    } catch (error) {
      await storage.createLog({
        userId: empresa.userId,
        empresaId: empresa.id,
        sincronizacaoId: null,
        nivel: "error",
        mensagem: `Erro na busca avançada: ${String(error)}`,
        detalhes: JSON.stringify({
          error: String(error),
          consultasRealizadas,
          xmlsEncontrados
        }),
      });

      throw error;
    }
  }
}

export const sefazService = new SefazService();
