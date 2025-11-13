import argparse
import base64
import gzip
import io
import json
import logging
import os
import time
import re
import sys
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from typing import Optional, Tuple, List,Callable
import requests_pkcs12

import requests
from requests_pkcs12 import Pkcs12Adapter
from lxml import etree
from dateutil import parser as dtparser
from dateutil.relativedelta import relativedelta

# ========= Configurações padrão =========


STATE_DIR = "state"
NS_NFE = "http://www.portalfiscal.inf.br/nfe"
NS_SOAP = "http://www.w3.org/2003/05/soap-envelope"
SOAP_ACTION = "http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe/nfeDistDFeInteresse"


UF_CODE_MAP = {
    # IBGE UF codes (cUFAutor). Ex.: SP=35, RJ=33, MG=31...
    # Fonte: Tabela de códigos IBGE das UFs.
    "AC": 12, "AL": 27, "AM": 13, "AP": 16, "BA": 29, "CE": 23,
    "DF": 53, "ES": 32, "GO": 52, "MA": 21, "MG": 31, "MS": 50,
    "MT": 51, "PA": 15, "PB": 25, "PE": 26, "PI": 22, "PR": 41,
    "RJ": 33, "RN": 24, "RO": 11, "RR": 14, "RS": 43, "SC": 42,
    "SE": 28, "SP": 35, "TO": 17,
}

ENDPOINTS = {
    # Produção/homologação do Ambiente Nacional (Portal Nacional NF-e)
    "prod": "https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx",
    "hom": "https://hom1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx",
}

SOAP_NS = {
    "soap12": "http://www.w3.org/2003/05/soap-envelope",
    "wsdl": "http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe",
    "nfe": "http://www.portalfiscal.inf.br/nfe",
}

# ========= Utilidades =========
def _state_filepath(cnpj: str, ambiente: str) -> str:
    fn = f"{cnpj}_{ambiente}.json"
    return os.path.join(STATE_DIR, fn)

def load_state(cnpj: str, ambiente: str) -> dict:
    path = _state_filepath(cnpj, ambiente)
    if os.path.isfile(path):
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {
        "ult_nsu": "000000000000000",
        "next_allowed_ts": 0
    }

def save_state(cnpj: str, ambiente: str, ult_nsu: str, next_allowed_ts: float) -> None:
    path = _state_filepath(cnpj, ambiente)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    state = {
        "ult_nsu": ult_nsu,
        "next_allowed_ts": next_allowed_ts
    }
    with open(path, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2)

def setup_logging(logfile: Optional[str], verbose: bool):
    logger = logging.getLogger()
    logger.setLevel(logging.DEBUG if verbose else logging.INFO)
    fmt = logging.Formatter("%(asctime)s | %(levelname)s | %(message)s", "%Y-%m-%d %H:%M:%S")

    ch = logging.StreamHandler(sys.stdout)
    ch.setLevel(logging.DEBUG if verbose else logging.INFO)
    ch.setFormatter(fmt)
    logger.handlers.clear()
    logger.addHandler(ch)

    if logfile:
        fh = logging.FileHandler(logfile, encoding="utf-8")
        fh.setLevel(logging.DEBUG)
        fh.setFormatter(fmt)
        logger.addHandler(fh)


def ensure_dir(path: str):
    os.makedirs(path, exist_ok=True)


def month_from_arg(mes_emissao: Optional[str], ultimo_mes: bool) -> Optional[Tuple[int, int]]:
    """
    Resolve o filtro de mês: retorna (ano, mes) ou None (sem filtro).
    """
    if mes_emissao:
        # Formato esperado: AAAA-MM
        try:
            year, month = mes_emissao.split("-")
            return int(year), int(month)
        except Exception:
            raise SystemExit("--mes-emissao deve estar no formato AAAA-MM (ex.: 2025-11)")

    if ultimo_mes:
        now_sp = datetime.now()  # sistema; se quiser, ajuste tz explicitamente
        ref = (now_sp.replace(day=1) - relativedelta(days=1))
        return ref.year, ref.month

    return None


