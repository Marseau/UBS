/**
 * BERTOPIC RESULTS ROUTES
 *
 * Serve os resultados da análise BERTopic (Python) para o dashboard.
 * Os resultados são gerados pelo script: scripts/market-demand-discovery.py
 *
 * Endpoints:
 * - GET /api/bertopic/results - Retorna os resultados mais recentes
 * - GET /api/bertopic/results/:filename - Retorna um arquivo específico
 * - GET /api/bertopic/list - Lista todos os arquivos de resultado disponíveis
 */

import express from 'express';
import fs from 'fs';
import path from 'path';

const router = express.Router();

const OUTPUT_DIR = path.join(process.cwd(), 'scripts', 'output');

/**
 * GET /api/bertopic/results
 * Retorna os resultados mais recentes da análise BERTopic
 */
router.get('/results', async (_req, res) => {
  try {
    // Verificar se o diretório existe
    if (!fs.existsSync(OUTPUT_DIR)) {
      return res.status(404).json({
        success: false,
        error: 'Nenhuma análise BERTopic encontrada',
        message: 'Execute primeiro: python scripts/market-demand-discovery.py',
      });
    }

    // Listar arquivos JSON de resultado
    const files = fs.readdirSync(OUTPUT_DIR)
      .filter(f => f.startsWith('market_demands_') && f.endsWith('.json'))
      .sort()
      .reverse(); // Mais recente primeiro

    if (files.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Nenhum resultado encontrado',
        message: 'Execute primeiro: python scripts/market-demand-discovery.py',
      });
    }

    // Ler o arquivo mais recente
    const latestFile = files[0] as string;
    const filePath = path.join(OUTPUT_DIR, latestFile);
    const content = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content);

    return res.json({
      success: true,
      filename: latestFile,
      ...data,
    });
  } catch (error) {
    console.error('[BERTOPIC] Erro ao ler resultados:', error);
    return res.status(500).json({
      error: 'Erro ao ler resultados',
      message: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

/**
 * GET /api/bertopic/results/:filename
 * Retorna um arquivo específico de resultado
 */
router.get('/results/:filename', async (req, res) => {
  try {
    const { filename } = req.params;

    // Sanitizar filename para evitar path traversal
    const sanitizedFilename = path.basename(filename);
    const filePath = path.join(OUTPUT_DIR, sanitizedFilename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        error: 'Arquivo não encontrado',
      });
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content);

    return res.json({
      success: true,
      filename: sanitizedFilename,
      ...data,
    });
  } catch (error) {
    console.error('[BERTOPIC] Erro ao ler arquivo:', error);
    return res.status(500).json({
      error: 'Erro ao ler arquivo',
      message: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

/**
 * GET /api/bertopic/list
 * Lista todos os arquivos de resultado disponíveis
 */
router.get('/list', async (_req, res) => {
  try {
    if (!fs.existsSync(OUTPUT_DIR)) {
      return res.json({
        success: true,
        files: [],
        message: 'Nenhuma análise disponível',
      });
    }

    const files = fs.readdirSync(OUTPUT_DIR)
      .filter(f => f.startsWith('market_demands_') && f.endsWith('.json'))
      .map(f => {
        const filePath = path.join(OUTPUT_DIR, f);
        const stats = fs.statSync(filePath);
        return {
          filename: f,
          created_at: stats.mtime.toISOString(),
          size_bytes: stats.size,
        };
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return res.json({
      success: true,
      count: files.length,
      files,
    });
  } catch (error) {
    console.error('[BERTOPIC] Erro ao listar arquivos:', error);
    return res.status(500).json({
      error: 'Erro ao listar arquivos',
      message: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

export default router;
