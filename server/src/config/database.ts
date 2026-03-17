import knex from 'knex';
import { env } from './env';

export const db = knex({
  client: 'pg',
  connection: env.DATABASE_URL,
  pool: {
    min: 2,
    max: 10,
  },
  migrations: {
    directory: '../database/migrations',
    tableName: 'knex_migrations',
  },
  seeds: {
    directory: '../database/seeds',
  },
});

export async function testDatabaseConnection(): Promise<void> {
  try {
    await db.raw('SELECT 1');
    console.log('✅ PostgreSQL connecté');
  } catch (error) {
    console.error('❌ Erreur connexion PostgreSQL:', error);
    process.exit(1);
  }
}
