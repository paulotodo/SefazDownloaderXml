import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { FileText, Download, Search, FolderOpen, ChevronRight, ChevronDown, CheckCircle2, XCircle, Clock, Ban } from "lucide-react";
import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface Xml {
  id: string;
  empresaId: string;
  empresaCnpj: string;
  empresaNome: string;
  chaveNFe: string;
  numeroNF: string;
  modelo: string;
  tipoDocumento: string;
  dataEmissao: string;
  caminhoArquivo: string;
  tamanhoBytes: number;
  createdAt: string;
  statusDownload?: string;
  tentativasDownload?: number;
  erroDownload?: string;
  statusNfe?: string;
  manifestacao?: {
    id: string;
    tipoEvento: string;
    status: string;
    dataManifestacao: string | null;
  } | null;
}

interface Manifestacao {
  id: string;
  empresaId: string;
  chaveNFe: string;
  tipoEvento: string;
  status: string;
  dataManifestacao: string | null;
}

interface XmlGroup {
  cnpj: string;
  empresaNome: string;
  anos: {
    ano: string;
    meses: {
      mes: string;
      xmls: Xml[];
    }[];
  }[];
}

function getManifestacaoBadge(xml: Xml) {
  // Apenas resNFe pode ter manifestação
  if (xml.tipoDocumento !== "resNFe") {
    return null;
  }

  const manifestacao = xml.manifestacao;

  if (!manifestacao) {
    return (
      <Badge variant="outline" className="gap-1 text-xs">
        <Clock className="w-3 h-3" />
        Não Manifestado
      </Badge>
    );
  }

  if (manifestacao.status === "confirmado") {
    return (
      <Badge variant="default" className="gap-1 text-xs">
        <CheckCircle2 className="w-3 h-3" />
        Manifestado
      </Badge>
    );
  }

  if (manifestacao.status === "erro") {
    return (
      <Badge variant="destructive" className="gap-1 text-xs">
        <XCircle className="w-3 h-3" />
        Erro Manifestação
      </Badge>
    );
  }

  if (manifestacao.status === "pendente") {
    return (
      <Badge variant="secondary" className="gap-1 text-xs">
        <Clock className="w-3 h-3" />
        Manifestação Pendente
      </Badge>
    );
  }

  return (
    <Badge variant="secondary" className="gap-1 text-xs">
      {manifestacao.status}
    </Badge>
  );
}

function getStatusNfeBadge(xml: Xml) {
  if (xml.statusNfe === "cancelada") {
    return (
      <Badge variant="destructive" className="gap-1 text-xs">
        <Ban className="w-3 h-3" />
        Cancelada
      </Badge>
    );
  }
  
  if (xml.statusNfe === "denegada") {
    return (
      <Badge variant="destructive" className="gap-1 text-xs">
        <XCircle className="w-3 h-3" />
        Denegada
      </Badge>
    );
  }
  
  return null;
}

function getTipoDocumentoBadge(xml: Xml) {
  // Não exibe tipo de documento para XMLs cancelados (badge cancelada já informa)
  if (xml.statusNfe === "cancelada" || xml.statusNfe === "denegada") {
    return null;
  }

  if (xml.tipoDocumento === "resNFe") {
    return (
      <Badge variant="secondary" className="gap-1 text-xs">
        <FileText className="w-3 h-3" />
        Resumo
      </Badge>
    );
  }
  
  if (xml.tipoDocumento === "nfeProc") {
    return (
      <Badge variant="default" className="gap-1 text-xs">
        <CheckCircle2 className="w-3 h-3" />
        XML Completo
      </Badge>
    );
  }
  
  return null;
}

