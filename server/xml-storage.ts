import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { supabaseAdmin } from "./supabase";

/**
 * Serviço de Armazenamento Híbrido de XMLs
 * 
 * Suporta dois tipos de storage:
 * - "local": Filesystem local (./xmls/) - Rápido mas não persistente no Replit
 * - "supabase": Supabase Storage - Persistente e escalável
 * 
 * Conforme escolha do usuário: "Implementar ambos e deixar configurável"
 */
export class XmlStorageService {
  private localBasePath: string;
  private supabaseBucket: string;

  constructor() {
    this.localBasePath = process.env.XML_DEST_PATH || (process.env.NODE_ENV === "production" ? "/app/xmls" : "./xmls");
    this.supabaseBucket = "xmls"; // Nome do bucket no Supabase Storage
  }

  /**
   * Salva um XML no storage escolhido (local ou Supabase)
   * 
   * @param tipoArmazenamento - "local" ou "supabase"
   * @param relativePath - Caminho relativo do arquivo (ex: "CNPJ/2025/11/12345.xml")
   * @param conteudo - Conteúdo XML em string
   * @returns Caminho completo do arquivo salvo
   */
  async saveXml(
    tipoArmazenamento: string,
    relativePath: string,
    conteudo: string
  ): Promise<string> {
    if (tipoArmazenamento === "supabase") {
      return await this.saveToSupabase(relativePath, conteudo);
    } else {
      return await this.saveToLocal(relativePath, conteudo);
    }
  }

  /**
   * Recupera um XML do storage escolhido
   * 
   * @param tipoArmazenamento - "local" ou "supabase"
   * @param relativePath - Caminho relativo do arquivo
   * @returns Conteúdo XML em string
   */
  async getXml(tipoArmazenamento: string, relativePath: string): Promise<string> {
    if (tipoArmazenamento === "supabase") {
      return await this.getFromSupabase(relativePath);
    } else {
      return await this.getFromLocal(relativePath);
    }
  }

  /**
   * Verifica se um XML existe no storage
   * 
   * @param tipoArmazenamento - "local" ou "supabase"
   * @param relativePath - Caminho relativo do arquivo
   * @returns true se existir, false caso contrário
   */
  async existsXml(tipoArmazenamento: string, relativePath: string): Promise<boolean> {
    if (tipoArmazenamento === "supabase") {
      return await this.existsInSupabase(relativePath);
    } else {
      return await this.existsInLocal(relativePath);
    }
  }

  /**
   * Deleta um XML do storage
   * 
   * @param tipoArmazenamento - "local" ou "supabase"
   * @param relativePath - Caminho relativo do arquivo
   */
  async deleteXml(tipoArmazenamento: string, relativePath: string): Promise<void> {
    if (tipoArmazenamento === "supabase") {
      await this.deleteFromSupabase(relativePath);
    } else {
      await this.deleteFromLocal(relativePath);
    }
  }

  // ========== MÉTODOS PRIVADOS - FILESYSTEM LOCAL ==========

  private async saveToLocal(relativePath: string, conteudo: string): Promise<string> {
    const fullPath = path.join(this.localBasePath, relativePath);
    const dir = path.dirname(fullPath);

    // Cria diretórios se não existirem
    await fs.mkdir(dir, { recursive: true });

    // Salva arquivo
    await fs.writeFile(fullPath, conteudo, "utf-8");

    // Retorna caminho relativo normalizado para consistência (ex: "xmls/NFe/12345678000100/2025/11/12345.xml")
    return path.join(this.localBasePath, relativePath);
  }

  private async getFromLocal(relativePath: string): Promise<string> {
    const fullPath = path.join(this.localBasePath, relativePath);
    return await fs.readFile(fullPath, "utf-8");
  }

  private async existsInLocal(relativePath: string): Promise<boolean> {
    const fullPath = path.join(this.localBasePath, relativePath);
    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  private async deleteFromLocal(relativePath: string): Promise<void> {
    const fullPath = path.join(this.localBasePath, relativePath);
    await fs.unlink(fullPath);
  }

  // ========== MÉTODOS PRIVADOS - SUPABASE STORAGE ==========

  private async saveToSupabase(relativePath: string, conteudo: string): Promise<string> {
    const { data, error } = await supabaseAdmin.storage
      .from(this.supabaseBucket)
      .upload(relativePath, conteudo, {
        contentType: "application/xml",
        upsert: true, // Sobrescreve se já existir
      });

    if (error) {
      throw new Error(`Erro ao salvar XML no Supabase Storage: ${error.message}`);
    }

    // Retorna o caminho completo no Supabase
    return `supabase://${this.supabaseBucket}/${data.path}`;
  }

  private async getFromSupabase(relativePath: string): Promise<string> {
    const { data, error } = await supabaseAdmin.storage
      .from(this.supabaseBucket)
      .download(relativePath);

    if (error) {
      throw new Error(`Erro ao recuperar XML do Supabase Storage: ${error.message}`);
    }

    // Converte Blob para string
    return await data.text();
  }

  private async existsInSupabase(relativePath: string): Promise<boolean> {
    const { data, error } = await supabaseAdmin.storage
      .from(this.supabaseBucket)
      .list(path.dirname(relativePath), {
        search: path.basename(relativePath),
      });

    if (error) {
      // Se o bucket não existir, retorna false
      if (error.message.includes("not found")) return false;
      throw new Error(`Erro ao verificar XML no Supabase Storage: ${error.message}`);
    }

    return data && data.length > 0;
  }

  private async deleteFromSupabase(relativePath: string): Promise<void> {
    const { error } = await supabaseAdmin.storage
      .from(this.supabaseBucket)
      .remove([relativePath]);

    if (error) {
      throw new Error(`Erro ao deletar XML do Supabase Storage: ${error.message}`);
    }
  }

  /**
   * Cria o bucket de XMLs no Supabase Storage (se não existir)
   * Deve ser chamado uma vez na inicialização do servidor
   */
  async ensureBucketExists(): Promise<void> {
    const { data: buckets, error: listError } = await supabaseAdmin.storage.listBuckets();

    if (listError) {
      console.error("⚠️  Erro ao listar buckets do Supabase Storage:", listError.message);
      return;
    }

    const bucketExists = buckets?.some((bucket) => bucket.name === this.supabaseBucket);

    if (!bucketExists) {
      const { error: createError } = await supabaseAdmin.storage.createBucket(this.supabaseBucket, {
        public: false, // Privado - requer autenticação
        fileSizeLimit: 10 * 1024 * 1024, // 10MB por arquivo
      });

      if (createError) {
        console.error("⚠️  Erro ao criar bucket de XMLs no Supabase Storage:", createError.message);
      } else {
        console.log("✅ Bucket de XMLs criado no Supabase Storage");
      }
    }
  }
}

// Exporta instância única (singleton)
export const xmlStorageService = new XmlStorageService();
