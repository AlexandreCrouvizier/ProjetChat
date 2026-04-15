/**
 * repositories/report.repository.ts — Phase 3 Étape 5
 *
 * FIX: findAllGrouped regroupe les signalements par message_id
 * FIX: reviewAllForMessage traite tous les signalements d'un message d'un coup
 */
import { db } from '../config/database';

export const reportRepository = {

  /** Créer un signalement (message OU utilisateur) */
  async create(data: {
    message_id?: string; reported_user_id: string; reporter_id: string;
    group_id?: string; conversation_id?: string;
    reason: string; reason_text?: string;
  }): Promise<any> {
    const [report] = await db('reports').insert({
      message_id: data.message_id || null,
      reported_user_id: data.reported_user_id,
      reporter_id: data.reporter_id,
      group_id: data.group_id || null,
      conversation_id: data.conversation_id || null,
      reason: data.reason,
      reason_text: data.reason_text || null,
    }).returning('*');
    return report;
  },

  /** Vérifier si un user a déjà signalé ce message */
  async existsForUser(messageId: string, reporterId: string): Promise<boolean> {
    const row = await db('reports').where({ message_id: messageId, reporter_id: reporterId }).first();
    return !!row;
  },

  /** Compter les signalements d'un message */
  async countForMessage(messageId: string): Promise<number> {
    const r = await db('reports').where({ message_id: messageId }).count('id as count').first();
    return parseInt(r?.count as string, 10) || 0;
  },

  /** Liste classique des signalements (pour compatibilité) */
  async findAll(params: { status?: string; page: number; limit: number }): Promise<{ reports: any[]; total: number }> {
    let query = db('reports')
      .leftJoin('users as reporter', 'reports.reporter_id', '=', 'reporter.id')
      .leftJoin('users as reported', 'reports.reported_user_id', '=', 'reported.id')
      .leftJoin('messages', 'reports.message_id', '=', 'messages.id')
      .leftJoin('groups', 'reports.group_id', '=', 'groups.id')
      .select(
        'reports.*',
        'reporter.username as reporter_username',
        'reported.username as reported_username',
        'messages.content as message_content',
        'messages.is_hidden as message_is_hidden',
        'groups.name as group_name',
      );

    if (params.status) query = query.where('reports.status', params.status);

    const countQuery = db('reports');
    if (params.status) countQuery.where('status', params.status);
    const [countResult] = await countQuery.count('id as total');
    const total = parseInt(countResult.total as string, 10) || 0;

    const reports = await query
      .orderBy('reports.created_at', 'desc')
      .offset((params.page - 1) * params.limit)
      .limit(params.limit);

    return { reports, total };
  },

  /**
   * ⭐ Liste REGROUPÉE par message_id pour le panel admin
   * Les signalements d'un même message sont fusionnés en un seul item
   * avec la liste des reporters + raisons
   */
  async findAllGrouped(params: { status?: string; page: number; limit: number }): Promise<{ groups: any[]; total: number }> {
    // 1. Récupérer tous les reports individuels (filtré par status)
    let query = db('reports')
      .leftJoin('users as reporter', 'reports.reporter_id', '=', 'reporter.id')
      .leftJoin('users as reported', 'reports.reported_user_id', '=', 'reported.id')
      .leftJoin('messages', 'reports.message_id', '=', 'messages.id')
      .leftJoin('groups', 'reports.group_id', '=', 'groups.id')
      .select(
        'reports.*',
        'reporter.username as reporter_username',
        'reported.username as reported_username',
        'messages.content as message_content',
        'messages.is_hidden as message_is_hidden',
        'messages.parent_message_id as message_parent_id',
        'groups.name as group_name',
      )
      .orderBy('reports.created_at', 'desc');

    if (params.status) query = query.where('reports.status', params.status);

    const allReports = await query;

    // 2. Regrouper par message_id (ou par report.id si pas de message)
    const groupMap = new Map<string, any>();

    for (const report of allReports) {
      const key = report.message_id || `user_${report.id}`;

      if (!groupMap.has(key)) {
        groupMap.set(key, {
          // Clé de regroupement
          message_id: report.message_id,
          reported_user_id: report.reported_user_id,
          reported_username: report.reported_username,
          group_id: report.group_id,
          group_name: report.group_name,
          message_content: report.message_content,
          message_is_hidden: report.message_is_hidden,
          message_parent_id: report.message_parent_id,
          status: report.status,
          // Tous les report_ids associés (pour agir d'un coup)
          report_ids: [],
          // Détails de chaque signalement
          reporters: [],
          // Date du premier signalement
          first_reported_at: report.created_at,
          last_reported_at: report.created_at,
        });
      }

      const group = groupMap.get(key)!;
      group.report_ids.push(report.id);
      group.reporters.push({
        id: report.id,
        reporter_id: report.reporter_id,
        reporter_username: report.reporter_username,
        reason: report.reason,
        reason_text: report.reason_text,
        created_at: report.created_at,
      });
      // Mettre à jour les dates
      if (report.created_at < group.first_reported_at) group.first_reported_at = report.created_at;
      if (report.created_at > group.last_reported_at) group.last_reported_at = report.created_at;
      // Le statut global est "pending" si au moins un est pending
      if (report.status === 'pending') group.status = 'pending';
    }

    const grouped = Array.from(groupMap.values());
    // Tri: pending en premier, puis par date
    grouped.sort((a, b) => {
      if (a.status === 'pending' && b.status !== 'pending') return -1;
      if (a.status !== 'pending' && b.status === 'pending') return 1;
      return new Date(b.last_reported_at).getTime() - new Date(a.last_reported_at).getTime();
    });

    const total = grouped.length;
    const offset = (params.page - 1) * params.limit;
    const paged = grouped.slice(offset, offset + params.limit);

    return { groups: paged, total };
  },

  /** Mettre à jour un signalement (review) */
  async review(id: string, data: { status: string; reviewed_by: string; review_note?: string }): Promise<any> {
    const [report] = await db('reports').where({ id }).update({
      status: data.status,
      reviewed_by: data.reviewed_by,
      review_note: data.review_note || null,
      reviewed_at: new Date(),
    }).returning('*');
    return report;
  },

  /** ⭐ Traiter TOUS les signalements d'un message d'un coup */
  async reviewAllForMessage(messageId: string, data: { status: string; reviewed_by: string; review_note?: string }): Promise<number> {
    const count = await db('reports')
      .where({ message_id: messageId, status: 'pending' })
      .update({
        status: data.status,
        reviewed_by: data.reviewed_by,
        review_note: data.review_note || null,
        reviewed_at: new Date(),
      });
    return count;
  },

  /** Récupérer un signalement par ID */
  async findById(id: string): Promise<any | null> {
    return db('reports').where({ id }).first() || null;
  },
};
