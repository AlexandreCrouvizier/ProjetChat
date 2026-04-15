/**
 * scripts/reset-totp.ts — Réinitialiser le TOTP en cas de perte du téléphone
 * 
 * Usage :
 *   npx tsx scripts/reset-totp.ts --email ton@email.com
 *   npx tsx scripts/reset-totp.ts --username MonPseudo
 * 
 * Après reset, le prochain accès au panel admin reproposera le QR code.
 */

import { db } from '../server/src/config/database';

async function main() {
  const args = process.argv.slice(2);
  let email: string | null = null;
  let username: string | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--email' && args[i + 1]) { email = args[i + 1]; i++; }
    else if (args[i] === '--username' && args[i + 1]) { username = args[i + 1]; i++; }
  }

  if (!email && !username) {
    console.log('');
    console.log('🔄 Réinitialiser le TOTP — ChatApp');
    console.log('');
    console.log('Usage :');
    console.log('  npx tsx scripts/reset-totp.ts --email ton@email.com');
    console.log('  npx tsx scripts/reset-totp.ts --username MonPseudo');
    await db.destroy();
    process.exit(0);
  }

  let user;
  if (email) user = await db('users').where({ email }).first();
  else if (username) user = await db('users').whereRaw('LOWER(username) = ?', [username.toLowerCase()]).first();

  if (!user) {
    console.log(`❌ Utilisateur introuvable : ${email || username}`);
    await db.destroy();
    process.exit(1);
  }

  await db('users').where({ id: user.id }).update({ totp_secret: null, totp_enabled: false });

  console.log('');
  console.log(`✅ TOTP réinitialisé pour ${user.username}`);
  console.log('   Le prochain accès au panel admin affichera un nouveau QR code.');
  console.log('');

  await db.destroy();
  process.exit(0);
}

main();
