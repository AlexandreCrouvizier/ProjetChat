/**
 * scripts/change-password.ts — Changer le mot de passe d'un utilisateur
 * 
 * Script AUTONOME.
 * 
 * Usage (depuis le dossier server/) :
 *   npx tsx scripts/change-password.ts --username Raziel --password MonNouveauMDP
 */
import dotenv from 'dotenv';
import path from 'path';
import knex from 'knex';
import bcrypt from 'bcrypt';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const db = knex({
  client: 'pg',
  connection: process.env.DATABASE_URL || 'postgresql://chatapp:chatapp_dev_2026@localhost:5432/chatapp',
});

async function main() {
  const args = process.argv.slice(2);
  let username: string | null = null;
  let email: string | null = null;
  let password: string | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--username' && args[i + 1]) { username = args[i + 1]; i++; }
    else if (args[i] === '--email' && args[i + 1]) { email = args[i + 1]; i++; }
    else if (args[i] === '--password' && args[i + 1]) { password = args[i + 1]; i++; }
  }

  if ((!username && !email) || !password) {
    console.log('\n🔑 Changer un mot de passe — ChatApp');
    console.log('─'.repeat(45));
    console.log('\nUsage :');
    console.log('  npx tsx scripts/change-password.ts --username MonPseudo --password MonMDP');
    console.log('  npx tsx scripts/change-password.ts --email mon@email.com --password MonMDP\n');
    await db.destroy();
    process.exit(0);
  }

  try {
    let user: any;
    if (email) user = await db('users').where({ email }).first();
    else if (username) user = await db('users').whereRaw('LOWER(username) = ?', [username.toLowerCase()]).first();

    if (!user) {
      console.log(`\n❌ Utilisateur introuvable : ${email || username}\n`);
      await db.destroy();
      process.exit(1);
    }

    if (password.length < 6) {
      console.log('\n❌ Le mot de passe doit faire au moins 6 caractères.\n');
      await db.destroy();
      process.exit(1);
    }

    const hash = await bcrypt.hash(password, 10);
    await db('users').where({ id: user.id }).update({ password_hash: hash });

    console.log('');
    console.log('═'.repeat(45));
    console.log('  ✅ MOT DE PASSE MODIFIÉ AVEC SUCCÈS');
    console.log('═'.repeat(45));
    console.log(`\n  Pseudo : ${user.username}`);
    console.log(`  Email  : ${user.email || '(pas d\'email)'}\n`);
  } catch (error: any) {
    console.error('❌ Erreur :', error.message);
    process.exit(1);
  }

  await db.destroy();
  process.exit(0);
}

main();
