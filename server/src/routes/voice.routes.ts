/**
 * routes/voice.routes.ts — Voix / vidéo / partage d'écran
 *
 *   GET   /api/voice/status        mode effectif + droits du type de compte + emplacement des boutons
 *   GET   /api/voice/permissions   droits dans un salon / message privé précis (?group_id= ou ?conversation_id=)
 *   PATCH /api/voice/entry         choix du membre : { voice_entry: "header,composer" (emplacements) | none | null }
 *   POST  /api/voice/token         jeton d'appel LiveKit — TOUS les contrôles sont faits ici, côté serveur
 *   POST  /api/voice/test-token    test de connexion (profil) : salle personnelle, rien à publier, 1 min
 *   POST  /api/voice/ring/decline  refuser un appel entrant (message privé)   { conversation_id }
 *   POST  /api/voice/ring/cancel   annuler son propre appel avant la réponse  { conversation_id }
 *
 * 🔐 La clé secrète LiveKit ne quitte jamais le serveur (règle n° 9). Le jeton (services/livekit.service.ts)
 * ne contient que les fonctions autorisées dans CE salon : LiveKit refuse tout le reste.
 * Message privé : jamais d'appel entre comptes bloqués ; une seule sonnerie par période de 20 s.
 */
import { Router, type Request, type Response } from 'express';
import { requireAuth, optionalAuth } from '../middleware/auth.middleware';
import { rateLimit } from '../middleware/rateLimit.middleware';
import { db } from '../config/database';
import { voiceService, tierOf } from '../services/voice.service';
import { VOICE_CAPS, VOICE_PLACES, normalizeVoiceEntry, normalizeTier, type VoiceCap, type VoiceEntryChoice } from '../services/settings.service';
import { AppError } from '../utils/errors';
import { createJoinToken, createTestToken, publicLiveKitUrl, TOKEN_TTL_SECONDS } from '../services/livekit.service';
import { conversationRepository } from '../repositories/conversation.repository';
import { blockedRepository } from '../repositories/blocked.repository';
import { redis } from '../config/redis';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RING_SECONDS = 20;

const router = Router();

function fail(res: Response, error: unknown, label: string): void {
  if (error instanceof AppError) { res.status(error.statusCode).json({ error: error.code, message: error.message }); return; }
  console.error(`❌ ${label}:`, error);
  res.status(500).json({ error: 'INTERNAL_ERROR' });
}

/** GET /api/voice/status — ouvert aux visiteurs (ils sont traités comme des invités) */
router.get('/status', optionalAuth, rateLimit({ name: 'voice-status', max: 120, windowSeconds: 60 }), async (req: Request, res: Response) => {
  try {
    const tier = req.user ? await tierOf(req.user.userId) : normalizeTier('guest');
    const status = await voiceService.status(tier);
    const entry = req.user ? await voiceService.entry(req.user.userId, tier) : null;
    res.json({ ...status, entry });
  } catch (error) { fail(res, error, 'voice status'); }
});

/** GET /api/voice/permissions?group_id=… | ?conversation_id=… */
router.get('/permissions', requireAuth, rateLimit({ name: 'voice-perm', max: 120, windowSeconds: 60, by: 'user' }), async (req: Request, res: Response) => {
  try {
    const p = await voiceService.permissions(req.user!.userId, { groupId: req.query.group_id, conversationId: req.query.conversation_id });
    res.json({ mode: p.mode, kind: p.target.kind, decisions: p.decisions, max_participants: p.max_participants,
      voicemsg: p.voicemsg, voicemsg_max_seconds: p.voicemsg_max_seconds });
  } catch (error) { fail(res, error, 'voice permissions'); }
});

