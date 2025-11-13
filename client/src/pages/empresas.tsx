import { useQuery, useMutation } from "@tanstack/react-query";
import { Building2, Plus, Pencil, Trash2, Search, Play } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/status-badge";
import { Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useState } from "react";

interface Empresa {
  id: string;
  cnpj: string;
  razaoSocial: string;
  uf: string;
  ambiente: string;
  ativo: boolean;
  ultimoNSU: string;
  updatedAt: string;
}

export default function Empresas() {
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();

  const { data: empresas, isLoading } = useQuery<Empresa[]>({
    queryKey: ["/api/empresas"],
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/empresas/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/empresas"] });
      toast({
        title: "Empresa excluída",
        description: "A empresa foi removida com sucesso.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao excluir",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const sincronizarMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/empresas/${id}/sincronizar`, { method: "POST" }),
    onSuccess: () => {
      toast({
        title: "Sincronização iniciada",
        description: "A sincronização foi iniciada em segundo plano.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao sincronizar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const filteredEmpresas = empresas?.filter((empresa) =>
    empresa.razaoSocial.toLowerCase().includes(searchTerm.toLowerCase()) ||
    empresa.cnpj.includes(searchTerm)
  );

  const formatCNPJ = (cnpj: string) => {
    return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  };

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="heading-empresas">Empresas Cadastradas</h1>
          <p className="text-sm text-muted-foreground">Gerencie as empresas para sincronização de XMLs</p>
        </div>
        <Button asChild data-testid="button-nova-empresa">
          <Link href="/empresas/nova">
            <Plus className="w-4 h-4 mr-2" />
            Nova Empresa
          </Link>
        </Button>
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou CNPJ..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
                data-testid="input-search-empresa"
              />
            </div>
            <div className="text-sm text-muted-foreground">
              {filteredEmpresas?.length ?? 0} empresa(s)
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-4 p-4 border rounded-md">
                  <Skeleton className="w-12 h-12 rounded-md" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-5 w-48" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                  <Skeleton className="h-6 w-16" />
                  <Skeleton className="h-8 w-20" />
                </div>
              ))}
            </div>
          ) : filteredEmpresas && filteredEmpresas.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12"></TableHead>
                    <TableHead>Razão Social</TableHead>
                    <TableHead>CNPJ</TableHead>
                    <TableHead>UF</TableHead>
                    <TableHead>Ambiente</TableHead>
                    <TableHead>Último NSU</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Atualizado em</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEmpresas.map((empresa) => (
                    <TableRow key={empresa.id} data-testid={`row-empresa-${empresa.id}`} className="hover-elevate">
                      <TableCell>
                        <div className="w-10 h-10 bg-primary/10 rounded-md flex items-center justify-center">
                          <Building2 className="w-5 h-5 text-primary" />
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">
                        {empresa.razaoSocial}
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-sm">
                          {formatCNPJ(empresa.cnpj)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="font-medium">{empresa.uf}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm capitalize">
                          {empresa.ambiente === "prod" ? "Produção" : "Homologação"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs text-muted-foreground">
                          {empresa.ultimoNSU}
                        </span>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={empresa.ativo ? "ativo" : "inativo"} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDateTime(empresa.updatedAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => sincronizarMutation.mutate(empresa.id)}
                            disabled={sincronizarMutation.isPending}
                            title="Sincronizar agora"
                            data-testid={`button-sync-${empresa.id}`}
                          >
                            <Play className="w-4 h-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                data-testid={`button-delete-${empresa.id}`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Tem certeza que deseja excluir a empresa <strong>{empresa.razaoSocial}</strong>?
                                  Esta ação não pode ser desfeita e todos os XMLs associados serão removidos.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteMutation.mutate(empresa.id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Excluir
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12">
              <Building2 className="w-16 h-16 mx-auto mb-4 opacity-20" />
              <h3 className="text-lg font-medium mb-2">Nenhuma empresa cadastrada</h3>
              <p className="text-sm text-muted-foreground mb-6">
                {searchTerm
                  ? "Nenhuma empresa encontrada com os critérios de busca"
                  : "Cadastre a primeira empresa para começar a sincronizar XMLs"}
              </p>
              {!searchTerm && (
                <Button asChild>
                  <Link href="/empresas/nova">
                    <Plus className="w-4 h-4 mr-2" />
                    Cadastrar Primeira Empresa
                  </Link>
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
