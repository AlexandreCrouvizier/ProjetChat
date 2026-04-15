/**
 * scripts/create-superadmin.ts — Promouvoir un utilisateur en superadmin
 * 
 * Script AUTONOME — crée sa propre connexion BDD, pas d'import du projet.
 * 
 * Usage (depuis le dossier server/) :
 *   npx tsx scripts/create-superadmin.ts --username Raziel
 *   npx tsx scripts/create-superadmin.ts --email ton@email.com
 *   npx tsx scripts/create-superadmin.ts              (liste les comptes)
 */
import dotenv from 'dotenv';
import path from 'path';
import knex from 'knex';

// Charger le .env depuis la racine du projet
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Connexion BDD autonome
const db = knex({
  client: 'pg',
  connection: process.env.DATABASE_URL || 'postgresql://chatapp:chatapp_dev_2026@localhost:5432/chatapp',
});

async function main() {
  const args = process.argv.slice(2);
  let email: string | null = null;
  let username: string | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--email' && args[i + 1]) { email = args[i + 1]; i++; }
    else if (args[i] === '--username' && args[i + 1]) { username = args[i + 1]; i++; }
  }

  // Vérifier que la colonne app_role existe
  const hasColumn = await db.schema.hasColumn('users', 'app_role');
  if (!hasColumn) {
    console.log('\n❌ La colonne app_role n\'existe pas dans la table users.');
    console.log('   Lancez d\'abord la migration :');
    console.log('   npx tsx run-knex.ts migrate:latest\n');
    await db.destroy();
    process.exit(1);
  }

  if (!email && !username) {
    console.log('');
    console.log('🛡️  Créer un superadmin — ChatApp');
    console.log('─'.repeat(45));
    console.log('');
    console.log('Usage :');
    console.log('  npx tsx scripts/create-superadmin.ts --email ton@email.com');
    console.log('  npx tsx scripts/create-superadmin.ts --username MonPseudo');
    console.log('');

    const users = await db('users')
      .whereIn('tier', ['registered', 'premium'])
      .select('id', 'username', 'email', 'tier', 'app_role')
      .orderBy('created_at', 'asc');

    if (users.length === 0) {
      console.log('❌ Aucun utilisateur inscrit trouvé.');
      console.log('   Créez d\'abord un compte sur l\'application.\n');
    } else {
      console.log('Utilisateurs disponibles :');
      console.log('');
      users.forEach((u: any, i: number) => {
        const badge = u.app_role === 'superadmin' ? ' ⭐ SUPERADMIN' : '';
        console.log(`  ${i + 1}. ${u.username} (${u.email || 'pas d\'email'}) — ${u.tier}${badge}`);
      });
      console.log('');
      console.log('Relancez avec --username ou --email pour promouvoir.\n');
    }

    await db.destroy();
    process.exit(0);
  }

  try {
    let user: any;
    if (email) {
      user = await db('users').where({ email }).first();
    } else if (username) {
      user = await db('users').whereRaw('LOWER(username) = ?', [username.toLowerCase()]).first();
    }

    if (!user) {
      console.log(`\n❌ Utilisateur introuvable : ${email || username}\n`);
      await db.destroy();
      process.exit(1);
    }

    if (user.app_role === 'superadmin') {
      console.log(`\nℹ️  ${user.username} est déjà superadmin.\n`);
      await db.destroy();
      process.exit(0);
    }

    await db('users').where({ id: user.id }).update({ app_role: 'superadmin' });

    console.log('');
    console.log('═'.repeat(45));
    console.log('  ✅ SUPERADMIN CRÉÉ AVEC SUCCÈS');
    console.log('═'.repeat(45));
    console.log('');
    console.log(`  Pseudo   : ${user.username}`);
    console.log(`  Email    : ${user.email || '(pas d\'email)'}`);
    console.log(`  Tier     : ${user.tier}`);
    console.log('');
    console.log('  Prochaines étapes :');
    console.log('  1. Connectez-vous avec ce compte');
    console.log('  2. Ouvrez /panel/{ADMIN_PANEL_SLUG}');
    console.log('  3. Scannez le QR code TOTP');
    console.log('');
  } catch (error: any) {
    console.error('❌ Erreur :', error.message);
    process.exit(1);
  }

  await db.destroy();
  process.exit(0);
}

main();
