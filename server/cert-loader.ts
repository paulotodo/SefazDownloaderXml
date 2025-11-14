import forge from 'node-forge';
import fs from 'fs';
import path from 'path';

export interface CertificateData {
  key: string;      // Private key em formato PEM
  cert: string;     // Certificado em formato PEM
  ca: string[];     // Certificados CA (chain) em formato PEM
}

interface CertificateCache {
  [filePath: string]: CertificateData;
}

const certCache: CertificateCache = {};

/**
 * Carrega e converte certificado PKCS12 (.pfx) para formato PEM
 * 
 * Esta função resolve o problema "Unsupported PKCS12 PFX data" que ocorre
 * quando certificados A1 brasileiros (que usam algoritmos legados DES/3DES)
 * são carregados diretamente no https.Agent do Node.js com OpenSSL 3.x.
 * 
 * Solução: Usa node-forge para fazer parsing do PKCS12 e converter para PEM,
 * que é suportado nativamente pelo OpenSSL 3.x.
 * 
 * @param pfxPath - Caminho completo para o arquivo .pfx
 * @param password - Senha do certificado
 * @returns Dados do certificado em formato PEM (key, cert, ca)
 * @throws Error se o certificado for inválido ou senha incorreta
 */
export async function loadPKCS12Certificate(
  pfxPath: string,
  password: string
): Promise<CertificateData> {
  // Verificar cache
  const cacheKey = `${pfxPath}:${password}`;
  if (certCache[cacheKey]) {
    return certCache[cacheKey];
  }

  try {
    // Ler arquivo .pfx
    if (!fs.existsSync(pfxPath)) {
      throw new Error(`Arquivo de certificado não encontrado: ${pfxPath}`);
    }

    const pfxBuffer = fs.readFileSync(pfxPath);

    // Validar tamanho mínimo
    if (pfxBuffer.length < 100) {
      throw new Error(
        `Certificado inválido ou corrompido (tamanho muito pequeno: ${pfxBuffer.length} bytes)`
      );
    }

    // Converter buffer para formato base64 que o forge espera
    const pfxBase64 = pfxBuffer.toString('base64');
    const pfxAsn1 = forge.util.decode64(pfxBase64);

    let p12Asn1: forge.asn1.Asn1;
    try {
      p12Asn1 = forge.asn1.fromDer(pfxAsn1);
    } catch (error: any) {
      throw new Error(
        `Formato de certificado inválido. Verifique se o arquivo .pfx não está corrompido. ` +
        `Erro: ${error.message}`
      );
    }

    // Fazer parsing do PKCS12 com a senha
    let p12: forge.pkcs12.Pkcs12Pfx;
    try {
      p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);
    } catch (error: any) {
      // Erro comum: senha incorreta
      if (error.message?.includes('Invalid password') || 
          error.message?.includes('MAC verify')) {
        throw new Error(
          `Senha do certificado incorreta. Verifique a senha do arquivo .pfx`
        );
      }
      throw new Error(
        `Erro ao decodificar certificado PKCS12. ` +
        `Verifique: (1) Senha correta, (2) Arquivo não corrompido. ` +
        `Erro: ${error.message}`
      );
    }

    // Extrair chave privada e certificados
    const bags = p12.getBags({ bagType: forge.pki.oids.certBag });
    const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });

    // Verificar se encontrou chave privada
    if (!keyBags[forge.pki.oids.pkcs8ShroudedKeyBag] || 
        keyBags[forge.pki.oids.pkcs8ShroudedKeyBag].length === 0) {
      throw new Error(
        `Chave privada não encontrada no certificado. ` +
        `Verifique se o arquivo .pfx contém a chave privada.`
      );
    }

    // Verificar se encontrou certificados
    if (!bags[forge.pki.oids.certBag] || bags[forge.pki.oids.certBag].length === 0) {
      throw new Error(
        `Certificado não encontrado no arquivo .pfx. ` +
        `Verifique se o arquivo está completo.`
      );
    }

    // Extrair chave privada
    const keyBag = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag][0];
    if (!keyBag.key) {
      throw new Error('Erro ao extrair chave privada do certificado');
    }
    const privateKey = keyBag.key;
    const privateKeyPem = forge.pki.privateKeyToPem(privateKey);

    // Extrair certificado principal e cadeia (CA certificates)
    const certBags = bags[forge.pki.oids.certBag];
    const certPems: string[] = [];
    const caPems: string[] = [];

    for (const bag of certBags) {
      if (!bag.cert) continue;
      
      const certPem = forge.pki.certificateToPem(bag.cert);
      
      // O primeiro certificado normalmente é o certificado principal
      // Os demais são certificados intermediários/raiz (CA)
      if (certPems.length === 0) {
        certPems.push(certPem);
      } else {
        caPems.push(certPem);
      }
    }

    if (certPems.length === 0) {
      throw new Error('Nenhum certificado válido encontrado no arquivo .pfx');
    }

    const certData: CertificateData = {
      key: privateKeyPem,
      cert: certPems[0],
      ca: caPems,
    };

    // Armazenar em cache
    certCache[cacheKey] = certData;

    return certData;
  } catch (error: any) {
    // Se já é um erro customizado, apenas propagar
    if (error.message.includes('Senha do certificado incorreta') ||
        error.message.includes('Arquivo de certificado não encontrado') ||
        error.message.includes('Certificado inválido ou corrompido')) {
      throw error;
    }

    // Erro genérico
    throw new Error(
      `Erro ao carregar certificado: ${error.message}. ` +
      `Verifique: (1) Arquivo .pfx válido, (2) Senha correta, (3) Certificado não expirado.`
    );
  }
}

/**
 * Limpa o cache de certificados
 * Útil para forçar reload após atualização de certificados
 */
export function clearCertificateCache(): void {
  Object.keys(certCache).forEach(key => delete certCache[key]);
}

/**
 * Verifica se um certificado está em cache
 */
export function isCertificateCached(pfxPath: string, password: string): boolean {
  const cacheKey = `${pfxPath}:${password}`;
  return cacheKey in certCache;
}