def parse_emission_dt(nfe_root: etree._Element) -> Optional[datetime]:
    """
    Busca ide/dhEmi (ou dEmi) e retorna datetime (naive em UTC/local, tanto faz para ano/mês).
    """
    ns = {"nfe": SOAP_NS["nfe"]}
    # dhEmi (v4.00) – pode vir com timezone
    el = nfe_root.find(".//{http://www.portalfiscal.inf.br/nfe}ide/{http://www.portalfiscal.inf.br/nfe}dhEmi")
    if el is not None and el.text:
        try:
            return dtparser.parse(el.text)
        except Exception:
            pass

    # dEmi (formatos antigos)
    el = nfe_root.find(".//{http://www.portalfiscal.inf.br/nfe}ide/{http://www.portalfiscal.inf.br/nfe}dEmi")
    if el is not None and el.text:
        try:
            return dtparser.parse(el.text)
        except Exception:
            pass

    return None


def localname(tag: str) -> str:
    """
    Remove namespace do nome da tag.
    """
    if "}" in tag:
        return tag.split("}", 1)[1]
    return tag


def gzip_base64_to_xml(b64_text: str) -> bytes:
    raw = base64.b64decode(b64_text)
    try:
        return gzip.decompress(raw)
    except OSError:
        # Algumas implantações já retornam descompactado; devolve como está
        return raw


def extract_chave_e_nnf(nfeproc_root: etree._Element) -> Tuple[Optional[str], Optional[str]]:
    """
    Extrai chNFe (do protNFe/infProt/chNFe) e nNF (NFe/infNFe/ide/nNF).
    """
    ns = {"nfe": SOAP_NS["nfe"]}
    ch = nfeproc_root.find(".//{http://www.portalfiscal.inf.br/nfe}protNFe/{http://www.portalfiscal.inf.br/nfe}infProt/{http://www.portalfiscal.inf.br/nfe}chNFe")
    nnf = nfeproc_root.find(".//{http://www.portalfiscal.inf.br/nfe}NFe/{http://www.portalfiscal.inf.br/nfe}infNFe/{http://www.portalfiscal.inf.br/nfe}ide/{http://www.portalfiscal.inf.br/nfe}nNF")
    ch_text = ch.text.strip() if ch is not None and ch.text else None
    nnf_text = nnf.text.strip() if nnf is not None and nnf.text else None
    return ch_text, nnf_text


def save_nfeproc(xml_bytes: bytes, dest_root: str, cnpj: str, dh_emi: Optional[datetime]) -> Tuple[str, str]:
    """
    Salva o nfeProc em DEST/CNPJ/AAAA/MM/nNF.xml (ou CHAVE.xml em conflito).
    Retorna (dest_dir, filename).
    """
    root = etree.fromstring(xml_bytes)
    if localname(root.tag) != "nfeProc":
        raise ValueError("XML não é nfeProc")

    # Data de emissão para path
    dt_emi = parse_emission_dt(root) or dh_emi or datetime.now()
    year = f"{dt_emi.year:04d}"
    month = f"{dt_emi.month:02d}"

    dest_dir = os.path.join(dest_root, cnpj, year, month)
    ensure_dir(dest_dir)

    ch, nnf = extract_chave_e_nnf(root)
    if not nnf:
        # fallback para chave
        if not ch:
            raise ValueError("Não foi possível extrair nNF nem chNFe.")
        base = f"{ch}.xml"
    else:
        base = f"{int(nnf)}.xml" if nnf.isdigit() else f"{nnf}.xml"  # lida com zeros à esquerda

    filename = os.path.join(dest_dir, base)

    if os.path.exists(filename):
        if ch:
            filename = os.path.join(dest_dir, f"{ch}.xml")
        else:
            # último recurso: sufixo
            filename = os.path.join(dest_dir, f"{base}.dup")

    with open(filename, "wb") as f:
        f.write(xml_bytes)

    return dest_dir, os.path.basename(filename)


