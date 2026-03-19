/**
 * services/mention.service.ts — Détection et traitement des mentions @pseudo
 * 
 * Quand un message contient @Paul ou @Invité_1234 :
 *   1. On parse le texte pour extraire les pseudos mentionnés
 *   2. On vérifie que ces pseudos existent en BDD
 *   3. On envoie une notification temps réel à chaque utilisateur mentionné
 * 
 * Regex : @[a-zA-Z0-9_-]{3,30} (correspond aux règles de validation du pseudo)
 */

import { db } from '../config/database';

// Regex pour détecter les @mentions dans le texte
// Capture le pseudo après le @, avec les mêmes règles que la validation username
const MENTION_REGEX = /@([a-zA-Z0-9_-]{3,30})/g;

export interface MentionedUser {
  id: string;
  username: string;
}

export const mentionService = {

  /**
   * Extraire les pseudos mentionnés dans un texte
   * Retourne les pseudos uniques trouvés (sans le @)
   */
  parseMentions(content: string): string[] {
    const matches = content.matchAll(MENTION_REGEX);
    const usernames = new Set<string>();
    for (const match of matches) {
      usernames.add(match[1]);  // match[1] = le groupe capturé (sans le @)
    }
    return Array.from(usernames);
  },

  /**
   * Résoudre les pseudos → utilisateurs réels en BDD
   * Retourne uniquement les utilisateurs qui existent
   */
  async resolveMentions(usernames: string[]): Promise<MentionedUser[]> {
    if (usernames.length === 0) return [];

    const users = await db('users')
      .whereIn('username', usernames)
      .select('id', 'username');

    return users;
  },

  /**
   * Pipeline complet : parse + resolve
   * Utilisé par le message handler après l'envoi d'un message
   */
  async processMentions(content: string, excludeUserId?: string): Promise<MentionedUser[]> {
    const usernames = this.parseMentions(content);
    if (usernames.length === 0) return [];

    const users = await this.resolveMentions(usernames);

    // Exclure l'auteur du message (on ne se notifie pas soi-même)
    return users.filter(u => u.id !== excludeUserId);
  },

  /**
   * Rechercher des utilisateurs pour l'autocomplete
   * Appelé quand l'utilisateur tape @pa... dans l'input
   * 
   * Critères : 
   *   - Pseudo commence par le terme recherché (prefix match)
   *   - Limité aux membres du groupe actuel (si groupId fourni)
   *   - Max 8 résultats
   */
  async searchForAutocomplete(params: {
    query: string;
    groupId?: string;
    currentUserId: string;
    limit?: number;
  }): Promise<Array<{ id: string; username: string; avatar_url: string | null; tier: string }>> {
    const { query, groupId, currentUserId, limit = 8 } = params;

    if (!query || query.length < 1) return [];

    let dbQuery = db('users')
      .where('username', 'ilike', `${query}%`)  // Prefix match, case-insensitive
      .whereNot('id', currentUserId)             // Pas soi-même
      .where('is_banned', false)
      .select('id', 'username', 'avatar_url', 'tier')
      .limit(limit);

    // Si on a un groupId, prioriser les membres du groupe
    if (groupId) {
      // D'abord les membres du groupe, puis les autres
      dbQuery = db('users')
        .where('username', 'ilike', `${query}%`)
        .whereNot('id', currentUserId)
        .where('is_banned', false)
        .select(
          'users.id', 'users.username', 'users.avatar_url', 'users.tier',
          db.raw(`
            CASE WHEN EXISTS (
              SELECT 1 FROM group_members 
              WHERE group_members.user_id = users.id 
              AND group_members.group_id = ?
            ) THEN 0 ELSE 1 END as sort_order
          `, [groupId])
        )
        .orderBy('sort_order', 'asc')
        .orderBy('username', 'asc')
        .limit(limit);
    }

    return dbQuery;
  },
};
