/**
 * scripts/reset-totp.ts — Réinitialiser le TOTP (perte du téléphone)
 * 
 * Script AUTONOME.
 * 
 * Usage (depuis le dossier server/) :
 *   npx tsx scripts/reset-totp.ts --username Raziel
 */
import dotenv from 'dotenv';
import path from 'path';
import knex from 'knex';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const db = knex({
  client: 'pg',
  connection: process.env.DATABASE_URL || 'postgresql://chatapp:chatapp_dev_2026@localhost:5432/chatapp',
});

async function main() {
  const args = process.argv.slice(2);
  let username: string | null = null;
  let email: string | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--username' && args[i + 1]) { username = args[i + 1]; i++; }
    else if (args[i] === '--email' && args[i + 1]) { email = args[i + 1]; i++; }
  }

  if (!username && !email) {
    console.log('\n🔄 Réinitialiser le TOTP — ChatApp');
    console.log('\nUsage :');
    console.log('  npx tsx scripts/reset-totp.ts --username MonPseudo');
    console.log('  npx tsx scripts/reset-totp.ts --email mon@email.com\n');
    await db.destroy();
    process.exit(0);
  }

  let user: any;
  if (email) user = await db('users').where({ email }).first();
  else if (username) user = await db('users').whereRaw('LOWER(username) = ?', [username.toLowerCase()]).first();

  if (!user) {
    console.log(`\n❌ Utilisateur introuvable : ${email || username}\n`);
    await db.destroy();
    process.exit(1);
  }

  await db('users').where({ id: user.id }).update({ totp_secret: null, totp_enabled: false });

  console.log(`\n✅ TOTP réinitialisé pour ${user.username}`);
  console.log('   Le prochain accès au panel admin affichera un nouveau QR code.\n');

  await db.destroy();
  process.exit(0);
}

main();
