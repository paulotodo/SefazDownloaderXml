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

export default function Configuracoes() {
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
              <div className="space-y-2">
                <Label htmlFor="dest-path">Diretório de Destino dos XMLs</Label>
                <Input
                  id="dest-path"
                  placeholder="/caminho/para/xmls"
                  defaultValue="./xmls"
                  data-testid="input-dest-path"
                />
                <p className="text-xs text-muted-foreground">
                  Caminho onde os XMLs serão salvos no servidor
                </p>
              </div>

              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label>Sincronização Automática</Label>
                  <p className="text-sm text-muted-foreground">
                    Ativa ou desativa a sincronização automática para todas as empresas
                  </p>
                </div>
                <Switch defaultChecked data-testid="switch-auto-sync" />
              </div>

              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label>Logs Detalhados</Label>
                  <p className="text-sm text-muted-foreground">
                    Registra informações detalhadas de debug nos logs
                  </p>
                </div>
                <Switch data-testid="switch-verbose-logs" />
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
                  defaultValue="60"
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
                <Switch defaultChecked data-testid="switch-verify-ssl" />
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
                <Select defaultValue="1h">
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
                <Switch defaultChecked data-testid="switch-sync-on-start" />
              </div>

              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label>Retry Automático</Label>
                  <p className="text-sm text-muted-foreground">
                    Tenta novamente automaticamente em caso de falha
                  </p>
                </div>
                <Switch defaultChecked data-testid="switch-auto-retry" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="max-retries">Máximo de Tentativas</Label>
                <Input
                  id="max-retries"
                  type="number"
                  defaultValue="3"
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

          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-medium">Próxima Sincronização</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                <div>
                  <p className="text-sm font-medium">Agendada para:</p>
                  <p className="text-lg font-semibold mt-1">Hoje às 15:00</p>
                </div>
                <Button data-testid="button-sync-now">
                  <Clock className="w-4 h-4 mr-2" />
                  Sincronizar Agora
                </Button>
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
                <Switch defaultChecked data-testid="switch-notify-new-xmls" />
              </div>

              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label>Notificar Erros</Label>
                  <p className="text-sm text-muted-foreground">
                    Receba notificação quando ocorrerem erros na sincronização
                  </p>
                </div>
                <Switch defaultChecked data-testid="switch-notify-errors" />
              </div>

              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label>Relatório Diário</Label>
                  <p className="text-sm text-muted-foreground">
                    Receba um resumo diário das sincronizações
                  </p>
                </div>
                <Switch data-testid="switch-daily-report" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">E-mail para Notificações</Label>
                <Input
                  id="email"
                  type="email"
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
        <Button data-testid="button-save-config">
          Salvar Configurações
        </Button>
        <Button variant="outline" data-testid="button-reset-config">
          Restaurar Padrões
        </Button>
      </div>
    </div>
  );
}
