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

## Lot 2 — Dépendances serveur (✅ fait le 16/11/2026)

`npm audit` serveur : **19 vulnérabilités (2 critiques) → 0**. Côté client : **0** depuis le lot 3.

- [x] `npm audit fix` (correctifs sans rupture : Express, Socket.io, engine.io, ws, lodash, qs, morgan, proxy-addr, body-parser…)
- [x] `bcrypt` 5 → 6 (supprime `tar` vulnérable, critique) — les mots de passe existants (`$2b$`) restent valides
- [x] `sharp` 0.34 → 0.35.5 (failles libvips / libheif / librsvg) — compression WebP et détection des faux fichiers vérifiées
- [x] `multer` 1.x → 2.5 (failles connues, version 1 abandonnée)
- [x] Dépendances inutilisées supprimées : `uuid`, `zod`, `node-cron`, `passport-github2` (+ leurs types)
- [x] `engines.node >= 20.9` (requis par sharp 0.35) et script `npm run typecheck`
- [x] Affichage des adresses réseau : cartes virtuelles (WSL/Docker/Hyper-V) masquées

## Lot 3 — Next.js 14 → 16 (✅ fait le 16/11/2026)

Next 14.2.35 cumulait des failles **critiques d'exécution de code à distance**, dont une **spécifique aux serveurs Windows**.

