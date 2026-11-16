# 📊 Bilan de l'état du projet — ChatApp

> Rapport généré le 4 juillet 2026, après reprise du projet suite à un arrêt (~20 avril → 4 juillet 2026).
> Objectif : reconstituer précisément l'état de l'application pour reprendre le développement.

---

## 1. Résumé exécutif

**ChatApp** est une PWA de chat communautaire temps réel, **déjà très avancée**. Les Phases 1 à 3 sont terminées et taguées (`v0.1.0` → `v0.3.0`). Un travail important de **Phase 3.5** (améliorations modération + sécurité invités) et le **début de la Phase 4.1** (partage de fichiers, GIF, aperçus de liens) sont **réalisés mais NON commités** sur le nouveau PC — c'est le point le plus sensible à protéger.

Le développement s'est arrêté **en pleine Phase 4.1**, juste après l'intégration des GIF (Tenor/Giphy) et du système de sécurité invités (fingerprint + bannissement IP).

| Élément | État |
|---|---|
| Dernier commit | `29f1941` — *Phase 3 complète* (15 avril 2026) |
| Dernier tag | `v0.3.0` |
| Dernière migration BDD | `20260420000008_gif_display` (20 avril 2026) |
| Travail non commité | ~71 fichiers modifiés + ~15 fichiers nouveaux (Phase 3.5 & 4.1) |

---

## 2. ⚠️ Point d'attention important : deux projets différents dans tes fichiers

Tes fichiers mélangent **deux projets distincts** — à ne pas confondre :

