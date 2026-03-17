/**
 * controllers/groups.controller.ts — Endpoints REST pour les groupes/salons
 */

import type { Request, Response } from 'express';
import { groupRepository } from '../repositories/group.repository';
import { AppError, BadRequestError, ForbiddenError } from '../utils/errors';
import { TIER_LIMITS, VALIDATION } from '../../../shared/constants';

export const groupsController = {

  /** GET /api/groups — Liste des salons publics */
  async list(req: Request, res: Response): Promise<void> {
    try {
      const groups = await groupRepository.findPublicActive();
      res.json({ groups });
    } catch (error: any) {
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Erreur serveur' });
    }
  },

  /** GET /api/groups/:id — Détails d'un salon */
  async get(req: Request, res: Response): Promise<void> {
    try {
      const group = await groupRepository.findById(req.params.id);
      if (!group) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Salon introuvable' });
        return;
      }

      // Ajouter si l'utilisateur est membre + son rôle
      let isMember = false;
      let myRole = null;
      if (req.user) {
        isMember = await groupRepository.isMember(group.id, req.user.userId);
        if (isMember) {
          const members = await groupRepository.getMembers(group.id);
          const me = members.find((m: any) => m.id === req.user!.userId);
          myRole = me?.role || null;
        }
      }

      res.json({
        group: {
          ...group,
          is_member: isMember,
          my_role: myRole,
        },
      });
    } catch (error: any) {
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Erreur serveur' });
    }
  },

  /** POST /api/groups — Créer un salon */
  async create(req: Request, res: Response): Promise<void> {
    try {
      const { name, description, type, rules } = req.body;
      const userId = req.user!.userId;
      const tier = req.user!.tier;

      // Validation
      if (!name || name.length < VALIDATION.groupName.minLength) {
        res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Nom trop court (min 3 caractères)', field: 'name' });
        return;
      }

      // Vérifier le quota de création
      const tierConfig = TIER_LIMITS[tier as keyof typeof TIER_LIMITS];
      const maxCreations = tierConfig?.maxGroupCreations ?? 0;

      if (maxCreations === 0) {
        res.status(403).json({ error: 'FORBIDDEN', message: 'Les invités ne peuvent pas créer de salons' });
        return;
      }

      if (maxCreations !== Infinity) {
        const created = await groupRepository.countCreatedByUser(userId);
        if (created >= maxCreations) {
          res.status(403).json({
            error: 'QUOTA_EXCEEDED',
            message: `Limite atteinte : ${maxCreations} salons créés maximum`,
          });
          return;
        }
      }

      // Vérifier unicité du nom
      const existing = await groupRepository.findByName(name);
      if (existing) {
        res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Un salon avec ce nom existe déjà', field: 'name' });
        return;
      }

      // Créer le groupe
      const group = await groupRepository.create({
        name,
        description,
        type: type || 'public',
        creator_id: userId,
        rules,
      });

      // Ajouter le créateur comme membre avec le rôle "creator"
      await groupRepository.addMember(group.id, userId, 'creator');

      res.status(201).json({ group });
    } catch (error: any) {
      if (error instanceof AppError) {
        res.status(error.statusCode).json({ error: error.code, message: error.message });
      } else {
        console.error('❌ Erreur create group:', error);
        res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Erreur serveur' });
      }
    }
  },

  /** GET /api/groups/:id/members — Liste des membres */
  async members(req: Request, res: Response): Promise<void> {
    try {
      const members = await groupRepository.getMembers(req.params.id);
      res.json({ members });
    } catch (error: any) {
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Erreur serveur' });
    }
  },
};
