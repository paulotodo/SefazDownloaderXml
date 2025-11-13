import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { sefazService } from "./sefaz-service";
import multer from "multer";
import path from "path";
import fs from "fs/promises";
import cron from "node-cron";
import { z } from "zod";
import { insertEmpresaSchema, uploadCertificadoSchema } from "@shared/schema";

// Configuração do multer para upload de certificados
const certificadosDir = path.join(process.cwd(), "certificados");
fs.mkdir(certificadosDir, { recursive: true }).catch(console.error);

const upload = multer({
  storage: multer.diskStorage({
    destination: certificadosDir,
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      cb(null, `cert-${uniqueSuffix}${path.extname(file.originalname)}`);
    },
  }),
  fileFilter: (req, file, cb) => {
    if (file.originalname.endsWith(".pfx") || file.originalname.endsWith(".p12")) {
      cb(null, true);
    } else {
      cb(new Error("Apenas arquivos .pfx ou .p12 são permitidos"));
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
});

export async function registerRoutes(app: Express): Promise<Server> {
  // ========== DASHBOARD ==========
  app.get("/api/dashboard/stats", async (req, res) => {
    try {
      const empresas = await storage.getEmpresas();
      const empresasAtivas = await storage.getEmpresasAtivas();
      const xmlsHoje = await storage.getXmlsHoje();
      const sincronizacoesEmAndamento = await storage.getSincronizacoesEmAndamento();
      
      const sincronizacoes = await storage.getSincronizacoes();
      const ultimaSincronizacao = sincronizacoes.length > 0
        ? sincronizacoes[0].dataFim || sincronizacoes[0].dataInicio
        : null;

      res.json({
        totalEmpresas: empresas.length,
        empresasAtivas: empresasAtivas.length,
        xmlsHoje,
        ultimaSincronizacao,
        sincronizacoesEmAndamento: sincronizacoesEmAndamento.length,
      });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  app.get("/api/dashboard/recent-xmls", async (req, res) => {
    try {
      const xmls = await storage.getXmlsRecentes(5);
      const empresas = await storage.getEmpresas();
      const empresasMap = new Map(empresas.map((e) => [e.id, e]));

      const result = xmls.map((xml) => {
        const empresa = empresasMap.get(xml.empresaId);
        return {
          id: xml.id,
          empresaCnpj: empresa?.cnpj || "",
          empresaNome: empresa?.razaoSocial || "",
          numeroNF: xml.numeroNF,
          dataEmissao: xml.dataEmissao,
          createdAt: xml.createdAt,
        };
      });

      res.json(result);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  app.get("/api/dashboard/recent-logs", async (req, res) => {
    try {
      const logs = await storage.getLogsRecentes(5);
      const empresas = await storage.getEmpresas();
      const empresasMap = new Map(empresas.map((e) => [e.id, e]));

      const result = logs.map((log) => ({
        ...log,
        empresaNome: log.empresaId ? empresasMap.get(log.empresaId)?.razaoSocial : undefined,
      }));

      res.json(result);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  // ========== EMPRESAS ==========
  app.get("/api/empresas", async (req, res) => {
    try {
      const empresas = await storage.getEmpresas();
      res.json(empresas);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  app.get("/api/empresas/:id", async (req, res) => {
    try {
      const empresa = await storage.getEmpresa(req.params.id);
      if (!empresa) {
        return res.status(404).json({ error: "Empresa não encontrada" });
      }
      res.json(empresa);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  app.post("/api/empresas", upload.single("certificado"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "Certificado digital é obrigatório" });
      }

      const data = uploadCertificadoSchema.parse({
        cnpj: req.body.cnpj,
        razaoSocial: req.body.razaoSocial,
        uf: req.body.uf,
        ambiente: req.body.ambiente,
        certificadoSenha: req.body.certificadoSenha,
      });

      // Verifica se CNPJ já existe
      const existing = await storage.getEmpresaByCNPJ(data.cnpj);
      if (existing) {
        // Remove arquivo enviado
        await fs.unlink(req.file.path);
        return res.status(400).json({ error: "CNPJ já cadastrado" });
      }

      const empresa = await storage.createEmpresa({
        ...data,
        certificadoPath: req.file.path,
        ativo: true,
      });

      await storage.createLog({
        empresaId: empresa.id,
        sincronizacaoId: null,
        nivel: "info",
        mensagem: `Empresa cadastrada: ${empresa.razaoSocial}`,
        detalhes: JSON.stringify({ cnpj: empresa.cnpj, uf: empresa.uf }),
      });

      res.status(201).json(empresa);
    } catch (error) {
      // Remove arquivo em caso de erro
      if (req.file) {
        await fs.unlink(req.file.path).catch(console.error);
      }

      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: String(error) });
    }
  });

  app.patch("/api/empresas/:id", async (req, res) => {
    try {
      const updates = req.body;
      const empresa = await storage.updateEmpresa(req.params.id, updates);
      
      if (!empresa) {
        return res.status(404).json({ error: "Empresa não encontrada" });
      }

      res.json(empresa);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  app.delete("/api/empresas/:id", async (req, res) => {
    try {
      const empresa = await storage.getEmpresa(req.params.id);
      if (!empresa) {
        return res.status(404).json({ error: "Empresa não encontrada" });
      }

      // Remove certificado
      try {
        await fs.unlink(empresa.certificadoPath);
      } catch (error) {
        console.error("Erro ao remover certificado:", error);
      }

      const deleted = await storage.deleteEmpresa(req.params.id);
      
      if (deleted) {
        await storage.createLog({
          empresaId: null,
          sincronizacaoId: null,
          nivel: "info",
          mensagem: `Empresa removida: ${empresa.razaoSocial}`,
          detalhes: JSON.stringify({ cnpj: empresa.cnpj }),
        });
      }

      res.json({ success: deleted });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  app.post("/api/empresas/:id/sincronizar", async (req, res) => {
    try {
      const empresa = await storage.getEmpresa(req.params.id);
      if (!empresa) {
        return res.status(404).json({ error: "Empresa não encontrada" });
      }

      // Executa sincronização de forma assíncrona
      sefazService.sincronizarEmpresa(empresa).catch(console.error);

      res.json({ message: "Sincronização iniciada" });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  // ========== XMLs ==========
  app.get("/api/xmls", async (req, res) => {
    try {
      const xmls = await storage.getXmls();
      const empresas = await storage.getEmpresas();
      const empresasMap = new Map(empresas.map((e) => [e.id, e]));

      const result = xmls.map((xml) => {
        const empresa = empresasMap.get(xml.empresaId);
        return {
          ...xml,
          empresaCnpj: empresa?.cnpj || "",
          empresaNome: empresa?.razaoSocial || "",
        };
      });

      res.json(result);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  app.get("/api/xmls/:id/download", async (req, res) => {
    try {
      const xml = await storage.getXml(req.params.id);
      if (!xml) {
        return res.status(404).json({ error: "XML não encontrado" });
      }

      res.download(xml.caminhoArquivo);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  // ========== LOGS ==========
  app.get("/api/logs", async (req, res) => {
    try {
      const logs = await storage.getLogs();
      const empresas = await storage.getEmpresas();
      const empresasMap = new Map(empresas.map((e) => [e.id, e]));

      const result = logs.map((log) => ({
        ...log,
        empresaNome: log.empresaId ? empresasMap.get(log.empresaId)?.razaoSocial : undefined,
      }));

      res.json(result);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  // ========== SINCRONIZAÇÕES ==========
  app.get("/api/sincronizacoes", async (req, res) => {
    try {
      const sincronizacoes = await storage.getSincronizacoes();
      res.json(sincronizacoes);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  app.post("/api/sincronizacoes/executar", async (req, res) => {
    try {
      // Executa sincronização de todas as empresas de forma assíncrona
      sefazService.sincronizarTodasEmpresas().catch(console.error);
      
      res.json({ message: "Sincronização de todas as empresas iniciada" });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  // ========== AGENDAMENTO AUTOMÁTICO ==========
  // Executa a cada 1 hora
  cron.schedule("0 * * * *", async () => {
    console.log("Executando sincronização agendada...");
    try {
      await sefazService.sincronizarTodasEmpresas();
    } catch (error) {
      console.error("Erro na sincronização agendada:", error);
    }
  });

  console.log("✓ Agendamento configurado: sincronização a cada 1 hora");

  const httpServer = createServer(app);
  return httpServer;
}
