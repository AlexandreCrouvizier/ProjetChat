# 🔐 Sécurité — ChatApp

> Audit réalisé le 16 novembre 2026 (code serveur + client + dépendances).
> Ce fichier suit l'état de chaque faille : ✅ corrigée · 🔜 planifiée.

---

## Lot 1 — Failles du code (✅ corrigé le 16/11/2026)

| # | Gravité | Faille | Correction |
|---|---|---|---|
| 1 | 🔴 Critique | **Modération ouverte à tous** : n'importe quel compte inscrit (gratuit) pouvait lister les signalements, masquer des messages, muter ou **bannir n'importe qui, y compris le superadmin** (`/api/moderation/*`) | Routes réservées au superadmin + TOTP (`routes/moderation.routes.ts`) |
| 2 | 🔴 Critique | **Secret du panel admin public** : il valait la chaîne `"undefined_admin_panel"` (variable inexistante) → tokens admin falsifiables, **TOTP contournable** | Vrai secret `ADMIN_JWT_SECRET` (`middleware/superadmin.middleware.ts`, `.env`) |
| 3 | 🔴 Critique | **Salons privés lisibles par tous** : historique, fils, membres et détails accessibles avec l'identifiant du salon, **même sans être connecté**, même après expulsion | Contrôle d'accès membre (`services/access.service.ts`) |
| 4 | 🔴 Critique | **Vol de session par upload** : une « image » `.html` (type annoncé falsifié) ou un fichier premium `.html/.svg` était servi depuis le domaine de l'app → exécution de JavaScript, vol des tokens | Analyse réelle du contenu (Sharp), liste blanche d'extensions, en-têtes `nosniff` + CSP `sandbox` + `attachment` (`routes/upload.routes.ts`, `app.ts`) |
| 5 | 🟠 Élevée | **Médias falsifiables par WebSocket** : `file_url`, `gif_url`, `type` libres → un invité pouvait poster une « image » externe (traçage d'IP) ou un lien `javascript:` (vol de session au clic) | Validation stricte côté serveur (`services/message.service.ts`) + filtrage des URLs côté client (`lib/safeUrl.ts`) |
| 6 | 🟠 Élevée | **SSRF via les aperçus de liens** : le serveur allait chercher n'importe quelle URL (box `192.168.1.254`, `127.0.0.1`, métadonnées cloud `169.254.169.254`), suivait les redirections, sans limite de taille réelle | IP publiques uniquement (contrôle à la connexion, anti DNS-rebinding), ports 80/443, 3 redirections revérifiées, 500 Ko max (`services/linkPreview.service.ts`) |
| 7 | 🟠 Élevée | **Bannissement inefficace** : le banni gardait ses sessions, renouvelait ses tokens et restait connecté en WebSocket | Sessions révoquées + WebSocket fermés + refus du renouvellement (`services/accessRevocation.service.ts`) |
| 8 | 🟠 Élevée | **Aucune limite de tentatives** : connexion, inscription, invités, TOTP (6 chiffres) brute-forçables | Limites par IP et par compte (`middleware/rateLimit.middleware.ts`) |
| 9 | 🟠 Élevée | **IP falsifiable** (`X-Forwarded-For` cru aveuglément) → contournement des bannissements IP, traces LCEN faussées | En-tête accepté seulement depuis notre proxy local (`utils/ip.ts`) |
| 10 | 🟡 Moyenne | Fil de discussion / citation pointant vers un message d'un autre salon (fuite de contenu privé) | Même salon/conversation exigé |
| 11 | 🟡 Moyenne | Pseudo invité non validé (usurpation, caractères arbitraires) | Mêmes règles que les inscrits |
| 12 | 🟡 Moyenne | Connexion : temps de réponse et message « banni » révélaient l'existence d'un compte ; email sensible à la casse | Comparaison à temps constant, bannissement vérifié après le mot de passe, email normalisé |
| 13 | 🟡 Moyenne | Erreurs internes renvoyées telles quelles aux clients WebSocket | Seules les erreurs métier sont transmises |
| 14 | 🟡 Moyenne | Optimiseur d'images Next.js ouvert à tout Internet (`remotePatterns: '**'`), avec des failles critiques connues | Désactivé (non utilisé) |
| 15 | 🟢 Faible | Faux accusés de lecture sur une conversation dont on n'est pas participant | Vérification du participant |
| 16 | 🟢 Faible | Secrets JWT de développement faibles ; pas de contrôle en production | Secrets aléatoires 128 caractères ; refus de démarrer en prod avec des secrets faibles ou identiques |
| 17 | 🟠 Élevée | **Un seul ban temporaire d'invité bloquait TOUS les invités** (requête SQL sans parenthèses dans `isFingerprintBanned`) ; des bans expirés comptaient encore pour le bannissement automatique d'IP | Requête corrigée, seuls les bans actifs comptent (`services/guestSecurity.service.ts`) |
| 18 | 🟡 Moyenne | **Débannir un invité ne levait pas le ban de son empreinte** → il restait bloqué ; message « Erreur » sans explication | Empreinte débannie avec le compte, message clair (durée + motif) |

---

## Lot 2 — Dépendances serveur et client (🔜)

`npm audit` : **19 vulnérabilités côté serveur (2 critiques)**, **14 côté client (1 critique)**.

- [ ] `npm audit fix` (correctifs sans rupture : Express, Socket.io, ws, lodash, qs, morgan, axios…)
- [ ] `bcrypt` 5 → 6 (supprime `tar` vulnérable, critique)
- [ ] `sharp` 0.34 → 0.35 (failles libvips / libheif / librsvg)
- [ ] `multer` 1.x → 2.x (failles connues, version 1 abandonnée)
- [ ] Supprimer les dépendances inutilisées : `uuid` (remplacé par `crypto.randomUUID`), `zod`, `node-cron`

## Lot 3 — Next.js 14 → 16 (🔜, le plus urgent après le lot 1)

Next 14.2.35 cumule des failles **critiques d'exécution de code à distance**, dont une **spécifique aux serveurs Windows**. Corrigées à partir de 15.5.28 (branche 15) / 16.x.
- Implique React 18 → 19 et quelques adaptations de code.
- ⚠️ En attendant : lancer le client avec `npm run dev` (PC seul) ; `npm run dev:lan` uniquement le temps des tests sur mobile.

## Lot 4 — Renforcement (🔜)

- [ ] Tokens dans des **cookies `httpOnly`** au lieu de `localStorage` (une faille XSS ne pourrait plus voler la session)
- [ ] Politique **CSP** pour l'application Next.js
- [ ] **Clé API GIF** : appels via le serveur (aujourd'hui la clé est envoyée au navigateur)
- [ ] **OAuth Google** : tokens dans l'URL de retour → code d'échange à usage unique ; vérifier `email_verified` avant de lier un compte existant
- [ ] **TOTP** : chiffrer le secret en base, remplacer `speakeasy` (abandonné) par `otplib`, empêcher la réutilisation d'un même code
- [ ] **Empreinte invité** : elle sert aussi de « clé » de reconnexion → la lier à un secret serveur
- [ ] **Avatars** : stocker en fichier (pas en base64 de 700 Ko dans la table `users`), refuser les URLs externes
- [ ] **Fichiers uploadés** : les rattacher à l'utilisateur en base (traçabilité LCEN), quota de stockage
- [ ] Indicateur « en train d'écrire » : vérifier l'appartenance au salon ; remplacer `KEYS` par `SCAN` dans Redis
- [ ] Corriger les erreurs TypeScript existantes (77 serveur, 50 client) et ajouter `tsc --noEmit` comme garde-fou
- [ ] Production : NGINX + HTTPS + HSTS, domaine séparé pour les fichiers uploadés, sauvegardes chiffrées

---

## Règles à respecter pour la suite du développement

1. **Toute donnée venant du client est hostile** (body HTTP, événement WebSocket, nom de fichier, type MIME) : valider le type, la longueur et le format côté serveur.
2. **Chaque route qui lit une ressource vérifie le droit d'accès** (salon privé → membre ; DM → participant). Utiliser `services/access.service.ts`.
3. **Actions de modération globales = superadmin + TOTP** (`requireSuperAdmin, requireAdminToken`).
4. **Jamais de `fetch` serveur vers une URL fournie par un utilisateur** sans passer par la protection anti-SSRF de `linkPreview.service.ts`.
5. **URLs affichées dans l'interface** : toujours via `safeMediaUrl()` / `safeHttpsUrl()` (`client/lib/safeUrl.ts`).
6. **IP du client** : toujours `getIpFromRequest()` / `getIpFromSocket()`, jamais `req.ip` ni l'en-tête brut.