function getDownloadBadge(xml: Xml) {
  // Não exibe badge de download para XMLs cancelados ou denegados
  if (xml.statusNfe === "cancelada" || xml.statusNfe === "denegada") {
    return null;
  }

  // Apenas resNFe pode ter download pendente (nfeProc já está completo)
  if (xml.tipoDocumento !== "resNFe") {
    return null;
  }

  if (xml.statusDownload === "pendente") {
    return (
      <Badge variant="outline" className="gap-1 text-xs">
        <Clock className="w-3 h-3" />
        Aguardando Download
      </Badge>
    );
  }
  
  if (xml.statusDownload === "processando") {
    return (
      <Badge variant="secondary" className="gap-1 text-xs">
        <Download className="w-3 h-3" />
        Baixando...
      </Badge>
    );
  }
  
  if (xml.statusDownload === "erro") {
    return (
      <Badge variant="destructive" className="gap-1 text-xs" title={xml.erroDownload}>
        <XCircle className="w-3 h-3" />
        Erro Download ({xml.tentativasDownload || 0}/5)
      </Badge>
    );
  }

  if (xml.statusDownload === "completo") {
    return (
      <Badge variant="default" className="gap-1 text-xs">
        <CheckCircle2 className="w-3 h-3" />
        Download OK
      </Badge>
    );
  }
  
  return null;
}

