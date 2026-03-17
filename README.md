# 💬 ChatApp

Application de chat en ligne communautaire et généraliste — PWA temps réel.

## Stack technique

| Composant | Technologie |
|-----------|------------|
| Frontend | React + Next.js 14 (App Router) |
| Backend | Node.js + Express + Socket.io |
| Base de données | PostgreSQL 16 |
| Cache & Pub/Sub | Redis 7 |
| Styling | Tailwind CSS |
| Auth | JWT + OAuth (Google, GitHub) |
| Paiements | Stripe |

## Prérequis

- Node.js 22+ LTS
- Docker Desktop (pour PostgreSQL & Redis)
- Git

## Installation

```bash
# 1. Cloner le repo
git clone https://github.com/ton-username/chatapp.git
cd chatapp

# 2. Copier les variables d'environnement
cp .env.example .env

# 3. Lancer PostgreSQL & Redis
docker compose up -d

# 4. Installer les dépendances
cd server && npm install && cd ..
cd client && npm install && cd ..

# 5. Lancer les migrations BDD
cd server && npm run migrate && cd ..

# 6. Lancer le projet (2 terminaux)
# Terminal 1 — Backend
cd server && npm run dev

# Terminal 2 — Frontend
cd client && npm run dev
```

## Accès

- **Frontend** : http://localhost:3000
- **Backend API** : http://localhost:4000
- **PostgreSQL** : localhost:5432
- **Redis** : localhost:6379

## Structure du projet

```
chatapp/
├── client/          # Frontend Next.js (PWA)
├── server/          # Backend Node.js + Express + Socket.io
├── shared/          # Types TypeScript partagés
├── docker-compose.yml
├── .env.example
└── README.md
```

## Licence

MIT
