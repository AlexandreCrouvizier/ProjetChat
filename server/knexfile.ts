// knexfile.ts — À la racine de /server pour que la CLI knex le trouve
// La CLI knex cherche ce fichier par défaut dans le dossier courant

import 'dotenv/config';
import path from 'path';
import type { Knex } from 'knex';

const config: Knex.Config = {
  client: 'pg',
  connection: process.env.DATABASE_URL || 'postgresql://chatapp:chatapp_dev_2026@localhost:5432/chatapp',
  pool: {
    min: 2,
    max: 10,
  },
  migrations: {
    directory: path.resolve(__dirname, 'src/database/migrations'),
    extension: 'ts',
  },
  seeds: {
    directory: path.resolve(__dirname, 'src/database/seeds'),
    extension: 'ts',
  },
};

export default config;
