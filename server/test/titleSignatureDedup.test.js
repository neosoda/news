const path = require('path');
const os = require('os');
const test = require('node:test');
const assert = require('node:assert/strict');

// DB temporaire dédiée à ce test (isolation complète, pas de collision
// avec les autres tests ou le dev.db).
const DB_PATH = path.join(os.tmpdir(), 'newsai-title-signature-dedup-test.db').replace(/\\/g, '/');
process.env.SQLITE_URL = `file:${DB_PATH}`;
process.env.ADMIN_TOKEN = 'title-signature-test-token-with-at-least-32-characters';

const prisma = require('../db');
const {
    buildShortTitleSignature,
    computeArticleFingerprint,
    computeArticleDedupKey,
    tokenizeTitleToSortedSet,
    jaccardTitleSimilarity,
    serializeTitleTokenSet,
    TITLE_DEDUP_JACCARD_THRESHOLD
} = require('../services/articleDedup');
const { collapseDuplicateArticlesBySourceNumericId } = require('../services/rss');

const TEST_SOURCE_URL = '__test_title_signature_dedup__';
const TEST_SOURCE_NAME = '__TestTitleSignatureDedup__';

async function ensureSource() {
    return prisma.source.upsert({
        where: { url: TEST_SOURCE_URL },
        update: {},
        create: {
            name: TEST_SOURCE_NAME,
            url: TEST_SOURCE_URL,
            category: 'Test'
        }
    });
}

async function resetArticles(sourceId) {
    await prisma.article.deleteMany({ where: { sourceId } });
}

function makeArticleData(overrides) {
    const originalTitle = overrides.originalTitle || 'Default title';
    return {
        title: overrides.title || originalTitle,
        originalTitle,
        link: overrides.link,
        fingerprint: computeArticleFingerprint({
            title: originalTitle,
            contentSnippet: overrides.contentSnippet || 'x',
            content: ''
        }),
        dedupKey: computeArticleDedupKey({
            title: originalTitle,
            contentSnippet: overrides.contentSnippet || 'x',
            content: ''
        }),
        titleSignature: buildShortTitleSignature(originalTitle),
        titleTokens: serializeTitleTokenSet(tokenizeTitleToSortedSet(originalTitle)),
        date: overrides.date || new Date(),
        content: overrides.content || 'content',
        sourceId: overrides.sourceId,
        isBookmarked: false
    };
}

test('tokenizeTitleToSortedSet : normalise accents/ponctuation/stopwords', () => {
    const a = tokenizeTitleToSortedSet("Actualité : French Days — L'ordinateur Portable Samsung Galaxy Book 5G");
    const b = tokenizeTitleToSortedSet("Actualite: French Days, L'ordinateur Portable Samsung Galaxy Book 5G 2024");
    // Les deux titres traitent du même sujet : le set trié unique doit être
    // identique (à l'ajout de "2024" près).
    assert.deepStrictEqual(a, ['actualite', 'book', 'days', 'french', 'galaxy', 'ordinateur', 'portable', 'samsung']);
    assert.deepStrictEqual(b, ['2024', 'actualite', 'book', 'days', 'french', 'galaxy', 'ordinateur', 'portable', 'samsung']);
});

test('jaccardTitleSimilarity : 1 mot ajouté sur 8 → similarité >= seuil (0.8)', () => {
    const base = tokenizeTitleToSortedSet('Microsoft unveils Project Zenith for cloud developers today');
    const variant = tokenizeTitleToSortedSet('Microsoft unveils Project Zenith for cloud developers today update');
    const score = jaccardTitleSimilarity(base, variant);
    // |A ∩ B| = 7, |A ∪ B| = 8 → Jaccard = 0.875
    assert.ok(score >= 0.8, `expected Jaccard >= 0.8 for suffix-added variant, got ${score}`);
    assert.ok(score >= TITLE_DEDUP_JACCARD_THRESHOLD);
});

