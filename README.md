
# Agrégateur de News Tech & IA 🤖📰

Une application web complète de veille technologique automatisée, conçue avec une architecture "Thick Backend, Thin Frontend". Elle agrège des flux RSS, utilise l'IA pour les résumer, et présente le tout via une interface moderne.

## 🚀 Fonctionnalités

-   **Veille Automatisée** : Récupération automatique des flux RSS toutes les 30 minutes et dès le démarrage.
-   **Traduction Illimitée** : Intégration de **LibreTranslate** pour une traduction automatique en français sans limites de quota API.
-   **IA Intégrée** : Résumé intelligent et analyse de sentiment des articles via l'API **Mistral AI**.
-   **Circuit Breaker** : Gestion intelligente des limites de débit de l'IA (fallback automatique).
-   **Zéro Doublon** : Déduplication robuste basée sur les URLs des articles.
-   **Interface Premium** : Dashboard réactif et moderne (React + Tailwind) avec horodatage détaillé.
-   **Déploiement Automatisé** : Initialisation complète de la base de données et des 58 sources tech/sécurité au lancement (Compatible Coolify).

## 🛠 Stack Technique

### Backend (Le Cerveau)
-   **Node.js & Express** : API REST performante.
-   **Prisma ORM** : Gestion de base de données (PostgreSQL/SQLite).
-   **RSS Parser & Node-Cron** : Moteur d'agrégation et planification.
-   **LibreTranslate** : Service de traduction auto-hébergé (Docker).
-   **Mistral AI SDK** : Intelligence artificielle pour les synthèses.

### Frontend (L'Interface)
-   **React (Vite)** : Single Page Application (SPA).
-   **TailwindCSS** : Design system utilitaire.
-   **React Query** : Gestion d'état serveur et cache.
-   **Lucide React** : Iconographie moderne.

## 📦 Installation & Démarrage

### Prérequis
-   Node.js (v18+)
-   Docker & Docker Compose
-   Une clé API Mistral AI (pour les résumés)

### 1. Développement Local

Pour lancer le projet en local :

**Backend :**
1.  Allez dans le dossier `server`.
2.  Créez un fichier `.env` avec votre clé API Mistral : `MISTRAL_API_KEY=votre_cle`.
3.  Installez et lancez :
    ```bash
    npm install
    npx prisma db push
    npx prisma db seed
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

Le projet est "Zero-Touch" : tout est automatisé au démarrage.

1.  Configurez vos variables d'environnement (`MISTRAL_API_KEY`).
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
│   ├── prisma/     # Schéma et scripts de seeding
│   └── services/   # Logique RSS, AI et Traduction
├── docker-compose.yml
└── README.md
```

## 📝 API Endpoints

-   `GET /api/articles` : Liste des articles (paginé).
-   `POST /api/articles/:id/summarize` : Générer un résumé IA.
-   `GET /api/sources` : Liste des flux RSS suivis.
-   `GET /api/health` : État de santé de l'API et de la base de données.
