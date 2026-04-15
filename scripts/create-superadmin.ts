/**
 * scripts/create-superadmin.ts — Promouvoir un utilisateur en superadmin
 * 
 * Usage :
 *   npx tsx scripts/create-superadmin.ts --email ton@email.com
 *   npx tsx scripts/create-superadmin.ts --username MonPseudo
 * 
 * Ce script :
 *   1. Cherche l'utilisateur par email ou username
 *   2. Le passe en app_role = 'superadmin'
 *   3. Affiche une confirmation
 * 
 * ⚠️ À exécuter UNIQUEMENT depuis le serveur (pas d'interface web)
 * ⚠️ Supprimer ce script en production après usage si besoin
 */

import { db } from '../server/src/config/database';

async function main() {
  const args = process.argv.slice(2);

  // Parser les arguments
  let email: string | null = null;
  let username: string | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--email' && args[i + 1]) {
      email = args[i + 1];
      i++;
    } else if (args[i] === '--username' && args[i + 1]) {
      username = args[i + 1];
      i++;
    }
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

    // Mode interactif : lister les utilisateurs registered/premium
    const users = await db('users')
      .whereIn('tier', ['registered', 'premium'])
      .select('id', 'username', 'email', 'tier', 'app_role')
      .orderBy('created_at', 'asc');

    if (users.length === 0) {
      console.log('❌ Aucun utilisateur inscrit trouvé.');
      console.log('   Créez d\'abord un compte sur l\'application.');
    } else {
      console.log('Utilisateurs disponibles :');
      console.log('');
      users.forEach((u, i) => {
        const badge = u.app_role === 'superadmin' ? ' ⭐ SUPERADMIN' : '';
        console.log(`  ${i + 1}. ${u.username} (${u.email || 'pas d\'email'}) — ${u.tier}${badge}`);
      });
      console.log('');
      console.log('Relancez avec --email ou --username pour promouvoir un compte.');
    }

    await db.destroy();
    process.exit(0);
  }

  try {
    // Chercher l'utilisateur
    let user;
    if (email) {
      user = await db('users').where({ email }).first();
    } else if (username) {
      user = await db('users').whereRaw('LOWER(username) = ?', [username.toLowerCase()]).first();
    }

    if (!user) {
      console.log('');
      console.log(`❌ Utilisateur introuvable : ${email || username}`);
      console.log('   Vérifiez l\'email ou le pseudo et réessayez.');
      await db.destroy();
      process.exit(1);
    }

    // Déjà superadmin ?
    if (user.app_role === 'superadmin') {
      console.log('');
      console.log(`ℹ️  ${user.username} est déjà superadmin.`);
      await db.destroy();
      process.exit(0);
    }

    // Promouvoir
    await db('users').where({ id: user.id }).update({ app_role: 'superadmin' });

    console.log('');
    console.log('═'.repeat(45));
    console.log('  ✅ SUPERADMIN CRÉÉ AVEC SUCCÈS');
    console.log('═'.repeat(45));
    console.log('');
    console.log(`  Pseudo   : ${user.username}`);
    console.log(`  Email    : ${user.email || '(pas d\'email)'}`);
    console.log(`  Tier     : ${user.tier}`);
    console.log(`  ID       : ${user.id}`);
    console.log('');
    console.log('  Prochaine étape :');
    console.log('  → Connectez-vous avec ce compte');
    console.log('  → Accédez à l\'URL admin secrète');
    console.log('  → Scannez le QR code TOTP avec Google Authenticator');
    console.log('');

  } catch (error: any) {
    console.error('❌ Erreur :', error.message);
    process.exit(1);
  }

  await db.destroy();
  process.exit(0);
}

main();