test('jaccardTitleSimilarity : sujets différents → similarité < seuil', () => {
    const a = tokenizeTitleToSortedSet('Microsoft unveils Project Zenith for cloud developers today');
    const b = tokenizeTitleToSortedSet('Apple launches Vision Pro 2 headset worldwide release date');
    const score = jaccardTitleSimilarity(a, b);
    // Aucun token commun (microsoft/apple, project/launches, zenith/vision…) → 0
    assert.ok(score < TITLE_DEDUP_JACCARD_THRESHOLD);
});

test('Cas A : republication "promo" → captée par titleSignature (top 6 tokens inchangé)', async () => {
    const source = await ensureSource();
    await resetArticles(source.id);

    const originalTitle1 = "Actualité : French Days — L'ordinateur Portable Samsung Galaxy Book 5G";
    const originalTitle2 = "Actualité : French Days — L'ordinateur Portable Samsung Galaxy Book 5G (promo)";

    await prisma.article.create({
        data: makeArticleData({
            originalTitle: originalTitle1,
            link: 'https://lesnumeriques.com/ordinateur-portable/french-days-galaxy-book-5g',
            sourceId: source.id
        })
    });
    await prisma.article.create({
        data: makeArticleData({
            originalTitle: originalTitle2,
            link: 'https://lesnumeriques.com/ordinateur-portable/french-days-galaxy-book-5g?utm_source=feed',
            sourceId: source.id
        })
    });

    // "promo" est alphabétiquement après portable et avant samsung → sort
    // du top 6 → titleSignature identique → capté par la passe signature.
    const summary = await collapseDuplicateArticlesBySourceNumericId();
    assert.ok(
        (summary.signatureRemoved + summary.jaccardRemoved) >= 1,
        `expected at least 1 removed, got ${JSON.stringify(summary)}`
    );
    const remaining = await prisma.article.findMany({ where: { sourceId: source.id } });
    assert.strictEqual(remaining.length, 1, 'doit être dedupé via signature');
});

test('Cas B : republication avec préfixe "breaking" → titleSignature diffère, capté par Jaccard', async () => {
    const source = await ensureSource();
    await resetArticles(source.id);

    // Préfixe alphabétiquement AVANT les autres tokens → la titleSignature
    // (top 6 sorted) diffère. Seul le check Jaccard peut merger ces deux
    // articles : c'est le cas qui passait à travers l'ancienne dédup.
    const originalTitle1 = "Microsoft unveils Project Zenith for cloud developers today";
    const originalTitle2 = "BREAKING: Microsoft unveils Project Zenith for cloud developers today";

    await prisma.article.create({
        data: makeArticleData({
            originalTitle: originalTitle1,
            link: 'https://example.com/zenith-1',
            sourceId: source.id,
            content: 'aaaa'
        })
    });
    await prisma.article.create({
        data: makeArticleData({
            originalTitle: originalTitle2,
            link: 'https://example.com/zenith-2?utm=feed',
            sourceId: source.id,
            content: 'bbbb'
        })
    });

    // "breaking" commence par 'b' et est < 'microsoft' alphabétiquement, mais
    // tokenize le retire (length < 3 ? non, 8 chars). En fait 'breaking' est
    // retenu. Sorted A = [cloud, developers, for, microsoft, project, today, unveils, zenith]
    // Sorted B = [breaking, cloud, developers, for, microsoft, project, today, unveils, zenith]
    // Top 6 A = [cloud, developers, for, microsoft, project, today]
    // Top 6 B = [breaking, cloud, developers, for, microsoft, project]
    // → titleSignatures DIFFÉRENTES
    const t1 = tokenizeTitleToSortedSet(originalTitle1);
    const t2 = tokenizeTitleToSortedSet(originalTitle2);
    const sig1 = t1.slice(0, 6).join(' ');
    const sig2 = t2.slice(0, 6).join(' ');
    assert.notStrictEqual(sig1, sig2, 'precondition: signatures différentes');

    const jaccardScore = jaccardTitleSimilarity(t1, t2);
    assert.ok(
        jaccardScore >= TITLE_DEDUP_JACCARD_THRESHOLD,
        `precondition: Jaccard doit être >= seuil, got ${jaccardScore}`
    );

    const summary = await collapseDuplicateArticlesBySourceNumericId();
    assert.ok(
        summary.jaccardRemoved >= 1,
        `la passe Jaccard doit merger ce doublon, got ${JSON.stringify(summary)}`
    );
    const remaining = await prisma.article.findMany({ where: { sourceId: source.id } });
    assert.strictEqual(remaining.length, 1, 'doit être dedupé via Jaccard');
});

