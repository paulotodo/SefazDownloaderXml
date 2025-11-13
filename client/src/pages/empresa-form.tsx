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

const formSchema = z.object({
  cnpj: z.string().regex(/^\d{14}$/, "CNPJ deve conter 14 dígitos (somente números)"),
  razaoSocial: z.string().min(1, "Razão social é obrigatória"),
  uf: z.string().length(2, "Selecione uma UF"),
  ambiente: z.enum(["prod", "hom"]),
  certificadoSenha: z.string().min(1, "Senha do certificado é obrigatória"),
  ativo: z.boolean().default(true),
});

type FormData = z.infer<typeof formSchema>;

export default function EmpresaForm() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [certificadoFile, setCertificadoFile] = useState<File | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      cnpj: "",
      razaoSocial: "",
      uf: "",
      ambiente: "prod",
      certificadoSenha: "",
      ativo: true,
    },
  });

  const onSubmit = async (data: FormData) => {
    if (!certificadoFile) {
      toast({
        title: "Erro",
        description: "Selecione o arquivo do certificado digital (.pfx)",
        variant: "destructive",
      });
      return;
    }

    try {
      const formData = new FormData();
      formData.append("cnpj", data.cnpj);
      formData.append("razaoSocial", data.razaoSocial);
      formData.append("uf", data.uf);
      formData.append("ambiente", data.ambiente);
      formData.append("certificadoSenha", data.certificadoSenha);
      formData.append("certificado", certificadoFile);

      const response = await fetch("/api/empresas", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Erro ao cadastrar empresa");
      }

      toast({
        title: "Empresa cadastrada!",
        description: "A empresa foi cadastrada com sucesso e está pronta para sincronização.",
      });

      setTimeout(() => {
        setLocation("/empresas");
      }, 1000);
    } catch (error) {
      toast({
        title: "Erro ao cadastrar",
        description: String(error),
        variant: "destructive",
      });
    }
  };

  const formatCNPJ = (value: string) => {
    const numbers = value.replace(/\D/g, "");
    return numbers.slice(0, 14);
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
          <h1 className="text-2xl font-semibold" data-testid="heading-nova-empresa">Nova Empresa</h1>
          <p className="text-sm text-muted-foreground">Cadastre uma empresa para sincronização automática</p>
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
                <FormField
                  control={form.control}
                  name="cnpj"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium uppercase tracking-wide">
                        CNPJ
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="00000000000000"
                          {...field}
                          onChange={(e) => field.onChange(formatCNPJ(e.target.value))}
                          maxLength={14}
                          className="font-mono"
                          data-testid="input-cnpj"
                        />
                      </FormControl>
                      <FormDescription>Somente números (14 dígitos)</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="uf"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium uppercase tracking-wide">
                        UF
                      </FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-medium">Certificado Digital</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <FormLabel className="text-xs font-medium uppercase tracking-wide mb-3 block">
                  Arquivo do Certificado (.pfx)
                </FormLabel>
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
                        <p className="text-sm font-medium">Clique para selecionar o certificado</p>
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
                          placeholder="Digite a senha do certificado"
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
                      A senha será armazenada de forma segura e criptografada
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
              {form.formState.isSubmitting ? "Cadastrando..." : "Cadastrar Empresa"}
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
