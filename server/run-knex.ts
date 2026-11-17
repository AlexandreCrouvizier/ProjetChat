/**
 * run-knex.ts — Script pour exécuter Knex CLI depuis TypeScript sur Windows
 * Usage : npx tsx run-knex.ts migrate:latest
 *         npx tsx run-knex.ts migrate:rollback
 *         npx tsx run-knex.ts seed:run
 */

import knexConfig from './knexfile';
import knex from 'knex';

const db = knex(knexConfig);
const command = process.argv[2];

async function run() {
  switch (command) {
    case 'migrate:latest': {
      console.log('🔄 Lancement des migrations...');
      const [batch, migrations] = await db.migrate.latest();
      if (migrations.length === 0) {
        console.log('✅ Aucune migration en attente');
      } else {
        console.log(`✅ Batch ${batch} : ${migrations.length} migration(s) exécutée(s)`);
        migrations.forEach((m: string) => console.log(`   → ${m}`));
      }
      break;
    }
    case 'migrate:rollback': {
      console.log('🔄 Rollback de la dernière migration...');
      const [batch, migrations] = await db.migrate.rollback();
      console.log(`✅ Batch ${batch} : ${migrations.length} migration(s) annulée(s)`);
      migrations.forEach((m: string) => console.log(`   → ${m}`));
      break;
    }
    case 'migrate:status': {
      console.log('📋 Statut des migrations :');
      const [completed, pending] = await Promise.all([
        db.migrate.list(),
      ]);
      console.log('Complétées :', completed[0].length);
      console.log('En attente  :', completed[1].length);
      break;
    }
    case 'seed:run': {
      console.log('🌱 Lancement des seeds...');
      await db.seed.run();
      console.log('✅ Seeds exécutés');
      break;
    }
    default:
      console.error('❌ Commande inconnue :', command);
      console.log('   Commandes disponibles : migrate:latest, migrate:rollback, migrate:status, seed:run');
      process.exit(1);
  }

  await db.destroy();
}

run().catch((err) => {
  // Une connexion refusée (base éteinte) arrive sans message : on affiche le code et les détails
  const inner: any[] = Array.isArray(err?.errors) ? err.errors : [];
  const code = err?.code || inner.find((e) => e?.code)?.code;
  const detail = err?.message || inner.map((e) => e?.message).filter(Boolean).join(' | ') || String(err);
  console.error('❌ Erreur :', detail, code ? `(${code})` : '');
  if (code === 'ECONNREFUSED') {
    console.error('   → PostgreSQL ne répond pas. Lancer Docker Desktop puis, à la racine du projet : docker compose up -d');
  }
  process.exit(1);
});
