/**
 * Utilitários para trabalhar com timezone do Brasil
 * 
 * IMPORTANTE: O banco armazena TUDO em UTC (timestamptz)
 * Este módulo fornece helpers para exibir em horário do Brasil (America/Sao_Paulo)
 */

/**
 * Formata uma data UTC para exibição em horário do Brasil
 * @param date - Data em UTC (instância de Date)
 * @returns String formatada em horário do Brasil (ex: "14/11/2025, 18:30:00")
 */
export function formatarDataBrasil(date: Date | string | null | undefined): string {
  if (!date) return 'N/A';
  
  const d = typeof date === 'string' ? new Date(date) : date;
  
  return d.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'medium',
  });
}

/**
 * Formata uma data UTC para exibição COMPLETA em horário do Brasil
 * @param date - Data em UTC (instância de Date)
 * @returns String formatada (ex: "14 de novembro de 2025, 18:30:00")
 */
export function formatarDataBrasilCompleta(date: Date | string | null | undefined): string {
  if (!date) return 'N/A';
  
  const d = typeof date === 'string' ? new Date(date) : date;
  
  return d.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'long',
    timeStyle: 'medium',
  });
}

/**
 * Formata uma data UTC para exibição apenas da HORA em horário do Brasil
 * @param date - Data em UTC (instância de Date)
 * @returns String formatada (ex: "18:30:00")
 */
export function formatarHoraBrasil(date: Date | string | null | undefined): string {
  if (!date) return 'N/A';
  
  const d = typeof date === 'string' ? new Date(date) : date;
  
  return d.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    timeStyle: 'medium',
  });
}

/**
 * Calcula diferença em minutos entre agora (UTC) e uma data futura (UTC)
 * Útil para calcular "tempo restante" em bloqueios
 * 
 * @param futureDate - Data futura em UTC
 * @returns Minutos restantes (arredondado para cima), ou 0 se já passou
 */
export function calcularMinutosRestantes(futureDate: Date | string | null | undefined): number {
  if (!futureDate) return 0;
  
  const future = typeof futureDate === 'string' ? new Date(futureDate) : futureDate;
  const now = new Date();
  
  const diffMs = future.getTime() - now.getTime();
  if (diffMs <= 0) return 0;
  
  return Math.ceil(diffMs / 1000 / 60);
}

/**
 * Verifica se uma data bloqueio ainda está ativa
 * @param bloqueadoAte - Data limite do bloqueio (UTC)
 * @returns true se ainda bloqueado, false se já desbloqueado
 */
export function estaBloqueado(bloqueadoAte: Date | string | null | undefined): boolean {
  if (!bloqueadoAte) return false;
  
  const limite = typeof bloqueadoAte === 'string' ? new Date(bloqueadoAte) : bloqueadoAte;
  return new Date() < limite;
}

/**
 * Cria um timestamp UTC para bloqueio (agora + minutos)
 * @param minutos - Quantos minutos para frente (ex: 61 para bloqueio SEFAZ)
 * @returns Date em UTC
 */
export function criarBloqueio(minutos: number): Date {
  return new Date(Date.now() + minutos * 60 * 1000);
}
