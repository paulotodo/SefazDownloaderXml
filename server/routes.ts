import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { sefazService } from "./sefaz-service";
import { authenticateUser } from "./auth-middleware";
import authRoutes from "./auth-routes";
import multer from "multer";
import path from "path";
import fs from "fs/promises";
import cron from "node-cron";
import { z } from "zod";
import { insertEmpresaSchema, uploadCertificadoSchema } from "@shared/schema";
import { xmlStorageService } from "./xml-storage";

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
  // ========== HEALTH CHECK ========== (público)
  app.get("/api/health", (req, res) => {
    res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // ========== AUTENTICAÇÃO ==========
  app.use("/api/auth", authRoutes);

  // ========== DASHBOARD ========== (protegida)
  app.get("/api/dashboard/stats", authenticateUser, async (req, res) => {
    const userId = req.user!.id;
    try {
      const empresas = await storage.getEmpresas(userId);
      const empresasAtivas = await storage.getEmpresasAtivas(userId);
      const xmlsHoje = await storage.getXmlsHoje(userId);
      const sincronizacoesEmAndamento = await storage.getSincronizacoesEmAndamento(userId);
      
      const sincronizacoes = await storage.getSincronizacoes(userId);
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

  app.get("/api/dashboard/recent-xmls", authenticateUser, async (req, res) => {
    const userId = req.user!.id;
    try {
      const xmls = await storage.getXmlsRecentes(5, userId);
      const empresas = await storage.getEmpresas(userId);
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

  app.get("/api/dashboard/recent-logs", authenticateUser, async (req, res) => {
    const userId = req.user!.id;
    try {
      const logs = await storage.getLogsRecentes(5, userId);
      const empresas = await storage.getEmpresas(userId);
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

  // ========== EMPRESAS ========== (protegidas)
  app.get("/api/empresas", authenticateUser, async (req, res) => {
    const userId = req.user!.id;
    try {
      const empresas = await storage.getEmpresas(userId);
      res.json(empresas);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  app.get("/api/empresas/:id", authenticateUser, async (req, res) => {
    const userId = req.user!.id;
    try {
      const empresa = await storage.getEmpresa(req.params.id, userId);
      if (!empresa) {
        return res.status(404).json({ error: "Empresa não encontrada" });
      }
      res.json(empresa);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  app.post("/api/empresas", authenticateUser, upload.single("certificado"), async (req, res) => {
    const userId = req.user!.id;
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

      // ===== VALIDAR CERTIFICADO E SENHA =====
      const { validateCertificate } = await import("./cert-loader");
      const validation = await validateCertificate(req.file.path, data.certificadoSenha);
      
      if (!validation.valid) {
        // Remove arquivo enviado
        await fs.unlink(req.file.path);
        
        // Retornar erro específico
        if (validation.error?.includes('Senha do certificado incorreta')) {
          return res.status(400).json({ 
            error: "Senha do certificado incorreta. Verifique a senha e tente novamente." 
          });
        } else if (validation.error?.includes('Arquivo de certificado não encontrado')) {
          return res.status(400).json({ 
            error: "Erro ao processar o arquivo do certificado. Tente fazer upload novamente." 
          });
        } else if (validation.isExpired) {
          const now = new Date();
          const notBefore = validation.notBefore || new Date();
          const notAfter = validation.notAfter || new Date();
          
          if (now < notBefore) {
            // Certificado ainda não é válido
            return res.status(400).json({ 
              error: `Certificado ainda não é válido. Será válido a partir de ${notBefore.toLocaleDateString('pt-BR')}.` 
            });
          } else {
            // Certificado expirado
            return res.status(400).json({ 
              error: `Certificado expirado em ${notAfter.toLocaleDateString('pt-BR')}. Renove seu certificado digital.` 
            });
          }
        } else {
          return res.status(400).json({ 
            error: validation.error || "Certificado inválido. Verifique o arquivo e a senha." 
          });
        }
      }

      // Avisar se certificado está próximo de expirar (menos de 30 dias)
      if (validation.daysUntilExpiry && validation.daysUntilExpiry < 30 && validation.daysUntilExpiry > 0) {
        console.warn(`⚠️ Certificado expira em ${validation.daysUntilExpiry} dias (${data.cnpj})`);
      }

      // Verifica se CNPJ já existe para este usuário
      const existing = await storage.getEmpresaByCNPJ(data.cnpj, userId);
      if (existing) {
        // Remove arquivo enviado
        await fs.unlink(req.file.path);
        return res.status(400).json({ error: "CNPJ já cadastrado" });
      }

      const empresa = await storage.createEmpresa({
        ...data,
        userId,
        certificadoPath: req.file.path,
        ativo: true,
      });

      await storage.createLog({
        userId,
        empresaId: empresa.id,
        sincronizacaoId: null,
        nivel: "info",
        mensagem: `Empresa cadastrada: ${empresa.razaoSocial}`,
        detalhes: JSON.stringify({ 
          cnpj: empresa.cnpj, 
          uf: empresa.uf,
          certificadoValido: `${validation.notBefore?.toLocaleDateString('pt-BR')} até ${validation.notAfter?.toLocaleDateString('pt-BR')}`,
          diasRestantes: validation.daysUntilExpiry
        }),
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

  app.patch("/api/empresas/:id", authenticateUser, async (req, res) => {
    const userId = req.user!.id;
    try {
      const updates = req.body;
      const empresa = await storage.updateEmpresa(req.params.id, updates, userId);
      
      if (!empresa) {
        return res.status(404).json({ error: "Empresa não encontrada" });
      }

      res.json(empresa);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  app.delete("/api/empresas/:id", authenticateUser, async (req, res) => {
    const userId = req.user!.id;
    try {
      const empresa = await storage.getEmpresa(req.params.id, userId);
      if (!empresa) {
        return res.status(404).json({ error: "Empresa não encontrada" });
      }

      // Remove certificado
      try {
        await fs.unlink(empresa.certificadoPath);
      } catch (error) {
        console.error("Erro ao remover certificado:", error);
      }

      const deleted = await storage.deleteEmpresa(req.params.id, userId);
      
      if (deleted) {
        await storage.createLog({
          userId,
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

  app.post("/api/empresas/:id/sincronizar", authenticateUser, async (req, res) => {
    const userId = req.user!.id;
    try {
      const empresa = await storage.getEmpresa(req.params.id, userId);
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

  app.post("/api/empresas/:id/reconciliar-nsu", authenticateUser, async (req, res) => {
    const userId = req.user!.id;
    try {
      const empresa = await storage.getEmpresa(req.params.id, userId);
      
      if (!empresa) {
        return res.status(404).json({ error: "Empresa não encontrada" });
      }

      // Executa reconciliação
      const resultado = await sefazService.reconciliarUltimoNSU(empresa);
      
      res.json({
        success: true,
        nsuAnterior: empresa.ultimoNSU,
        nsuAtual: resultado.nsuFinal,
        chamadas: resultado.chamadas,
        intervalo: resultado.intervalo,
      });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  app.post("/api/empresas/:id/buscar-periodo", authenticateUser, async (req, res) => {
    const userId = req.user!.id;
    try {
      const empresa = await storage.getEmpresa(req.params.id, userId);
      
      if (!empresa) {
        return res.status(404).json({ error: "Empresa não encontrada" });
      }

      // Validação com Zod (coerção automática de tipos)
      const schema = z.object({
        nsuInicial: z.string().trim().regex(/^[0-9]{1,15}$/, "NSU inicial deve conter apenas números (máx 15 dígitos)"),
        nsuFinal: z.string().trim().regex(/^[0-9]{1,15}$/, "NSU final deve conter apenas números (máx 15 dígitos)"),
        maxConsultas: z.coerce.number().int().min(1).max(20).default(20),
      });

      const validationResult = schema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Dados inválidos", 
          details: validationResult.error.errors 
        });
      }

      const { nsuInicial, nsuFinal, maxConsultas } = validationResult.data;

      // Executa busca por período (limite de 20 é garantido pela validação Zod)
      const resultado = await sefazService.buscarPorPeriodo(
        empresa,
        nsuInicial,
        nsuFinal,
        maxConsultas
      );
      
      res.json({
        success: true,
        xmlsEncontrados: resultado.xmlsEncontrados,
        consultasRealizadas: resultado.consultasRealizadas,
        nsuConsultados: resultado.nsuConsultados,
      });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });


  // ========== XMLs ========== (protegidos)
  app.get("/api/xmls", authenticateUser, async (req, res) => {
    const userId = req.user!.id;
    try {
      const xmls = await storage.getXmls(userId);
      const empresas = await storage.getEmpresas(userId);
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

  app.get("/api/xmls/:id/download", authenticateUser, async (req, res) => {
    const userId = req.user!.id;
    try {
      const xml = await storage.getXml(req.params.id, userId);
      if (!xml) {
        return res.status(404).json({ error: "XML não encontrado" });
      }

      // Busca empresa para saber o tipo de armazenamento
      const empresa = await storage.getEmpresa(xml.empresaId, userId);
      if (!empresa) {
        return res.status(404).json({ error: "Empresa não encontrada" });
      }

      // Extrai caminho relativo do caminhoArquivo
      // Suporta diferentes formatos para backward compatibility:
      // - Novo (relativo): "xmls/NFe/12345678000100/2025/11/12345.xml"
      // - Local antigo: "./xmls/NFe/12345678000100/2025/11/12345.xml"
      // - Absoluto antigo: "/home/runner/project/xmls/NFe/12345678000100/2025/11/12345.xml"
      // - Supabase: "supabase://xmls/NFe/12345678000100/2025/11/12345.xml"
      let relativePath = xml.caminhoArquivo;
      
      // Se for caminho do Supabase (com protocolo)
      if (relativePath.startsWith("supabase://xmls/")) {
        relativePath = relativePath.substring("supabase://xmls/".length);
      }
      // Se for caminho local (relativo ou absoluto)
      else {
        // Remove prefixo "./xmls/" se existir
        if (relativePath.startsWith("./xmls/")) {
          relativePath = relativePath.substring("./xmls/".length);
        }
        // Remove "xmls/" se for o início (caso já seja relativo limpo)
        else if (relativePath.startsWith("xmls/")) {
          relativePath = relativePath.substring("xmls/".length);
        }
        // Se for caminho absoluto, extrai apenas a parte após "/xmls/"
        else if (relativePath.includes("/xmls/")) {
          const idx = relativePath.lastIndexOf("/xmls/");
          relativePath = relativePath.substring(idx + "/xmls/".length);
        }
        // Se ainda for um caminho absoluto sem "/xmls/" (caso extremo), usa direto com res.download
        else if (path.isAbsolute(relativePath)) {
          // Backward compatibility: se for caminho absoluto antigo, usa res.download diretamente
          return res.download(relativePath);
        }
      }

      // Recupera XML usando storage híbrido
      const xmlContent = await xmlStorageService.getXml(empresa.tipoArmazenamento, relativePath);

      // Envia XML com headers apropriados
      const filename = path.basename(relativePath);
      res.setHeader("Content-Type", "application/xml");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(xmlContent);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  // ========== LOGS ========== (protegidos)
  app.get("/api/logs", authenticateUser, async (req, res) => {
    const userId = req.user!.id;
    try {
      const logs = await storage.getLogs(userId);
      const empresas = await storage.getEmpresas(userId);
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

  // ========== SINCRONIZAÇÕES ========== (protegidas)
  app.get("/api/sincronizacoes", authenticateUser, async (req, res) => {
    const userId = req.user!.id;
    try {
      const sincronizacoes = await storage.getSincronizacoes(userId);
      res.json(sincronizacoes);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  app.post("/api/sincronizacoes/executar", authenticateUser, async (req, res) => {
    try {
      // Executa sincronização de todas as empresas de forma assíncrona
      sefazService.sincronizarTodasEmpresas().catch(console.error);
      
      res.json({ message: "Sincronização de todas as empresas iniciada" });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  // ========== MANIFESTAÇÕES DO DESTINATÁRIO (NT 2020.001) ========== (protegidas)
  app.get("/api/manifestacoes", authenticateUser, async (req, res) => {
    const userId = req.user!.id;
    try {
      const { empresaId, status } = req.query;
      
      let manifestacoes;
      if (empresaId) {
        manifestacoes = await storage.getManifestacoesByEmpresa(empresaId as string, userId);
      } else {
        manifestacoes = await storage.getManifestacoes(userId);
      }
      
      // Filtro adicional por status se fornecido
      if (status && typeof status === "string") {
        manifestacoes = manifestacoes.filter(m => m.status === status);
      }
      
      res.json(manifestacoes);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  app.post("/api/manifestacoes/manifestar", authenticateUser, async (req, res) => {
    const userId = req.user!.id;
    try {
      const { empresaId, chaveNFe, tipoEvento, justificativa } = req.body;
      
      // Validação básica
      if (!empresaId || !chaveNFe || !tipoEvento) {
        return res.status(400).json({ 
          error: "empresaId, chaveNFe e tipoEvento são obrigatórios" 
        });
      }
      
      // Valida tipo de evento
      const tiposValidos = ["210200", "210210", "210220", "210240"];
      if (!tiposValidos.includes(tipoEvento)) {
        return res.status(400).json({ 
          error: `tipoEvento inválido. Valores aceitos: ${tiposValidos.join(", ")}` 
        });
      }
      
      // Valida justificativa obrigatória para 210240
      if (tipoEvento === "210240" && !justificativa) {
        return res.status(400).json({ 
          error: "Justificativa é obrigatória para Operação Não Realizada (210240)" 
        });
      }
      
      // Busca empresa
      const empresa = await storage.getEmpresa(empresaId, userId);
      if (!empresa) {
        return res.status(404).json({ error: "Empresa não encontrada" });
      }
      
      // Dispara manifestação via SefazService
      const manifestacao = await sefazService.manifestarEvento(
        empresa,
        chaveNFe,
        tipoEvento,
        justificativa
      );
      
      res.json({ 
        success: true, 
        manifestacao,
        message: "Manifestação enviada com sucesso" 
      });
    } catch (error) {
      console.error("Erro ao manifestar:", error);
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
