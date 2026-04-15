/**
 * controllers/members.controller.ts — Phase 3 Étape 3 : Gestion des rôles
 * 
 * Hiérarchie : creator > admin > moderator > member
 * Règles :
 *   - Creator peut tout faire (promouvoir admin, rétrograder, kick, mute)
 *   - Admin peut promouvoir/rétrograder moderator et member, kick, mute
 *   - Moderator peut kick et mute les members uniquement
 *   - On ne peut pas agir sur quelqu'un de rang égal ou supérieur
 */
import type { Request, Response } from 'express';
import { groupRepository } from '../repositories/group.repository';

const ROLE_HIERARCHY: Record<string, number> = {
  creator: 4,
  admin: 3,
  moderator: 2,
  member: 1,
};

function canActOn(actorRole: string, targetRole: string): boolean {
  return (ROLE_HIERARCHY[actorRole] || 0) > (ROLE_HIERARCHY[targetRole] || 0);
}

function canPromoteTo(actorRole: string, newRole: string): boolean {
  // On ne peut promouvoir qu'à un rang strictement inférieur au sien
  return (ROLE_HIERARCHY[actorRole] || 0) > (ROLE_HIERARCHY[newRole] || 0);
}

export const membersController = {

  /** PATCH /api/groups/:id/members/:userId — Changer le rôle d'un membre */
  async updateRole(req: Request, res: Response): Promise<void> {
    try {
      const { id: groupId, userId: targetUserId } = req.params;
      const { role: newRole } = req.body;
      const actorId = req.user!.userId;

      // Validation du rôle demandé
      if (!['admin', 'moderator', 'member'].includes(newRole)) {
        res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Rôle invalide. Valeurs possibles : admin, moderator, member' });
        return;
      }

      // On ne peut pas se modifier soi-même
      if (actorId === targetUserId) {
        res.status(400).json({ error: 'INVALID_ACTION', message: 'Vous ne pouvez pas modifier votre propre rôle' });
        return;
      }

      // Vérifier les memberships
      const actorMembership = await groupRepository.getMembership(groupId, actorId);
      if (!actorMembership) {
        res.status(403).json({ error: 'FORBIDDEN', message: 'Vous n\'êtes pas membre de ce salon' });
        return;
      }

      const targetMembership = await groupRepository.getMembership(groupId, targetUserId);
      if (!targetMembership) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Cet utilisateur n\'est pas membre du salon' });
        return;
      }

      // Vérifier la hiérarchie
      if (!canActOn(actorMembership.role, targetMembership.role)) {
        res.status(403).json({ error: 'FORBIDDEN', message: 'Vous ne pouvez pas modifier le rôle d\'un membre de rang égal ou supérieur' });
        return;
      }

      if (!canPromoteTo(actorMembership.role, newRole)) {
        res.status(403).json({ error: 'FORBIDDEN', message: 'Vous ne pouvez pas promouvoir à un rang égal ou supérieur au vôtre' });
        return;
      }

      // Le rôle 'creator' ne peut pas être attribué manuellement
      if (newRole === 'creator') {
        res.status(400).json({ error: 'INVALID_ACTION', message: 'Le rôle créateur ne peut pas être attribué' });
        return;
      }

      await groupRepository.updateMemberRole(groupId, targetUserId, newRole);

      res.json({
        message: `Rôle mis à jour`,
        member: { user_id: targetUserId, role: newRole },
      });
    } catch (error: any) {
      console.error('❌ updateRole:', error);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Erreur serveur' });
    }
  },

  /** POST /api/groups/:id/members/:userId/kick — Expulser un membre */
  async kick(req: Request, res: Response): Promise<void> {
    try {
      const { id: groupId, userId: targetUserId } = req.params;
      const actorId = req.user!.userId;

      if (actorId === targetUserId) {
        res.status(400).json({ error: 'INVALID_ACTION', message: 'Utilisez la route /leave pour quitter un salon' });
        return;
      }

      const actorMembership = await groupRepository.getMembership(groupId, actorId);
      if (!actorMembership || !['creator', 'admin', 'moderator'].includes(actorMembership.role)) {
        res.status(403).json({ error: 'FORBIDDEN', message: 'Seuls les modérateurs et admins peuvent expulser' });
        return;
      }

      const targetMembership = await groupRepository.getMembership(groupId, targetUserId);
      if (!targetMembership) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Membre introuvable' });
        return;
      }

      if (!canActOn(actorMembership.role, targetMembership.role)) {
        res.status(403).json({ error: 'FORBIDDEN', message: 'Vous ne pouvez pas expulser un membre de rang égal ou supérieur' });
        return;
      }

      await groupRepository.removeMember(groupId, targetUserId);
      await groupRepository.decrementMemberCount(groupId);

      res.json({ message: 'Membre expulsé' });
    } catch (error: any) {
      console.error('❌ kick:', error);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Erreur serveur' });
    }
  },

  /** POST /api/groups/:id/members/:userId/mute — Mute un membre dans le salon */
  async muteInGroup(req: Request, res: Response): Promise<void> {
    try {
      const { id: groupId, userId: targetUserId } = req.params;
      const actorId = req.user!.userId;

      const actorMembership = await groupRepository.getMembership(groupId, actorId);
      if (!actorMembership || !['creator', 'admin', 'moderator'].includes(actorMembership.role)) {
        res.status(403).json({ error: 'FORBIDDEN', message: 'Seuls les modérateurs et admins peuvent mute' });
        return;
      }

      const targetMembership = await groupRepository.getMembership(groupId, targetUserId);
      if (!targetMembership) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Membre introuvable' });
        return;
      }

      if (!canActOn(actorMembership.role, targetMembership.role)) {
        res.status(403).json({ error: 'FORBIDDEN', message: 'Vous ne pouvez pas mute un membre de rang égal ou supérieur' });
        return;
      }

      // Toggle mute
      const isMuted = targetMembership.is_muted;
      await groupRepository.setMemberMuted(groupId, targetUserId, !isMuted);

      res.json({
        message: isMuted ? 'Membre démute' : 'Membre muté',
        is_muted: !isMuted,
      });
    } catch (error: any) {
      console.error('❌ muteInGroup:', error);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Erreur serveur' });
    }
  },
};
