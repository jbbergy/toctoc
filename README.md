# TocToc — suivi des coups et contractions

PWA (Vue 3) pour noter les coups du bébé et les contractions pendant la grossesse.
Les données sont stockées **sur l'appareil** dans PostgreSQL embarqué (PGlite, persisté
dans IndexedDB) et peuvent être **synchronisées** vers un serveur PostgreSQL.

- **Accueil** : bascule Coups / Contractions, gros bouton.
  - Coup : toucher = enregistrer.
  - Contraction : toucher = enregistrer ; **maintenir ≥ 1,5 s** = chronométrer la durée
    (au clavier : maintenir la barre d'espace).
  - Résumé (dernier enregistrement, nombre de coups du jour / intervalle entre contractions),
    annulation du dernier enregistrement.
- **Historique** : groupé par jour, filtres Tout / Coups / Contractions, durée et écart des
  contractions. Bouton « Ajouter une entrée » pour saisir après coup un coup ou une
  contraction (date, heure, durée facultative ; pas de date future).
- Fonctionne hors ligne (service worker, PGlite précaché).

## Démarrage

```bash
npm install
npm run dev          # http://localhost:5173 — 100 % local, sans serveur
```

Avec synchronisation PostgreSQL :

```bash
cp .env.example .env          # VITE_SYNC_URL=/api
docker compose -f compose.dev.yml up -d db   # PostgreSQL 17 local
DATABASE_URL=postgres://toctoc:toctoc@127.0.0.1:5432/toctoc npm --prefix server run dev
npm run dev                   # le proxy Vite redirige /api vers :3000
```

Sans Docker, un PostgreSQL de dev (PGlite exposé sur le protocole wire) :

```bash
cd server && npm install
PGPORT=55499 npm run db:dev
DATABASE_URL=postgres://postgres@127.0.0.1:55499/postgres PG_POOL_MAX=1 npm run dev
```

## Déploiement (toctoc.jibhey.fr)

Même modèle que les autres applications du VPS `jibhey.fr` : une image Docker unique
(API Fastify qui sert aussi la PWA) reliée au PostgreSQL partagé via le réseau Docker `infra`,
publiée en HTTPS par Caddy.

```bash
scripts/server-setup.sh   # une seule fois (idempotent) : base, .env, site Caddy
./deploy.sh               # à chaque mise en production
```

- `server-setup.sh` crée la base et le rôle `toctoc` (mot de passe généré sur le serveur dans
  `/srv/apps/toctoc/.env`) et installe `/etc/caddy/sites/toctoc.caddy` (CSP stricte, avec
  `'wasm-unsafe-eval'` requis par PGlite).
- `deploy.sh` envoie les sources par rsync, construit l'image sur le serveur
  (`docker compose up -d --build`, port local 4321) puis vérifie `/api/health`.

## Scripts

| Commande | Rôle |
| --- | --- |
| `npm run build` | vérification de types + build PWA dans `dist/` |
| `npm test` | tests unitaires (formatage, dépôt PGlite) |
| `npm --prefix server test` | tests d'intégration de l'API sur un vrai protocole PostgreSQL |
| `npm run icons` | régénère les icônes depuis `public/icon-source.svg` |

## Architecture

```
src/
  db/          schéma, client PGlite (idb://toctoc), requêtes
  lib/         formatage FR, regroupement de l'historique, synchronisation
  composables/ état partagé (événements, mode, horloge, annonces lecteur d'écran)
  views/       HomeView (accueil), HistoryView (historique)
server/        API Fastify + pg, migrations SQL
```

**Synchronisation** — chaque appareil a un identifiant d'espace (UUID aléatoire, table `meta`).
`POST /api/spaces/:space/sync` reçoit les lignes modifiées localement et renvoie celles changées
côté serveur depuis le curseur `since` (dernière écriture gagnante sur `updated_at`). Les
suppressions sont « douces » (`deleted_at`) pour être propagées. L'identifiant d'espace sert de
jeton d'accès : à protéger par une vraie authentification avant une mise en production.

## Accessibilité (WCAG 2.2 AA)

- Mise en page fluide jusqu'à **279 px** de large sans défilement horizontal ; zoom 400 % et
  agrandissement du texte supportés (unités `rem`, pas de hauteur fixe).
- Contrastes vérifiés (texte ≥ 4,5:1, composants ≥ 3:1), mode contraste forcé pris en charge.
- Cibles tactiles ≥ 44 px, focus visible, `prefers-reduced-motion` respecté.
- Alternative clavier à l'appui long (barre d'espace), confirmations annoncées via une région
  `aria-live`, focus déplacé sur le titre lors d'un changement d'écran et restauré au retour.
- Structure sémantique : titres, listes, `<time datetime>`, groupes de boutons `aria-pressed`.
- Audit axe-core (règles WCAG 2.0 → 2.2 A/AA) : 0 violation sur les deux écrans.
