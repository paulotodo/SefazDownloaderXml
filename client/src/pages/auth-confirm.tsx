import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Loader2, CheckCircle, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

export default function AuthConfirm() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Confirmando seu email...");

  useEffect(() => {
    const handleEmailConfirmation = async () => {
      try {
        // Supabase redireciona com access_token e refresh_token nos hash fragments
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");
        const type = hashParams.get("type");

        if (!accessToken || !refreshToken) {
          setStatus("error");
          setMessage("Link de confirmação inválido ou expirado");
          return;
        }

        if (type === "signup") {
          // Salva tokens no localStorage para auto-login
          const expiresAt = Math.floor(Date.now() / 1000) + 3600; // 1 hora
          const session = {
            accessToken,
            refreshToken,
            expiresAt,
          };

          localStorage.setItem("session", JSON.stringify(session));

          // Busca dados do usuário
          const response = await fetch("/api/auth/me", {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          });

          if (!response.ok) {
            throw new Error("Erro ao buscar dados do usuário");
          }

          const userData = await response.json();
          localStorage.setItem("user", JSON.stringify(userData));

          setStatus("success");
          setMessage("Email confirmado com sucesso! Redirecionando...");

          toast({
            title: "Email confirmado!",
            description: "Bem-vindo ao SEFAZ XML Sync!",
          });

          // Redireciona para o dashboard após 2 segundos
          setTimeout(() => {
            window.location.href = "/";
          }, 2000);
        } else {
          setStatus("error");
          setMessage("Tipo de confirmação não reconhecido");
        }
      } catch (error) {
        console.error("Erro ao processar confirmação:", error);
        setStatus("error");
        setMessage("Erro ao processar confirmação de email");
        
        toast({
          title: "Erro",
          description: "Não foi possível confirmar seu email. Tente fazer login.",
          variant: "destructive",
        });

        // Redireciona para login após erro
        setTimeout(() => {
          navigate("/login");
        }, 3000);
      }
    };

    handleEmailConfirmation();
  }, [navigate, toast]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            {status === "loading" && (
              <Loader2 className="h-12 w-12 text-primary animate-spin" data-testid="icon-loading" />
            )}
            {status === "success" && (
              <CheckCircle className="h-12 w-12 text-green-500" data-testid="icon-success" />
            )}
            {status === "error" && (
              <XCircle className="h-12 w-12 text-destructive" data-testid="icon-error" />
            )}
          </div>
          <CardTitle className="text-2xl font-bold" data-testid="text-title">
            {status === "loading" && "Confirmando Email"}
            {status === "success" && "Email Confirmado!"}
            {status === "error" && "Erro na Confirmação"}
          </CardTitle>
          <CardDescription data-testid="text-message">
            {message}
          </CardDescription>
        </CardHeader>

        <CardContent className="text-center text-sm text-muted-foreground">
          {status === "loading" && "Por favor, aguarde..."}
          {status === "success" && "Você será redirecionado em instantes."}
          {status === "error" && "Você será redirecionado para a página de login."}
        </CardContent>
      </Card>
    </div>
  );
}
