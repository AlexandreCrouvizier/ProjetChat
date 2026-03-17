/**
 * app/legal/mentions/page.tsx — Mentions légales
 * 
 * Obligatoire pour tout site web français (LCEN art. 6-III).
 * À compléter avec tes vraies informations.
 */

export default function MentionsLegales() {
  return (
    <article>
      <h1 className="text-2xl font-bold mb-6">Mentions légales</h1>
      <p className="text-xs text-[var(--t3)] mb-8">Dernière mise à jour : Mars 2026</p>

      <section className="mb-8">
        <h2 className="text-lg font-bold mb-3 text-[var(--acc)]">1. Éditeur du site</h2>
        <div className="text-sm text-[var(--t2)] leading-relaxed space-y-1">
          <p><strong className="text-[var(--t1)]">Nom :</strong> [Votre nom complet]</p>
          <p><strong className="text-[var(--t1)]">Statut :</strong> Personne physique — Projet personnel</p>
          <p><strong className="text-[var(--t1)]">Adresse :</strong> [Votre adresse]</p>
          <p><strong className="text-[var(--t1)]">Email :</strong> [votre@email.com]</p>
          <p><strong className="text-[var(--t1)]">Directeur de la publication :</strong> [Votre nom]</p>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-bold mb-3 text-[var(--acc)]">2. Hébergeur</h2>
        <div className="text-sm text-[var(--t2)] leading-relaxed space-y-1">
          <p><strong className="text-[var(--t1)]">Nom :</strong> [Nom de l&apos;hébergeur]</p>
          <p><strong className="text-[var(--t1)]">Adresse :</strong> [Adresse de l&apos;hébergeur]</p>
          <p><strong className="text-[var(--t1)]">Téléphone :</strong> [Numéro]</p>
          <p><strong className="text-[var(--t1)]">Site web :</strong> [URL de l&apos;hébergeur]</p>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-bold mb-3 text-[var(--acc)]">3. Propriété intellectuelle</h2>
        <p className="text-sm text-[var(--t2)] leading-relaxed">
          L&apos;ensemble du contenu de ce site (textes, images, logos, code source) est protégé 
          par le droit de la propriété intellectuelle. Toute reproduction, même partielle, 
          est interdite sans autorisation préalable de l&apos;éditeur.
        </p>
        <p className="text-sm text-[var(--t2)] leading-relaxed mt-2">
          Les messages publiés par les utilisateurs restent leur propriété. En publiant 
          sur la plateforme, l&apos;utilisateur accorde une licence non exclusive d&apos;affichage 
          de ses contenus dans le cadre du service.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-bold mb-3 text-[var(--acc)]">4. Données personnelles</h2>
        <p className="text-sm text-[var(--t2)] leading-relaxed">
          Le traitement des données personnelles est détaillé dans notre{' '}
          <a href="/legal/privacy" className="text-[var(--acc)] hover:underline">
            politique de confidentialité
          </a>. Conformément au RGPD, vous disposez d&apos;un droit d&apos;accès, de rectification, 
          de suppression et de portabilité de vos données.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-bold mb-3 text-[var(--acc)]">5. Conservation des données de connexion (LCEN)</h2>
        <p className="text-sm text-[var(--t2)] leading-relaxed">
          Conformément à l&apos;article 6-II de la Loi pour la Confiance dans l&apos;Économie 
          Numérique (LCEN) et au décret n°2011-219, nous conservons pendant une durée de 
          <strong className="text-[var(--t1)]"> 1 an</strong> les données permettant l&apos;identification 
          de toute personne ayant contribué à la création d&apos;un contenu : identifiant de 
          connexion, dates et heures de connexion, adresse IP.
        </p>
        <p className="text-sm text-[var(--t2)] leading-relaxed mt-2">
          Ces données sont conservées exclusivement pour répondre à une éventuelle 
          réquisition judiciaire. Elles ne sont jamais utilisées à des fins commerciales 
          et sont automatiquement supprimées après le délai légal de conservation.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold mb-3 text-[var(--acc)]">6. Loi applicable</h2>
        <p className="text-sm text-[var(--t2)] leading-relaxed">
          Le présent site est soumis au droit français. Tout litige sera porté devant 
          les juridictions compétentes du ressort du tribunal de [votre ville].
        </p>
      </section>
    </article>
  );
}
