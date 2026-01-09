/**
 * Client Authentication Middleware
 * Middleware para autenticar clientes do portal AIC via Supabase Auth
 */

import { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'https://qsdfyffuonywmtnlycri.supabase.co';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Extend Express Request to include client user info
export interface ClientRequest extends Request {
  clientUser?: {
    id: string;
    email: string;
    name?: string;
    phone?: string;
  };
}

/**
 * Middleware para autenticar clientes via Supabase JWT
 * Extrai o user_id do token e adiciona ao request
 */
export async function authenticateClient(
  req: ClientRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        message: 'Token de autenticacao nao fornecido'
      });
      return;
    }

    const token = authHeader.replace('Bearer ', '');

    // Validar token com Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      console.error('[ClientAuth] Token invalido:', error?.message);
      res.status(401).json({
        success: false,
        message: 'Token invalido ou expirado'
      });
      return;
    }

    // Adicionar informacoes do usuario ao request
    req.clientUser = {
      id: user.id,
      email: user.email || '',
      name: user.user_metadata?.full_name || user.user_metadata?.name,
      phone: user.user_metadata?.phone
    };

    next();
  } catch (error) {
    console.error('[ClientAuth] Erro ao autenticar:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno de autenticacao'
    });
  }
}

/**
 * Middleware opcional - permite requisicoes sem autenticacao
 * mas adiciona user info se token estiver presente
 */
export async function optionalClientAuth(
  req: ClientRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.replace('Bearer ', '');

    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (!error && user) {
      req.clientUser = {
        id: user.id,
        email: user.email || '',
        name: user.user_metadata?.full_name || user.user_metadata?.name,
        phone: user.user_metadata?.phone
      };
    }

    next();
  } catch (error) {
    // Em caso de erro, apenas continua sem autenticacao
    next();
  }
}

export default { authenticateClient, optionalClientAuth };