- [x] Next.js **14.2.35 → 16.4.6** (Turbopack par défaut), React / React DOM **18 → 19.3**, types React 19
- [x] Dépendances inutilisées supprimées : `next-themes` (bloquait React 19), `clsx`
- [x] Script `lint` supprimé (`next lint` n'existe plus en v16) → remplacé par `npm run typecheck`
- [x] `allowedDevOrigins` : seules les adresses réseau local du PC peuvent utiliser le rechargement à chaud (`dev:lan`)
- [x] Les clés GIF ne sont plus recopiées dans le code du navigateur via `env` (bloc inutilisé)
- [x] Pages `/auth_group/login` et `/chat_group` : `useSearchParams()` entouré d'un `<Suspense>` (la compilation de production échouait)
- [x] Types Socket.io (`shared/types/websocket.types.ts`) réécrits pour correspondre aux événements réels → **erreurs TypeScript client : 50 → 0**, `npm run build` passe de nouveau
- [x] Bugs révélés par TypeScript : `showModal` non importé dans la zone de saisie (plantage si un envoi échouait) ; envoi de média en message privé (fonction inexistante → message clair à la place)
- Résultat : `npm audit` client = **0 vulnérabilité**

## Lot 3 bis — Ports dédiés et panel admin isolé (✅ fait le 16/11/2026)

| Service | Port | Accessible depuis |
|---|---|---|
| Chat (Next.js) | **1608** | PC + Wi-Fi (avec `npm run dev:lan`) |
| Panel admin (passerelle) | **2025** | **Ce PC uniquement** (`127.0.0.1` / `::1`) |
| Serveur API + temps réel | 4000 | PC + Wi-Fi |

- [x] Chat déplacé de 3000 → **1608** (fin du conflit avec Open WebUI)
- [x] Passerelle admin `client/scripts/admin-gateway.mjs` (`npm run admin`) : n'écoute que sur ce PC, ajoute l'en-tête secret `x-chatapp-admin-gateway` (`ADMIN_GATEWAY_SECRET`), refuse les noms d'hôte non locaux (anti DNS rebinding), redirige tout ce qui n'est pas le panel vers le chat
- [x] `client/proxy.ts` : `/panel/...` répond 404 sans l'en-tête secret (port 1608 / Wi-Fi)
- [x] Serveur : `/api/admin`, `/api/admin-auth` et les routes de modération du panel répondent 404 sans l'en-tête secret (comparaison à temps constant), **même avec un compte superadmin et un TOTP valides**
- [x] Fermé par défaut : sans passerelle lancée, ou sans secret dans le `.env`, le panel est inaccessible
- ⚠️ Production : NGINX jouera le rôle de la passerelle (vhost admin restreint par IP/VPN, qui ajoute l'en-tête). `ADMIN_GATEWAY_SECRET` est obligatoire en production (64 caractères min.)

## Lot 4 — Renforcement, partie 1 (✅ fait le 17/11/2026)

Vérifié par **26 tests automatisés** (vrai serveur + vraie base de données) et un parcours dans un vrai navigateur (Chromium).

**Typage (garde-fou)**
- [x] Erreurs TypeScript : serveur **78 → 0**, client **50 → 0** (`npm run typecheck` dans `client/` et `server/`)
- [x] Cause principale : `req.user` déclaré deux fois (passport + nous) → on complète `Express.User`
- [x] `tsconfig` serveur : `rootDir` = racine du projet (le serveur importe `shared/`) ; build → `dist/server/src/index.js`

**Sessions en cookies `httpOnly`** (une faille XSS ne peut plus voler la session)
- [x] `chatapp_at` (accès, 15 min, `Path=/`), `chatapp_rt` (renouvellement, 7 j, `Path=/api/auth`), `chatapp_admin` (panel, 30 min, `Path=/api`)
- [x] `HttpOnly` + `SameSite=Strict` (+ `Secure` en production) ; plus aucun jeton dans le JSON ni dans `localStorage`
- [x] WebSocket authentifié par le cookie de la poignée de main
- [x] **CSRF** : `middleware/csrf.middleware.ts` — toute requête qui modifie des données doit venir d'une origine autorisée
- [x] Déconnexion possible même avec un jeton d'accès expiré ; cookies effacés côté serveur
- [x] Jetons avec identifiant unique (`jti`) : avant, deux jetons émis dans la même seconde étaient identiques (rotation inefficace)

**OAuth Google**
- [x] Plus aucun jeton dans l'URL de retour (cookies posés par le serveur)
- [x] `email_verified` exigé avant de lier un compte Google à un compte existant (anti prise de contrôle)
- [x] Compte banni : connexion Google refusée

**TOTP du panel**
- [x] `otplib` 13 (maintenue, crypto auditée) à la place de `speakeasy` (abandonnée)
- [x] Secret chiffré en base (AES-256-GCM, `TOTP_ENCRYPTION_KEY`) ; anciens secrets rechiffrés automatiquement
- [x] Code à usage unique (anti-rejeu) ; tolérance ±30 s au lieu de ±60 s

**CSP et en-têtes (client)**
- [x] CSP avec **nonce** par requête (`client/proxy.ts`) : seuls les scripts de Next.js et les nôtres s'exécutent
- [x] `connect-src` limité au serveur temps réel et aux API GIF ; `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`
- [x] En-têtes : `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, `COOP`, HSTS (production), `X-Powered-By` retiré
- [x] Police **Sora hébergée localement** (`@fontsource-variable/sora`) : plus d'appel à Google Fonts (RGPD : l'IP des visiteurs n'est plus transmise à Google)

**Bugs trouvés en route**
- [x] « Masquer une conversation privée » → erreur 500 (fonction inexistante)
- [x] Connexion invité → erreur 500 si Redis était vidé/redémarré (compteur de pseudos remis à zéro)

## Correctif — Bannissement immédiat (✅ fait le 17/11/2026)

Symptôme : le banni voyait un message, cliquait « OK » et restait sur la page du chat
(à moitié déconnecté, cookies encore valides jusqu'à 15 min).

- **Serveur** : marqueur Redis `revoked:user:{id}` posé au ban (durée = vie d'un jeton d'accès + 1 min),
  vérifié par `requireAuth` (→ 403 `ACCOUNT_SUSPENDED`), `optionalAuth` (→ visiteur anonyme) et la connexion WebSocket ;
  levé au débannissement (panel admin, empreinte invité, modérateurs).
- `revokeUserAccess()` centralise : marqueur + suppression des sessions + notification + fermeture des WebSocket.
- 🐛 Le ban depuis un **signalement** (« masquer + bannir ») ne coupait pas l'accès : corrigé.
  Le ban par un **modérateur** prévient maintenant l'utilisateur.
- **Client** : `lib/banGuard.ts` — à n'importe quel signal (notification, reconnexion refusée « Compte suspendu »,
  API 403) : état vidé, cookies effacés, rechargement complet vers l'accueil, motif affiché sur l'accueil.
- Testé : 14/14 (API + navigateur en ligne + téléphone hors ligne pendant le ban) et 26/26 e2e.

## Lot 4 — Renforcement, partie 2 (🔜)

- [ ] **Clé API GIF** : appels via le serveur (aujourd'hui la clé est envoyée au navigateur)
- [ ] **Empreinte invité** : elle sert aussi de « clé » de reconnexion → la lier à un secret serveur
- [ ] **Avatars** : stocker en fichier (pas en base64 de 700 Ko dans la table `users`), refuser les URLs externes
- [ ] **Fichiers uploadés** : les rattacher à l'utilisateur en base (traçabilité LCEN), quota de stockage
- [ ] Indicateur « en train d'écrire » : vérifier l'appartenance au salon ; remplacer `KEYS` par `SCAN` dans Redis
- [ ] Lancer `npm run typecheck` automatiquement avant chaque commit (hook Git) ou en intégration continue
- [ ] Invités : jeton de renouvellement (aujourd'hui, reconnexion obligatoire après 15 min d'inactivité du WebSocket)
- [ ] Production : NGINX + HTTPS + HSTS, domaine séparé pour les fichiers uploadés, sauvegardes chiffrées

---

## Règles à respecter pour la suite du développement

1. **Toute donnée venant du client est hostile** (body HTTP, événement WebSocket, nom de fichier, type MIME) : valider le type, la longueur et le format côté serveur.
2. **Chaque route qui lit une ressource vérifie le droit d'accès** (salon privé → membre ; DM → participant). Utiliser `services/access.service.ts`.
3. **Actions de modération globales = superadmin + TOTP** (`requireSuperAdmin, requireAdminToken`).
4. **Jamais de `fetch` serveur vers une URL fournie par un utilisateur** sans passer par la protection anti-SSRF de `linkPreview.service.ts`.
5. **URLs affichées dans l'interface** : toujours via `safeMediaUrl()` / `safeHttpsUrl()` (`client/lib/safeUrl.ts`).
6. **IP du client** : toujours `getIpFromRequest()` / `getIpFromSocket()`, jamais `req.ip` ni l'en-tête brut.
7. **Jetons de session** : uniquement via `utils/authCookies.ts` (cookies httpOnly). Jamais de jeton dans une réponse JSON, une URL ou `localStorage`.
8. **Pas de script inline** dans le client : la CSP le bloquerait. Si c'est indispensable, lui passer le `nonce` (voir `ThemeInitScript`).
9. **Nouvelle API externe appelée par le navigateur** : l'ajouter à `connect-src` dans `client/proxy.ts`.
10. **Avant chaque commit** : `npm run typecheck` dans `client/` et `server/` doit afficher 0 erreur.
