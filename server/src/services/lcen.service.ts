/**
 * services/lcen.service.ts — Purge automatique des traces au-delà de la durée de conservation
 *
 * LCEN (art. 6-II) : les données permettant d'identifier l'auteur d'un contenu (adresse IP, date)
 * doivent être conservées 1 an. RGPD : elles ne doivent pas être gardées plus longtemps que nécessaire.
 * → Chaque nuit (et au démarrage), les traces plus anciennes que `lcen_retention_days`
 *   (Panel → Paramètres, 365 jours minimum) sont effacées :
 *     - IP des messages, des fichiers envoyés, des actions de modération, dernière IP des comptes inactifs
 *     - journal des connexions et des actions (audit_logs) et historique IP des invités
 *     - sessions expirées (à tout moment)
 *     - traces des fichiers déjà effacés du disque
 * Les messages eux-mêmes ne sont PAS supprimés. Les bannissements actifs ne sont pas touchés.
 */
import { db } from '../config/database';
import { settingsService, invalidateAppSettings } from './settings.service';
import { logger } from '../utils/logger';

export interface PurgeResult {
  at: string;
  retention_days: number;
  messages_ip: number;
  uploads_ip: number;
  uploads_deleted: number;
  moderation_ip: number;
  users_ip: number;
  audit_logs: number;
  guest_ip_history: number;
  sessions: number;
  total: number;
}

let running = false;

export const lcenService = {
  async purge(): Promise<PurgeResult> {
    if (running) throw new Error('Purge déjà en cours');
    running = true;
    try {
      const days = await settingsService.lcenRetentionDays();
      // Date limite calculée par PostgreSQL (pas de fuseau horaire JavaScript)
      const limit = db.raw(`now() - (? || ' days')::interval`, [String(days)]);

      const messagesIp = await db('messages').whereNotNull('ip_address').where('created_at', '<', limit).update({ ip_address: null });
      const uploadsIp = await db('uploads').whereNotNull('ip_address').where('created_at', '<', limit).update({ ip_address: null });
      const uploadsDeleted = await db('uploads').whereNotNull('deleted_at').where('deleted_at', '<', limit).delete();
      const moderationIp = await db('moderation_actions').whereNotNull('ip_address').where('created_at', '<', limit).update({ ip_address: null });
      const usersIp = await db('users').whereNotNull('last_ip')
        .where((q) => q.where('last_seen_at', '<', limit).orWhere((q2) => q2.whereNull('last_seen_at').where('created_at', '<', limit)))
        .update({ last_ip: null });
      const auditLogs = await db('audit_logs').where('created_at', '<', limit).delete();
      const guestIp = await db('guest_ip_history').where('seen_at', '<', limit).delete();
      const sessions = await db('sessions').where('expires_at', '<', db.fn.now()).delete();

      const counts = {
        messages_ip: messagesIp, uploads_ip: uploadsIp, uploads_deleted: uploadsDeleted,
        moderation_ip: moderationIp, users_ip: usersIp, audit_logs: auditLogs,
        guest_ip_history: guestIp, sessions,
      };
      const result: PurgeResult = {
        at: new Date().toISOString(),
        retention_days: days,
        ...counts,
        total: Object.values(counts).reduce((a, b) => a + b, 0),
      };
      await db('app_settings').where({ key: 'lcen_last_purge' })
        .update({ value: JSON.stringify(result), updated_at: db.fn.now() });
      invalidateAppSettings();
      if (result.total > 0) logger.info(`🗄️ Purge LCEN (> ${days} j) : ${result.total} trace(s) effacée(s)`);
      return result;
    } finally {
      running = false;
    }
  },
};

const DAY_MS = 24 * 60 * 60 * 1000;
let timer: ReturnType<typeof setInterval> | null = null;

/** Purge au démarrage (après 60 s) puis toutes les 24 h */
export function startLcenPurge(): void {
  if (timer) return;
  const run = () => lcenService.purge().catch((err) => logger.warn(`Purge LCEN impossible : ${err?.message || err}`));
  setTimeout(run, 60_000).unref?.();
  timer = setInterval(run, DAY_MS);
  timer.unref?.();
}
