// ===== CONSTANTES PARTAGÉES =====
// Utilisées par le client ET le serveur

// Limites par tier
export const TIER_LIMITS = {
  guest: {
    maxPublicGroups: 3,
    maxGroupCreations: 0,
    rateLimitMs: 10000,       // 1 message / 10s
    canSendDMs: false,
    canUploadImages: false,
    canUploadFiles: false,
    canUseGifs: false,
    allowedReactions: ['👍', '👎'],
    hasHistory: false,
    storageQuotaBytes: 0,                  // aucun envoi de fichier
  },
  registered: {
    maxPublicGroups: 5,
    maxGroupCreations: 3,
    rateLimitMs: 1000,        // 1 message / 1s
    canSendDMs: true,
    canUploadImages: true,
    canUploadFiles: false,
    canUseGifs: true,
    maxImageSize: 5 * 1024 * 1024,  // 5 Mo
    allowedReactions: 'all',
    hasHistory: true,
    storageQuotaBytes: 200 * 1024 * 1024,  // 200 Mo d'images (+ avatar) au total
  },
  premium: {
    maxPublicGroups: Infinity,
    maxGroupCreations: Infinity,
    rateLimitMs: 500,
    canSendDMs: true,
    canUploadImages: true,
    canUploadFiles: true,
    canUseGifs: true,
    maxImageSize: 25 * 1024 * 1024,   // 25 Mo
    maxFileSize: 100 * 1024 * 1024,    // 100 Mo
    storageQuotaBytes: 2 * 1024 * 1024 * 1024, // 2 Go d'images et fichiers au total
    allowedReactions: 'all',
    hasHistory: true,
    canCustomizeColors: true,
    canCustomizeSounds: true,
    canSendEphemeral: true,
  },
} as const;

// Validation
export const VALIDATION = {
  username: {
    minLength: 3,
    maxLength: 30,
    pattern: /^[a-zA-Z0-9_-]+$/,
  },
  password: {
    minLength: 8,
    pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/,
  },
  message: {
    maxLength: 4000,
  },
  bio: {
    maxLength: 500,
  },
  groupName: {
    minLength: 3,
    maxLength: 100,
  },
  groupDescription: {
    maxLength: 500,
  },
};

// Auto-suppression des salons
export const SALON_CLEANUP = {
  inactiveDelay: 2 * 60 * 60 * 1000,   // 2 heures → marqué inactif
  archiveDelay: 24 * 60 * 60 * 1000,    // 1 jour → archivé
  deleteDelay: 24 * 60 * 60 * 1000,     // 24h après archivage → supprimé
  premiumMultiplier: 2,                  // Délais doublés pour les salons premium
};

// Modération
export const MODERATION = {
  autoHideThreshold: 3,    // Nombre de signalements pour masquer automatiquement
  guestRateLimitMultiplier: 10,
};

// 🔐 Domaines d'hébergement des GIF (Klipy : static.klipy.com, static1/2.klipy.com ; GIPHY : media*.giphy.com,
// i.giphy.com ; Tenor : media.tenor.com). SEULE source de vérité, utilisée par :
//   - le serveur : un message GIF n'est accepté que si son image est hébergée ici ;
//   - le client : CSP img-src et affichage des GIF, via sa COPIE client/lib/gifMedia.ts
//     (Next.js ne peut pas importer hors de client/) → les deux listes doivent rester identiques.
export const GIF_MEDIA_DOMAINS = ['klipy.com', 'giphy.com', 'tenor.com'] as const;

/** L'adresse est-elle une image https hébergée par un fournisseur de GIF ? */
export function isGifMediaUrl(value: unknown): boolean {
  if (typeof value !== 'string' || value.length > 1000) return false;
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return false;
    const host = u.hostname.toLowerCase();
    return GIF_MEDIA_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
  } catch {
    return false;
  }
}
