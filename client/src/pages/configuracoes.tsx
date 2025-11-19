import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings, Clock, Bell, Shield } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import type { Configuracao } from "@shared/schema";

export default function Configuracoes() {
  const { toast } = useToast();
  
  const { data: config, isLoading } = useQuery<Configuracao>({
    queryKey: ["/api/configuracoes"],
  });

  const [formData, setFormData] = useState({
    intervaloSincronizacao: "1h" as const,
    sincronizacaoAutomatica: true,
    sincronizarAoIniciar: true,
    retryAutomatico: true,
    maxRetries: 3,
    timeoutRequisicao: 60,
    validarSSL: true,
    logsDetalhados: false,
    notificarNovosXmls: true,
    notificarErros: true,
    relatorioDiario: false,
    emailNotificacoes: "",
  });

  useEffect(() => {
    if (config) {
      setFormData({
        intervaloSincronizacao: config.intervaloSincronizacao as any,
        sincronizacaoAutomatica: config.sincronizacaoAutomatica,
        sincronizarAoIniciar: config.sincronizarAoIniciar,
        retryAutomatico: config.retryAutomatico,
        maxRetries: config.maxRetries,
        timeoutRequisicao: config.timeoutRequisicao,
        validarSSL: config.validarSSL,
        logsDetalhados: config.logsDetalhados,
        notificarNovosXmls: config.notificarNovosXmls,
        notificarErros: config.notificarErros,
        relatorioDiario: config.relatorioDiario,
        emailNotificacoes: config.emailNotificacoes || "",
      });
    }
  }, [config]);

  const saveMutation = useMutation({
    mutationFn: () =>
      apiRequest("/api/configuracoes", {
        method: "PUT",
        body: JSON.stringify(formData),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/configuracoes"] });
      toast({
        title: "Configurações salvas!",
        description: "As configurações foram atualizadas com sucesso.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao salvar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const resetMutation = useMutation({
    mutationFn: () =>
      apiRequest("/api/configuracoes", {
        method: "PUT",
        body: JSON.stringify({
          intervaloSincronizacao: "1h",
          sincronizacaoAutomatica: true,
          sincronizarAoIniciar: true,
          retryAutomatico: true,
          maxRetries: 3,
          timeoutRequisicao: 60,
          validarSSL: true,
          logsDetalhados: false,
          notificarNovosXmls: true,
          notificarErros: true,
          relatorioDiario: false,
          emailNotificacoes: "",
        }),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/configuracoes"] });
      toast({
        title: "Configurações restauradas!",
        description: "As configurações foram restauradas para os valores padrão.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao restaurar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Carregando configurações...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold" data-testid="heading-configuracoes">Configurações</h1>
        <p className="text-sm text-muted-foreground">Gerencie as configurações do sistema</p>
      </div>

      <Tabs defaultValue="geral" className="space-y-6">
        <TabsList>
          <TabsTrigger value="geral" data-testid="tab-geral">
            <Settings className="w-4 h-4 mr-2" />
            Geral
          </TabsTrigger>
          <TabsTrigger value="agendamento" data-testid="tab-agendamento">
            <Clock className="w-4 h-4 mr-2" />
            Agendamento
          </TabsTrigger>
          <TabsTrigger value="notificacoes" data-testid="tab-notificacoes">
            <Bell className="w-4 h-4 mr-2" />
            Notificações
          </TabsTrigger>
        </TabsList>

        <TabsContent value="geral" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-medium">Configurações Gerais</CardTitle>
              <CardDescription>Preferências básicas do sistema</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label>Sincronização Automática</Label>
                  <p className="text-sm text-muted-foreground">
                    Ativa ou desativa a sincronização automática para todas as empresas
                  </p>
                </div>
                <Switch
                  checked={formData.sincronizacaoAutomatica}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, sincronizacaoAutomatica: checked })
                  }
                  data-testid="switch-auto-sync"
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label>Logs Detalhados</Label>
                  <p className="text-sm text-muted-foreground">
                    Registra informações detalhadas de debug nos logs
                  </p>
                </div>
                <Switch
                  checked={formData.logsDetalhados}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, logsDetalhados: checked })
                  }
                  data-testid="switch-verbose-logs"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-medium">
                <Shield className="w-4 h-4 inline mr-2" />
                Segurança
              </CardTitle>
              <CardDescription>Configurações de segurança e certificados</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="timeout">Timeout de Requisição (segundos)</Label>
                <Input
                  id="timeout"
                  type="number"
                  value={formData.timeoutRequisicao}
                  onChange={(e) =>
                    setFormData({ ...formData, timeoutRequisicao: parseInt(e.target.value) })
                  }
                  min="30"
                  max="300"
                  data-testid="input-timeout"
                />
                <p className="text-xs text-muted-foreground">
                  Tempo máximo de espera para requisições à SEFAZ
                </p>
              </div>

              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label>Validar Certificados SSL</Label>
                  <p className="text-sm text-muted-foreground">
                    Verifica a validade dos certificados SSL nas conexões
                  </p>
                </div>
                <Switch
                  checked={formData.validarSSL}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, validarSSL: checked })
                  }
                  data-testid="switch-verify-ssl"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="agendamento" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-medium">Agendamento de Sincronização</CardTitle>
              <CardDescription>Configure quando e como a sincronização deve ocorrer</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="interval">Intervalo de Sincronização</Label>
                <Select
                  value={formData.intervaloSincronizacao}
                  onValueChange={(value: any) =>
                    setFormData({ ...formData, intervaloSincronizacao: value })
                  }
                >
                  <SelectTrigger id="interval" data-testid="select-interval">
                    <SelectValue placeholder="Selecione o intervalo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="15m">A cada 15 minutos</SelectItem>
                    <SelectItem value="30m">A cada 30 minutos</SelectItem>
                    <SelectItem value="1h">A cada 1 hora (padrão)</SelectItem>
                    <SelectItem value="2h">A cada 2 horas</SelectItem>
                    <SelectItem value="6h">A cada 6 horas</SelectItem>
                    <SelectItem value="12h">A cada 12 horas</SelectItem>
                    <SelectItem value="24h">A cada 24 horas</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Frequência com que o sistema buscará novos XMLs
                </p>
              </div>

              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label>Sincronizar ao Iniciar</Label>
                  <p className="text-sm text-muted-foreground">
                    Executa sincronização imediatamente quando o sistema inicia
                  </p>
                </div>
                <Switch
                  checked={formData.sincronizarAoIniciar}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, sincronizarAoIniciar: checked })
                  }
                  data-testid="switch-sync-on-start"
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label>Retry Automático</Label>
                  <p className="text-sm text-muted-foreground">
                    Tenta novamente automaticamente em caso de falha
                  </p>
                </div>
                <Switch
                  checked={formData.retryAutomatico}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, retryAutomatico: checked })
                  }
                  data-testid="switch-auto-retry"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="max-retries">Máximo de Tentativas</Label>
                <Input
                  id="max-retries"
                  type="number"
                  value={formData.maxRetries}
                  onChange={(e) =>
                    setFormData({ ...formData, maxRetries: parseInt(e.target.value) })
                  }
                  min="1"
                  max="10"
                  data-testid="input-max-retries"
                />
                <p className="text-xs text-muted-foreground">
                  Número de tentativas em caso de falha
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notificacoes" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-medium">Notificações</CardTitle>
              <CardDescription>Configure como você deseja ser notificado</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label>Notificar Novos XMLs</Label>
                  <p className="text-sm text-muted-foreground">
                    Receba notificação quando novos XMLs forem baixados
                  </p>
                </div>
                <Switch
                  checked={formData.notificarNovosXmls}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, notificarNovosXmls: checked })
                  }
                  data-testid="switch-notify-new-xmls"
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label>Notificar Erros</Label>
                  <p className="text-sm text-muted-foreground">
                    Receba notificação quando ocorrerem erros na sincronização
                  </p>
                </div>
                <Switch
                  checked={formData.notificarErros}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, notificarErros: checked })
                  }
                  data-testid="switch-notify-errors"
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label>Relatório Diário</Label>
                  <p className="text-sm text-muted-foreground">
                    Receba um resumo diário das sincronizações
                  </p>
                </div>
                <Switch
                  checked={formData.relatorioDiario}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, relatorioDiario: checked })
                  }
                  data-testid="switch-daily-report"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">E-mail para Notificações</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.emailNotificacoes}
                  onChange={(e) =>
                    setFormData({ ...formData, emailNotificacoes: e.target.value })
                  }
                  placeholder="seu@email.com"
                  data-testid="input-notification-email"
                />
                <p className="text-xs text-muted-foreground">
                  Endereço de e-mail para receber notificações (futuro)
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="flex items-center gap-3">
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          data-testid="button-save-config"
        >
          {saveMutation.isPending ? "Salvando..." : "Salvar Configurações"}
        </Button>
        <Button
          variant="outline"
          onClick={() => resetMutation.mutate()}
          disabled={resetMutation.isPending}
          data-testid="button-reset-config"
        >
          {resetMutation.isPending ? "Restaurando..." : "Restaurar Padrões"}
        </Button>
      </div>
    </div>
  );
}
