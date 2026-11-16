# Améliorations à prévoir — ChatApp

> À traiter **une fois les correctifs de sécurité terminés** (voir `SECURITE.md`).
> Ce fichier garde la trace des idées validées pour plus tard, avec leur explication.

---

## 1. Optimiseur d'images de Next.js (à réétudier)

### C'est quoi ?
Un service intégré à Next.js qui redimensionne et convertit les images **au moment où elles sont affichées**.
On l'utilise via le composant `<Image>` de `next/image`. Pour chaque écran, il fabrique une version adaptée
(petite sur téléphone, grande sur PC), au bon format (WebP/AVIF), puis la garde en cache.

### Différence avec notre outil actuel (Sharp, côté serveur)

| | **Notre outil (Sharp, Express)** | **Optimiseur Next.js** |
|---|---|---|
| Quand | **Une seule fois**, à l'envoi de l'image | **À chaque affichage** (puis cache) |
| Ce qu'il fait | Réduit + convertit en WebP, stocke le résultat | Génère une taille par écran, à la demande |
| Utilisation | Automatique, réglable dans Panel → Paramètres | Il faut remplacer les `<img>` par `<Image>` |
| Bonus sécurité | Vérifie que le fichier est **vraiment une image** | Aucun |
| État dans le projet | ✅ Actif | ❌ Désactivé (`images.unoptimized: true`) |

### Avantages de l'optimiseur Next.js
- Images adaptées à la taille de l'écran (moins de données sur mobile).
- Chargement différé (*lazy loading*) et placeholder flou intégrés.
- Évite les décalages de mise en page (dimensions réservées).

### Inconvénients / risques
- **Consomme du CPU à chaque nouvelle taille demandée** : sur un chat avec beaucoup d'images, ça charge le serveur.
- **Risque de proxy ouvert** : notre ancienne config (`remotePatterns: '**'`) laissait n'importe qui faire traiter
  n'importe quelle image d'Internet par notre serveur (surcharge, abus).
- **Historique de failles critiques** dans cet optimiseur (images SVG/AVIF piégées → exécution de code) sur Next 14.
- Les GIF animés et les images externes (Klipy) passent mal ou doivent être exclus.

### Pourquoi il est désactivé
Il n'était utilisé nulle part (aucun `<Image>` dans le code) et la config l'exposait à tout Internet.
Le désactiver n'a rien changé à l'affichage et a supprimé le risque.

### Recommandation pour plus tard
Pour un chat, **traiter l'image une fois à l'envoi reste la meilleure approche**.
Le vrai gain (images légères sur mobile) peut s'obtenir **sans** l'optimiseur Next.js :
- À l'upload, Sharp génère en plus une **miniature (~400 px)** affichée dans le fil du chat.
- L'image complète n'est chargée qu'au clic (visionneuse).
- Ajouter `loading="lazy"` + `width`/`height` sur les `<img>` du chat.

Si un jour on réactive l'optimiseur Next.js : **uniquement** pour nos propres fichiers
(`images.localPatterns` limité à `/uploads/images/**`), jamais `remotePatterns: '**'`, et en restant
sur une version de Next.js à jour.

---

## 2. Délais minimum entre deux messages modifiables dans le panel Admin

### Aujourd'hui
Les délais sont **codés en dur** dans `shared/constants.ts` (`TIER_LIMITS.rateLimitMs`) :

| Type de compte | Délai actuel |
|---|---|
| Invité | 10 s |
| Inscrit | 1 s |
| Premium | 0,5 s |

Pour les changer, il faut modifier le code et redémarrer le serveur.

### Objectif
Pouvoir les régler depuis **Panel Admin → Paramètres**, comme la compression d'images, sans redémarrage.

### Pistes d'implémentation
- Stocker les 3 valeurs dans la table `app_settings` (ex. `rate_limit_guest_ms`, `rate_limit_registered_ms`,
  `rate_limit_premium_ms`), avec `shared/constants.ts` comme valeurs par défaut.
- Lire ces valeurs dans `checkRateLimit` (middleware rate limit) avec un petit cache mémoire (ex. 30 s)
  pour ne pas interroger la base à chaque message.
- Route admin protégée (superadmin + TOTP) pour les modifier, avec **bornes de sécurité** côté serveur
  (ex. minimum 200 ms, maximum 60 s) pour éviter une erreur de saisie qui ouvrirait la porte au spam.
- Journaliser chaque modification (qui, quand, ancienne → nouvelle valeur).
- Le message d'erreur côté client (« Veuillez attendre X s ») doit afficher la valeur réelle renvoyée par le serveur.

---

## 3. Images, GIF et fichiers dans les messages privés

### Aujourd'hui
L'envoi de médias ne fonctionne que dans les salons. L'événement `dm:send` du serveur
(`server/src/websocket/conversation.handler.ts`) n'accepte que du texte.
En message privé, le bouton média affiche désormais un message clair (« pas encore disponible »)
au lieu de planter.

### Pistes d'implémentation
- Faire passer `type`, `file_url` et `gif_url` dans `dm:send`, avec **les mêmes contrôles** que
  `message:send` (`message.service.ts` : URL d'upload locale uniquement, image interdite aux invités,
  fichier réservé au premium, GIF en https).
- Ajouter `sendMediaMessage` au hook `useDMChat`.
