/**
 * app/legal/cgu/page.tsx — Conditions Générales d'Utilisation
 */

export default function CGU() {
  return (
    <article>
      <h1 className="text-2xl font-bold mb-6">Conditions Générales d&apos;Utilisation</h1>
      <p className="text-xs text-[var(--t3)] mb-8">Dernière mise à jour : Mars 2026</p>

      <section className="mb-8">
        <h2 className="text-lg font-bold mb-3 text-[var(--acc)]">1. Objet</h2>
        <p className="text-sm text-[var(--t2)] leading-relaxed">
          Les présentes Conditions Générales d&apos;Utilisation (CGU) régissent l&apos;accès et 
          l&apos;utilisation de la plateforme ChatApp, un service de chat en ligne communautaire. 
          En utilisant le service, vous acceptez ces conditions.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-bold mb-3 text-[var(--acc)]">2. Accès au service</h2>
        <p className="text-sm text-[var(--t2)] leading-relaxed mb-3">Le service propose trois niveaux d&apos;accès :</p>
        <div className="space-y-2">
          <div className="p-3 rounded-lg bg-[var(--glass)] border border-[var(--border)]">
            <p className="font-semibold text-[var(--t1)] text-xs">🟢 Invité (accès anonyme)</p>
            <p className="text-[11px] text-[var(--t3)] mt-1">Accès limité : lecture et participation aux salons publics avec rate limit. Pas de messages privés, pas de création de groupes, pas d&apos;upload de fichiers. Historique perdu à la déconnexion.</p>
          </div>
          <div className="p-3 rounded-lg bg-[var(--glass)] border border-[var(--border)]">
            <p className="font-semibold text-[var(--t1)] text-xs">🔵 Inscrit (compte gratuit)</p>
            <p className="text-[11px] text-[var(--t3)] mt-1">Accès complet : messages privés, création de groupes (3 max), partage d&apos;images, GIFs, historique persistant, notifications.</p>
          </div>
          <div className="p-3 rounded-lg bg-[var(--glass)] border border-[var(--border)]">
            <p className="font-semibold text-[var(--t1)] text-xs">⭐ Premium (abonnement payant)</p>
            <p className="text-[11px] text-[var(--t3)] mt-1">Toutes les fonctionnalités sans limite : fichiers, messages éphémères, personnalisation, groupes illimités, pas de publicité.</p>
          </div>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-bold mb-3 text-[var(--acc)]">3. Inscription</h2>
        <p className="text-sm text-[var(--t2)] leading-relaxed">
          L&apos;inscription est gratuite. Vous devez fournir une adresse email valide et 
          choisir un pseudo unique. Vous êtes responsable de la confidentialité de vos 
          identifiants. Tout usage de votre compte est réputé être fait par vous. 
          Le service est ouvert aux personnes de 13 ans et plus.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-bold mb-3 text-[var(--acc)]">4. Règles de conduite</h2>
        <p className="text-sm text-[var(--t2)] leading-relaxed mb-3">En utilisant le service, vous vous engagez à ne pas :</p>
        <ul className="text-sm text-[var(--t2)] space-y-1.5">
          {[
            'Publier de contenu illégal, diffamatoire, haineux, discriminatoire ou menaçant',
            'Harceler, intimider ou menacer d\'autres utilisateurs',
            'Publier du contenu à caractère sexuel ou pornographique',
            'Envoyer du spam, de la publicité non sollicitée ou des liens malveillants',
            'Usurper l\'identité d\'une autre personne',
            'Tenter de contourner les mesures de sécurité ou de modération',
            'Utiliser le service à des fins commerciales sans autorisation',
            'Collecter les données personnelles d\'autres utilisateurs',
          ].map((rule, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="text-red-400 flex-shrink-0">✕</span>{rule}
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-bold mb-3 text-[var(--acc)]">5. Modération</h2>
        <p className="text-sm text-[var(--t2)] leading-relaxed">
          Le service dispose d&apos;un système de modération à plusieurs niveaux : filtrage 
          automatique (anti-spam, mots interdits), signalement communautaire, et modération 
          humaine. Tout contenu signalé peut être masqué ou supprimé. Les utilisateurs 
          contrevenant aux règles peuvent être temporairement ou définitivement bannis.
        </p>
        <p className="text-sm text-[var(--t2)] leading-relaxed mt-2">
          Les décisions de modération sont prises en toute impartialité. En cas de désaccord, 
          vous pouvez contacter l&apos;éditeur à [votre@email.com].
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-bold mb-3 text-[var(--acc)]">6. Conservation des messages</h2>
        <div className="p-4 rounded-lg bg-amber-500/5 border border-amber-500/15 text-sm text-[var(--t2)] leading-relaxed">
          <p className="font-semibold text-amber-400 text-xs mb-2">⚠️ Information importante</p>
          <p>
            Conformément à la loi LCEN, <strong className="text-[var(--t1)]">tous les messages</strong> (y compris 
            les messages privés) sont conservés avec leur horodatage et l&apos;adresse IP de 
            l&apos;auteur pendant une durée de <strong className="text-[var(--t1)]">1 an</strong>. Cette conservation 
            est une obligation légale et ne peut faire l&apos;objet d&apos;une suppression anticipée.
          </p>
          <p className="mt-2">
            Ces données sont accessibles uniquement sur réquisition judiciaire et ne sont 
            jamais utilisées à des fins commerciales.
          </p>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-bold mb-3 text-[var(--acc)]">7. Abonnement Premium</h2>
        <p className="text-sm text-[var(--t2)] leading-relaxed">
          L&apos;abonnement Premium est géré par Stripe. Les tarifs sont indiqués sur la page 
          d&apos;abonnement. L&apos;abonnement est reconduit automatiquement sauf annulation. 
          L&apos;annulation prend effet à la fin de la période en cours. Aucun remboursement 
          partiel n&apos;est effectué en cas d&apos;annulation en cours de période.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-bold mb-3 text-[var(--acc)]">8. Propriété du contenu</h2>
        <p className="text-sm text-[var(--t2)] leading-relaxed">
          Vous restez propriétaire des contenus que vous publiez. En publiant sur la plateforme, 
          vous accordez une licence non exclusive, gratuite et mondiale d&apos;affichage et de 
          distribution de vos contenus dans le cadre du fonctionnement du service.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-bold mb-3 text-[var(--acc)]">9. Limitation de responsabilité</h2>
        <p className="text-sm text-[var(--t2)] leading-relaxed">
          Le service est fourni « en l&apos;état ». L&apos;éditeur ne garantit pas un fonctionnement 
          ininterrompu et ne peut être tenu responsable des contenus publiés par les 
          utilisateurs, ni des dommages résultant de l&apos;utilisation du service.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-bold mb-3 text-[var(--acc)]">10. Suppression de compte</h2>
        <p className="text-sm text-[var(--t2)] leading-relaxed">
          Vous pouvez supprimer votre compte à tout moment depuis les paramètres. 
          La suppression est effective immédiatement. Vos messages publiés restent 
          visibles (anonymisés) conformément aux obligations LCEN. Vos données 
          personnelles sont supprimées dans un délai de 30 jours, à l&apos;exception 
          des données de connexion (conservées 1 an, LCEN).
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold mb-3 text-[var(--acc)]">11. Modification des CGU</h2>
        <p className="text-sm text-[var(--t2)] leading-relaxed">
          Les présentes CGU peuvent être modifiées à tout moment. Les utilisateurs 
          seront informés de toute modification substantielle. L&apos;utilisation continue 
          du service après modification vaut acceptation des nouvelles conditions.
        </p>
      </section>
    </article>
  );
}