| | **ChatApp** (le code réel) | **CivicApp / CivicTech** (les .docx uploadés) |
|---|---|---|
| Nature | Chat communautaire temps réel | Plateforme d'info législative citoyenne |
| Stack | Next.js 14 + Express + Socket.io | Laravel 11 + Vue.js 3 + Inertia |
| Fichiers | `D:\Projets\ProjetChat\` + les 4 PDF | `cahier_des_charges_civicapp/civic_tech.docx`, `document_technique_civicapp.docx`, `maquettes_civic_app.*`, politiques de confidentialité |

👉 **Le projet que tu développes est ChatApp.** Les documents Word « CivicApp » décrivent un autre concept (agrégation Légifrance/Assemblée/Sénat, vote citoyen, baromètre) qui n'a **pas** été codé ici. À clarifier : projet abandonné, mis en pause, ou à mener en parallèle ?

*(Ce bilan porte uniquement sur ChatApp, le code existant.)*

---

## 3. Stack technique (ChatApp)

| Couche | Technologie |
|---|---|
| Frontend | Next.js 14 (App Router), React 18, Zustand, Tailwind CSS, next-themes |
| Backend | Node.js 22, Express 4, Socket.io 4, TypeScript |
| Base de données | PostgreSQL 16 (via Knex, migrations) |
| Cache / temps réel | Redis 7 (sessions, présence, pub/sub) |
| Auth | JWT (access + refresh) + OAuth Google/GitHub + TOTP superadmin |
| Médias | Multer + Sharp (images), aperçus de liens, GIF Tenor |
| Infra dev | Docker Compose (Postgres + Redis) |
| Prévu Phase 4 | Stripe (paiements), Google AdSense (pub), LiveKit (audio/vidéo) |

---

## 4. Fonctionnalités livrées (par domaine)

### 4.1 Authentification & comptes (✅ complet)
- Inscription / connexion email + mot de passe (bcrypt)
- **Connexion invité** (guest) avec tiers de permissions
- OAuth **Google** et **GitHub**
- Tokens JWT access (15 min) + refresh (7 j), sessions en BDD
- **3 tiers utilisateurs** avec quotas (`shared/constants.ts`) :
  - **guest** : 3 salons publics max, 0 création, rate limit ×10
  - **registered** : 5 salons, 3 créations, images 5 Mo
  - **premium** : illimité, images 25 Mo, fichiers 100 Mo
- **Superadmin protégé par TOTP** (2FA via QR code, `speakeasy`/`qrcode`)

### 4.2 Chat temps réel (✅ Phase 1)
- Salons de groupe (publics/privés/officiels), messages temps réel via WebSocket
- Présence en ligne / hors ligne, indicateur « en train d'écrire »
- Messages éphémères (TTL), réponses, upload d'images

### 4.3 Expérience sociale (✅ Phase 2)
- **Messages privés (DM)** — conversations 1-à-1
- **Réactions emoji** sur les messages
- **Fils de discussion (threads)** avec compteur de réponses
- **Mentions** (@utilisateur) + notifications
- **Blocage d'utilisateurs**
- Profils personnalisables (avatar, bio, statut, couleur de chat)

### 4.4 Modération & administration (✅ Phase 3 + 3.5 non commitée)
- **Signalements** de messages/utilisateurs (reports)
- Actions de modération : **mute, ban** (temporaire/permanent), historique
- **Rôles de salon** (membre/modo/admin), kick, mute par salon
- **Système d'invitations** par code (usage limité, expiration)
- **Dashboard admin** complet (stats, users, salons, reports, settings)
- `app_settings` : paramètres applicatifs configurables en BDD

### 4.5 Sécurité invités (✅ Phase 3.5 / 4.1 non commitée) — *travail avancé récent*
- **Empreinte navigateur (fingerprint)** pour tracer les invités
- **Bannissement par fingerprint** et par **IP** (manuel + auto)
- Historique IP des invités, gestion des fingerprints/IP bannis dans l'admin
- But : empêcher un invité banni de revenir sous un autre pseudo `invité_XXXXX`

### 4.6 Médias & contenu (🟡 Phase 4.1 en cours — non commitée)
- **Upload d'images** (Sharp, conversion webp) et **fichiers** (jusqu'à mp4 vidéo)
- **Aperçus de liens** (link previews) automatiques
- **GIF** via API Tenor (composant `GifPicker`, config `gif_display`)
- Permissions de partage d'image selon le tier (premium)

---

## 5. Schéma de base de données

**8 migrations**, ~20 tables réparties par domaine :

| Domaine | Tables |
|---|---|
| Utilisateurs & auth | `users`, `sessions` |
| Groupes | `groups`, `group_members`, `invitations` |
| Messages | `messages` (threads, réactions, éphémère, gif, aperçus) |
| Social / DM | `conversations`, `conversation_participants`, `reactions` |
| Modération | `reports`, `moderation_actions`, `blocked_users` |
| Sécurité invités | `guest_ip_history`, `banned_fingerprints`, `banned_ips` |
| Système | `app_settings` |

Champs notables ajoutés au fil des phases : `app_role`/`totp_secret`/`totp_enabled` (superadmin), `guest_fingerprint`, colonnes GIF.

---

## 6. Ce qu'il reste à faire (feuille de route)

### 🟡 Phase 4.1 — Médias (à finaliser)
Le travail est commencé mais à consolider/tester : upload fichiers, GIF, aperçus de liens, permissions premium. C'est ici que le développement s'est arrêté.

### 🔜 Phase 4.2 — Audio / Vidéo
- Intégration **LiveKit** (appels audio/vidéo, salons vocaux)

### 🔜 Phase 4.3 — Monétisation
- **Stripe** : abonnements premium (mensuel/annuel) — clés déjà prévues dans `.env`
- **Google AdSense** : publicité

### 🔜 Phase 4.4 — Déploiement production
- VPS EU (reco : 4 vCPU / 8 Go RAM / 80-100 Go NVMe, Ubuntu 24.04)
- NGINX reverse proxy + SSL, HTTPS
- Conformité **LCEN** (rétention logs 1 an — déjà câblée via `LCEN_RETENTION_DAYS`)
- Sauvegardes PostgreSQL automatisées, monitoring

---

## 7. État Git & risque à gérer en priorité

- **Branche à jour jusqu'à Phase 3** (commit `29f1941`, tag `v0.3.0`).
- **~71 fichiers modifiés + ~15 nouveaux non suivis** = tout le travail Phase 3.5 et 4.1.
  - Modifiés notables : `oauth.controller`, `moderation.service`, `mention.service`, `admin.routes`, handlers WebSocket, middlewares.
  - Nouveaux : `GifPicker`, `LinkPreview`, `guestSecurity.service`, `linkPreview.service`, `upload.routes`, `fingerprint.ts`, migrations 5→8.

> ⚠️ **Action prioritaire dès que le projet retourne : committer ce travail** (`git add` + `commit`), et éventuellement le taguer `v0.3.5`. Ne surtout **pas** faire `git reset`/`git checkout` dessus avant : ce serait ~2 semaines de travail perdues.

---

## 8. Prochaines étapes recommandées

1. **Réinstaller l'environnement** sur le nouveau PC (Node 22, Docker, Git) — voir `RELANCE.md`.
2. **Relancer le projet en local** et vérifier que Phase 3.5 / 4.1 fonctionne (chat, admin, GIF, upload, sécurité invités).
3. **Committer le travail non commité** une fois validé → tag `v0.3.5`.
4. **Reprendre la Phase 4.1** : corriger/finaliser les derniers points médias.
5. Enchaîner Phase 4.2 (LiveKit), 4.3 (Stripe/AdSense), 4.4 (déploiement).

---

*Bilan établi par analyse du code (server + client), des 8 migrations, du diff Git, des cahiers des charges et des 4 transcriptions PDF de conversations.*
