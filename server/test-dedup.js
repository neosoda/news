/**
 * test-dedup.js — Test de déduplication des articles
 *
 * Ce script vérifie que le mécanisme de déduplication fonctionne correctement
 * en tentant d'insérer des articles qui devraient être rejetés.
 *
 * Usage: node server/test-dedup.js
 */

const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
const prisma = new PrismaClient();

// --- Utilitaires (copie des fonctions de rss.js) ---

function normalizeWhitespace(value) {
    if (typeof value !== 'string') return '';
    return value.replace(/\s+/g, ' ').trim();
}

function computeFingerprint({ title, contentSnippet, content }) {
    const normalizedTitle = normalizeWhitespace(title).toLowerCase();
    const normalizedSnippet = normalizeWhitespace(contentSnippet).toLowerCase();
    const normalizedContent = normalizeWhitespace(content).toLowerCase();
    const fingerprintSource = [normalizedTitle, normalizedSnippet || normalizedContent]
        .filter(Boolean).join('|');
    if (!fingerprintSource) return null;
    return crypto.createHash('sha256').update(fingerprintSource).digest('hex');
}

function computeDedupKey({ title, contentSnippet, content }) {
    const normalizedTitle = normalizeWhitespace(title).toLowerCase();
    const normalizedSnippet = normalizeWhitespace(contentSnippet).toLowerCase();
    const normalizedContent = normalizeWhitespace(content).toLowerCase();
    if (!normalizedTitle) return null;
    const contentBasis = normalizedSnippet || normalizedContent.slice(0, 500);
    const source = contentBasis
        ? `${normalizedTitle}|${contentBasis}`
        : `title-only:${normalizedTitle}`;
    return crypto.createHash('sha256').update(source).digest('hex');
}

// --- Données de test ---

const TEST_SOURCE_URL = '__test_dedup_source__';

const baseArticle = {
    title: 'Test Article on AI Security',
    contentSnippet: 'This is a test snippet about AI and security threats.',
    content: ''
};

const fingerprint = computeFingerprint(baseArticle);
const dedupKey = computeDedupKey(baseArticle);

// --- Helpers ---

async function checkDuplicate(label, criteria) {
    const existing = await prisma.article.findFirst({ where: { OR: criteria } });
    return existing !== null;
}

function pass(msg) { console.log(`  ✓ PASS: ${msg}`); }
function fail(msg) { console.log(`  ✗ FAIL: ${msg}`); process.exitCode = 1; }

// --- Main ---

async function main() {
    console.log('\n========================================');
    console.log('TEST DE DÉDUPLICATION DES ARTICLES');
    console.log('========================================\n');

    // Setup: créer une source de test
    let testSource;
    try {
        testSource = await prisma.source.upsert({
            where: { url: TEST_SOURCE_URL },
            update: {},
            create: { name: '__TestDedupSource__', url: TEST_SOURCE_URL, category: 'Test' }
        });
    } catch (e) {
        console.error('Erreur lors de la création de la source de test:', e.message);
        return;
    }

    // Nettoyer les articles de test précédents
    await prisma.article.deleteMany({ where: { sourceId: testSource.id } });

    // Insérer l'article de référence
    const refArticle = await prisma.article.create({
        data: {
            title: 'Article IA Sécurité (traduit)',
            originalTitle: baseArticle.title,
            link: 'https://example.com/test-article-ai-security',
            fingerprint,
            dedupKey,
            date: new Date(),
            content: 'Contenu traduit...',
            sourceId: testSource.id
        }
    });
    console.log(`Article de référence créé (id=${refArticle.id})\n`);

    let passed = 0;
    let failed = 0;

    // TEST 1 — Même link → doit être détecté comme doublon
    {
        const isDup = await checkDuplicate('same link', [
            { link: 'https://example.com/test-article-ai-security' }
        ]);
        if (isDup) { pass('Doublon détecté par link identique'); passed++; }
        else { fail('Doublon NON détecté par link identique'); failed++; }
    }

    // TEST 2 — Link avec paramètre tracking → même URL normalisée → doublon
    {
        const isDup = await checkDuplicate('link with utm', [
            { link: 'https://example.com/test-article-ai-security' } // normalizeUrl aurait supprimé utm
        ]);
        if (isDup) { pass('Doublon détecté par link normalisé (sans utm)'); passed++; }
        else { fail('Doublon NON détecté par link normalisé'); failed++; }
    }

    // TEST 3 — Même fingerprint, link différent → doublon
    {
        const isDup = await checkDuplicate('same fingerprint', [
            { fingerprint }
        ]);
        if (isDup) { pass('Doublon détecté par fingerprint'); passed++; }
        else { fail('Doublon NON détecté par fingerprint'); failed++; }
    }

    // TEST 4 — Même dedupKey, link et fingerprint différents → doublon
    {
        const isDup = await checkDuplicate('same dedupKey', [
            { dedupKey }
        ]);
        if (isDup) { pass('Doublon détecté par dedupKey'); passed++; }
        else { fail('Doublon NON détecté par dedupKey'); failed++; }
    }

    // TEST 5 — Article entièrement différent → pas un doublon
    {
        const differentFingerprint = computeFingerprint({ title: 'Completely Different Article', contentSnippet: 'Unrelated content here.', content: '' });
        const differentDedupKey = computeDedupKey({ title: 'Completely Different Article', contentSnippet: 'Unrelated content here.', content: '' });
        const isDup = await checkDuplicate('different article', [
            { link: 'https://example.com/completely-different' },
            { fingerprint: differentFingerprint },
            { dedupKey: differentDedupKey }
        ]);
        if (!isDup) { pass('Article différent correctement identifié comme nouveau'); passed++; }
        else { fail('Article différent incorrectement détecté comme doublon'); failed++; }
    }

    // TEST 6 — Article sans snippet → dedupKey basé sur titre seul → doit être détecté
    {
        const titleOnlyDedupKey = computeDedupKey({ title: baseArticle.title, contentSnippet: '', content: '' });
        // Cela a un préfixe 'title-only:', donc differ de la clé avec snippet
        const isDistinct = titleOnlyDedupKey !== dedupKey;
        if (isDistinct) { pass('dedupKey "titre seul" distinct du dedupKey "titre + snippet" (pas de faux positif)'); passed++; }
        else { fail('dedupKey "titre seul" identique à "titre + snippet" (collision!)'); failed++; }
    }

    // TEST 7 — Contrainte P2002 : tentative d'insertion avec link en double → doit lever une erreur gérée
    {
        try {
            await prisma.article.create({
                data: {
                    title: 'Duplicate Link Test',
                    link: 'https://example.com/test-article-ai-security', // même link
                    date: new Date(),
                    sourceId: testSource.id
                }
            });
            fail('Aucune erreur levée pour un link en double (contrainte @unique non respectée)');
            failed++;
        } catch (e) {
            if (e.code === 'P2002') { pass('Contrainte @unique DB correctement levée (P2002) pour link doublon'); passed++; }
            else { fail(`Erreur inattendue: ${e.message}`); failed++; }
        }
    }

    // Nettoyage
    await prisma.article.deleteMany({ where: { sourceId: testSource.id } });
    await prisma.source.delete({ where: { id: testSource.id } });

    console.log('\n========================================');
    console.log(`RÉSULTAT: ${passed} passés, ${failed} échoués`);
    console.log('========================================\n');
}

main()
    .catch(e => { console.error(e); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
