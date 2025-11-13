import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { FileText, Loader2 } from "lucide-react";

export default function Register() {
  const [, navigate] = useLocation();
  const { register } = useAuth();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [nomeCompleto, setNomeCompleto] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast({
        title: "Erro",
        description: "As senhas não coincidem",
        variant: "destructive",
      });
      return;
    }

    if (password.length < 6) {
      toast({
        title: "Erro",
        description: "A senha deve ter pelo menos 6 caracteres",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      await register(email, password, nomeCompleto);
      toast({
        title: "Conta criada com sucesso",
        description: "Bem-vindo ao SEFAZ XML Sync!",
      });
      navigate("/");
    } catch (error: any) {
      // Verifica se é erro de confirmação de email
      const errorMessage = error.message || "Ocorreu um erro ao criar sua conta";
      const isEmailConfirmation = errorMessage.includes("confirmar o cadastro") || 
                                   errorMessage.includes("verifique seu email");
      
      toast({
        title: isEmailConfirmation ? "⚠️ Confirmação de Email Necessária" : "Erro ao criar conta",
        description: errorMessage,
        variant: isEmailConfirmation ? "default" : "destructive",
        duration: isEmailConfirmation ? 10000 : 5000,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-primary/10 rounded-full">
              <FileText className="h-8 w-8 text-primary" data-testid="icon-logo" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold" data-testid="text-title">
            Criar Conta
          </CardTitle>
          <CardDescription data-testid="text-subtitle">
            Preencha os dados para começar
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nomeCompleto" data-testid="label-nome">Nome Completo</Label>
              <Input
                id="nomeCompleto"
                type="text"
                placeholder="João Silva"
                value={nomeCompleto}
                onChange={(e) => setNomeCompleto(e.target.value)}
                required
                disabled={isLoading}
                data-testid="input-nome"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" data-testid="label-email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
                data-testid="input-email"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" data-testid="label-password">Senha</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                disabled={isLoading}
                data-testid="input-password"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword" data-testid="label-confirm-password">Confirmar Senha</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                disabled={isLoading}
                data-testid="input-confirm-password"
              />
            </div>
          </CardContent>

          <CardFooter className="flex flex-col space-y-4">
            <Button 
              type="submit" 
              className="w-full" 
              disabled={isLoading}
              data-testid="button-register"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Criando conta...
                </>
              ) : (
                "Criar Conta"
              )}
            </Button>

            <div className="text-sm text-center text-muted-foreground">
              Já tem uma conta?{" "}
              <Link href="/login" className="text-primary hover:underline" data-testid="link-login">
                Entre aqui
              </Link>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
