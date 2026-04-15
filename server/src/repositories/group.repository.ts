/**
 * repositories/group.repository.ts — Phase 3 : CRUD complet + pagination + recherche
 */
import { db } from '../config/database';

export interface GroupRow {
  id: string; name: string; description: string | null; type: string;
  creator_id: string | null; is_official: boolean; status: string;
  rules: string | null; member_count: number; last_message_at: string | null;
  invite_code: string | null; created_at: string;
}

export const groupRepository = {

  /** Groupes dont l'utilisateur est membre */
  async findUserGroups(userId: string): Promise<GroupRow[]> {
    return db('groups')
      .join('group_members', 'groups.id', '=', 'group_members.group_id')
      .where('group_members.user_id', userId)
      // ⭐ Inclure active ET inactive (pas archived/supprimé)
      .whereIn('groups.status', ['active', 'inactive'])
      .select('groups.*')
      .orderBy('groups.last_message_at', 'desc');
  },

  /**
   * ⭐ Sidebar : tous les salons publics actifs/inactifs
   * + les salons privés dont l'utilisateur est membre
   * Tous les utilisateurs voient tous les salons publics.
   */
  async findSidebarGroups(userId: string): Promise<GroupRow[]> {
    // Salons publics actifs ou inactifs (visibles par tous)
    const publicGroups = await db('groups')
      .whereIn('groups.status', ['active', 'inactive'])
      .where('groups.type', 'public')
      .select('groups.*')
      .orderBy('groups.last_message_at', 'desc');

    // Salons privés dont l'utilisateur est membre
    const privateGroups = await db('groups')
      .join('group_members', 'groups.id', '=', 'group_members.group_id')
      .where('group_members.user_id', userId)
      .where('groups.type', 'private')
      .whereIn('groups.status', ['active', 'inactive'])
      .select('groups.*')
      .orderBy('groups.last_message_at', 'desc');

    // Fusionner sans doublons, ordre : dernier message d'abord
    const all = [...publicGroups, ...privateGroups];
    const seen = new Set<string>();
    const merged = all.filter(g => { if (seen.has(g.id)) return false; seen.add(g.id); return true; });
    merged.sort((a, b) => {
      const ta = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
      const tb = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
      return tb - ta;
    });
    return merged;
  },

  async findPublicActive(): Promise<GroupRow[]> {
    return db('groups').where({ type: 'public', status: 'active' }).orderBy('member_count', 'desc');
  },

  /** Liste paginée avec recherche et tri */
  async findPublicActiveWithPagination(params: { search?: string; sort: string; page: number; limit: number }) {
    let query = db('groups').where({ type: 'public', status: 'active' });

    if (params.search) {
      query = query.where('name', 'ilike', `%${params.search}%`);
    }

    // Tri
    switch (params.sort) {
      case 'recent': query = query.orderBy('created_at', 'desc'); break;
      case 'active': query = query.orderBy('last_message_at', 'desc'); break;
      case 'name': query = query.orderBy('name', 'asc'); break;
      default: query = query.orderBy('member_count', 'desc'); break; // popular
    }

    const offset = (params.page - 1) * params.limit;
    const [countResult] = await query.clone().count('id as total');
    const total = parseInt(countResult.total as string, 10) || 0;
    const groups = await query.offset(offset).limit(params.limit);

    return {
      groups,
      pagination: { page: params.page, total, pages: Math.ceil(total / params.limit) },
    };
  },

  async findById(id: string): Promise<GroupRow | null> {
    return db('groups').where({ id }).first() || null;
  },

  async findByName(name: string): Promise<GroupRow | null> {
    return db('groups').whereRaw('LOWER(name) = ?', [name.toLowerCase()]).first() || null;
  },

  async create(data: { name: string; description?: string | null; type: string; creator_id: string; rules?: string | null }): Promise<GroupRow> {
    const [group] = await db('groups').insert({
      name: data.name, description: data.description || null,
      type: data.type, creator_id: data.creator_id,
      rules: data.rules || null, member_count: 1, last_message_at: new Date(),
    }).returning('*');
    return group;
  },

  async update(id: string, updates: Record<string, any>): Promise<GroupRow | null> {
    const [group] = await db('groups').where({ id }).update(updates).returning('*');
    return group || null;
  },

  async remove(id: string): Promise<void> {
    // Cascade : messages, group_members, invitations seront supprimés par FK CASCADE
    await db('groups').where({ id }).del();
  },

  async updateLastMessage(groupId: string): Promise<void> {
    await db('groups').where({ id: groupId }).update({
      last_message_at: new Date(), status: 'active', inactive_since: null,
    });
  },

  async isMember(groupId: string, userId: string): Promise<boolean> {
    return !!(await db('group_members').where({ group_id: groupId, user_id: userId }).first());
  },

  /** Récupérer le membership avec le rôle et l'état mute */
  async getMembership(groupId: string, userId: string): Promise<{ role: string; is_muted: boolean } | null> {
    return db('group_members').where({ group_id: groupId, user_id: userId }).select('role', 'is_muted').first() || null;
  },

  /** Muter/démuter un membre dans un salon */
  async setMemberMuted(groupId: string, userId: string, muted: boolean): Promise<void> {
    await db('group_members').where({ group_id: groupId, user_id: userId }).update({ is_muted: muted });
  },

  /** Vérifier si un membre est mute dans un salon */
  async isMemberMuted(groupId: string, userId: string): Promise<boolean> {
    const row = await db('group_members').where({ group_id: groupId, user_id: userId }).select('is_muted').first();
    return row?.is_muted === true;
  },

  async addMember(groupId: string, userId: string, role: string = 'member'): Promise<void> {
    // Upsert : si déjà membre, ne rien faire
    const exists = await db('group_members').where({ group_id: groupId, user_id: userId }).first();
    if (!exists) {
      await db('group_members').insert({ group_id: groupId, user_id: userId, role });
    }
  },

  async removeMember(groupId: string, userId: string): Promise<void> {
    await db('group_members').where({ group_id: groupId, user_id: userId }).del();
  },

  async incrementMemberCount(groupId: string): Promise<void> {
    await db('groups').where({ id: groupId }).increment('member_count', 1);
  },

  async decrementMemberCount(groupId: string): Promise<void> {
    await db('groups').where({ id: groupId }).decrement('member_count', 1);
  },

  async getMembers(groupId: string): Promise<any[]> {
    return db('group_members')
      .join('users', 'group_members.user_id', '=', 'users.id')
      .where('group_members.group_id', groupId)
      .select('users.id', 'users.username', 'users.avatar_url', 'users.tier',
        'users.donor_badge', 'users.last_seen_at', 'group_members.role',
        'group_members.is_muted', 'group_members.joined_at')
      .orderByRaw(`CASE group_members.role WHEN 'creator' THEN 1 WHEN 'admin' THEN 2 WHEN 'moderator' THEN 3 ELSE 4 END`);
  },

  async countCreatedByUser(userId: string): Promise<number> {
    // ⭐ Compter uniquement les salons encore "vivants" (actifs ou inactifs)
    // Les salons archivés ou supprimés ne comptent plus dans le quota
    const r = await db('groups')
      .where({ creator_id: userId })
      .whereIn('status', ['active', 'inactive'])
      .count('id as count').first();
    return parseInt(r?.count as string, 10) || 0;
  },

  async countJoinedPublicByUser(userId: string): Promise<number> {
    const r = await db('group_members').join('groups', 'group_members.group_id', '=', 'groups.id')
      .where('group_members.user_id', userId).where('groups.type', 'public')
      .count('group_members.id as count').first();
    return parseInt(r?.count as string, 10) || 0;
  },

  async getGroupIdsForUser(userId: string): Promise<string[]> {
    const rows = await db('group_members').where({ user_id: userId }).select('group_id');
    return rows.map((r: any) => r.group_id);
  },

  /** Transférer la propriété au premier admin (ou au membre le plus ancien) */
  async transferOwnership(groupId: string, currentOwnerId: string): Promise<void> {
    // Chercher un admin
    let newOwner = await db('group_members')
      .where({ group_id: groupId, role: 'admin' })
      .whereNot('user_id', currentOwnerId)
      .orderBy('joined_at', 'asc').first();

    if (!newOwner) {
      // Pas d'admin → prendre le modérateur le plus ancien
      newOwner = await db('group_members')
        .where({ group_id: groupId, role: 'moderator' })
        .whereNot('user_id', currentOwnerId)
        .orderBy('joined_at', 'asc').first();
    }

    if (!newOwner) {
      // Pas de modérateur → prendre le membre le plus ancien
      newOwner = await db('group_members')
        .where({ group_id: groupId })
        .whereNot('user_id', currentOwnerId)
        .orderBy('joined_at', 'asc').first();
    }

    if (newOwner) {
      await db('group_members').where({ group_id: groupId, user_id: newOwner.user_id }).update({ role: 'creator' });
      await db('groups').where({ id: groupId }).update({ creator_id: newOwner.user_id });
    }
  },

  /** Mettre à jour le rôle d'un membre */
  async updateMemberRole(groupId: string, userId: string, role: string): Promise<void> {
    await db('group_members').where({ group_id: groupId, user_id: userId }).update({ role });
  },
};