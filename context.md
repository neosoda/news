# 📖 Context Technique — Agrégateur News Tech & IA (NewsAI)

> Ce fichier résume l'architecture réelle et les conventions techniques du projet pour les développeurs et assistants IA.

## Objectif du Projet

Agrégateur de veille technologique et cybersécurité auto-hébergé. Il ingère des flux RSS, déduplique les articles, répare l'encodage, traduit en français, catégorise, regroupe les sujets multisources, suit CISA KEV + CERT-FR et génère des résumés et briefs IA à la demande. Déployé via Docker / Coolify.

## Architecture Globale

```text
Flux RSS + CERT-FR + Fuites de données + YouTube RSS + CISA KEV
       │
       ▼
  server/services/rss.js · videos.js · kev.js · editorial.js
  ┌── Validation SSRF / DNS pinning (urlSafety.js)
  ├── Déduplication URL + SHA-256 + titleSignature + Jaccard
  ├── Réparation mojibake UTF-8/Latin-1 (encoding.js)
  ├── Traduction (LibreTranslate d'abord, cascade LLM en repli)
  ├── Catégorisation (LLM + repli heuristique local)
  └── Regroupement éditorial 48 h + tendances 24 h (sans LLM)
       │
       ▼
  SQLite (Prisma 5 ORM)
       │
       ▼
  Express 5 API (server/index.js + server/routes.js)
       │
       ▼
  React 19 SPA (client/ — Vite 7, Tailwind CSS, TanStack Query)
```

## Cascade IA : Schéma de Priorité

### Traduction (EN → FR)

1. **LibreTranslate** (`TRANSLATION_URL`, défaut `https://translate.techsentinel.fr/translate`) — cooldown de 10 min en cas d'erreur réseau
2. **Groq** (`llama-3.1-8b-instant`)
3. **Mistral** (`mistral-small-latest`)
4. **OpenRouter** (cascade modèles `:free`)

### Résumé / Catégorisation / Brief Quotidien

1. **Groq** (`llama-3.1-8b-instant`)
2. **Mistral** (`mistral-small-latest`)
3. **OpenRouter** (cascade de 6 modèles gratuits)

## Fichiers Clés

| Fichier | Rôle |
|---|---|
| `server/index.js` | Point d'entrée Express, en-têtes CSP/sécurité, cron RSS (15 min), brief programmé optionnel |
| `server/routes.js` | Endpoints REST publics et admin, coalescence des générations IA |
| `server/services/rss.js` | Ingestion RSS bornée (5 Mo, 200 items), déduplication, récupération d'images |
| `server/services/ai.js` | Orchestrateur IA (LibreTranslate + LLM + retry validation citations du brief) |
| `server/services/openrouter.js` | Moteur LLM multi-provider (Groq → Mistral → OpenRouter) |
| `server/services/briefQuality.js` | Validation structurelle et bornage des citations `[n]` du brief |
| `server/services/editorial.js` | Dossiers multisources et tendances de mots-clés (48 h, max 500 articles) |
| `server/services/kev.js` | Catalogue CISA KEV avec cache 1 h, miroir officiel et index CVE en cache |
| `server/services/urlSafety.js` | Protection SSRF, blocage IP privées/non-globales, DNS pinning, `normalizePublicLink` |
| `server/services/adminAuth.js` | Auth `X-Admin-Token` (timing-safe), CORS, rate limiters bornés en mémoire |
| `server/prisma/schema.prisma` | Modèles `Source`, `Article`, `DailyBrief` (SQLite) |
| `client/src/` | SPA React (Actualités, Dossiers, Brief IA, Vidéos, Cyber Radar, Fuites, Favoris, Historique, Observatoire, Sources) |

## Variables d'Environnement

```env
SQLITE_URL=file:./prisma/dev.db
ADMIN_TOKEN=...                     # Obligatoire (>= 32 caractères) pour /sources et routes admin
ALLOWED_ORIGINS=                    # Vide si le frontend est servi par Express en production
GROQ_API_KEY=...                    # Priorité 1 LLM
MISTRAL_API_KEY=...                 # Repli niveau 2
OPENROUTER_API_KEY=...              # Repli final
TRANSLATION_URL=https://translate.techsentinel.fr/translate
ENABLE_SCHEDULED_BRIEF=false        # true pour générer le brief à 07h00 Europe/Paris
PORT=3000
NODE_ENV=production
```

## Règles de Développement

- **Catégories valides** : `Cybersecurité`, `Intelligence Artificielle`, `Cloud`, `Développement`, `Hardware`, `Web`, `Société`, `Business`, `Autre`, `Spam`.
- **Isolation des fuites** : `Fuites de données` reste isolée dans `/breaches` et n'apparaît ni dans `/`, ni dans `/api/articles/stats`, ni dans `/api/editorial`, ni dans `/api/daily-brief`.
- **Favoris & préférences lecteur** : stockés localement par navigateur (`localStorage`) pour éviter les écritures partagées sans authentification. Les routes DB historiques (`/api/bookmarks`, `POST /api/articles/:id/bookmark`) restent protégées par `requireAdmin`.
- **Sécurité des liens** : tout lien externe rendu côté client passe par `safeHttpUrl()` (`client/src/utils/url.js`) et côté serveur par `normalizePublicLink()`.
- **Validation** : `cd server && npm test`, `cd client && npm run lint && npm run build`, `node server/scripts/browser-smoke.js`, `npm audit --audit-level=high`.