/** PATCH /api/voice/entry — { voice_entry: emplacements séparés par des virgules | 'none' | null } (seulement si l'admin a mis « option ») */
router.patch('/entry', requireAuth, rateLimit({ name: 'voice-entry', max: 30, windowSeconds: 60, by: 'user' }), async (req: Request, res: Response) => {
  try {
    const raw = req.body?.voice_entry;
    const value = raw === null ? null : normalizeVoiceEntry(raw);
    if (raw !== null && value === null) {
      res.status(400).json({ error: 'VALIDATION_ERROR', message: `Choix invalide (emplacements : ${VOICE_PLACES.join(', ')} · ou none · ou null)`, field: 'voice_entry' });
      return;
    }
    const tier = await tierOf(req.user!.userId);
    const current = await voiceService.entry(req.user!.userId, tier);
    if (current.rule !== 'option') {
      res.status(403).json({ error: 'ENTRY_LOCKED', message: "L'emplacement des boutons d'appel est imposé par l'administrateur" });
      return;
    }
    await db('users').where({ id: req.user!.userId }).update({ voice_entry: value });
    res.json(await voiceService.entry(req.user!.userId, tier));
  } catch (error) { fail(res, error, 'voice entry'); }
});

/** POST /api/voice/token — { group_id | conversation_id, capabilities?: ('voice'|'video'|'screen')[] } */
router.post('/token', requireAuth, rateLimit({ name: 'voice-token', max: 30, windowSeconds: 60, by: 'user' }), async (req: Request, res: Response) => {
  try {
    const wanted: unknown = req.body?.capabilities ?? ['voice'];
    if (!Array.isArray(wanted) || wanted.length === 0 || wanted.length > 3 || !wanted.every((c) => VOICE_CAPS.includes(c as VoiceCap))) {
      res.status(400).json({ error: 'VALIDATION_ERROR', message: `Fonctions demandées invalides (${VOICE_CAPS.join(' | ')})`, field: 'capabilities' });
      return;
    }
    const p = await voiceService.permissions(req.user!.userId, { groupId: req.body?.group_id, conversationId: req.body?.conversation_id });
    // Mode général : « désactivée » et « indisponible » ne délivrent jamais rien
    if (p.mode === 'off') { res.status(403).json({ error: 'VOICE_DISABLED', message: 'La voix et la vidéo sont désactivées' }); return; }
    if (p.mode === 'unavailable') { res.status(503).json({ error: 'VOICE_UNAVAILABLE', message: 'Indisponible pour le moment' }); return; }
    const denied = (wanted as VoiceCap[]).find((c) => !p.decisions[c].allowed);
    if (denied) {
      res.status(403).json({ error: 'VOICE_NOT_ALLOWED', capability: denied, reason: p.decisions[denied].reason, message: 'Cette fonction n\'est pas autorisée ici' });
      return;
    }
    const me = req.user!;
    const url = publicLiveKitUrl();
    if (!url) { res.status(503).json({ error: 'VOICE_UNAVAILABLE', message: 'Indisponible pour le moment' }); return; }

    // Message privé : jamais d'appel entre comptes bloqués (dans un sens ou dans l'autre)
    let other: { id: string; username: string } | null = null;
    if (p.target.conversationId) {
      other = await conversationRepository.getOtherParticipant(p.target.conversationId, me.userId);
      if (other && await blockedRepository.isEitherBlocked(me.userId, other.id)) {
        res.status(403).json({ error: 'VOICE_BLOCKED', message: 'Appel impossible avec ce membre' });
        return;
      }
    }

    // Le jeton contient TOUTES les fonctions autorisées ici (on peut allumer la caméra en cours d'appel), rien de plus
    const allowed = VOICE_CAPS.filter((c) => p.decisions[c].allowed);
    const { token, room } = await createJoinToken({
      userId: me.userId, username: me.username, target: p.target, caps: allowed, maxParticipants: p.max_participants,
    });

    // Sonnerie en message privé (une seule fois par période, et seulement si l'autre peut décrocher)
    let ring: 'sent' | 'skipped' | 'unavailable' | undefined;
    if (other && p.target.conversationId) {
      const cid = p.target.conversationId;
      const io = req.app.get('io');
      // Mes autres onglets / appareils arrêtent de sonner : j'ai décroché ou lancé l'appel
      io?.to(`user:${me.userId}`).emit('voice:ring_stop', { conversation_id: cid });
      if (req.body?.ring === false) ring = 'skipped';
      else {
        const theirs = await voiceService.permissions(other.id, { conversationId: cid }).catch(() => null);
        const caps = theirs ? (wanted as VoiceCap[]).filter((c) => theirs.decisions[c]?.allowed) : [];
        if (theirs && !caps.length && theirs.decisions.voice?.allowed) caps.push('voice');
        if (!caps.length) ring = 'unavailable';
        else {
          const first = await redis.set(`voice:ring:${cid}:${me.userId}`, '1', 'EX', RING_SECONDS, 'NX');
          if (first) {
            io?.to(`user:${other.id}`).emit('voice:ring', {
              conversation_id: cid,
              from: { id: me.userId, username: me.username },
              capabilities: caps,
              expires_in: RING_SECONDS + 10,
            });
          }
          ring = 'sent';
        }
      }
    }

    res.json({
      token, url, room,
      identity: me.userId,
      capabilities: allowed,
      start: wanted,
      max_participants: p.max_participants,
      expires_in: TOKEN_TTL_SECONDS,
      ...(ring ? { ring } : {}),
    });
  } catch (error) { fail(res, error, 'voice token'); }
});

