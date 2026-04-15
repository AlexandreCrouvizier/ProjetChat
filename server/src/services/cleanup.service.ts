/**
 * services/cleanup.service.ts — Auto-gestion des salons inactifs
 * 
 * Cycle de vie d'un salon :
 *   active → inactive (2h sans message) → archived (24h) → supprimé (48h)
 * 
 * Exemptions :
 *   - Salons officiels (is_official = true) : jamais touchés
 *   - Salons créés par un premium : durées ×2 (4h, 48h, 96h)
 * 
 * Ce service est appelé par un setInterval dans server.ts (toutes les 5 min)
 */
import { db } from '../config/database';

// Durées en millisecondes
const THRESHOLDS = {
  standard: {
    inactive: 2 * 60 * 60 * 1000,    // 2h → passe en "inactive"
    archived: 24 * 60 * 60 * 1000,   // 24h → passe en "archived"
    deleted: 48 * 60 * 60 * 1000,    // 48h → supprimé
  },
  premium: {
    inactive: 4 * 60 * 60 * 1000,    // 4h (×2)
    archived: 48 * 60 * 60 * 1000,   // 48h (×2)
    deleted: 96 * 60 * 60 * 1000,    // 96h (×2)
  },
};

export const cleanupService = {

  /**
   * Exécuter le nettoyage complet
   * Retourne un résumé des actions effectuées
   */
  async run(): Promise<{ inactivated: number; archived: number; deleted: number }> {
    const now = Date.now();
    let inactivated = 0;
    let archived = 0;
    let deleted = 0;

    try {
      // Récupérer tous les salons non-officiels
      const groups = await db('groups')
        .where('is_official', false)
        .whereIn('status', ['active', 'inactive', 'archived'])
        .select('groups.*');

      for (const group of groups) {
        // Déterminer si le créateur est premium
        const creator = group.created_by
          ? await db('users').where({ id: group.created_by }).select('tier').first()
          : null;
        const isPremium = creator?.tier === 'premium';
        const thresholds = isPremium ? THRESHOLDS.premium : THRESHOLDS.standard;

        // Dernier message dans le salon
        const lastMsg = await db('messages')
          .where({ group_id: group.id, is_hidden: false })
          .orderBy('created_at', 'desc')
          .select('created_at')
          .first();

        // Date de référence : dernier message OU date de création du salon
        const lastActivity = lastMsg
          ? new Date(lastMsg.created_at).getTime()
          : new Date(group.created_at).getTime();

        const inactiveFor = now - lastActivity;

        // ⚠️ Phase 3 : suppression des salons très inactifs
        if (group.status === 'archived' && inactiveFor > thresholds.deleted) {
          // Supprimer le salon + messages + membres
          await db('messages').where({ group_id: group.id }).del();
          await db('group_members').where({ group_id: group.id }).del();
          await db('reports').where({ group_id: group.id }).del();
          await db('invitations').where({ group_id: group.id }).del();
          await db('groups').where({ id: group.id }).del();
          deleted++;
          console.log(`🗑️ Salon supprimé : "${group.name}" (inactif depuis ${Math.round(inactiveFor / 3600000)}h)`);
          continue;
        }

        // Archiver les salons inactifs depuis longtemps
        if ((group.status === 'active' || group.status === 'inactive') && inactiveFor > thresholds.archived) {
          await db('groups').where({ id: group.id }).update({ status: 'archived' });
          archived++;
          console.log(`📦 Salon archivé : "${group.name}" (inactif depuis ${Math.round(inactiveFor / 3600000)}h)`);
          continue;
        }

        // Marquer comme inactif
        if (group.status === 'active' && inactiveFor > thresholds.inactive) {
          await db('groups').where({ id: group.id }).update({ status: 'inactive' });
          inactivated++;
          console.log(`💤 Salon inactif : "${group.name}" (inactif depuis ${Math.round(inactiveFor / 3600000)}h)`);
        }
      }

    } catch (error) {
      console.error('❌ Erreur cleanup:', error);
    }

    return { inactivated, archived, deleted };
  },

  /**
   * Réactiver un salon quand un message est envoyé
   * Appelé depuis le message handler WebSocket
   */
  async reactivateIfNeeded(groupId: string): Promise<void> {
    try {
      const group = await db('groups').where({ id: groupId }).select('status').first();
      if (group && (group.status === 'inactive' || group.status === 'archived')) {
        await db('groups').where({ id: groupId }).update({
          status: 'active',
          last_message_at: new Date(),
        });
        console.log(`✅ Salon réactivé : ${groupId}`);
      }
    } catch (error) {
      console.error('❌ Erreur reactivate:', error);
    }
  },
};
