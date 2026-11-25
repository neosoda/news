<div align="center">

<img src="docs/assets/newsai-hero.svg" alt="NewsAI — L’essentiel de la tech, sans le bruit. Bannière éditoriale conceptuelle." width="100%" />

<br />

### Votre centre de veille technologique, augmenté par l'IA.

**Une seule interface pour suivre la tech, comprendre les tendances et garder une longueur d'avance.**

Agrégation RSS · Briefs IA · Cybersécurité · Vidéos · Fuites de données

<br />

[![Node.js](https://img.shields.io/badge/Node.js-22-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-19-087EA4?style=for-the-badge&logo=react&logoColor=white)](https://react.dev/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?style=for-the-badge&logo=docker&logoColor=white)](#-déploiement-avec-docker)
[![Self-hosted](https://img.shields.io/badge/Self--hosted-Yes-27c4c9?style=for-the-badge)](#-déploiement-avec-docker)
[![Last commit](https://img.shields.io/github/last-commit/neosoda/news?style=for-the-badge&label=Dernier%20commit&color=818cf8)](https://github.com/neosoda/news/commits/main)

<br />

[**🌐 Ouvrir TechNews**](https://news.techsentinel.fr/) · [**Découvrir les fonctionnalités**](#-une-veille-qui-va-à-lessentiel) · [**Installer avec Docker**](#-déploiement-avec-docker) · [**Comprendre l'architecture**](#-architecture) · [**Explorer l'API**](#-api-rest)

<sub>Projet développé par <a href="https://github.com/neosoda">neosoda</a> · React + Express + Prisma · Déployable sur Docker et Coolify</sub>

</div>

---

## ✨ Une veille qui va à l'essentiel

L'information technologique est partout. Le temps pour la lire, beaucoup moins.

**NewsAI** centralise des sources d'actualité tech, IA, cloud, développement et cybersécurité. Le moteur collecte les flux RSS, déduplique les articles, les traduit si nécessaire et permet de produire des synthèses assistées par IA.

L'objectif : **passer moins de temps à chercher l'information et plus de temps à la comprendre.**

| | Espace | Ce que vous y trouvez |
|:---:|---|---|
| 📰 | **Actualités** | Flux RSS consolidé, recherche multi-termes, filtres partageables par URL (catégorie, période, source), suivi local de recherches et masquage de sources. |
| 🗂️ | **Dossiers & tendances** | Regroupements automatiques de sujets repris par plusieurs sources sur 48 h et mots-clés en progression (sans appel IA). |
| ⚡ | **Brief IA quotidien** | Synthèses structurées par thème, validation des citations numériques `[n]`, cache de secours et consultation des éditions archivées. |
| 📡 | **Cyber Radar** | Catalogue officiel **CISA KEV** (cache 1 h, filtre rançongiciel, miroir officiel) et derniers avis **CERT-FR** avec corrélation des CVE. |
| 🛡️ | **Fuites de données** | Espace dédié aux alertes publiées par Bonjour la fuite, Fuites Infos et FrenchBreaches, isolées du fil principal. |
| 🎬 | **Vidéos** | Veille IA, IT, tech et développement depuis des chaînes YouTube via leurs flux RSS mis en cache. |
| 🔖 | **Favoris & Historique** | Favoris individuels et historique des 100 derniers liens ouverts, stockés localement dans le navigateur, sans compte. |
| 📊 | **Observatoire & Sources** | Suivi public de l'activité des flux sur 7 jours (`/observatory`) et administration complète des sources RSS sous jeton admin (`/sources`). |

<sub>Interface responsive avec thème clair/sombre ; les fonctions IA nécessitent au moins une clé de fournisseur configurée.</sub>

## 🧠 Une intelligence artificielle avec des solutions de repli

NewsAI utilise plusieurs fournisseurs pour éviter de dépendre d'un seul moteur.

```mermaid
flowchart TB
    RSS["Flux RSS et articles"] --> PROCESS["Collecte, déduplication et catégorisation"]
    PROCESS --> TRANSLATE["Traduction vers le français"]
    PROCESS --> BRIEF["Résumés et briefs IA"]
    TRANSLATE --> LIBRE["LibreTranslate"]
    LIBRE -->|"Service indisponible"| LLM["Cascade LLM"]
    BRIEF --> LLM
    LLM --> GROQ["Groq"]
    GROQ -->|"Erreur ou quota"| MISTRAL["Mistral"]
    MISTRAL -->|"Échec"| OPEN["OpenRouter — modèles de repli"]
    style RSS fill:#102a42,stroke:#67dbe5,color:#fff
    style PROCESS fill:#102a42,stroke:#67dbe5,color:#fff
    style LLM fill:#25315a,stroke:#9c9cf9,color:#fff
    style GROQ fill:#173f4c,stroke:#67dbe5,color:#fff
    style MISTRAL fill:#25315a,stroke:#9c9cf9,color:#fff
    style OPEN fill:#25315a,stroke:#9c9cf9,color:#fff
```

**Ordre de priorité :** Groq → Mistral → OpenRouter. Les modèles gratuits OpenRouter sont utilisés en cascade lorsque ce fournisseur est configuré. Pour les traductions, **LibreTranslate** est essayé avant le repli sur LLM.

Cette stratégie améliore la résilience, **sans garantir** la disponibilité, la gratuité ni l'exactitude des réponses des services tiers.

## 🔍 Ce qui se passe en coulisses

<details>
<summary><strong>Voir les détails du moteur de veille</strong></summary>

<br />

- **Collecte planifiée** : récupération des flux au démarrage, puis toutes les **15 minutes** tant que le serveur fonctionne.
- **Catalogue initial** : sources technologiques et sécurité préconfigurées ; initialisation idempotente sans effacer les articles existants.
- **Déduplication** : normalisation des URL, empreintes de contenu SHA-256 et rapprochement de titres pour limiter les republications.
- **Traitement de contenu** : récupération d'images lorsqu'elle est possible, correction de problèmes d'encodage et traduction en français.
- **Résilience des sources** : suivi des échecs, périodes de pause, désactivation après échecs répétés et possibilité de réactivation.
- **Contrôle éditorial** : les fuites de données restent dans leur rubrique dédiée plutôt que d'encombrer le fil principal.

</details>

## 🚀 Déploiement avec Docker

Le moyen le plus simple pour lancer NewsAI, y compris depuis un environnement **Coolify**.

**Prérequis :** Docker avec Compose, un jeton d'administration robuste et **au moins une clé API LLM** pour les fonctionnalités IA (Groq, Mistral ou OpenRouter).

### 1. Récupérer le dépôt

```bash
git clone https://github.com/neosoda/news.git
cd news
cp server/.env.example .env
```

### 2. Configurer `.env`

Définissez un jeton `ADMIN_TOKEN` aléatoire d'au moins **32 caractères** et au moins une clé LLM :

```dotenv
# Obligatoire pour l'administration des sources
ADMIN_TOKEN=remplacer_par_un_jeton_aleatoire_de_32_caracteres_minimum

# Au moins une clé pour les fonctions IA
GROQ_API_KEY=
MISTRAL_API_KEY=
OPENROUTER_API_KEY=

# Traduction en développement local ; voir note Docker ci-dessous
TRANSLATION_URL=https://translate.techsentinel.fr/translate
```

Pour générer un bon jeton :

```bash
openssl rand -base64 48
```

> **Sécurité :** ne publiez jamais votre `.env` ni vos clés API. Le traducteur par défaut est externe au conteneur. Pour utiliser votre propre LibreTranslate avec Docker Compose, définissez `TRANSLATION_URL` dans votre environnement ou votre fichier `.env`.

### 3. Lancer l'application

```bash
docker compose up -d --build
```

Ouvrez **http://localhost:8080**.

Le conteneur initialise Prisma/SQLite et charge les sources par défaut au démarrage. Le volume nommé `news-data` conserve la base SQLite lors de la recréation du conteneur.

**Pour Coolify :** importez le dépôt Git, utilisez le déploiement Docker Compose, configurez les variables d'environnement dans Coolify et exposez le service sur le port interne `3000`.

## 💻 Développement local

<details>
<summary><strong>Installation Node.js sans Docker</strong></summary>

<br />

Prévoir **Node.js 20+**, npm et un accès réseau vers les fournisseurs configurés.

Dans un premier terminal :

```bash
git clone https://github.com/neosoda/news.git
cd news/server
cp .env.example .env
# Renseignez ADMIN_TOKEN et au moins une clé LLM dans .env
npm ci
npx prisma generate
npx prisma db push
npx prisma db seed
npm run dev
```

Dans un deuxième terminal, depuis la racine du dépôt :

```bash
cd client
npm ci
npm run dev
```

Le frontend Vite s'ouvre sur **http://localhost:5173** et redirige les requêtes `/api` vers l'API locale sur le port `3000`.

**Vérifications disponibles :**

```bash
cd server && npm test
```

```bash
cd client && npm run lint && npm run build
```

</details>

## 🏗️ Architecture

Un backend chargé de la collecte et des traitements, un frontend léger centré sur la lecture.

| Couche | Technologies | Rôle |
|---|---|---|
| **Interface** | React 19, Vite 7, Tailwind CSS, TanStack Query | Lecture, recherche, navigation, briefs, favoris et administration. |
| **API** | Node.js 20, Express 5 | Endpoints, accès aux données et contrôle des requêtes. |
| **Veille** | rss-parser, node-cron, Cheerio | Ingestion, nettoyage, enrichissement et planification des flux. |
| **Données** | SQLite, Prisma 5 | Articles, sources, favoris et cache des briefs. |
| **IA / traduction** | Groq, Mistral, OpenRouter, LibreTranslate | Synthèse, catégorisation et traduction avec stratégies de repli. |
| **Déploiement** | Docker, Docker Compose | Conteneur applicatif et stockage persistant. |

```text
news/
├── client/                   # Interface React / Vite
│   └── src/
│       ├── pages/            # Actualités, brief, vidéos, fuites...
│       ├── components/       # Layout et cartes
│       └── services/         # Client API et parsing du brief
├── server/                   # API et traitements
│   ├── prisma/               # Schéma SQLite et seed RSS
│   ├── services/             # RSS, IA, sécurité, vidéos, déduplication
│   ├── routes.js             # API REST
│   └── index.js              # Serveur et actualisation planifiée
├── docs/assets/              # Identité visuelle GitHub
├── Dockerfile
└── docker-compose.yml
```

## 🔌 API REST

Quelques endpoints utiles pour superviser ou intégrer NewsAI :

| Méthode | Route | Utilité |
|---|---|---|
| `GET` | `/api/health` | État de l'API, de SQLite et de l'actualisation RSS |
| `GET` | `/api/articles` | Articles, recherche multi-termes, pagination et filtres (`period`, `sourceId`, `excludeSources`) |
| `GET` | `/api/articles/stats` | Statistiques de la veille par catégorie |
| `GET` | `/api/article-sources` | Liste publique des sources actives (sans URL interne) |
| `GET` | `/api/editorial` | Dossiers multisources et tendances sur 48 h (max 500 articles, sans IA) |
| `GET` | `/api/daily-brief` | Brief IA quotidien (avec repli sur dernier cache valide) |
| `GET` | `/api/brief-archive` | Liste des éditions archivées du brief (`GET /api/brief-archive/:date` pour une date) |
| `GET` | `/api/cyber/kev` | Catalogue officiel CISA KEV (cache 1 h, filtre `search` et `ransomware=known`) |
| `GET` | `/api/cyber/cert` | Derniers avis CERT-FR avec extraction CVE et corrélation KEV |
| `GET` | `/api/source-observatory` | Activité et fraîcheur des flux sur 7 jours (sans URL ni erreurs internes) |
| `GET` | `/api/videos` | Vidéos par thème et mots-clés (flux YouTube mis en cache 15 min) |
| `POST` | `/api/articles/:id/summarize` | Résumé IA d'un article (requêtes simultanées fusionnées) |
| `GET` | `/api/sources/health` | État des sources (**jeton admin obligatoire**) |
| `POST` | `/api/sources/refresh` | Demande d'actualisation (**jeton admin obligatoire**) |

Les autres opérations de gestion des sources utilisent également le jeton `X-Admin-Token`. Les favoris individuels, recherches suivies, sources masquées et l'historique des 100 derniers liens ouverts sont stockés localement par navigateur, sans compte. Les anciennes entrées de favoris en base sont conservées et accessibles uniquement avec le jeton administrateur (`GET /api/bookmarks`, `POST /api/articles/:id/bookmark`, `GET /api/articles?bookmarked=true`).

## 🔐 Sécurité et exploitation

- **Administration des sources protégée** par `ADMIN_TOKEN`, transmis dans l'en-tête `X-Admin-Token` et gardé en `sessionStorage` côté navigateur.
- **Validation des URL** des sources et protections SSRF (blocage IP privées/non-globales, DNS pinning, blocage identifiants dans l'URL), restriction CORS, en-têtes CSP et limitation du nombre de requêtes.
- **Génération programmée facultative** : `ENABLE_SCHEDULED_BRIEF=true` active une édition automatique quotidienne à 07 h 00 (`Europe/Paris`) ; désactivée par défaut pour éviter toute consommation IA non souhaitée.
- **Données persistantes** dans SQLite : sauvegardez le volume Docker avant toute migration importante.
- **Fonctionnement dépendant des tiers** : la collecte, YouTube, CISA KEV, la traduction et la génération IA dépendent de la disponibilité des services contactés. Les échéances CISA concernent les agences fédérales américaines et ne constituent pas une obligation locale.
- **Synthèses IA et regroupements à vérifier** : les briefs facilitent la lecture (citations numériques validées structurellement) et les dossiers sont heuristiques, mais les articles originaux restent la référence.

## Questions fréquentes

**Comment suivre plusieurs sources de veille informatique au même endroit ?** NewsAI collecte les flux RSS configurés, supprime les doublons et classe les articles par catégorie.

**Peut-on obtenir des résumés de l'actualité IT et cybersécurité avec l'IA ?** Oui, si un fournisseur IA est configuré. Les synthèses doivent rester vérifiées par rapport aux sources originales.

**L'application est-elle auto-hébergeable ?** Oui, le dépôt fournit un déploiement Docker. Une [instance TechNews](https://news.techsentinel.fr/) est également indiquée dans les informations du dépôt.

## 🤝 Participer au projet

Une idée de fonctionnalité, un problème de collecte RSS, une correction d'interface ou une amélioration à proposer ?

[**Signaler un problème**](https://github.com/neosoda/news/issues) · [**Proposer une contribution**](https://github.com/neosoda/news/pulls) · [**Explorer le code**](https://github.com/neosoda/news)

## Licence et réutilisation

Le **code original** de NewsAI est proposé sous **Apache License 2.0 + Commons Clause 1.0** (licence *source-available*, **non reconnue comme open source**). Voir [LICENSE](LICENSE).

L'utilisation personnelle, l'auto-hébergement non commercial et les modifications sont autorisés dans les limites du texte de licence. La revente du logiciel ou d'un service payant tirant **entièrement ou substantiellement** sa valeur de ses fonctionnalités nécessite une autorisation écrite du titulaire des droits. **La Commons Clause ne prohibe pas tous les SaaS commerciaux** : les produits apportant une valeur substantielle supplémentaire peuvent être autorisés.

Les logiciels, bibliothèques, contenus et installateurs de tiers restent soumis à **leurs propres licences**, qui ne sont pas remplacées par celle du projet.

---

<div align="center">

**NewsAI — Moins de bruit. Plus de signal.** ✦

<sub>Made by <a href="https://github.com/neosoda">neosoda</a> · Pensé pour les passionnés de tech, les développeurs et les professionnels IT.</sub>

<br /><br />

<a href="https://github.com/neosoda/news#readme">↑ Retour en haut</a>

</div>
