import { Switch, Route, Redirect, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import Dashboard from "@/pages/dashboard";
import Empresas from "@/pages/empresas";
import EmpresaForm from "@/pages/empresa-form";
import Xmls from "@/pages/xmls";
import Logs from "@/pages/logs";
import Configuracoes from "@/pages/configuracoes";
import Login from "@/pages/login";
import Register from "@/pages/register";
import AuthConfirm from "@/pages/auth-confirm";
import NotFound from "@/pages/not-found";
import { Loader2, LogOut } from "lucide-react";

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();
  const [location] = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Redirect to={`/login?redirect=${encodeURIComponent(location)}`} />;
  }

  return <Component />;
}

function PublicRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (user) {
    return <Redirect to="/" />;
  }

  return <Component />;
}

function AuthenticatedLayout() {
  const { user, logout } = useAuth();
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1">
          <header className="flex items-center justify-between p-4 border-b">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="text-sm text-muted-foreground">
                  {user?.nomeCompleto}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={logout}
                  data-testid="button-logout"
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  Sair
                </Button>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-sm text-muted-foreground">
                  Sistema em execução
                </div>
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              </div>
            </div>
          </header>
          <main className="flex-1 overflow-auto p-6">
            <div className="max-w-7xl mx-auto">
              <Switch>
                <Route path="/">{() => <ProtectedRoute component={Dashboard} />}</Route>
                <Route path="/empresas">{() => <ProtectedRoute component={Empresas} />}</Route>
                <Route path="/empresas/nova">{() => <ProtectedRoute component={EmpresaForm} />}</Route>
                <Route path="/empresas/:id/editar">{() => <ProtectedRoute component={EmpresaForm} />}</Route>
                <Route path="/xmls">{() => <ProtectedRoute component={Xmls} />}</Route>
                <Route path="/logs">{() => <ProtectedRoute component={Logs} />}</Route>
                <Route path="/configuracoes">{() => <ProtectedRoute component={Configuracoes} />}</Route>
                <Route component={NotFound} />
              </Switch>
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/login">{() => <PublicRoute component={Login} />}</Route>
      <Route path="/register">{() => <PublicRoute component={Register} />}</Route>
      <Route path="/auth/confirm" component={AuthConfirm} />
      <Route>{() => <AuthenticatedLayout />}</Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <Router />
          <Toaster />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
