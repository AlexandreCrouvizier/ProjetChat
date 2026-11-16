import Redis from 'ioredis';
import { env } from './env';

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    const delay = Math.min(times * 200, 5000);
    return delay;
  },
});

redis.on('connect', () => {
  console.log('✅ Redis connecté');
});

redis.on('error', (error: any) => {
  // Certaines erreurs réseau (AggregateError, ECONNRESET…) ont un message vide : on affiche le code
  const detail =
    error?.message ||
    error?.code ||
    (Array.isArray(error?.errors) ? error.errors.map((e: any) => e.code || e.message).join(', ') : String(error));
  console.error('❌ Erreur Redis:', detail);
});
