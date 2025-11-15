/**
 * Sistema de Logs com suporte a arquivo e console
 * Conforme especificação do sistema (logs/app.log)
 */

import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { config } from "./config";

export type LogLevel = "info" | "warning" | "error" | "debug";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  details?: any;
  userId?: string;
  empresaId?: string;
  sincronizacaoId?: string;
}

class Logger {
  private logPath: string;
  private maxLogFiles: number;
  private currentLogFile: string | null = null;

  constructor() {
    this.logPath = config.storage.logPath;
    this.maxLogFiles = config.storage.maxLogFiles;
    this.initializeLogDirectory();
  }

  /**
   * Inicializa diretório de logs
   */
  private initializeLogDirectory(): void {
    try {
      if (!fsSync.existsSync(this.logPath)) {
        fsSync.mkdirSync(this.logPath, { recursive: true });
      }
      this.currentLogFile = this.getCurrentLogFile();
    } catch (error) {
      console.error("Erro ao inicializar diretório de logs:", error);
    }
  }

  /**
   * Retorna nome do arquivo de log do dia atual
   */
  private getCurrentLogFile(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return path.join(this.logPath, `app-${year}-${month}-${day}.log`);
  }

  /**
   * Formata entrada de log para arquivo
   */
  private formatLogEntry(entry: LogEntry): string {
    const parts = [
      `[${entry.timestamp}]`,
      `[${entry.level.toUpperCase()}]`,
      entry.message,
    ];

    if (entry.userId) {
      parts.push(`userId=${entry.userId}`);
    }

    if (entry.empresaId) {
      parts.push(`empresaId=${entry.empresaId}`);
    }

    if (entry.sincronizacaoId) {
      parts.push(`sincronizacaoId=${entry.sincronizacaoId}`);
    }

    if (entry.details) {
      parts.push(`details=${JSON.stringify(entry.details)}`);
    }

    return parts.join(" ");
  }

  /**
   * Escreve log no arquivo
   */
  private async writeToFile(entry: LogEntry): Promise<void> {
    try {
      const logFile = this.getCurrentLogFile();
      
      // Se mudou o dia, atualiza arquivo atual
      if (logFile !== this.currentLogFile) {
        this.currentLogFile = logFile;
        await this.rotateLogFiles();
      }

      const line = this.formatLogEntry(entry) + "\n";
      await fs.appendFile(logFile, line, "utf-8");
    } catch (error) {
      console.error("Erro ao escrever log em arquivo:", error);
    }
  }

  /**
   * Rotação de logs: mantém apenas os últimos N arquivos
   */
  private async rotateLogFiles(): Promise<void> {
    try {
      const files = await fs.readdir(this.logPath);
      const logFiles = files
        .filter((f) => f.startsWith("app-") && f.endsWith(".log"))
        .sort()
        .reverse(); // Mais recentes primeiro

      // Remove arquivos antigos
      if (logFiles.length > this.maxLogFiles) {
        const toDelete = logFiles.slice(this.maxLogFiles);
        for (const file of toDelete) {
          await fs.unlink(path.join(this.logPath, file));
        }
      }
    } catch (error) {
      console.error("Erro na rotação de logs:", error);
    }
  }

  /**
   * Loga mensagem (console + arquivo)
   */
  async log(
    level: LogLevel,
    message: string,
    details?: any,
    metadata?: {
      userId?: string;
      empresaId?: string;
      sincronizacaoId?: string;
    }
  ): Promise<void> {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      details,
      ...metadata,
    };

    // Console (colorido)
    const colors = {
      info: "\x1b[36m",    // Cyan
      warning: "\x1b[33m", // Yellow
      error: "\x1b[31m",   // Red
      debug: "\x1b[90m",   // Gray
    };
    const reset = "\x1b[0m";
    
    const consoleMsg = `${colors[level]}[${level.toUpperCase()}]${reset} ${message}`;
    
    if (level === "error") {
      console.error(consoleMsg, details ? details : "");
    } else if (level === "warning") {
      console.warn(consoleMsg, details ? details : "");
    } else if (level === "debug" && config.nodeEnv === "development") {
      console.debug(consoleMsg, details ? details : "");
    } else {
      console.log(consoleMsg, details ? details : "");
    }

    // Arquivo (sempre)
    await this.writeToFile(entry);
  }

  /**
   * Atalhos para níveis comuns
   */
  info(message: string, details?: any, metadata?: any): Promise<void> {
    return this.log("info", message, details, metadata);
  }

  warning(message: string, details?: any, metadata?: any): Promise<void> {
    return this.log("warning", message, details, metadata);
  }

  error(message: string, details?: any, metadata?: any): Promise<void> {
    return this.log("error", message, details, metadata);
  }

  debug(message: string, details?: any, metadata?: any): Promise<void> {
    return this.log("debug", message, details, metadata);
  }

  /**
   * Retorna logs recentes do arquivo atual
   */
  async getRecentLogs(lines: number = 100): Promise<string[]> {
    try {
      const logFile = this.getCurrentLogFile();
      
      if (!fsSync.existsSync(logFile)) {
        return [];
      }

      const content = await fs.readFile(logFile, "utf-8");
      const allLines = content.split("\n").filter((line) => line.trim());
      
      return allLines.slice(-lines);
    } catch (error) {
      console.error("Erro ao ler logs recentes:", error);
      return [];
    }
  }
}

// Singleton
export const logger = new Logger();
