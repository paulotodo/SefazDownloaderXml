import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/status-badge";
import { Download, Calendar, Filter, Trash2 } from "lucide-react";
import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";

interface Log {
  id: string;
  empresaId: string | null;
  sincronizacaoId: string | null;
  nivel: "info" | "warning" | "error";
  mensagem: string;
  detalhes: string | null;
  timestamp: string;
  empresaNome?: string;
}

export default function Logs() {
  const [nivelFilter, setNivelFilter] = useState<string>("todos");
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();

  const { data: logs, isLoading } = useQuery<Log[]>({
    queryKey: ["/api/logs"],
  });

  const cleanupLockLogsMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("/api/logs/cleanup-lock-logs", {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/logs"] });
      toast({
        title: "Logs limpos",
        description: "Logs técnicos de lock removidos com sucesso",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao limpar logs",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const filteredLogs = logs?.filter((log) => {
    const matchNivel = nivelFilter === "todos" || log.nivel === nivelFilter;
    const matchSearch = log.mensagem.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.empresaNome?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchNivel && matchSearch;
  });

  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(date);
  };

  const getLevelIcon = (nivel: string) => {
    switch (nivel) {
      case "error": return "erro";
      case "warning": return "pausado";
      default: return "ativo";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="heading-logs">Logs de Sincronização</h1>
          <p className="text-sm text-muted-foreground">Histórico detalhado de todas as operações do sistema</p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={() => cleanupLockLogsMutation.mutate()}
            disabled={cleanupLockLogsMutation.isPending}
            data-testid="button-cleanup-lock-logs"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Limpar Logs Técnicos
          </Button>
          <Button variant="outline" data-testid="button-exportar-logs">
            <Download className="w-4 h-4 mr-2" />
            Exportar Logs
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="flex flex-wrap items-center gap-3 mb-6">
            <div className="flex-1 min-w-[200px]">
              <Input
                placeholder="Buscar em logs..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                data-testid="input-search-logs"
              />
            </div>

            <Select value={nivelFilter} onValueChange={setNivelFilter}>
              <SelectTrigger className="w-[180px]" data-testid="select-nivel-filter">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Filtrar por nível" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os níveis</SelectItem>
                <SelectItem value="info">Info</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
                <SelectItem value="error">Error</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="w-4 h-4" />
              <span>{filteredLogs?.length ?? 0} registro(s)</span>
            </div>
          </div>

          <div className="rounded-lg border">
            <div className="max-h-[600px] overflow-y-auto">
              {isLoading ? (
                <div className="p-4 space-y-2">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                    <div key={i} className="flex items-start gap-3 p-3 border-b">
                      <Skeleton className="w-20 h-5 rounded-full" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-3 w-32" />
                      </div>
                      <Skeleton className="w-24 h-4" />
                    </div>
                  ))}
                </div>
              ) : filteredLogs && filteredLogs.length > 0 ? (
                <div className="divide-y">
                  {filteredLogs.map((log) => (
                    <div
                      key={log.id}
                      className="flex items-start gap-3 p-4 hover:bg-muted/30 transition-colors"
                      data-testid={`log-${log.id}`}
                    >
                      <div className="flex-shrink-0 pt-0.5">
                        <StatusBadge status={getLevelIcon(log.nivel)} />
                      </div>

                      <div className="flex-1 min-w-0 space-y-1">
                        <p className="text-sm font-medium">{log.mensagem}</p>
                        {log.empresaNome && (
                          <p className="text-xs text-muted-foreground">
                            Empresa: {log.empresaNome}
                          </p>
                        )}
                        {log.detalhes && (
                          <details className="text-xs text-muted-foreground mt-2">
                            <summary className="cursor-pointer hover:text-foreground">
                              Ver detalhes
                            </summary>
                            <pre className="mt-2 p-2 bg-muted rounded text-xs font-mono overflow-x-auto">
                              {JSON.stringify(JSON.parse(log.detalhes), null, 2)}
                            </pre>
                          </details>
                        )}
                      </div>

                      <div className="flex-shrink-0 text-right">
                        <p className="text-xs font-mono text-muted-foreground whitespace-nowrap">
                          {formatDateTime(log.timestamp)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <Filter className="w-16 h-16 mx-auto mb-4 opacity-20" />
                  <h3 className="text-lg font-medium mb-2">Nenhum log encontrado</h3>
                  <p className="text-sm text-muted-foreground">
                    {searchTerm || nivelFilter !== "todos"
                      ? "Tente ajustar os filtros de busca"
                      : "Logs aparecerão aqui após operações do sistema"}
                  </p>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