def matches_month_filter(xml_bytes: bytes, month_filter: Optional[Tuple[int, int]]) -> bool:
    if not month_filter:
        return True
    y, m = month_filter
    try:
        root = etree.fromstring(xml_bytes)
        # Tenta pegar data de emissão do próprio nfeProc
        dt = parse_emission_dt(root)
        if dt:
            return (dt.year == y and dt.month == m)
    except Exception:
        pass
    return False


# ========= SOAP: NFeDistribuicaoDFe =========

def build_envelope(cnpj: str, uf: str, ambiente: str, nsu: str = "000000000000000") -> bytes:
    cuf_autor = UF_CODE_MAP.get(uf.upper(), 35)
    tp_amb_str = "1" if ambiente.lower().startswith("prod") else "2"
    nsu15 = (nsu or "0").rjust(15, "0")

    envelope = f"""<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"
                 xmlns:nfe="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">
  <soap12:Body>
    <nfe:nfeDistDFeInteresse>
      <nfe:nfeDadosMsg>
        <distDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01">
          <tpAmb>{tp_amb_str}</tpAmb>
          <cUFAutor>{cuf_autor}</cUFAutor>
          <CNPJ>{cnpj}</CNPJ>
          <consNSU><NSU>{nsu15}</NSU></consNSU>
        </distDFeInt>
      </nfe:nfeDadosMsg>
    </nfe:nfeDistDFeInteresse>
  </soap12:Body>
</soap12:Envelope>"""
    return envelope.encode("utf-8")


def call_distdfe(
    session: requests.Session,
    url: str,
    envelope_xml: bytes,
    timeout: int = 60,
    verbose: bool = False
) -> ET.Element:
    """
    Chama o serviço nfeDistDFeInteresse e retorna a raiz SOAP como Element.
    Loga SOAP Fault (500) e responde com raise contendo mais contexto.
    """
    headers = {
        "Content-Type": "application/soap+xml; charset=utf-8",
        "Connection": "keep-alive",
    }

    if verbose:
        logging.debug(">>> SOAP REQUEST to %s\n%s", url, envelope_xml.decode("utf-8"))

    resp = session.post(url, data=envelope_xml, headers=headers, timeout=timeout)

    if verbose:
        logging.debug("<<< HTTP %s", resp.status_code)
        logging.debug("<<< HEADERS: %s", dict(resp.headers))
        if resp.content:
            logging.debug("<<< BODY:\n%s", resp.text[:10000])  # limita a 10k p/ não poluir

    # Em caso de 500, muitas vezes há SOAP Fault com detalhes úteis.
    if resp.status_code >= 400:
        body_preview = resp.text.strip()[:4000]
        raise requests.HTTPError(
            f"{resp.status_code} ao chamar Distribuição DF-e. "
            f"URL={url} | Preview corpo:\n{body_preview}",
            response=resp
        )

    # Parse do SOAP
    try:
        root = ET.fromstring(resp.content)
    except ET.ParseError as e:
        raise RuntimeError(f"Falha ao parsear SOAP: {e}\nCorpo:\n{resp.text[:4000]}")

    # SOAP Fault explícito
    fault = root.find(".//{http://www.w3.org/2003/05/soap-envelope}Fault")
    if fault is not None:
        fault_str = ET.tostring(fault, encoding="unicode")
        raise RuntimeError(f"SOAP Fault recebido:\n{fault_str}")

    return root