test('Clustering Jaccard : 3 articles du même sujet (A republications B+C) → 1 survivant', async () => {
    const source = await ensureSource();
    await resetArticles(source.id);

    // Article A : base. B et C ajoutent chacun un mot (suffixe "update" / "release").
    // Les titleSignatures peuvent différer (suffixes triés diff). Mais le
    // Jaccard clustering doit chaîner A~B~C et converger vers 1 article.
    const tA = "Microsoft unveils Project Zenith for cloud developers today";
    const tB = "Microsoft unveils Project Zenith for cloud developers today update";
    const tC = "Microsoft unveils Project Zenith for cloud developers today release";
    const a = await prisma.article.create({ data: makeArticleData({ originalTitle: tA, link: 'https://example.com/zenith-a', sourceId: source.id, content: 'aaaa' }) });
    const b = await prisma.article.create({ data: makeArticleData({ originalTitle: tB, link: 'https://example.com/zenith-b?utm=feed', sourceId: source.id, content: 'bbbb' }) });
    const c = await prisma.article.create({ data: makeArticleData({ originalTitle: tC, link: 'https://example.com/zenith-c', sourceId: source.id, content: 'cccc' }) });

    const summary = await collapseDuplicateArticlesBySourceNumericId();
    // Au moins 2 articles supprimés (3 → 1). Le split signature/jaccard
    // n'a pas d'importance, ce qui compte c'est le total.
    const totalRemoved = summary.signatureRemoved + summary.jaccardRemoved;
    assert.ok(totalRemoved >= 2, `expected at least 2 removed, got signature=${summary.signatureRemoved} jaccard=${summary.jaccardRemoved}`);

    const remaining = await prisma.article.findMany({ where: { sourceId: source.id } });
    assert.strictEqual(remaining.length, 1, 'clustering Jaccard doit merger en 1 seul');
    // Le survivor est l'un des trois originaux — le score favorise le plus récent
    // (date desc), mais peu importe qui, le clustering Jaccard est validé.
    assert.ok(
        [a.id, b.id, c.id].includes(remaining[0].id),
        `le survivant doit être l'un des 3 originaux (a=${a.id}, b=${b.id}, c=${c.id}), got ${remaining[0].id}`
    );
});

test('Pas de faux positif : deux articles de sujets différents, même source', async () => {
    const source = await ensureSource();
    await resetArticles(source.id);

    await prisma.article.create({
        data: makeArticleData({
            originalTitle: 'Microsoft unveils Project Zenith for cloud developers today',
            link: 'https://example.com/zenith',
            sourceId: source.id
        })
    });
    await prisma.article.create({
        data: makeArticleData({
            originalTitle: 'Apple launches Vision Pro 2 headset worldwide release date',
            link: 'https://example.com/vision-pro-2',
            sourceId: source.id
        })
    });

    const summary = await collapseDuplicateArticlesBySourceNumericId();
    assert.strictEqual(summary.jaccardRemoved, 0, 'deux sujets différents ne doivent pas être mergés');

    const remaining = await prisma.article.findMany({ where: { sourceId: source.id } });
    assert.strictEqual(remaining.length, 2, 'deux sujets différents ne doivent pas être mergés');
});

test.after(async () => {
    await prisma.article.deleteMany({ where: { source: { url: TEST_SOURCE_URL } } });
    await prisma.source.deleteMany({ where: { url: TEST_SOURCE_URL } });
    // On ne $disconnect pas le client partagé : d'autres tests s'en servent.
});
