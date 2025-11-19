import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Upload, ArrowLeft, Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { UFS } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";
import type { Empresa } from "@shared/schema";

const formSchema = z.object({
  razaoSocial: z.string().min(1, "Razão social é obrigatória"),
  uf: z.string().length(2, "Selecione uma UF"),
  ambiente: z.enum(["prod", "hom"]),
  certificadoSenha: z.string().optional(),
  ativo: z.boolean().default(true),
  tipoArmazenamento: z.enum(["local", "supabase"]).default("local"),
  manifestacaoAutomatica: z.boolean().default(false),
});

type FormData = z.infer<typeof formSchema>;

interface EmpresaEditProps {
  params: {
    id: string;
  };
}

export default function EmpresaEdit({ params }: EmpresaEditProps) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [certificadoFile, setCertificadoFile] = useState<File | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const { data: empresa, isLoading } = useQuery<Empresa>({
    queryKey: ["/api/empresas", params.id],
  });

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      razaoSocial: "",
      uf: "",
      ambiente: "prod",
      certificadoSenha: "",
      ativo: true,
      tipoArmazenamento: "local",
      manifestacaoAutomatica: false,
    },
    values: empresa ? {
      razaoSocial: empresa.razaoSocial,
      uf: empresa.uf,
      ambiente: empresa.ambiente as "prod" | "hom",
      certificadoSenha: "",
      ativo: empresa.ativo,
      tipoArmazenamento: empresa.tipoArmazenamento as "local" | "supabase",
      manifestacaoAutomatica: empresa.manifestacaoAutomatica,
    } : undefined,
  });

  const onSubmit = async (data: FormData) => {
    try {
      const formData = new FormData();
      formData.append("razaoSocial", data.razaoSocial);
      formData.append("uf", data.uf);
      formData.append("ambiente", data.ambiente);
      if (data.certificadoSenha) {
        formData.append("certificadoSenha", data.certificadoSenha);
      }
      formData.append("tipoArmazenamento", data.tipoArmazenamento);
      formData.append("manifestacaoAutomatica", data.manifestacaoAutomatica.toString());
      formData.append("ativo", data.ativo.toString());
      
      if (certificadoFile) {
        formData.append("certificado", certificadoFile);
      }

      await apiRequest(`/api/empresas/${params.id}`, {
        method: "PATCH",
        body: formData,
      });

      toast({
        title: "Empresa atualizada!",
        description: "As informações da empresa foram atualizadas com sucesso.",
      });

      setTimeout(() => {
        setLocation("/empresas");
      }, 1000);
    } catch (error) {
      toast({
        title: "Erro ao atualizar",
        description: error instanceof Error ? error.message : "Erro ao atualizar empresa",
        variant: "destructive",
      });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.endsWith(".pfx") && !file.name.endsWith(".p12")) {
        toast({
          title: "Arquivo inválido",
          description: "Selecione um arquivo de certificado digital (.pfx ou .p12)",
          variant: "destructive",
        });
        return;
      }
      setCertificadoFile(file);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  if (!empresa) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <p className="text-muted-foreground">Empresa não encontrada</p>
        <Button onClick={() => setLocation("/empresas")}>
          Voltar para empresas
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setLocation("/empresas")}
          data-testid="button-voltar"
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold" data-testid="heading-editar-empresa">Editar Empresa</h1>
          <p className="text-sm text-muted-foreground">Atualize as informações da empresa</p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-medium">Dados da Empresa</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="razaoSocial"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium uppercase tracking-wide">
                      Razão Social
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Nome da empresa"
                        {...field}
                        data-testid="input-razao-social"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <FormLabel className="text-xs font-medium uppercase tracking-wide mb-2 block">
                    CNPJ
                  </FormLabel>
                  <Input
                    value={empresa.cnpj}
                    disabled
                    className="font-mono bg-muted"
                    data-testid="input-cnpj-readonly"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    CNPJ não pode ser alterado
                  </p>
                </div>

                <FormField
                  control={form.control}
                  name="uf"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium uppercase tracking-wide">
                        UF
                      </FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-uf">
                            <SelectValue placeholder="Selecione a UF" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {UFS.map((uf) => (
                            <SelectItem key={uf} value={uf}>
                              {uf}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="ambiente"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium uppercase tracking-wide">
                      Ambiente SEFAZ
                    </FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-ambiente">
                          <SelectValue placeholder="Selecione o ambiente" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="prod">Produção</SelectItem>
                        <SelectItem value="hom">Homologação</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Use Produção para ambiente real ou Homologação para testes
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="ativo"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-sm font-medium">
                        Empresa Ativa
                      </FormLabel>
                      <FormDescription>
                        Empresas ativas são sincronizadas automaticamente a cada hora
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-ativo"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="tipoArmazenamento"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium uppercase tracking-wide">
                      Tipo de Armazenamento
                    </FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-tipo-armazenamento">
                          <SelectValue placeholder="Selecione o tipo de armazenamento" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="local">Local (filesystem)</SelectItem>
                        <SelectItem value="supabase">Supabase Storage</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Define onde os XMLs serão armazenados (local ou nuvem)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="manifestacaoAutomatica"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-sm font-medium">
                        Manifestação Automática
                      </FormLabel>
                      <FormDescription>
                        Manifesta automaticamente evento 210210 (Ciência da Operação) quando um novo XML é recebido
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-manifestacao-automatica"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-medium">Certificado Digital (Opcional)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <FormLabel className="text-xs font-medium uppercase tracking-wide mb-3 block">
                  Novo Certificado (.pfx)
                </FormLabel>
                <p className="text-sm text-muted-foreground mb-3">
                  Faça upload apenas se desejar trocar o certificado atual
                </p>
                <div className="border-2 border-dashed rounded-lg p-6 text-center hover-elevate">
                  <input
                    type="file"
                    accept=".pfx,.p12"
                    onChange={handleFileChange}
                    className="hidden"
                    id="certificado-upload"
                    data-testid="input-certificado"
                  />
                  <label
                    htmlFor="certificado-upload"
                    className="cursor-pointer flex flex-col items-center gap-2"
                  >
                    <Upload className="w-10 h-10 text-muted-foreground" />
                    {certificadoFile ? (
                      <>
                        <p className="text-sm font-medium">{certificadoFile.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {(certificadoFile.size / 1024).toFixed(2)} KB
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-sm font-medium">Clique para selecionar um novo certificado</p>
                        <p className="text-xs text-muted-foreground">
                          Arquivo .pfx ou .p12 (máx. 5MB)
                        </p>
                      </>
                    )}
                  </label>
                </div>
              </div>

              <FormField
                control={form.control}
                name="certificadoSenha"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium uppercase tracking-wide">
                      Senha do Certificado
                    </FormLabel>
                    <div className="relative">
                      <FormControl>
                        <Input
                          type={showPassword ? "text" : "password"}
                          placeholder="Digite apenas se trocar o certificado"
                          {...field}
                          className="pr-10"
                          data-testid="input-senha"
                        />
                      </FormControl>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-full"
                        onClick={() => setShowPassword(!showPassword)}
                        data-testid="button-toggle-senha"
                      >
                        {showPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                    <FormDescription>
                      Deixe em branco para manter a senha atual
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <div className="flex items-center gap-3">
            <Button
              type="submit"
              disabled={form.formState.isSubmitting}
              data-testid="button-salvar"
            >
              {form.formState.isSubmitting ? "Salvando..." : "Salvar Alterações"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setLocation("/empresas")}
              data-testid="button-cancelar"
            >
              Cancelar
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
