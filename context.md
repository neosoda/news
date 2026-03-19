# 📖 Context Technique — Agrégateur News Tech & IA

> Ce fichier est destiné aux assistants IA (Antigravity, Copilot, etc.) pour avoir rapidement le contexte du projet.

## Objectif du Projet

Agrégateur de veille tech auto-hébergé. Il ingère des flux RSS, traduit les articles en français, les résume avec l'IA et les catégorise. Tout est automatique et déployé via Docker / Coolify.

## Architecture Globale

```
RSS Feeds (71 sources)
       │
       ▼
  server/services/rss.js
  ┌── Déduplique (URL + hash SHA-256)
  ├── Traduit (LibreTranslate d'abord, LLM en fallback)
  ├── Résume (LLM)
  └── Catégorise (LLM)
       │
       ▼
  PostgreSQL (Prisma ORM)
       │
       ▼
  Express API (server/index.js)
       │
       ▼
  React SPA (client/)
```

## Cascade IA : Schéma de Priorité

### Traduction (EN → FR)

1. **LibreTranslate** (`translate.techsentinel.fr`) — auto-hébergé, gratuit, sans quota
2. **Groq** (`llama-3.1-8b-instant`) — si LibreTranslate indisponible (>10 min de cooldown)
3. **Mistral** (`mistral-small-latest`) — si Groq échoue
4. **OpenRouter** (cascade modèles `:free`) — dernier recours

### Résumé / Catégorisation / Brief Quotidien

1. **Groq** (`llama-3.1-8b-instant`) — ultra-rapide, prioritaire
2. **Mistral** (`mistral-small-latest`) — fallback niveau 2
3. **OpenRouter** (cascade de 6 modèles gratuits) — fallback final

### Modèles OpenRouter (dans l'ordre)

```
mistralai/mistral-small-3.1-24b-instruct:free
google/gemma-3-12b-it:free
qwen/qwen3-4b:free
google/gemma-3-4b-it:free
meta-llama/llama-3.2-3b-instruct:free
google/gemma-3n-e4b-it:free
```

## Fichiers Clés

| Fichier | Rôle |
|---|---|
| `server/services/ai.js` | Orchestrateur IA : gère LibreTranslate + fallback LLM |
| `server/services/openrouter.js` | Moteur LLM multi-provider (Groq → Mistral → OpenRouter) |
| `server/services/rss.js` | Ingestion RSS, déduplication, appel aux services IA |
| `server/index.js` | Point d'entrée Express, cron jobs, WebSockets |
| `server/routes.js` | Définition des endpoints API REST |
| `server/prisma/schema.prisma` | Modèles de données |
| `client/src/` | Frontend React (Vite + TailwindCSS) |

## Variables d'Environnement

```env
# Base de données
DATABASE_URL=postgresql://user:password@host:5432/dbname

# LLM (au moins une requise - priorité : Groq > Mistral > OpenRouter)
GROQ_API_KEY=...           # Gratuit sur console.groq.com
MISTRAL_API_KEY=...        # Optionnel, fallback niveau 2
OPENROUTER_API_KEY=...     # Optionnel, fallback final

# Traduction (défaut : translate.techsentinel.fr)
TRANSLATION_URL=https://translate.techsentinel.fr/translate

# Serveur
PORT=3000
NODE_ENV=production
```

## Règles de Développement

- **Pas de doublons** : La déduplication se fait sur `normalizedUrl` + `contentHash` (SHA-256).
- **Cascade stricte** : Ne jamais appeler directement `openrouter.js`. Toujours passer par `generateResponse()` dans `openrouter.js` ou les fonctions de `ai.js`.
- **Catégories valides** : `Cybersecurité`, `Intelligence Artificielle`, `Cloud`, `Développement`, `Hardware`, `Web`, `Société`, `Business`, `Autre`, `Spam`.
- **Langues** : L'interface est en français. Les articles sources sont majoritairement en anglais.

## Points d'Attention

- LibreTranslate a un **cooldown de 10 minutes** après une erreur avant de réessayer.
- Les résumés IA ne sont générés qu'à la **demande explicite** (endpoint `/summarize`), pas automatiquement à l'ingestion.
- Le **brief quotidien** se génère à la demande via `/api/briefs`.
- Les **WebSockets** sont utilisés pour le push d'articles en temps réel vers le client.
- Le **seeding automatique** (71 sources RSS) s'exécute au premier démarrage si aucune source n'existe, incluant le blog Ollama (`https://ollama.com/blog/rss.xml`).
