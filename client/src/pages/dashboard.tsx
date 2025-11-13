import { useQuery } from "@tanstack/react-query";
import { Building2, FileText, Clock, Activity } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";

interface DashboardStats {
  totalEmpresas: number;
  empresasAtivas: number;
  xmlsHoje: number;
  ultimaSincronizacao: string | null;
  sincronizacoesEmAndamento: number;
}

interface RecentXml {
  id: string;
  empresaCnpj: string;
  empresaNome: string;
  numeroNF: string;
  dataEmissao: string;
  createdAt: string;
}

interface RecentLog {
  id: string;
  nivel: "info" | "warning" | "error";
  mensagem: string;
  timestamp: string;
  empresaNome?: string;
}

export default function Dashboard() {
  const { data: stats, isLoading: isLoadingStats } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats"],
  });

  const { data: recentXmls, isLoading: isLoadingXmls } = useQuery<RecentXml[]>({
    queryKey: ["/api/dashboard/recent-xmls"],
  });

  const { data: recentLogs, isLoading: isLoadingLogs } = useQuery<RecentLog[]>({
    queryKey: ["/api/dashboard/recent-logs"],
  });

  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  const formatTimeAgo = (dateStr: string) => {
    const now = new Date();
    const date = new Date(dateStr);
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Agora mesmo';
    if (diffMins < 60) return `Há ${diffMins} min`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `Há ${diffHours}h`;
    const diffDays = Math.floor(diffHours / 24);
    return `Há ${diffDays}d`;
  };

  const getLevelBadgeVariant = (nivel: string) => {
    switch (nivel) {
      case "error": return "destructive";
      case "warning": return "secondary";
      default: return "default";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="heading-dashboard">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Visão geral do sistema de sincronização</p>
        </div>
        <Button asChild data-testid="button-nova-empresa">
          <Link href="/empresas/nova">
            <Building2 className="w-4 h-4 mr-2" />
            Nova Empresa
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total de Empresas"
          value={stats?.totalEmpresas ?? 0}
          icon={Building2}
          description={`${stats?.empresasAtivas ?? 0} ativas`}
          isLoading={isLoadingStats}
        />
        <StatCard
          title="XMLs Hoje"
          value={stats?.xmlsHoje ?? 0}
          icon={FileText}
          description="Baixados nas últimas 24h"
          isLoading={isLoadingStats}
        />
        <StatCard
          title="Última Sincronização"
          value={stats?.ultimaSincronizacao ? formatTimeAgo(stats.ultimaSincronizacao) : 'Nunca'}
          icon={Clock}
          isLoading={isLoadingStats}
        />
        <StatCard
          title="Status Atual"
          value={stats?.sincronizacoesEmAndamento ?? 0}
          icon={Activity}
          description={stats?.sincronizacoesEmAndamento ? 'Em andamento' : 'Aguardando'}
          isLoading={isLoadingStats}
        />
      </div>

      <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-medium">XMLs Recentes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {isLoadingXmls ? (
                <>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-md border">
                      <Skeleton className="w-10 h-10 rounded-md" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-48" />
                      </div>
                      <Skeleton className="h-4 w-16" />
                    </div>
                  ))}
                </>
              ) : recentXmls && recentXmls.length > 0 ? (
                recentXmls.map((xml) => (
                  <div
                    key={xml.id}
                    className="flex items-center gap-3 p-3 rounded-md border hover-elevate"
                    data-testid={`card-xml-${xml.id}`}
                  >
                    <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <FileText className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">NF-e {xml.numeroNF}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {xml.empresaNome} • CNPJ {xml.empresaCnpj}
                      </p>
                    </div>
                    <div className="text-xs text-muted-foreground flex-shrink-0">
                      {formatTimeAgo(xml.createdAt)}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="w-12 h-12 mx-auto mb-3 opacity-20" />
                  <p className="text-sm">Nenhum XML baixado ainda</p>
                  <p className="text-xs mt-1">XMLs aparecerão aqui após a primeira sincronização</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-medium">Logs Recentes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {isLoadingLogs ? (
                <>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-md border">
                      <Skeleton className="w-16 h-5 rounded-full" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                    </div>
                  ))}
                </>
              ) : recentLogs && recentLogs.length > 0 ? (
                recentLogs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-start gap-3 p-3 rounded-md border"
                    data-testid={`log-${log.id}`}
                  >
                    <StatusBadge 
                      status={log.nivel === "error" ? "erro" : log.nivel === "warning" ? "pausado" : "ativo"} 
                      className="flex-shrink-0 mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">{log.mensagem}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {log.empresaNome && (
                          <span className="text-xs text-muted-foreground">{log.empresaNome}</span>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {formatTimeAgo(log.timestamp)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Activity className="w-12 h-12 mx-auto mb-3 opacity-20" />
                  <p className="text-sm">Nenhum log registrado</p>
                  <p className="text-xs mt-1">Logs aparecerão aqui após operações do sistema</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
