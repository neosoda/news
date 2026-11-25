// CI-only fixture server. No production database or external service calls.
const express = require('express');
const path = require('node:path');
const prisma = require('../db');
const kev = require('../services/kev');

const FIXTURE_KEV_ENTRIES = [
    {
        cve: 'CVE-2026-12345',
        vendor: 'ExampleVendor',
        product: 'Fixture OS',
        name: 'Remote Code Execution in Fixture Gateway',
        description: 'Improper input validation allows remote code execution.',
        action: 'Apply vendor security update immediately.',
        added: '2026-11-24',
        due: '2026-12-10',
        ransomware: 'Known'
    },
    {
        cve: 'CVE-2026-67890',
        vendor: 'CloudCore',
        product: 'Cluster Proxy',
        name: 'Authentication Bypass in Management Plane',
        description: 'Missing token verification allows unauthorized configuration changes.',
        action: 'Upgrade to Cluster Proxy 4.2.1 or later.',
        added: '2026-11-20',
        due: '2026-12-05',
        ransomware: 'Unknown'
    }
];

const mockGetCatalog = async () => ({
    version: 'test-fixture',
    released: '2026-11-24',
    fetchedAt: new Date().toISOString(),
    stale: false,
    entries: FIXTURE_KEV_ENTRIES
});
mockGetCatalog.getCachedCveSet = () => new Set(FIXTURE_KEV_ENTRIES.map((entry) => entry.cve));
kev.getCatalog = mockGetCatalog;

const routes = require('../routes');

(async () => {
    const now = new Date();
    const source = await prisma.source.create({
        data: {
            name: 'Fixture Technology',
            url: 'https://example.com/tech.xml',
            category: 'Cloud',
            lastFetched: now
        }
    });
    const second = await prisma.source.create({
        data: {
            name: 'Korben',
            url: 'https://example.com/korben.xml',
            category: 'Cloud',
            lastFetched: now
        }
    });
    const cert = await prisma.source.create({
        data: {
            name: 'CERT-FR Fixture',
            url: 'https://example.com/cert.xml',
            category: 'Cybersecurité',
            lastFetched: now
        }
    });
    const breachSource = await prisma.source.create({
        data: {
            name: 'Bonjour la fuite',
            url: 'https://example.com/breaches.xml',
            category: 'Fuites de données',
            lastFetched: now
        }
    });

    const items = await Promise.all([
        prisma.article.create({
            data: {
                title: 'Microsoft Azure Kubernetes cluster migration',
                link: 'https://example.com/article/1',
                date: now,
                sourceId: source.id,
                category: 'Cloud',
                content: 'Retour d’expérience complet sur la migration de clusters Kubernetes managés sur Azure.',
                summary: 'Migration progressive des charges critiques avec bascule sans interruption de service.'
            }
        }),
        prisma.article.create({
            data: {
                title: 'Microsoft Azure Kubernetes cluster migration guide',
                link: 'https://example.com/article/2',
                date: now,
                sourceId: second.id,
                category: 'Cloud',
                content: 'Guide pratique et retours terrain pour migrer un cluster Kubernetes en production.'
            }
        }),
        prisma.article.create({
            data: {
                title: 'Fixture CERT advisory CVE-2026-12345',
                link: 'https://example.com/article/3',
                date: now,
                sourceId: cert.id,
                category: 'Cybersecurité',
                content: 'Alerte critique concernant la vulnérabilité exploitée CVE-2026-12345.'
            }
        }),
        prisma.article.create({
            data: {
                title: 'Fuite confirmée chez ExempleCorp',
                link: 'https://example.com/breach/1',
                date: now,
                sourceId: breachSource.id,
                category: 'Fuites de données',
                content: 'Incident confirmé affectant des coordonnées clients.'
            }
        })
    ]);

    const dateKey = '2026-01-01';
    await prisma.dailyBrief.create({
        data: {
            dateKey,
            payload: JSON.stringify([
                {
                    category: 'Cloud',
                    summary: '# Fixture edition\nUn résumé factuel des mouvements cloud du jour.\n\n## Migration Azure\nUn article de test sur la migration Kubernetes [1].',
                    articleCount: 1,
                    topArticles: [
                        {
                            id: items[0].id,
                            title: items[0].title,
                            link: items[0].link,
                            date: now,
                            source: { name: source.name }
                        }
                    ]
                }
            ])
        }
    });

    const app = express();
    app.use(express.json());
    app.get('/api/daily-brief', (req, res) => res.json([]));
    app.use('/api', routes);

    const dist = path.resolve(__dirname, '../../client/dist');
    app.use(express.static(dist));
    app.get(/.*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));

    app.listen(4179, '127.0.0.1', () => console.log('Fixture server ready'));
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