def iter_doczip_from_response(soap_root: etree._Element) -> Tuple[str, str, List[etree._Element]]:
    """
    Retorna (cStat, xMotivo, lista de elementos <docZip>).
    Também retorna ultNSU/maxNSU via tags.
    """
    # Encontra retDistDFeInt
    ret = soap_root.find(".//{http://www.portalfiscal.inf.br/nfe}retDistDFeInt")
    if ret is None:
        # alguns ambientes aninham resultado em nfeDistDFeInteresseResponse/nfeDistDFeInteresseResult
        ret = soap_root.find(".//retDistDFeInt")
        if ret is None:
            raise ValueError("retDistDFeInt não encontrado na resposta.")

    cStat = ret.findtext("{http://www.portalfiscal.inf.br/nfe}cStat") or ret.findtext("cStat") or ""
    xMotivo = ret.findtext("{http://www.portalfiscal.inf.br/nfe}xMotivo") or ret.findtext("xMotivo") or ""

    lote = ret.find("{http://www.portalfiscal.inf.br/nfe}loteDistDFeInt")
    doczips = []
    if lote is not None:
        doczips = lote.findall("{http://www.portalfiscal.inf.br/nfe}docZip")

    ultNSU = ret.findtext("{http://www.portalfiscal.inf.br/nfe}ultNSU") or ""
    maxNSU = ret.findtext("{http://www.portalfiscal.inf.br/nfe}maxNSU") or ""

    return cStat, xMotivo, doczips, ultNSU, maxNSU

import xml.etree.ElementTree as ET
import base64
import gzip
from io import BytesIO
import logging
from typing import List, Tuple, Optional, Union

def _strip_ns(tag: str) -> str:
    """Remove namespace de uma tag XML (ex: '{…}cStat' → 'cStat')."""
    if '}' in tag:
        return tag.split('}', 1)[1]
    return tag

def _find_text(root: ET.Element, path: str, nsmap: dict, required: bool = True) -> Optional[str]:
    """Busca elemento por xpath e retorna .text ou None."""
    elem = root.find(path, nsmap)
    if elem is None:
        if required:
            logging.error(f"Elemento obrigatório '{path}' não encontrado no XML.")
            raise ValueError(f"Elemento obrigatório '{path}' não encontrado.")
        return None
    return elem.text.strip() if elem.text is not None else ''

def parse_response_metadata(xml_bytes: bytes) -> Tuple[int, str, Optional[str]]:
    """
    Extrai cStat (int), ultNSU (str) e maxNSU (str | None) da resposta.
    Retorna: (cStat, ultNSU, maxNSU)
    """
    root = ET.fromstring(xml_bytes)
    ns = {'nfe': 'http://www.portalfiscal.inf.br/nfe'}  # pode haver mais
    # localizar cStat
    text_stat = _find_text(root, './/nfe:cStat', ns)
    cstat = int(text_stat)
    ult_nsu = _find_text(root, './/nfe:ultNSU', ns, required=False) or ''
    max_nsu = _find_text(root, './/nfe:maxNSU', ns, required=False)
    logging.debug(f"parse_response_metadata → cStat={cstat}, ultNSU={ult_nsu}, maxNSU={max_nsu}")
    return cstat, ult_nsu, max_nsu

def parse_doczips(xml_bytes: bytes) -> List[Tuple[str, str, bytes]]:
    """
    Extrai todos os docZip da resposta.
    Cada tuple: (NSU, schema, raw_xml_bytes)
    raw_xml_bytes: descompactado se necessário (gzip + base64).
    """
    root = ET.fromstring(xml_bytes)
    ns = {'nfe': 'http://www.portalfiscal.inf.br/nfe'}
    docs = []
    for dz in root.findall('.//nfe:docZip', ns):
        nsu = dz.get('NSU')
        schema = dz.get('schema')
        raw_b64 = dz.text.strip() if dz.text else ''
        logging.debug(f"docZip encontrado → NSU={nsu}, schema={schema}, tamanho(base64)={len(raw_b64)}")
        try:
            compressed = base64.b64decode(raw_b64)
        except Exception as e:
            logging.error(f"Falha no base64 do NSU={nsu} schema={schema}: {e}")
            continue
        try:
            buf = BytesIO(compressed)
            with gzip.GzipFile(fileobj=buf) as gz:
                xml_raw = gz.read()
            logging.debug(f"Descompactado gzip NSU={nsu} (schema={schema}), tamanho={len(xml_raw)} bytes")
        except OSError:
            # Se não for gzip
            xml_raw = compressed
            logging.debug(f"Não era gzip (NSU={nsu}), usando raw direto, tamanho={len(xml_raw)} bytes")
        docs.append((nsu, schema, xml_raw))
    return docs

