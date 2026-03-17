/**
 * app/legal/privacy/page.tsx — Politique de confidentialité (RGPD)
 * 
 * Document obligatoire qui détaille :
 *   - Quelles données sont collectées
 *   - Pourquoi (base légale)
 *   - Combien de temps
 *   - Les droits de l'utilisateur
 */

export default function PrivacyPolicy() {
  return (
    <article>
      <h1 className="text-2xl font-bold mb-6">Politique de confidentialité</h1>
      <p className="text-xs text-[var(--t3)] mb-8">Dernière mise à jour : Mars 2026</p>

      <section className="mb-8">
        <h2 className="text-lg font-bold mb-3 text-[var(--acc)]">1. Responsable du traitement</h2>
        <p className="text-sm text-[var(--t2)] leading-relaxed">
          Le responsable du traitement des données personnelles est [Votre nom], 
          joignable à l&apos;adresse [votre@email.com].
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-bold mb-3 text-[var(--acc)]">2. Données collectées</h2>
        <p className="text-sm text-[var(--t2)] leading-relaxed mb-3">
          Nous collectons les données suivantes selon votre mode d&apos;utilisation :
        </p>

        {/* Tableau des données par tier */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs border border-[var(--border)] rounded-lg overflow-hidden">
            <thead>
              <tr className="bg-[var(--glass-s)]">
                <th className="text-left p-3 text-[var(--t3)] font-semibold border-b border-[var(--border)]">Donnée</th>
                <th className="text-center p-3 text-[var(--t3)] font-semibold border-b border-[var(--border)]">Invité</th>
                <th className="text-center p-3 text-[var(--t3)] font-semibold border-b border-[var(--border)]">Inscrit</th>
                <th className="text-center p-3 text-[var(--t3)] font-semibold border-b border-[var(--border)]">Premium</th>
              </tr>
            </thead>
            <tbody className="text-[var(--t2)]">
              <tr className="border-b border-[var(--border)]">
                <td className="p-3">Pseudo</td><td className="p-3 text-center">✓</td><td className="p-3 text-center">✓</td><td className="p-3 text-center">✓</td>
              </tr>
              <tr className="border-b border-[var(--border)] bg-[var(--glass)]">
                <td className="p-3">Adresse email</td><td className="p-3 text-center">—</td><td className="p-3 text-center">✓</td><td className="p-3 text-center">✓</td>
              </tr>
              <tr className="border-b border-[var(--border)]">
                <td className="p-3">Mot de passe (hashé)</td><td className="p-3 text-center">—</td><td className="p-3 text-center">✓</td><td className="p-3 text-center">✓</td>
              </tr>
              <tr className="border-b border-[var(--border)] bg-[var(--glass)]">
                <td className="p-3">Adresse IP</td><td className="p-3 text-center">✓</td><td className="p-3 text-center">✓</td><td className="p-3 text-center">✓</td>
              </tr>
              <tr className="border-b border-[var(--border)]">
                <td className="p-3">Messages envoyés</td><td className="p-3 text-center">✓</td><td className="p-3 text-center">✓</td><td className="p-3 text-center">✓</td>
              </tr>
              <tr className="border-b border-[var(--border)] bg-[var(--glass)]">
                <td className="p-3">Données de connexion (date, heure, IP, navigateur)</td><td className="p-3 text-center">✓</td><td className="p-3 text-center">✓</td><td className="p-3 text-center">✓</td>
              </tr>
              <tr>
                <td className="p-3">Données de paiement</td><td className="p-3 text-center">—</td><td className="p-3 text-center">—</td><td className="p-3 text-center">Via Stripe</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-bold mb-3 text-[var(--acc)]">3. Finalités et bases légales</h2>
        <div className="space-y-4 text-sm text-[var(--t2)] leading-relaxed">
          <div className="p-3 rounded-lg bg-[var(--glass)] border border-[var(--border)]">
            <p className="font-semibold text-[var(--t1)] mb-1">Fonctionnement du service</p>
            <p>Authentification, envoi de messages, gestion du profil.</p>
            <p className="text-xs text-[var(--t3)] mt-1">Base légale : exécution du contrat (art. 6.1.b RGPD)</p>
          </div>
          <div className="p-3 rounded-lg bg-[var(--glass)] border border-[var(--border)]">
            <p className="font-semibold text-[var(--t1)] mb-1">Conservation des données de connexion</p>
            <p>Adresses IP, horodatages, identifiants — conservés 1 an.</p>
            <p className="text-xs text-[var(--t3)] mt-1">Base légale : obligation légale LCEN (art. 6.1.c RGPD)</p>
          </div>
          <div className="p-3 rounded-lg bg-[var(--glass)] border border-[var(--border)]">
            <p className="font-semibold text-[var(--t1)] mb-1">Conservation des messages privés</p>
            <p>Tous les messages (y compris privés) sont conservés avec horodatage et adresse IP de l&apos;auteur pendant 1 an, conformément à la LCEN.</p>
            <p className="text-xs text-[var(--t3)] mt-1">Base légale : obligation légale LCEN (art. 6.1.c RGPD)</p>
          </div>
          <div className="p-3 rounded-lg bg-[var(--glass)] border border-[var(--border)]">
            <p className="font-semibold text-[var(--t1)] mb-1">Modération et sécurité</p>
            <p>Détection de spam, filtrage de contenu, actions de modération.</p>
            <p className="text-xs text-[var(--t3)] mt-1">Base légale : intérêt légitime (art. 6.1.f RGPD)</p>
          </div>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-bold mb-3 text-[var(--acc)]">4. Durée de conservation</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border border-[var(--border)] rounded-lg overflow-hidden">
            <thead>
              <tr className="bg-[var(--glass-s)]">
                <th className="text-left p-3 text-[var(--t3)] font-semibold border-b border-[var(--border)]">Donnée</th>
                <th className="text-left p-3 text-[var(--t3)] font-semibold border-b border-[var(--border)]">Durée</th>
                <th className="text-left p-3 text-[var(--t3)] font-semibold border-b border-[var(--border)]">Justification</th>
              </tr>
            </thead>
            <tbody className="text-[var(--t2)]">
              <tr className="border-b border-[var(--border)]">
                <td className="p-3">Compte utilisateur</td>
                <td className="p-3">Jusqu&apos;à suppression par l&apos;utilisateur</td>
                <td className="p-3">Exécution du contrat</td>
              </tr>
              <tr className="border-b border-[var(--border)] bg-[var(--glass)]">
                <td className="p-3">Données de connexion (IP, logs)</td>
                <td className="p-3 font-semibold text-[var(--t1)]">1 an</td>
                <td className="p-3">LCEN (obligation légale)</td>
              </tr>
              <tr className="border-b border-[var(--border)]">
                <td className="p-3">Messages (tous, y compris PV)</td>
                <td className="p-3 font-semibold text-[var(--t1)]">1 an minimum</td>
                <td className="p-3">LCEN (obligation légale)</td>
              </tr>
              <tr className="border-b border-[var(--border)] bg-[var(--glass)]">
                <td className="p-3">Compte invité inactif</td>
                <td className="p-3">24 heures</td>
                <td className="p-3">Nettoyage automatique</td>
              </tr>
              <tr>
                <td className="p-3">Données de paiement</td>
                <td className="p-3">Gérées par Stripe</td>
                <td className="p-3">Voir politique Stripe</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-bold mb-3 text-[var(--acc)]">5. Partage des données</h2>
        <p className="text-sm text-[var(--t2)] leading-relaxed">
          Vos données personnelles ne sont <strong className="text-[var(--t1)]">jamais vendues</strong> à 
          des tiers. Elles peuvent être partagées avec :
        </p>
        <ul className="text-sm text-[var(--t2)] mt-2 space-y-1">
          <li className="flex items-start gap-2"><span className="text-[var(--acc)]">▸</span>Les autorités judiciaires sur réquisition légale (LCEN)</li>
          <li className="flex items-start gap-2"><span className="text-[var(--acc)]">▸</span>Stripe (paiements premium) — voir <a href="https://stripe.com/fr/privacy" target="_blank" rel="noopener" className="text-[var(--acc)] hover:underline">politique Stripe</a></li>
          <li className="flex items-start gap-2"><span className="text-[var(--acc)]">▸</span>Google (OAuth connexion) — uniquement si vous choisissez cette méthode</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-bold mb-3 text-[var(--acc)]">6. Sécurité des données</h2>
        <p className="text-sm text-[var(--t2)] leading-relaxed">
          Nous mettons en œuvre des mesures techniques pour protéger vos données : 
          chiffrement des mots de passe (bcrypt), connexion HTTPS, tokens JWT signés, 
          accès restreint aux données sensibles, et chiffrement au repos des logs de connexion.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-bold mb-3 text-[var(--acc)]">7. Vos droits (RGPD)</h2>
        <p className="text-sm text-[var(--t2)] leading-relaxed mb-3">
          Conformément au Règlement Général sur la Protection des Données (RGPD), vous disposez des droits suivants :
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {[
            { icon: '👁️', title: 'Droit d\'accès', desc: 'Savoir quelles données nous détenons sur vous' },
            { icon: '✏️', title: 'Droit de rectification', desc: 'Corriger vos données inexactes' },
            { icon: '🗑️', title: 'Droit à l\'effacement', desc: 'Demander la suppression de vos données' },
            { icon: '📦', title: 'Droit à la portabilité', desc: 'Récupérer vos données dans un format lisible' },
            { icon: '⛔', title: 'Droit d\'opposition', desc: 'S\'opposer au traitement de vos données' },
            { icon: '⏸️', title: 'Droit à la limitation', desc: 'Limiter le traitement de vos données' },
          ].map(right => (
            <div key={right.title} className="p-3 rounded-lg bg-[var(--glass)] border border-[var(--border)]">
              <p className="font-semibold text-[var(--t1)] text-xs">{right.icon} {right.title}</p>
              <p className="text-[11px] text-[var(--t3)] mt-1">{right.desc}</p>
            </div>
          ))}
        </div>
        <p className="text-sm text-[var(--t2)] leading-relaxed mt-4">
          Pour exercer ces droits, contactez-nous à <strong className="text-[var(--t1)]">[votre@email.com]</strong>.
          Nous répondrons dans un délai de 30 jours.
        </p>
        <p className="text-sm text-[var(--t2)] leading-relaxed mt-2">
          <strong className="text-[var(--t1)]">Note importante :</strong> les données conservées au titre de la LCEN 
          (logs de connexion, IP) ne peuvent pas être supprimées avant l&apos;expiration du délai légal d&apos;un an, 
          même en cas de demande d&apos;effacement. C&apos;est une obligation légale qui prime sur le droit à l&apos;effacement.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold mb-3 text-[var(--acc)]">8. Réclamation</h2>
        <p className="text-sm text-[var(--t2)] leading-relaxed">
          Si vous estimez que vos droits ne sont pas respectés, vous pouvez introduire 
          une réclamation auprès de la CNIL (Commission Nationale de l&apos;Informatique et des Libertés) 
          sur <a href="https://www.cnil.fr" target="_blank" rel="noopener" className="text-[var(--acc)] hover:underline">www.cnil.fr</a>.
        </p>
      </section>
    </article>
  );
}
