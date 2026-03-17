/**
 * repositories/group.repository.ts — Requêtes BDD pour les groupes/salons
 */

import { db } from '../config/database';

export interface GroupRow {
  id: string;
  name: string;
  description: string | null;
  type: string;
  creator_id: string | null;
  is_official: boolean;
  status: string;
  rules: string | null;
  member_count: number;
  last_message_at: string | null;
  created_at: string;
}

export const groupRepository = {

  /** Lister les salons publics actifs */
  async findPublicActive(): Promise<GroupRow[]> {
    return db('groups')
      .where({ type: 'public', status: 'active' })
      .orderBy('member_count', 'desc');
  },

  /** Trouver un groupe par ID */
  async findById(id: string): Promise<GroupRow | null> {
    return db('groups').where({ id }).first() || null;
  },

  /** Trouver un groupe par nom */
  async findByName(name: string): Promise<GroupRow | null> {
    return db('groups').where({ name }).first() || null;
  },

  /** Créer un groupe */
  async create(data: {
    name: string;
    description?: string;
    type: string;
    creator_id: string;
    rules?: string;
  }): Promise<GroupRow> {
    const [group] = await db('groups')
      .insert({
        name: data.name,
        description: data.description || null,
        type: data.type,
        creator_id: data.creator_id,
        rules: data.rules || null,
        member_count: 1,  // Le créateur est automatiquement membre
        last_message_at: new Date(),
      })
      .returning('*');
    return group;
  },

  /** Mettre à jour last_message_at (appelé à chaque nouveau message) */
  async updateLastMessage(groupId: string): Promise<void> {
    await db('groups')
      .where({ id: groupId })
      .update({
        last_message_at: new Date(),
        // Si le salon était inactif, le repasser en actif
        status: 'active',
        inactive_since: null,
      });
  },

  /** Incrémenter le compteur de membres */
  async incrementMemberCount(groupId: string): Promise<void> {
    await db('groups').where({ id: groupId }).increment('member_count', 1);
  },

  /** Décrémenter le compteur de membres */
  async decrementMemberCount(groupId: string): Promise<void> {
    await db('groups').where({ id: groupId }).decrement('member_count', 1);
  },

  /** Vérifier si un utilisateur est membre d'un groupe */
  async isMember(groupId: string, userId: string): Promise<boolean> {
    const row = await db('group_members')
      .where({ group_id: groupId, user_id: userId })
      .first();
    return !!row;
  },

  /** Ajouter un membre à un groupe */
  async addMember(groupId: string, userId: string, role: string = 'member'): Promise<void> {
    await db('group_members').insert({
      group_id: groupId,
      user_id: userId,
      role,
    });
  },

  /** Retirer un membre d'un groupe */
  async removeMember(groupId: string, userId: string): Promise<void> {
    await db('group_members')
      .where({ group_id: groupId, user_id: userId })
      .del();
  },

  /** Lister les membres d'un groupe (avec infos user) */
  async getMembers(groupId: string): Promise<any[]> {
    return db('group_members')
      .join('users', 'group_members.user_id', '=', 'users.id')
      .where('group_members.group_id', groupId)
      .select(
        'users.id',
        'users.username',
        'users.avatar_url',
        'users.tier',
        'users.donor_badge',
        'users.last_seen_at',
        'group_members.role',
        'group_members.joined_at',
      )
      .orderByRaw(`
        CASE group_members.role 
          WHEN 'creator' THEN 1 
          WHEN 'admin' THEN 2 
          WHEN 'moderator' THEN 3 
          ELSE 4 
        END
      `);
  },

  /** Compter combien de groupes un utilisateur a créés */
  async countCreatedByUser(userId: string): Promise<number> {
    const result = await db('groups')
      .where({ creator_id: userId })
      .count('id as count')
      .first();
    return parseInt(result?.count as string, 10) || 0;
  },

  /** Compter combien de groupes publics un utilisateur a rejoints */
  async countJoinedPublicByUser(userId: string): Promise<number> {
    const result = await db('group_members')
      .join('groups', 'group_members.group_id', '=', 'groups.id')
      .where('group_members.user_id', userId)
      .where('groups.type', 'public')
      .count('group_members.id as count')
      .first();
    return parseInt(result?.count as string, 10) || 0;
  },

  /** Récupérer les IDs de tous les groupes d'un utilisateur (pour rejoindre les rooms) */
  async getGroupIdsForUser(userId: string): Promise<string[]> {
    const rows = await db('group_members')
      .where({ user_id: userId })
      .select('group_id');
    return rows.map((r: any) => r.group_id);
  },
};