def extract_chave_from_xml(raw_xml_bytes: bytes) -> str:
    """
    Extrai a chave de acesso da NF-e dentro do XML bruto.
    Procura infNFe/@Id ou tag chNFe.
    """
    try:
        root = ET.fromstring(raw_xml_bytes)
    except Exception as e:
        logging.error(f"Falha ao parsear XML bruto para extração de chave: {e}")
        raise

    # Remover namespace para facilitar
    for elem in root.iter():
        elem.tag = _strip_ns(elem.tag)

    # Tentar infNFe @Id
    infnfe = root.find('.//infNFe')
    if infnfe is not None and 'Id' in infnfe.attrib:
        id_val = infnfe.attrib['Id']
        if id_val.startswith('NFe'):
            chave = id_val[3:]
        else:
            chave = id_val
        logging.debug(f"Chave extraída via infNFe/@Id: {chave}")
        return chave

    # Tentar tag chNFe
    ch_elem = root.find('.//chNFe')
    if ch_elem is not None and ch_elem.text:
        chave = ch_elem.text.strip()
        logging.debug(f"Chave extraída via chNFe: {chave}")
        return chave

    logging.error("Chave de acesso não encontrada no XML bruto")
    raise ValueError("Chave de acesso não encontrada no XML")



def salvar_nfeproc_renomeando(xml_txt: str, _raw: bytes, dest_base: str, cnpj_alvo: str):
    """
    Salva sob <dest_base>/<cnpj_alvo>/<AAAA>/<MM>/
    Nome principal: nNF.xml; se já existir, salva como CHAVE.xml.
    """
    import os, re, xml.etree.ElementTree as ET
    ns = {"nfe": "http://www.portalfiscal.inf.br/nfe"}

    root = ET.fromstring(xml_txt)
    # Pega chave (chNFe) do prot, se existir
    ch = root.find(".//nfe:protNFe/nfe:infProt/nfe:chNFe", ns)
    chave = (ch.text or "").strip() if ch is not None else ""

    # nNF
    nnf = root.find(".//nfe:NFe/nfe:infNFe/nfe:ide/nfe:nNF", ns)
    nNF = (nnf.text or "").strip() if nnf is not None else ""

    # dhEmi → ano/mês
    dh = root.find(".//nfe:NFe/nfe:infNFe/nfe:ide/nfe:dhEmi", ns)
    em = (dh.text or "").strip() if dh is not None else ""
    ano = em[0:4]
    mes = em[5:7]

    pasta = os.path.join(dest_base, cnpj_alvo, ano, mes)
    os.makedirs(pasta, exist_ok=True)

    # nome principal: nNF.xml (somente dígitos)
    base_name = re.sub(r"[^\d]", "", nNF) or (chave if chave else "sem_nnf")
    primario = os.path.join(pasta, f"{base_name}.xml")

    if os.path.exists(primario):
        # fallback como CHAVE.xml (44 dígitos)
        if not chave:
            chave = "sem_chave"
        alvo = os.path.join(pasta, f"{chave}.xml")
    else:
        alvo = primario

    with open(alvo, "w", encoding="utf-8") as f:
        f.write(xml_txt)

def get_endpoint(ambiente: str) -> str:
    key = "prod" if ambiente.lower().startswith("prod") else "hom"
    return ENDPOINTS[key]

