/**
 * repositories/invitation.repository.ts — Invitations par lien pour salons privés
 */
import { db } from '../config/database';
import crypto from 'crypto';

function generateCode(): string {
  return crypto.randomBytes(4).toString('base64url').substring(0, 8);
}

export const invitationRepository = {

  async create(data: { groupId: string; createdBy: string; maxUses?: number; expiresInHours?: number }): Promise<any> {
    const code = generateCode();
    const expiresAt = data.expiresInHours
      ? new Date(Date.now() + data.expiresInHours * 3600000)
      : null;

    const [invitation] = await db('invitations').insert({
      group_id: data.groupId,
      created_by: data.createdBy,
      code,
      max_uses: data.maxUses || null,
      expires_at: expiresAt,
    }).returning('*');

    return invitation;
  },

  async findByCode(code: string): Promise<any | null> {
    return db('invitations')
      .where({ code, is_active: true })
      .first() || null;
  },

  async incrementUseCount(id: string): Promise<void> {
    await db('invitations').where({ id }).increment('use_count', 1);

    // Désactiver si max_uses atteint
    const inv = await db('invitations').where({ id }).first();
    if (inv && inv.max_uses && inv.use_count >= inv.max_uses) {
      await db('invitations').where({ id }).update({ is_active: false });
    }
  },

  async findByGroup(groupId: string): Promise<any[]> {
    return db('invitations').where({ group_id: groupId, is_active: true }).orderBy('created_at', 'desc');
  },

  async deactivate(id: string): Promise<void> {
    await db('invitations').where({ id }).update({ is_active: false });
  },
};
