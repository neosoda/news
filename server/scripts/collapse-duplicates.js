#!/usr/bin/env node
/**
 * One-shot dedup sweep.
 *
 * 1) Backfill titleSignature sur tous les articles qui n'en ont pas
 *    (colonnes ajoutées par le schema après le déploiement existant).
 * 2) Lance collapseDuplicateArticlesBySourceNumericId() pour merger
 *    les doublons intra-source, y compris ceux qui n'ont pas d'ID
 *    numérique dans l'URL (Les Numériques, Azure Blog, etc.).
 *
 * Usage :
 *   node scripts/collapse-duplicates.js
 *   node scripts/collapse-duplicates.js --dry-run   # rapporte sans écrire
 *
 * Lit SQLITE_URL depuis le même .env que le serveur.
 */

const path = require('path');
const {
    backfillArticleTitleSignatures,
    collapseDuplicateArticlesBySourceNumericId
} = require('../services/rss');

function parseArgs(argv) {
    const args = { dryRun: false };
    for (const arg of argv.slice(2)) {
        if (arg === '--dry-run' || arg === '-n') {
            args.dryRun = true;
        }
    }
    return args;
}

async function main() {
    const args = parseArgs(process.argv);
    const startedAt = Date.now();
    console.log(
        `[collapse-duplicates] Starting sweep dryRun=${args.dryRun} cwd="${process.cwd()}"`
    );

    if (args.dryRun) {
        const prisma = require('../db');
        const total = await prisma.article.count();
        const nullSignature = await prisma.article.count({ where: { titleSignature: null } });
        const collapsed = await prisma.article.count({ where: { titleSignature: { contains: '#dup' } } });
        console.log(
            `[collapse-duplicates] DRY RUN: total=${total} nullSignature=${nullSignature} previouslyCollided=${collapsed}`
        );
        return;
    }

    const backfill = await backfillArticleTitleSignatures();
    console.log(
        `[collapse-duplicates] Backfill done. scanned=${backfill.scanned} updated=${backfill.updated}`
    );

    await collapseDuplicateArticlesBySourceNumericId();

    console.log(
        `[collapse-duplicates] Sweep finished in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`
    );

    // Le process Prisma n'est pas tenu par l'app, on coupe explicitement.
    const prisma = require('../db');
    await prisma.$disconnect();
}

main().catch((error) => {
    console.error('[collapse-duplicates] Sweep failed:', error);
    process.exit(1);
});