def baixar_online(cnpj: str, uf: str, ambiente: str,
                  cert_pfx: str, cert_pass: str,
                  filtro_ano_mes: str | None,
                  salvar_xml_fn: Callable[[str, bytes], None],
                  verbose: bool = False) -> Tuple[int, int]:

    state = load_state(cnpj, ambiente)
    now_ts = time.time()
    if now_ts < state["next_allowed_ts"]:
        wait = int(state["next_allowed_ts"] - now_ts)
        logging.info(f"Aguardar {wait} segundos antes de nova consulta para {cnpj}/{ambiente}")
        return 0, 0

    sess = requests.Session()
    sess.mount('https://', requests_pkcs12.Pkcs12Adapter(
        pkcs12_filename=cert_pfx,
        pkcs12_password=cert_pass
    ))

    url = get_endpoint(ambiente)
    total_processed = 0
    total_saved = 0
    ult_nsu = state["ult_nsu"]

    while True:
        if verbose:
            logging.info(f"[NSU={ult_nsu}] POST {url}")
        envelope = build_envelope(cnpj=cnpj, uf=uf, ambiente=ambiente, nsu=ult_nsu)
        headers = {
            "Content-Type": "application/soap+xml; charset=utf-8",
            "Connection": "keep-alive",
        }
        resp = sess.post(url, data=envelope, headers=headers, timeout=60)
        resp.raise_for_status()
        body = resp.content

        # *** IMPORTANTE: adapte estas funções de parsing no seu projeto ***
        cStat, new_ult_nsu, max_nsu = parse_response_metadata(body)
        docs = [d[2] for d in parse_doczips(body)]

        if verbose:
            logging.info(f"cStat={cStat} novoUltNSU={new_ult_nsu} maxNSU={max_nsu} docs={len(docs)}")

        if cStat == 138:
            for raw in docs:
                xml_txt = extract_chave(raw)
                salvar_xml_fn(xml_txt, raw)
                total_saved += 1
            total_processed += len(docs)
            ult_nsu = new_ult_nsu
            if ult_nsu == max_nsu:
                break
        elif cStat == 137:
            break
        else:
            logging.warning(f"Código inesperado cStat={cStat} para CNPJ={cnpj}, NSU={ult_nsu}")
            break

        time.sleep(1.2)

    # Salvando estado para retomar depois
    next_allowed = time.time() + 3600
    save_state(cnpj, ambiente, ult_nsu, next_allowed)

    return total_processed, total_saved

def process_doczips_locais(scan_dir: str,
                           dest_root: str,
                           cnpj: str,
                           month_filter: Optional[Tuple[int, int]],
                           apenas_nfeproc: bool) -> Tuple[int, int]:
    """
    Lê todos os arquivos em scan_dir (docZip base64+gzip ou XML puro),
    aplica filtros e salva nfeProc conforme regras.
    """
    processados = 0
    salvos = 0

    for root_dir, _, files in os.walk(scan_dir):
        for name in files:
            path = os.path.join(root_dir, name)
            try:
                with open(path, "rb") as f:
                    data = f.read()
                # detecta se é docZip base64 ou xml já
                xml_bytes = None
                try:
                    # tenta como base64+gzip
                    xml_bytes = gzip_base64_to_xml(data.decode("utf-8"))
                except Exception:
                    # pode ser xml puro
                    xml_bytes = data

                processados += 1
                root = etree.fromstring(xml_bytes)
                tag = localname(root.tag)

                if tag == "procEventoNFe":
                    logging.debug(f"[local] Descartando procEventoNFe: {name}")
                    continue

                if apenas_nfeproc and tag != "nfeProc":
                    logging.debug(f"[local] Descartando {tag} (apenas nfeProc): {name}")
                    continue

                if not matches_month_filter(xml_bytes, month_filter):
                    logging.debug(f"[local] Fora do mês filtrado: {name}")
                    continue

                dest_dir, fname = save_nfeproc(xml_bytes, dest_root=dest_root, cnpj=cnpj, dh_emi=None)
                salvos += 1
                logging.info(f"[local] Salvo: {os.path.join(dest_dir, fname)}")

            except Exception as e:
                logging.exception(f"Falha ao processar {path}: {e}")

    return processados, salvos


# ========= CLI =========

