/**
 * middleware/tierGuard.middleware.ts — Vérifie le tier de l'utilisateur
 * 
 * Utilisation :
 *   router.post('/api/upload/file', requireAuth, requireTier('premium'), controller.upload)
 *   router.post('/api/groups', requireAuth, requireTier('registered', 'premium'), controller.create)
 * 
 * Le tier vient du JWT (req.user.tier), pas de la BDD à chaque requête.
 * C'est instantané, pas de requête supplémentaire.
 */

import type { Request, Response, NextFunction } from 'express';
import type { UserTier } from '../../../shared/types/user.types';

/**
 * Crée un middleware qui autorise uniquement les tiers spécifiés
 * @param allowedTiers - Liste des tiers autorisés ('guest', 'registered', 'premium')
 */
export function requireTier(...allowedTiers: UserTier[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Authentification requise',
      });
      return;
    }

    const userTier = req.user.tier as UserTier;

    if (!allowedTiers.includes(userTier)) {
      res.status(403).json({
        error: 'FORBIDDEN',
        message: `Cette fonctionnalité nécessite un compte ${allowedTiers.join(' ou ')}`,
        required_tier: allowedTiers,
        current_tier: userTier,
      });
      return;
    }

    next();
  };
}
