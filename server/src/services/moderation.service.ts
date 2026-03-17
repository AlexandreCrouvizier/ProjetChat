/**
 * services/moderation.service.ts — Filtre anti-spam et mots interdits
 * 
 * Deux niveaux de filtrage :
 *   1. Mots interdits — bloque le message si un mot interdit est détecté
 *   2. Flood detection — bloque si l'utilisateur envoie des messages trop similaires/répétitifs
 * 
 * En Phase 3, les mots seront chargés depuis la table banned_words.
 * Pour l'instant, c'est une liste statique.
 */

import { redis } from '../config/redis';

// Liste de mots/expressions interdits (insensible à la casse)
// Tu peux compléter cette liste selon tes besoins
const BANNED_WORDS: string[] = [
  // Insultes courantes (français)
  'connard', 'connasse', 'enculé', 'enculer', 'pute', 'putain', 'salope',
  'nique', 'niquer', 'ntm', 'nique ta mère', 'fils de pute', 'fdp',
  'batard', 'bâtard', 'merde', 'pd', 'pédé', 'tapette', 'gouine',
  'trouduc', 'trou du cul', 'bordel',
  // Racisme / discrimination
  'nègre', 'négro', 'bougnoule', 'youpin', 'feuj', 'sale arabe',
  'sale noir', 'sale blanc', 'sale juif',
  // Anglais courant
  'fuck', 'fucking', 'shit', 'asshole', 'bitch', 'nigger', 'nigga',
  'retard', 'faggot',
  // Spam patterns
  'acheter maintenant', 'buy now', 'click here', 'cliquez ici',
  'gagner de l\'argent', 'make money', 'casino en ligne',
];

// Patterns regex pour détecter les tentatives de contournement
// Ex: "f.u.c.k" ou "f_u_c_k" ou "fuuuuck"
const BANNED_PATTERNS: RegExp[] = [
  /f+[\s._-]*u+[\s._-]*c+[\s._-]*k/i,
  /n+[\s._-]*[i1]+[\s._-]*[gq]+[\s._-]*[gq]+[\s._-]*[ae]+[\s._-]*r*/i,
  /p+[\s._-]*u+[\s._-]*t+[\s._-]*[e3]+/i,
  /s+[\s._-]*a+[\s._-]*l+[\s._-]*o+[\s._-]*p+[\s._-]*e+/i,
];

export interface ModerationResult {
  allowed: boolean;
  reason?: string;
  matched?: string;
}

export const moderationService = {

  /**
   * Vérifie si un message est autorisé
   * Retourne { allowed: true } ou { allowed: false, reason: "...", matched: "..." }
   */
  async checkMessage(params: {
    content: string;
    userId: string;
    groupId: string;
  }): Promise<ModerationResult> {
    const { content, userId, groupId } = params;
    const contentLower = content.toLowerCase().trim();

    // 1. Vérifier les mots interdits (correspondance exacte dans le texte)
    for (const word of BANNED_WORDS) {
      // Cherche le mot comme mot entier ou comme partie du message
      // \b ne marche pas bien avec les accents, donc on utilise includes
      if (contentLower.includes(word.toLowerCase())) {
        return {
          allowed: false,
          reason: 'Votre message contient un terme interdit',
          matched: word,
        };
      }
    }

    // 2. Vérifier les patterns regex (contournements)
    for (const pattern of BANNED_PATTERNS) {
      if (pattern.test(contentLower)) {
        return {
          allowed: false,
          reason: 'Votre message contient un terme interdit',
          matched: 'pattern',
        };
      }
    }

    // 3. Détection de flood — Messages identiques répétés
    const floodCheck = await this.checkFlood(userId, groupId, contentLower);
    if (!floodCheck.allowed) {
      return floodCheck;
    }

    // 4. Détection de spam — Messages avec trop de liens
    const linkCount = (content.match(/https?:\/\//gi) || []).length;
    if (linkCount >= 3) {
      return {
        allowed: false,
        reason: 'Trop de liens dans un seul message (max 2)',
        matched: 'links',
      };
    }

    // 5. Détection de spam — Messages tout en majuscules (> 70%)
    if (content.length > 10) {
      const upperCount = (content.match(/[A-Z]/g) || []).length;
      const letterCount = (content.match(/[a-zA-Z]/g) || []).length;
      if (letterCount > 0 && upperCount / letterCount > 0.7) {
        return {
          allowed: false,
          reason: 'Veuillez ne pas écrire tout en majuscules',
          matched: 'caps',
        };
      }
    }

    return { allowed: true };
  },

  /**
   * Détecte le flood : messages identiques ou trop fréquents
   * Stocke les 5 derniers messages dans Redis avec un TTL de 60s
   */
  async checkFlood(userId: string, groupId: string, content: string): Promise<ModerationResult> {
    const key = `flood:${userId}:${groupId}`;
    
    try {
      // Récupérer les messages récents de cet utilisateur dans ce groupe
      const recentMessages = await redis.lrange(key, 0, 4);
      
      // Vérifier si le même message a été envoyé récemment
      const duplicateCount = recentMessages.filter(msg => msg === content).length;
      if (duplicateCount >= 2) {
        return {
          allowed: false,
          reason: 'Veuillez ne pas répéter le même message',
          matched: 'duplicate',
        };
      }

      // Vérifier si l'utilisateur envoie trop de messages (> 5 en 60s)
      if (recentMessages.length >= 5) {
        return {
          allowed: false,
          reason: 'Vous envoyez des messages trop rapidement',
          matched: 'flood',
        };
      }

      // Ajouter le message à la liste
      await redis.lpush(key, content);
      await redis.ltrim(key, 0, 4);  // Garder seulement les 5 derniers
      await redis.expire(key, 60);    // TTL 60 secondes

    } catch (err) {
      // Si Redis plante, on laisse passer (fail open)
      console.error('⚠️ Flood check Redis error:', err);
    }

    return { allowed: true };
  },
};
