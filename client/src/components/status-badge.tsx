import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type SyncStatus = "ativo" | "sincronizando" | "erro" | "pausado" | "inativo";

interface StatusBadgeProps {
  status: SyncStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const configs = {
    ativo: {
      label: "Ativo",
      dotColor: "bg-green-500",
      variant: "default" as const,
    },
    sincronizando: {
      label: "Sincronizando",
      dotColor: "bg-blue-500 animate-pulse",
      variant: "default" as const,
    },
    erro: {
      label: "Erro",
      dotColor: "bg-red-500",
      variant: "destructive" as const,
    },
    pausado: {
      label: "Pausado",
      dotColor: "bg-amber-500",
      variant: "secondary" as const,
    },
    inativo: {
      label: "Inativo",
      dotColor: "bg-gray-400",
      variant: "secondary" as const,
    },
  };

  const config = configs[status];

  return (
    <Badge variant={config.variant} className={cn("gap-1.5", className)} data-testid={`badge-status-${status}`}>
      <span className={cn("w-2 h-2 rounded-full", config.dotColor)} />
      {config.label}
    </Badge>
  );
}
