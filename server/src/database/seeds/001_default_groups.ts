/**
 * Seed 001 — Données initiales
 * 
 * Crée le salon "général" par défaut.
 * Ce salon est marqué "officiel" = exempt d'auto-suppression.
 */

import type { Knex } from 'knex';

export async function seed(knex: Knex): Promise<void> {
  // Vérifie si le salon existe déjà (évite les doublons si on relance le seed)
  const existing = await knex('groups').where('name', 'général').first();
  
  if (!existing) {
    await knex('groups').insert({
      name: 'général',
      description: 'Discussion libre — Tout le monde est bienvenu !',
      type: 'public',
      is_official: true,   // Ne sera jamais auto-supprimé
      status: 'active',
      member_count: 0,
    });

    console.log('✅ Salon "général" créé');
  } else {
    console.log('ℹ️  Salon "général" existe déjà');
  }
}