export default function Xmls() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [openCNPJs, setOpenCNPJs] = useState<Set<string>>(new Set());
  const [openYears, setOpenYears] = useState<Set<string>>(new Set());
  const [openMonths, setOpenMonths] = useState<Set<string>>(new Set());

  const { data: xmls, isLoading } = useQuery<Xml[]>({
    queryKey: ["/api/xmls"],
  });

  // Filtra XMLs para mostrar todos (nfeProc e resNFe)
  const filteredXmls = xmls?.filter((xml) =>
    xml.numeroNF.includes(searchTerm) ||
    xml.chaveNFe.includes(searchTerm) ||
    xml.empresaNome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    xml.empresaCnpj.includes(searchTerm)
  );

  // Conta XMLs por tipo e status
  const stats = {
    total: xmls?.length || 0,
    completos: xmls?.filter(x => x.tipoDocumento === "nfeProc").length || 0,
    resumos: xmls?.filter(x => x.tipoDocumento === "resNFe").length || 0,
    // CRÍTICO: Apenas resNFe podem estar pendentes de download (nfeProc já está completo)
    pendentesDownload: xmls?.filter(x => x.tipoDocumento === "resNFe" && x.statusDownload === "pendente").length || 0,
    errosDownload: xmls?.filter(x => x.tipoDocumento === "resNFe" && x.statusDownload === "erro" && (x.tentativasDownload || 0) >= 5).length || 0,
  };

  // Agrupar XMLs por CNPJ > Ano > Mês
  const groupedXmls: XmlGroup[] = [];
  if (filteredXmls) {
    const cnpjMap = new Map<string, XmlGroup>();

    filteredXmls.forEach((xml) => {
      const date = new Date(xml.dataEmissao);
      const ano = date.getFullYear().toString();
      const mes = (date.getMonth() + 1).toString().padStart(2, '0');

      if (!cnpjMap.has(xml.empresaCnpj)) {
        cnpjMap.set(xml.empresaCnpj, {
          cnpj: xml.empresaCnpj,
          empresaNome: xml.empresaNome,
          anos: [],
        });
      }

      const group = cnpjMap.get(xml.empresaCnpj)!;
      let yearGroup = group.anos.find((a) => a.ano === ano);

      if (!yearGroup) {
        yearGroup = { ano, meses: [] };
        group.anos.push(yearGroup);
      }

      let monthGroup = yearGroup.meses.find((m) => m.mes === mes);

      if (!monthGroup) {
        monthGroup = { mes, xmls: [] };
        yearGroup.meses.push(monthGroup);
      }

      monthGroup.xmls.push(xml);
    });

    groupedXmls.push(...Array.from(cnpjMap.values()));
  }

  const toggleCNPJ = (cnpj: string) => {
    setOpenCNPJs((prev) => {
      const next = new Set(prev);
      if (next.has(cnpj)) {
        next.delete(cnpj);
      } else {
        next.add(cnpj);
      }
      return next;
    });
  };

  const toggleYear = (key: string) => {
    setOpenYears((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const toggleMonth = (key: string) => {
    setOpenMonths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const formatCNPJ = (cnpj: string) => {
    return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const monthNames = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="heading-xmls">XMLs Baixados</h1>
          <p className="text-sm text-muted-foreground">Navegue pelos XMLs organizados por empresa, ano e mês</p>
        </div>
      </div>

      {/* Estatísticas de Download */}
      {!isLoading && (stats.resumos > 0 || stats.pendentesDownload > 0 || stats.errosDownload > 0) && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground">XMLs Completos</p>
                  <p className="text-2xl font-semibold">{stats.completos}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-600" />
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground">Resumos (resNFe)</p>
                  <p className="text-2xl font-semibold">{stats.resumos}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-yellow-600" />
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground">Pendentes Download</p>
                  <p className="text-2xl font-semibold">{stats.pendentesDownload}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <XCircle className="w-4 h-4 text-red-600" />
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground">Erros Download</p>
                  <p className="text-2xl font-semibold">{stats.errosDownload}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por NF-e, chave, empresa ou CNPJ..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
                data-testid="input-search-xmls"
              />
            </div>
            <div className="text-sm text-muted-foreground">
              {filteredXmls?.length ?? 0} XML(s)
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="border rounded-md p-4">
                  <Skeleton className="h-6 w-64 mb-3" />
                  <div className="ml-6 space-y-2">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-4 w-48" />
                  </div>
                </div>
              ))}
            </div>
          ) : groupedXmls.length > 0 ? (
            <div className="space-y-2">
              {groupedXmls.map((cnpjGroup) => (
                <Collapsible
                  key={cnpjGroup.cnpj}
                  open={openCNPJs.has(cnpjGroup.cnpj)}
                  onOpenChange={() => toggleCNPJ(cnpjGroup.cnpj)}
                >
                  <Card className="overflow-hidden">
                    <CollapsibleTrigger className="w-full" data-testid={`folder-cnpj-${cnpjGroup.cnpj}`}>
                      <div className="flex items-center gap-3 p-4 hover-elevate">
                        <div className="w-8 h-8 bg-primary/10 rounded-md flex items-center justify-center flex-shrink-0">
                          <FolderOpen className="w-4 h-4 text-primary" />
                        </div>
                        <div className="flex-1 text-left">
                          <p className="text-sm font-medium">{cnpjGroup.empresaNome}</p>
                          <p className="text-xs text-muted-foreground font-mono">
                            CNPJ {formatCNPJ(cnpjGroup.cnpj)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            {cnpjGroup.anos.reduce((sum, ano) => 
                              sum + ano.meses.reduce((s, mes) => s + mes.xmls.length, 0), 0
                            )} XML(s)
                          </span>
                          {openCNPJs.has(cnpjGroup.cnpj) ? (
                            <ChevronDown className="w-4 h-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-muted-foreground" />
                          )}
                        </div>
                      </div>
                    </CollapsibleTrigger>

                    <CollapsibleContent>
                      <div className="px-4 pb-4 pl-12 space-y-2">
                        {cnpjGroup.anos.map((yearGroup) => (
                          <Collapsible
                            key={`${cnpjGroup.cnpj}-${yearGroup.ano}`}
                            open={openYears.has(`${cnpjGroup.cnpj}-${yearGroup.ano}`)}
                            onOpenChange={() => toggleYear(`${cnpjGroup.cnpj}-${yearGroup.ano}`)}
                          >
                            <CollapsibleTrigger className="w-full" data-testid={`folder-year-${yearGroup.ano}`}>
                              <div className="flex items-center gap-2 p-2 hover-elevate rounded-md">
                                <FolderOpen className="w-4 h-4 text-muted-foreground" />
                                <span className="text-sm font-medium">{yearGroup.ano}</span>
                                <span className="text-xs text-muted-foreground ml-auto">
                                  {yearGroup.meses.reduce((sum, mes) => sum + mes.xmls.length, 0)} XML(s)
                                </span>
                                {openYears.has(`${cnpjGroup.cnpj}-${yearGroup.ano}`) ? (
                                  <ChevronDown className="w-3 h-3 text-muted-foreground" />
                                ) : (
                                  <ChevronRight className="w-3 h-3 text-muted-foreground" />
                                )}
                              </div>
                            </CollapsibleTrigger>

                            <CollapsibleContent>
                              <div className="ml-6 mt-2 space-y-2">
                                {yearGroup.meses.map((monthGroup) => (
                                  <Collapsible
                                    key={`${cnpjGroup.cnpj}-${yearGroup.ano}-${monthGroup.mes}`}
                                    open={openMonths.has(`${cnpjGroup.cnpj}-${yearGroup.ano}-${monthGroup.mes}`)}
                                    onOpenChange={() => toggleMonth(`${cnpjGroup.cnpj}-${yearGroup.ano}-${monthGroup.mes}`)}
                                  >
                                    <CollapsibleTrigger className="w-full" data-testid={`folder-month-${monthGroup.mes}`}>
                                      <div className="flex items-center gap-2 p-2 hover-elevate rounded-md">
                                        <FolderOpen className="w-4 h-4 text-muted-foreground" />
                                        <span className="text-sm">{monthNames[parseInt(monthGroup.mes) - 1]}</span>
                                        <span className="text-xs text-muted-foreground ml-auto">
                                          {monthGroup.xmls.length} XML(s)
                                        </span>
                                        {openMonths.has(`${cnpjGroup.cnpj}-${yearGroup.ano}-${monthGroup.mes}`) ? (
                                          <ChevronDown className="w-3 h-3 text-muted-foreground" />
                                        ) : (
                                          <ChevronRight className="w-3 h-3 text-muted-foreground" />
                                        )}
                                      </div>
                                    </CollapsibleTrigger>

                                    <CollapsibleContent>
                                      <div className="ml-6 mt-2 space-y-1">
                                        {monthGroup.xmls.map((xml) => (
                                          <div
                                            key={xml.id}
                                            className="flex items-center gap-3 p-3 border rounded-md hover-elevate"
                                            data-testid={`xml-${xml.id}`}
                                          >
                                            <FileText className="w-4 h-4 text-primary flex-shrink-0" />
                                            <div className="flex-1 min-w-0">
                                              <p className="text-sm font-medium truncate">
                                                NF-e {xml.numeroNF}
                                              </p>
                                              <p className="text-xs text-muted-foreground font-mono truncate">
                                                {xml.chaveNFe}
                                              </p>
                                            </div>
                                            <div className="flex items-center gap-1 flex-wrap">
                                              {getStatusNfeBadge(xml)}
                                              {getTipoDocumentoBadge(xml)}
                                              {getManifestacaoBadge(xml)}
                                              {getDownloadBadge(xml)}
                                            </div>
                                            <div className="text-xs text-muted-foreground flex-shrink-0">
                                              {formatFileSize(xml.tamanhoBytes)}
                                            </div>
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              className="flex-shrink-0"
                                              onClick={async () => {
                                                try {
                                                  const sessionStr = localStorage.getItem("session");
                                                  if (!sessionStr) {
                                                    toast({
                                                      title: "Erro",
                                                      description: "Sessão expirada. Faça login novamente.",
                                                      variant: "destructive",
                                                    });
                                                    return;
                                                  }

                                                  const session = JSON.parse(sessionStr);
                                                  const response = await fetch(`/api/xmls/${xml.id}/download`, {
                                                    headers: {
                                                      Authorization: `Bearer ${session.accessToken}`,
                                                    },
                                                  });

                                                  if (!response.ok) {
                                                    throw new Error("Erro ao baixar XML");
                                                  }

                                                  const blob = await response.blob();
                                                  const url = window.URL.createObjectURL(blob);
                                                  const a = document.createElement("a");
                                                  a.href = url;
                                                  a.download = `${xml.numeroNF}.xml`;
                                                  document.body.appendChild(a);
                                                  a.click();
                                                  window.URL.revokeObjectURL(url);
                                                  document.body.removeChild(a);
                                                } catch (error) {
                                                  toast({
                                                    title: "Erro ao baixar",
                                                    description: String(error),
                                                    variant: "destructive",
                                                  });
                                                }
                                              }}
                                              data-testid={`button-download-${xml.id}`}
                                            >
                                              <Download className="w-4 h-4" />
                                            </Button>
                                          </div>
                                        ))}
                                      </div>
                                    </CollapsibleContent>
                                  </Collapsible>
                                ))}
                              </div>
                            </CollapsibleContent>
                          </Collapsible>
                        ))}
                      </div>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <FileText className="w-16 h-16 mx-auto mb-4 opacity-20" />
              <h3 className="text-lg font-medium mb-2">Nenhum XML encontrado</h3>
              <p className="text-sm text-muted-foreground">
                {searchTerm
                  ? "Nenhum XML encontrado com os critérios de busca"
                  : "XMLs baixados aparecerão aqui após a sincronização"}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
