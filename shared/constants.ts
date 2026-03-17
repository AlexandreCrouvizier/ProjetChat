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
