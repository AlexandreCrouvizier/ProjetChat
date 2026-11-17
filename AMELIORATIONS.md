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

## 2. Délais minimum entre deux messages modifiables dans le panel Admin — ✅ fait (Lot 4.3, 17/11/2026)

Panel → Paramètres → **Rythme d'envoi des messages**, par type de compte : délai minimum entre deux messages
(0,2 s → 10 min, curseur + valeur libre) et nombre maximum de messages par minute dans un même salon (1 → 60).
Bornes contrôlées par le serveur, chaque changement est tracé dans le journal (ancienne → nouvelle valeur).
Le délai est désormais respecté à la milliseconde près (avant : 0,5 s était arrondi à 1 s).

---

## 3. Images, GIF et fichiers dans les messages privés — ✅ fait (Lot 4.3, 17/11/2026)

`dm:send` accepte `type`, `file_url` et `gif_url` avec **les mêmes contrôles** que dans les salons
(`message.service.ts`). Liste des conversations et notifications : « 📷 Image », « 🎞️ GIF », « 📎 Fichier ».

---

## 4. Paquets retirés au Lot 2, à réinstaller si besoin

Supprimés car inutilisés (moins de code tiers = moins de failles possibles). À réinstaller **en dernière version**
uniquement le jour où on en a vraiment l'usage.

| Paquet | À quoi il sert | Quand le réinstaller |
|---|---|---|
| `passport-github2` | **Connexion avec un compte GitHub** (comme Google) | ✅ Réinstallé au Lot 4.3 : bouton « Continuer avec GitHub » (affiché seulement si les clés sont dans le `.env`). |
| `zod` (v4) | Vérifier la forme des données reçues par l'API (schémas) | Si on veut généraliser une validation stricte et uniforme de toutes les routes, à la place des contrôles faits à la main. |
| `node-cron` | Tâches planifiées (« chaque nuit à 3 h ») | Pas nécessaire pour l'instant : la purge LCEN (Lot 4.3) tourne au démarrage puis toutes les 24 h avec un simple minuteur. À reprendre si on veut une heure précise. |
| `uuid` | Générer des identifiants uniques | **Probablement jamais** : Node.js le fait nativement avec `crypto.randomUUID()`. |

---

## 5. Fichiers envoyés : outils de gestion (suite du Lot 4.2b)

- **Quotas réglables** dans Panel → Paramètres (aujourd'hui : inscrit 200 Mo, premium 2 Go, dans `shared/constants.ts`).
- **Panel admin** : liste des fichiers d'un utilisateur (table `uploads` : date, IP, taille, nom d'origine), utile en cas de réquisition (LCEN) ou d'abus.
- **« Mes fichiers »** pour les membres : voir et supprimer leurs anciens fichiers pour libérer de l'espace.
- **Miniatures** (~400 px) générées à l'envoi pour le fil du chat (voir § 1).
- Ménage : `shared/constants.js`, `.d.ts` et `.map` sont d'anciens fichiers compilés (avril 2026), non utilisés
  (le serveur et le client lisent `constants.ts`) → à supprimer pour éviter toute confusion.

