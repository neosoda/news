
# Agrégateur de News Tech & IA 🤖📰

Une application web complète de veille technologique automatisée, conçue avec une architecture "Thick Backend, Thin Frontend". Elle agrège des flux RSS, utilise l'IA (Mistral) pour les résumer, et présente le tout via une interface moderne.

## 🚀 Fonctionnalités

-   **Veille Automatisée** : Récupération automatique des flux RSS toutes les 30 minutes.
-   **IA Intégrée** : Résumé intelligent et analyse de sentiment des articles via l'API Mistral AI.
-   **Zéro Doublon** : Déduplication robuste basée sur les URLs des articles.
-   **Interface Premium** : Dashboard réactif et moderne (React + Tailwind).
-   **Déploiement Facile** : Conteneurisation complète avec Docker & Docker Compose (Compatible Coolify).

## 🛠 Stack Technique

### Backend (Le Cerveau)
-   **Node.js & Express** : API REST performante.
-   **Prisma ORM** : Gestion de base de données (PostgreSQL en prod, SQLite en dev).
-   **RSS Parser & Node-Cron** : Moteur d'agrégation et planification.
-   **Mistral AI SDK** : Intelligence artificielle.

### Frontend (L'Interface)
-   **React (Vite)** : Single Page Application (SPA).
-   **TailwindCSS** : Design system utilitaire.
-   **React Query** : Gestion d'état serveur et cache.

## 📦 Installation & Démarrage

### Prérequis
-   Node.js (v18+)
-   Docker & Docker Compose (pour le déploiement)
-   Une clé API Mistral AI (optionnel pour les résumés)

### 1. Développement Local

Pour lancer le projet en local (avec SQLite):

**Backend :**
1.  Allez dans le dossier `server`.
2.  Copiez `.env` et ajoutez votre clé API Mistral : `MISTRAL_API_KEY=votre_cle`.
3.  Modifiez `prisma/schema.prisma` : changez `provider = "postgresql"` en `provider = "sqlite"`.
4.  Installez et lancez :
    ```bash
    npm install
    npx prisma generate
    npx prisma migrate dev --name init
    npm run dev
    ```

**Frontend :**
1.  Allez dans le dossier `client`.
2.  Installez et lancez :
    ```bash
    npm install
    npm run dev
    ```

### 2. Déploiement Docker (Production / Coolify)

Le projet est configuré pour PostgreSQL par défaut dans le `docker-compose.yml`.

1.  Assurez-vous d'avoir les variables d'environnement nécessaires (ou un fichier `.env` à la racine).
2.  Lancez les conteneurs :
    ```bash
    docker-compose up -d --build
    ```
3.  L'application est accessible sur `http://localhost:8080`.

## 📂 Structure du Projet

```
/
├── client/         # Frontend React + Vite
├── server/         # Backend Node.js + Express
├── docker-compose.yml
└── README.md
```

## 📝 API Endpoints

-   `GET /api/articles` : Liste des articles (paginé).
-   `POST /api/articles/:id/summarize` : Générer un résumé IA.
-   `GET /api/sources` : Liste des flux RSS suivis.
-   `POST /api/sources` : Ajouter un nouveau flux.
