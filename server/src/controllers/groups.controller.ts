/**
 * controllers/groups.controller.ts — Phase 3 : CRUD complet + explore + invitations
 */
import type { Request, Response } from 'express';
import { groupRepository } from '../repositories/group.repository';
import { invitationRepository } from '../repositories/invitation.repository';
import { VALIDATION, TIER_LIMITS } from '../../../shared/constants';

export const groupsController = {

  /** GET /api/groups — Liste des salons publics (avec recherche + tri) */
  async list(req: Request, res: Response): Promise<void> {
      try {
          const { search, sort, page, limit, mode } = req.query;

          // mode=mine → sidebar : tous les salons publics actifs/inactifs
          //              + les salons privés dont l'utilisateur est membre
          if (mode === 'mine' && req.user) {
              const groups = await groupRepository.findSidebarGroups(req.user.userId);
              res.json({ groups });
              return;
          }

          const pageNum = Math.max(parseInt(page as string) || 1, 1);
          const limitNum = Math.min(parseInt(limit as string) || 20, 50);

          const result = await groupRepository.findPublicActiveWithPagination({
              search: search as string,
              sort: (sort as string) || 'popular',
              page: pageNum,
              limit: limitNum,
          });

          res.json(result);
      } catch (error: any) {
          console.error('❌ list groups:', error);
          res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Erreur serveur' });
      }
  },

  /** GET /api/groups/:id — Détails d'un salon */
  async get(req: Request, res: Response): Promise<void> {
    try {
      const group = await groupRepository.findById(req.params.id);
      if (!group) { res.status(404).json({ error: 'NOT_FOUND', message: 'Salon introuvable' }); return; }

      let isMember = false;
      let myRole = null;
      if (req.user) {
        const membership = await groupRepository.getMembership(req.params.id, req.user.userId);
        isMember = !!membership;
        myRole = membership?.role || null;
      }

      res.json({ group: { ...group, is_member: isMember, my_role: myRole } });
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
      if (!name || name.length < VALIDATION.groupName.minLength || name.length > VALIDATION.groupName.maxLength) {
        res.status(400).json({ error: 'VALIDATION_ERROR', message: `Le nom doit faire entre ${VALIDATION.groupName.minLength} et ${VALIDATION.groupName.maxLength} caractères` });
        return;
      }

      // Vérifier le quota de création
      const tierConfig = TIER_LIMITS[tier as keyof typeof TIER_LIMITS];
      if (tierConfig.maxGroupCreations !== Infinity) {
        const count = await groupRepository.countCreatedByUser(userId);
        if (count >= tierConfig.maxGroupCreations) {
          res.status(403).json({ error: 'QUOTA_EXCEEDED', message: `Vous avez atteint la limite de ${tierConfig.maxGroupCreations} salon(s) créé(s). Passez Premium pour en créer plus !` });
          return;
        }
      }

      // Vérifier unicité du nom
      const existing = await groupRepository.findByName(name.trim());
      if (existing) {
        res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Ce nom de salon est déjà pris' });
        return;
      }

      const group = await groupRepository.create({
        name: name.trim(),
        description: description?.trim() || null,
        type: type || 'public',
        creator_id: userId,
        rules: rules?.trim() || null,
      });

      // Le créateur rejoint automatiquement en tant que 'creator'
      await groupRepository.addMember(group.id, userId, 'creator');

      // ⭐ Broadcast temps réel si salon public → tous les clients voient le nouveau salon
      if (group.type === 'public') {
        const io = req.app.get('io');
        if (io) {
          io.emit('group:created', { group });
        }
      }

      res.status(201).json({ group });
    } catch (error: any) {
      console.error('❌ create group:', error);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Erreur serveur' });
    }
  },

  /** PATCH /api/groups/:id — Modifier un salon */
  async update(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { name, description, rules } = req.body;
      const userId = req.user!.userId;

      // Vérifier les droits (creator ou admin)
      const membership = await groupRepository.getMembership(id, userId);
      if (!membership || !['creator', 'admin'].includes(membership.role)) {
        res.status(403).json({ error: 'FORBIDDEN', message: 'Seul le créateur ou un admin peut modifier ce salon' });
        return;
      }

      const updates: Record<string, any> = {};
      if (name !== undefined) {
        if (name.length < VALIDATION.groupName.minLength || name.length > VALIDATION.groupName.maxLength) {
          res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Nom invalide' }); return;
        }
        updates.name = name.trim();
      }
      if (description !== undefined) updates.description = description?.trim().substring(0, 500) || null;
      if (rules !== undefined) updates.rules = rules?.trim() || null;

      if (Object.keys(updates).length === 0) {
        res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Aucune modification' }); return;
      }

      const group = await groupRepository.update(id, updates);
      res.json({ group });
    } catch (error: any) {
      console.error('❌ update group:', error);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Erreur serveur' });
    }
  },

  /** DELETE /api/groups/:id — Supprimer un salon */
  async remove(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;

      const group = await groupRepository.findById(id);
      if (!group) { res.status(404).json({ error: 'NOT_FOUND' }); return; }
      if (group.is_official) { res.status(403).json({ error: 'FORBIDDEN', message: 'Impossible de supprimer un salon officiel' }); return; }

      const membership = await groupRepository.getMembership(id, userId);
      if (!membership || membership.role !== 'creator') {
        res.status(403).json({ error: 'FORBIDDEN', message: 'Seul le créateur peut supprimer ce salon' }); return;
      }

      await groupRepository.remove(id);
      res.json({ message: 'Salon supprimé' });
    } catch (error: any) {
      console.error('❌ delete group:', error);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Erreur serveur' });
    }
  },

  /** GET /api/groups/:id/members */
  async members(req: Request, res: Response): Promise<void> {
    try {
      const members = await groupRepository.getMembers(req.params.id);
      res.json({ members });
    } catch (error: any) {
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Erreur serveur' });
    }
  },

  /** POST /api/groups/:id/join — Rejoindre un salon public */
  async join(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;
      const tier = req.user!.tier;

      const group = await groupRepository.findById(id);
      if (!group) { res.status(404).json({ error: 'NOT_FOUND' }); return; }
      if (group.type === 'private') { res.status(403).json({ error: 'FORBIDDEN', message: 'Salon privé — utilisez un lien d\'invitation' }); return; }

      const already = await groupRepository.isMember(id, userId);
      if (already) { res.json({ message: 'Déjà membre' }); return; }

      // Vérifier le quota
      const tierConfig = TIER_LIMITS[tier as keyof typeof TIER_LIMITS];
      if (tierConfig.maxPublicGroups !== Infinity) {
        const count = await groupRepository.countJoinedPublicByUser(userId);
        if (count >= tierConfig.maxPublicGroups) {
          res.status(403).json({ error: 'QUOTA_EXCEEDED', message: `Limite de ${tierConfig.maxPublicGroups} salons atteinte` }); return;
        }
      }

      await groupRepository.addMember(id, userId, 'member');
      await groupRepository.incrementMemberCount(id);
      res.json({ message: 'Salon rejoint' });
    } catch (error: any) {
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Erreur serveur' });
    }
  },

  /** POST /api/groups/:id/leave — Quitter un salon */
  async leave(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;

      const group = await groupRepository.findById(id);
      if (!group) { res.status(404).json({ error: 'NOT_FOUND' }); return; }
      if (group.is_official) { res.status(403).json({ error: 'FORBIDDEN', message: 'Impossible de quitter un salon officiel' }); return; }

      const membership = await groupRepository.getMembership(id, userId);
      if (!membership) { res.status(400).json({ error: 'NOT_MEMBER' }); return; }

      // Si le créateur quitte → transférer au premier admin
      if (membership.role === 'creator') {
        await groupRepository.transferOwnership(id, userId);
      }

      await groupRepository.removeMember(id, userId);
      await groupRepository.decrementMemberCount(id);
      res.json({ message: 'Salon quitté' });
    } catch (error: any) {
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Erreur serveur' });
    }
  },

  /** POST /api/groups/:id/invite — Créer un lien d'invitation (salon privé) */
  async createInvite(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { max_uses, expires_in_hours } = req.body;
      const userId = req.user!.userId;

      const membership = await groupRepository.getMembership(id, userId);
      if (!membership || !['creator', 'admin'].includes(membership.role)) {
        res.status(403).json({ error: 'FORBIDDEN', message: 'Seuls le créateur et les admins peuvent créer des invitations' }); return;
      }

      const invitation = await invitationRepository.create({
        groupId: id,
        createdBy: userId,
        maxUses: max_uses,
        expiresInHours: expires_in_hours,
      });

      res.status(201).json({
        invitation: {
          code: invitation.code,
          link: `${process.env.APP_URL || 'http://localhost:3000'}/invites/${invitation.code}`,
          max_uses: invitation.max_uses,
          expires_at: invitation.expires_at,
        },
      });
    } catch (error: any) {
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Erreur serveur' });
    }
  },

  /** POST /api/groups/invite/:code — Rejoindre via lien d'invitation */
  async joinByInvite(req: Request, res: Response): Promise<void> {
    try {
      const { code } = req.params;
      const userId = req.user!.userId;
      const invitation = await invitationRepository.findByCode(code);
      if (!invitation) { res.status(404).json({ error: 'NOT_FOUND', message: 'Invitation invalide ou expirée' }); return; }
      if (invitation.expires_at && new Date(invitation.expires_at) < new Date()) {
        res.status(410).json({ error: 'EXPIRED', message: 'Cette invitation a expiré' }); return;
      }
      const group = await groupRepository.findById(invitation.group_id);
      if (!group) { res.status(404).json({ error: 'NOT_FOUND', message: 'Salon introuvable' }); return; }
      const already = await groupRepository.isMember(invitation.group_id, userId);
      if (already) { res.json({ group, message: 'Déjà membre', already: true }); return; }
      await groupRepository.addMember(invitation.group_id, userId, 'member');
      await groupRepository.incrementMemberCount(invitation.group_id);
      await invitationRepository.incrementUseCount(invitation.id);
      // ⭐ Notifier le user pour que sa sidebar se mette à jour
      const io = req.app.get('io');
      if (io) {
        io.to(`user:${userId}`).emit('group:joined', { group });
      }
      res.json({ group, message: 'Salon rejoint via invitation' });
    } catch (error: any) {
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Erreur serveur' });
    }
  },

  /** GET /api/groups/invite/:code/info — Infos publiques d'une invitation (sans rejoindre) */
  async getInviteInfo(req: Request, res: Response): Promise<void> {
    try {
      const { code } = req.params;
      const invitation = await invitationRepository.findByCode(code);
      if (!invitation) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Invitation invalide ou expirée' });
        return;
      }
      if (invitation.expires_at && new Date(invitation.expires_at) < new Date()) {
        res.status(410).json({ error: 'EXPIRED', message: 'Cette invitation a expiré' });
        return;
      }
      const group = await groupRepository.findById(invitation.group_id);
      if (!group) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Salon introuvable' });
        return;
      }
      res.json({
        group: {
          id: group.id, name: group.name, description: group.description,
          type: group.type, member_count: group.member_count, is_official: group.is_official,
        },
        invitation: {
          code: invitation.code,
          expires_at: invitation.expires_at,
          max_uses: invitation.max_uses,
          use_count: invitation.use_count,
        },
      });
    } catch (error: any) {
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Erreur serveur' });
    }
  },

  /** GET /api/groups/:id/invitations — Liste des invitations actives du salon */
  async listInvitations(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;
      const membership = await groupRepository.getMembership(id, userId);
      if (!membership || !['creator', 'admin'].includes(membership.role)) {
        res.status(403).json({ error: 'FORBIDDEN', message: 'Accès refusé' });
        return;
      }
      const invitations = await invitationRepository.findByGroup(id);
      res.json({ invitations });
    } catch (error: any) {
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Erreur serveur' });
    }
  },

  /** DELETE /api/groups/:id/invitations/:invId — Désactiver une invitation */
  async deactivateInvitation(req: Request, res: Response): Promise<void> {
    try {
      const { id, invId } = req.params;
      const userId = req.user!.userId;
      const membership = await groupRepository.getMembership(id, userId);
      if (!membership || !['creator', 'admin'].includes(membership.role)) {
        res.status(403).json({ error: 'FORBIDDEN', message: 'Accès refusé' });
        return;
      }
      await invitationRepository.deactivate(invId);
      res.json({ message: 'Invitation désactivée' });
    } catch (error: any) {
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Erreur serveur' });
    }
  },
};