/** POST /api/voice/test-token — test de connexion du profil (seulement si le compte a au moins une fonction d'appel) */
router.post('/test-token', requireAuth, rateLimit({ name: 'voice-test', max: 10, windowSeconds: 60, by: 'user' }), async (req: Request, res: Response) => {
  try {
    const tier = await tierOf(req.user!.userId);
    const st = await voiceService.status(tier);
    if (st.mode === 'off') { res.status(403).json({ error: 'VOICE_DISABLED', message: 'La voix et la vidéo sont désactivées' }); return; }
    const url = publicLiveKitUrl();
    if (st.mode === 'unavailable' || !url) { res.status(503).json({ error: 'VOICE_UNAVAILABLE', message: 'Indisponible pour le moment' }); return; }
    if (!VOICE_CAPS.some((c) => st.caps[c])) { res.status(403).json({ error: 'VOICE_NOT_ALLOWED', message: 'Les appels ne sont pas autorisés pour ton compte' }); return; }
    const { token, room } = await createTestToken(req.user!.userId, req.user!.username);
    res.json({ token, url, room });
  } catch (error) { fail(res, error, 'voice test token'); }
});

/** Sonnerie : refuser (destinataire) ou annuler (appelant). Seuls les participants du message privé peuvent l'utiliser. */
async function ringSignal(req: Request, res: Response, event: 'voice:ring_declined' | 'voice:ring_cancelled'): Promise<void> {
  const cid = req.body?.conversation_id;
  if (typeof cid !== 'string' || !UUID.test(cid) || !(await conversationRepository.isParticipant(cid, req.user!.userId))) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Conversation introuvable' });
    return;
  }
  const other = await conversationRepository.getOtherParticipant(cid, req.user!.userId);
  const io = req.app.get('io');
  const payload = { conversation_id: cid, by: { id: req.user!.userId, username: req.user!.username } };
  if (other) io?.to(`user:${other.id}`).emit(event, payload);
  if (event === 'voice:ring_declined') {
    io?.to(`user:${req.user!.userId}`).emit('voice:ring_stop', { conversation_id: cid });
    // L'appelant pourra rappeler, mais pas avant 5 s (au lieu de 20)
    if (other) await redis.set(`voice:ring:${cid}:${other.id}`, '1', 'EX', 5);
  } else await redis.del(`voice:ring:${cid}:${req.user!.userId}`);
  res.json({ ok: true });
}
const ringLimit = rateLimit({ name: 'voice-ring', max: 30, windowSeconds: 60, by: 'user' });
router.post('/ring/decline', requireAuth, ringLimit, (req, res) => { ringSignal(req, res, 'voice:ring_declined').catch((e) => fail(res, e, 'voice decline')); });
router.post('/ring/cancel', requireAuth, ringLimit, (req, res) => { ringSignal(req, res, 'voice:ring_cancelled').catch((e) => fail(res, e, 'voice cancel')); });

export default router;
