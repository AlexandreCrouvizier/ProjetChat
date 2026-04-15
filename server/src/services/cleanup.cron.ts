/**
 * services/cleanup.cron.ts — Démarrage du cron de nettoyage
 * 
 * Usage : importer dans server.ts après le démarrage du serveur
 * 
 *   import { startCleanupCron } from './services/cleanup.cron';
 *   startCleanupCron();
 */
import { cleanupService } from './cleanup.service';

const CLEANUP_INTERVAL = 5 * 60 * 1000; // Toutes les 5 minutes

let intervalId: ReturnType<typeof setInterval> | null = null;

export function startCleanupCron(): void {
  if (intervalId) return; // Déjà démarré

  console.log('🧹 Cron cleanup démarré (intervalle: 5min)');

  // Premier run après 30 secondes (laisser le serveur démarrer)
  setTimeout(async () => {
    const result = await cleanupService.run();
    if (result.inactivated + result.archived + result.deleted > 0) {
      console.log(`🧹 Cleanup initial: ${result.inactivated} inactivés, ${result.archived} archivés, ${result.deleted} supprimés`);
    }
  }, 30000);

  // Puis toutes les 5 minutes
  intervalId = setInterval(async () => {
    const result = await cleanupService.run();
    if (result.inactivated + result.archived + result.deleted > 0) {
      console.log(`🧹 Cleanup: ${result.inactivated} inactivés, ${result.archived} archivés, ${result.deleted} supprimés`);
    }
  }, CLEANUP_INTERVAL);
}

export function stopCleanupCron(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('🧹 Cron cleanup arrêté');
  }
}
