/**
 * services/guestSecurity.service.ts — Système de sécurité invités
 *
 * Responsabilités :
 *   - Vérifier si un fingerprint ou une IP est banni avant d'autoriser la connexion
 *   - Logger les couples (fingerprint, IP) à chaque connexion invité
 *   - Bannir un fingerprint + déclencher le permaban IP automatique à 3 bans
 *   - API de lecture pour le panel admin
 *
 * Règles :
 *   1. Fingerprint banni → connexion refusée (sauf si expiré)
 *   2. IP permabannit → connexion refusée SAUF si fingerprint inconnu + IP bannie < 3x
 *      (évite les faux positifs sur NAT partagé)
 *   3. Fingerprint inconnu + IP ayant déjà 3+ bans distincts → connexion refusée
 *   4. Quand on banne un fingerprint : incrémenter ban_count de l'IP
 *      Si ban_count atteint 3 → créer/mettre à jour banned_ips
 */

import { db } from '../config/database';

const AUTO_PERMABAN_THRESHOLD = 3; // Nombre de fingerprints bannis sur la même IP avant permaban

export const guestSecurityService = {

  // ─── Vérifications à la connexion ─────────────────────────────────────────

  /**
   * Vérifie si un fingerprint est actuellement banni.
   * Gère les bans temporaires (expires_at) et permanents.
   */
  async isFingerprintBanned(fingerprint: string): Promise<{ banned: boolean; reason?: string; permanent?: boolean }> {
    const row = await db('banned_fingerprints')
      .where({ fingerprint })
      .whereNull('expires_at')
      .orWhere('expires_at', '>', db.fn.now())
      .first();

    if (!row) return { banned: false };
    return { banned: true, reason: row.reason || 'Accès refusé', permanent: row.is_permanent };
  },

  /**
   * Vérifie si une IP est permabannit.
   */
  async isIpPermabanned(ip: string): Promise<{ banned: boolean; reason?: string }> {
    const row = await db('banned_ips').where('ip_address', ip).first();
    if (!row) return { banned: false };
    return { banned: true, reason: row.reason || 'IP bannie' };
  },

  /**
   * Vérifie si un fingerprint INCONNU vient d'une IP à risque élevé.
   * Retourne true si la connexion doit être bloquée.
   */
  async isNewFingerprintFromDangerousIp(fingerprint: string, ip: string): Promise<boolean> {
    // L'IP est-elle déjà permabannit ?
    const ipRow = await db('banned_ips').where('ip_address', ip).first();
    if (ipRow) return true;

    // L'IP a-t-elle déjà atteint le seuil de bans (même sans permaban explicite) ?
    const banCount = await db('banned_fingerprints')
      .where('last_known_ip', ip)
      .count('id as count')
      .first();

    return parseInt(banCount?.count as string || '0', 10) >= AUTO_PERMABAN_THRESHOLD;
  },

  // ─── Logging des connexions ────────────────────────────────────────────────

  /**
   * Enregistre le couple (fingerprint, IP) lors d'une connexion invité.
   * Ignore les doublons récents (unicité fingerprint+ip en BDD).
   */
  async logConnection(params: {
    fingerprint: string;
    userId: string;
    ip: string;
    userAgent?: string;
  }): Promise<void> {
    try {
      await db('guest_ip_history').insert({
        fingerprint:  params.fingerprint,
        user_id:      params.userId,
        ip_address:   params.ip,
        user_agent:   params.userAgent?.substring(0, 500) || null,
        seen_at:      db.fn.now(),
      }).onConflict(['fingerprint', 'ip_address'])
        .merge({ seen_at: db.fn.now() }); // Mise à jour de la dernière vue si déjà connu
    } catch { /* Non bloquant */ }
  },

  // ─── Actions de ban ────────────────────────────────────────────────────────

  /**
   * Banne un fingerprint invité.
   * Met automatiquement à jour le compteur d'IP et déclenche le permaban si seuil atteint.
   */
  async banFingerprint(params: {
    fingerprint:      string;
    usernameSnapshot: string;
    lastKnownIp:      string | null;
    reason?:          string;
    permanent?:       boolean;
    expiresAt?:       Date | null;
    bannedBy?:        string;
  }): Promise<{ permaban_triggered: boolean; ip_ban_count: number }> {
    // 1. Créer ou mettre à jour le ban du fingerprint
    await db('banned_fingerprints').insert({
      fingerprint:       params.fingerprint,
      username_snapshot: params.usernameSnapshot,
      last_known_ip:     params.lastKnownIp,
      reason:            params.reason || 'Comportement abusif',
      is_permanent:      params.permanent ?? false,
      expires_at:        params.expiresAt ?? null,
      banned_by:         params.bannedBy || 'admin',
    }).onConflict('fingerprint')
      .merge({
        username_snapshot: params.usernameSnapshot,
        last_known_ip:     params.lastKnownIp,
        reason:            params.reason || 'Comportement abusif',
        is_permanent:      params.permanent ?? false,
        expires_at:        params.expiresAt ?? null,
        banned_by:         params.bannedBy || 'admin',
      });

    if (!params.lastKnownIp) return { permaban_triggered: false, ip_ban_count: 0 };

    // 2. Compter le nombre de fingerprints distincts bannis sur cette IP
    const countResult = await db('banned_fingerprints')
      .where('last_known_ip', params.lastKnownIp)
      .count('id as count')
      .first();
    const ipBanCount = parseInt(countResult?.count as string || '0', 10);

    // 3. Permaban auto si seuil atteint
    let permabannTriggered = false;
    if (ipBanCount >= AUTO_PERMABAN_THRESHOLD) {
      await db('banned_ips').insert({
        ip_address: params.lastKnownIp,
        ban_count:  ipBanCount,
        reason:     `Permaban automatique — ${ipBanCount} comptes bannis sur cette IP`,
        is_auto:    true,
        updated_at: db.fn.now(),
      }).onConflict('ip_address')
        .merge({ ban_count: ipBanCount, updated_at: db.fn.now() });
      permabannTriggered = true;
    }

    return { permaban_triggered: permabannTriggered, ip_ban_count: ipBanCount };
  },

  /**
   * Débanne un fingerprint.
   */
  async unbanFingerprint(fingerprint: string): Promise<void> {
    await db('banned_fingerprints').where({ fingerprint }).delete();
  },

  /**
   * Débanne une IP permabannit.
   */
  async unbanIp(ip: string): Promise<void> {
    await db('banned_ips').where('ip_address', ip).delete();
  },

  /**
   * Permaban manuel d'une IP (par l'admin).
   */
  async manualPermbanIp(params: { ip: string; reason: string; bannedBy: string }): Promise<void> {
    await db('banned_ips').insert({
      ip_address: params.ip,
      ban_count:  1,
      reason:     params.reason,
      is_auto:    false,
      banned_by:  params.bannedBy,
      updated_at: db.fn.now(),
    }).onConflict('ip_address')
      .merge({ reason: params.reason, is_auto: false, banned_by: params.bannedBy, updated_at: db.fn.now() });
  },

  // ─── Lecture admin ─────────────────────────────────────────────────────────

  async getBannedFingerprints(page = 1, limit = 50): Promise<{ rows: any[]; total: number }> {
    const offset = (page - 1) * limit;
    const [rows, countRes] = await Promise.all([
      db('banned_fingerprints')
        .select('*')
        .orderBy('created_at', 'desc')
        .limit(limit)
        .offset(offset),
      db('banned_fingerprints').count('id as count').first(),
    ]);
    return { rows, total: parseInt(countRes?.count as string || '0', 10) };
  },

  async getBannedIps(page = 1, limit = 50): Promise<{ rows: any[]; total: number }> {
    const offset = (page - 1) * limit;
    const [rows, countRes] = await Promise.all([
      db('banned_ips')
        .select('*')
        .orderBy('ban_count', 'desc')
        .orderBy('created_at', 'desc')
        .limit(limit)
        .offset(offset),
      db('banned_ips').count('id as count').first(),
    ]);
    return { rows, total: parseInt(countRes?.count as string || '0', 10) };
  },

  async getFingerprintHistory(fingerprint: string): Promise<any[]> {
    return db('guest_ip_history')
      .where({ fingerprint })
      .orderBy('seen_at', 'desc')
      .limit(100);
  },

  async getIpHistory(ip: string): Promise<any[]> {
    return db('guest_ip_history')
      .where('ip_address', ip)
      .leftJoin('users', 'guest_ip_history.user_id', 'users.id')
      .select(
        'guest_ip_history.*',
        'users.username',
        'users.tier',
        'users.is_banned',
      )
      .orderBy('guest_ip_history.seen_at', 'desc')
      .limit(200);
  },

  async getSecurityStats(): Promise<{
    banned_fingerprints: number;
    banned_ips: number;
    total_ip_logs: number;
    recent_bans: any[];
  }> {
    const [fpCount, ipCount, logsCount, recentBans] = await Promise.all([
      db('banned_fingerprints').count('id as c').first(),
      db('banned_ips').count('id as c').first(),
      db('guest_ip_history').count('id as c').first(),
      db('banned_fingerprints')
        .orderBy('created_at', 'desc')
        .limit(5)
        .select('fingerprint', 'username_snapshot', 'last_known_ip', 'reason', 'created_at'),
    ]);
    return {
      banned_fingerprints: parseInt(fpCount?.c as string || '0', 10),
      banned_ips:          parseInt(ipCount?.c as string || '0', 10),
      total_ip_logs:       parseInt(logsCount?.c as string || '0', 10),
      recent_bans:         recentBans,
    };
  },
};
