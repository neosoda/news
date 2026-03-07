
# Agrégateur de News Tech & IA 🤖📰

Une application web complète de veille technologique automatisée, conçue avec une architecture **"Thick Backend, Thin Frontend"**. Elle agrège des flux RSS, utilise l'IA pour les résumer, et présente le tout via une interface moderne.

## 🚀 Fonctionnalités

- **Veille Automatisée** : Récupération automatique des flux RSS toutes les 30 minutes et dès le démarrage.
- **Traduction Gratuite** : [LibreTranslate](https://translate.techsentinel.fr) (auto-hébergé) assure la traduction EN→FR sans quota.
- **IA en Cascade** : Résumé, catégorisation et fallback de traduction via **Groq** (prioritaire), puis **Mistral**, puis **OpenRouter** (modèles gratuits).
- **Fallback Robuste** : Si LibreTranslate est indisponible, la traduction bascule automatiquement sur le LLM en cascade (Groq → Mistral → OpenRouter).
- **Zéro Doublon** : Déduplication robuste basée sur URL normalisée + empreinte de contenu (hash SHA-256).
- **Interface Premium** : Dashboard réactif et moderne (React + Tailwind) avec horodatage détaillé.
- **Déploiement Automatisé** : Initialisation complète de la base de données et des 59 sources tech/sécurité au lancement (Compatible Coolify).

## 🤖 Architecture IA : Cascade de Fallback

Chaque appel à un LLM suit une cascade stricte pour maximiser la disponibilité :

```
[Traduction]                [Résumé / Catégorisation / Brief]
     │                                    │
LibreTranslate (auto-hébergé)         Groq (llama-3.1-8b-instant)
     │ si indisponible                    │ si erreur/timeout/rate-limit
     ▼                                    ▼
LLM Cascade →                         Mistral (mistral-small-latest)
  1. Groq (llama-3.1-8b-instant)         │ si erreur
  2. Mistral (mistral-small-latest)      ▼
  3. OpenRouter (modèles gratuits)   OpenRouter (cascade modèles :free)
```

Les modèles OpenRouter utilisés en cascade (du plus capable au plus léger) :

- `mistralai/mistral-small-3.1-24b-instruct:free`
- `google/gemma-3-12b-it:free`
- `qwen/qwen3-4b:free`
- `google/gemma-3-4b-it:free`
- `meta-llama/llama-3.2-3b-instruct:free`
- `google/gemma-3n-e4b-it:free`

## 🛠 Stack Technique

### Backend (Le Cerveau)

- **Node.js & Express** : API REST performante.
- **Prisma ORM** : Gestion de base de données (PostgreSQL/SQLite).
- **RSS Parser & Node-Cron** : Moteur d'agrégation et planification.
- **LibreTranslate** : Instance auto-hébergée sur `translate.techsentinel.fr`.
- **Groq API** : LLM ultra-rapide (prioritaire, gratuit avec clé API).
- **Mistral API** : LLM de fallback (niveau 2).
- **OpenRouter API** : Orchestration multi-modèles gratuits (niveau 3 / fallback final).

### Frontend (L'Interface)

- **React (Vite)** : Single Page Application (SPA).
- **TailwindCSS** : Design system utilitaire.
- **React Query** : Gestion d'état serveur et cache.
- **Lucide React** : Iconographie moderne.

## 📦 Installation & Démarrage

### Prérequis

- Node.js (v18+)
- Docker & Docker Compose (optionnel, pour la prod)
- Une clé API **Groq** (gratuite sur [console.groq.com](https://console.groq.com)) ← **recommandée**
- Une clé API Mistral (optionnel, fallback niveau 2)
- Une clé API OpenRouter (optionnel, fallback final)

> **Note :** Au moins une des trois clés est requise. La priorité est **Groq > Mistral > OpenRouter**.

### 1. Développement Local

**Backend :**

```bash
cd server
cp .env.example .env   # puis remplissez les clés API
npm install
npx prisma db push
npx prisma db seed
npm run dev
```

Exemple de `.env` :

```env
# LLM - au moins une clé requise (ordre de priorité : Groq > Mistral > OpenRouter)
GROQ_API_KEY=votre_cle_groq
MISTRAL_API_KEY=votre_cle_mistral      # optionnel
OPENROUTER_API_KEY=votre_cle_openrouter # optionnel

# Traduction (utilise translate.techsentinel.fr par défaut)
TRANSLATION_URL=https://translate.techsentinel.fr/translate
```

**Frontend :**

```bash
cd client
npm install
npm run dev
```

### 2. Déploiement Docker (Production / Coolify)

```bash
docker-compose up -d --build
```

L'application est accessible sur `http://localhost:8080`.

## 📂 Structure du Projet

```
/
├── client/              # Frontend React + Vite
├── server/              # Backend Node.js + Express
│   ├── prisma/          # Schéma et scripts de seeding
│   └── services/
│       ├── ai.js        # Orchestrateur : LibreTranslate + LLM cascade
│       ├── openrouter.js # Moteur LLM : Groq → Mistral → OpenRouter
│       └── rss.js       # Agrégateur RSS
├── context.md           # Contexte technique pour assistants IA
├── docker-compose.yml
└── README.md
```

## 🤖 Automatisation Assistée

Le projet supporte l'automatisation via Antigravity :

- **Workflows .agent** : Les scripts de maintenance sont dans `.agent/workflows/`.
- **Pilotage Turbo** : Le mode `auto.md` permet une gestion 100% autonome de la stack Docker et Prisma.

## 📝 API Endpoints

- `GET /api/articles` : Liste des articles (paginé, filtrable).
- `POST /api/articles/:id/summarize` : Générer un résumé IA.
- `GET /api/sources` : Liste des flux RSS suivis.
- `GET /api/health` : État de santé de l'API et de la base de données.
- `GET /api/briefs` : Briefs quotidiens par catégorie.
