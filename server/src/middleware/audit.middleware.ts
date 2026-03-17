/**
 * middleware/audit.middleware.ts — Log LCEN
 * 
 * LCEN oblige à conserver les données de connexion pendant 1 an.
 * Ce middleware log chaque requête dans la table audit_logs.
 * 
 * On ne log pas TOUT (ça serait trop lourd), seulement les actions importantes :
 * login, register, message_send, etc. Il s'utilise comme middleware sur des routes spécifiques.
 */

import type { Request, Response, NextFunction } from 'express';
import { db } from '../config/database';
import { getIpFromRequest } from '../utils/ip';

/**
 * Crée un middleware de log pour une action spécifique
 * Utilisation : router.post('/api/auth/login', audit('login'), controller.login)
 */
export function audit(action: string) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    // On log APRÈS que le handler ait répondu (en arrière-plan)
    // Pour ne pas ralentir la réponse
    const ip = getIpFromRequest(req);
    const userAgent = req.headers['user-agent'] || null;
    const userId = req.user?.userId || null;

    // Fire and forget — on n'attend pas que le log soit écrit
    db('audit_logs')
      .insert({
        user_id: userId,
        action,
        ip_address: ip,
        user_agent: userAgent,
        metadata: JSON.stringify({
          method: req.method,
          path: req.path,
        }),
      })
      .catch((err) => {
        console.error('⚠️ Erreur audit log:', err.message);
        // On ne bloque pas la requête si le log échoue
      });

    next();
  };
}

/**
 * Log un événement audit directement (hors middleware)
 * Utilisé par les services pour logger des actions spécifiques
 */
export async function logAudit(
  action: string,
  ipAddress: string,
  userId?: string | null,
  metadata?: Record<string, unknown>,
  userAgent?: string | null,
): Promise<void> {
  try {
    await db('audit_logs').insert({
      user_id: userId || null,
      action,
      ip_address: ipAddress,
      user_agent: userAgent || null,
      metadata: metadata ? JSON.stringify(metadata) : null,
    });
  } catch (err: any) {
    console.error('⚠️ Erreur audit log:', err.message);
  }
}