def build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="Baixar/Processar NF-e (nfeProc) via NFeDistribuicaoDFe e/ou docZip local.",
        formatter_class=argparse.RawTextHelpFormatter,
    )
    p.add_argument("--cnpj", required=True, help="CNPJ do interessado (apenas dígitos).")
    p.add_argument("--dest", required=True, help="Diretório de destino (será organizado como DEST/CNPJ/AAAA/MM).")

    # Mês de emissão
    p.add_argument("--mes-emissao", help="Filtro do mês de emissão no formato AAAA-MM (ex.: 2025-11).")
    p.add_argument("--ultimo-mes", action="store_true", help="Filtrar pelo último mês (com base na data atual).")

    # Modo on-line
    p.add_argument("--baixar-online", action="store_true", help="Ativa o download on-line via NFeDistribuicaoDFe.")
    p.add_argument("--uf", help="UF do autor (ex.: SP, RJ, MG) – obrigatório com --baixar-online.")
    p.add_argument("--amb", choices=["prod", "hom"], default="prod", help="Ambiente (prod|hom). Padrão: prod.")
    p.add_argument("--cert-pfx", help="Caminho do certificado A1 (.pfx) – obrigatório com --baixar-online.")
    p.add_argument("--cert-pass", help="Senha do .pfx – obrigatório com --baixar-online.")
    p.add_argument("--max-chamadas", type=int, default=20, help="Limite de iterações da distribuição (default: 20).")

    # Modo local (docZip)
    p.add_argument("--scan-dir", help="Pasta contendo docZip (base64+gzip) ou XMLs para processamento local.")

    # Regras
    p.add_argument("--apenas-nfeproc", action="store_true", help="Salvar somente nfeProc (descarta demais).")
    p.add_argument("--verbose", action="store_true", help="Logs detalhados.")
    p.add_argument("--log", help="Arquivo de log.")

    return p


def main():
    args = build_arg_parser().parse_args()
    setup_logging(args.log, args.verbose)

    if args.baixar_online:
        for req in ("uf", "cert_pfx", "cert_pass"):
            if getattr(args, req.replace("-", "_"), None) is None:
                logging.error(f"--{req.replace('_','-')} é obrigatório com --baixar-online.")
                sys.exit(2)
        if args.uf.upper() not in UF_CODE_MAP:
            logging.error(f"UF inválida: {args.uf}")
            sys.exit(2)

    month_tuple = month_from_arg(args.mes_emissao, args.ultimo_mes)
    filtro_ano_mes = f"{month_tuple[0]:04d}-{month_tuple[1]:02d}" if month_tuple else None

    if month_tuple:
        logging.info(f"Filtro de emissão: {month_tuple[0]:04d}-{month_tuple[1]:02d}")
    else:
        logging.info("Sem filtro de mês (trará todas as emissões).")

    ensure_dir(args.dest)
    cnpj_digits = re.sub(r"\D", "", args.cnpj)

    total_proc = 0
    total_save = 0

    def _salvar(xml_txt: str, raw: bytes):
        salvar_nfeproc_renomeando(xml_txt, raw, args.dest, cnpj_digits)

    if args.baixar_online:
        p, s = baixar_online(
            cnpj=cnpj_digits,
            uf=args.uf.upper(),
            ambiente=args.amb,
            cert_pfx=args.cert_pfx,
            cert_pass=args.cert_pass,
            filtro_ano_mes=filtro_ano_mes,
            salvar_xml_fn=_salvar,
            verbose=args.verbose,
        )
        total_proc += p
        total_save += s

    if args.scan_dir:
        p, s = process_doczips_locais(
            scan_dir=args.scan_dir,
            dest_root=args.dest,
            cnpj=cnpj_digits,
            month_filter=month_tuple,
            apenas_nfeproc=True,
        )
        total_proc += p
        total_save += s

    dest_preview = os.path.join(
        args.dest,
        cnpj_digits,
        f"{month_tuple[0]:04d}" if month_tuple else "",
        f"{month_tuple[1]:02d}" if month_tuple else ""
    ).rstrip("\\/")

    logging.info(f"Resumo: processados={total_proc}, salvos={total_save}, destino={dest_preview}")

if __name__ == "__main__":
    main()

