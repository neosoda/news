#!/usr/bin/env node
/**
 * One-shot database encoding repair.
 *
 * Walks the Article table and rewrites any field that contains
 * UTF-8 -> Latin-1 -> UTF-8 mojibake (the classic "donn\u00c3\u00a9es" pattern
 * that was being stored by the LibreTranslate pipeline before the
 * post-processing guardrails were added in services/encoding.js).
 *
 * Usage:
 *   node scripts/repair-encoding.js
 *   node scripts/repair-encoding.js --dry-run
 *   node scripts/repair-encoding.js --batch-size=200
 *
 * Reads SQLITE_URL from the same .env the server uses.
 *
 * Safe to run repeatedly: it only writes rows that actually changed. Run this
 * once after deploying the encoding fix to clean up the historical corruption,
 * or after a feed provider migration that may have introduced new artifacts.
 */

const path = require('path');
const { repairAllArticlesEncoding } = require('../services/rss');

function parseArgs(argv) {
    const args = { dryRun: false, batchSize: 100, help: false };
    for (const arg of argv.slice(2)) {
        if (arg === '--dry-run' || arg === '-n') {
            args.dryRun = true;
        } else if (arg === '--help' || arg === '-h') {
            args.help = true;
        } else if (arg.startsWith('--batch-size=')) {
            const value = Number.parseInt(arg.slice('--batch-size='.length), 10);
            if (Number.isInteger(value) && value > 0) {
                args.batchSize = value;
            }
        }
    }
    return args;
}

function printHelp() {
    console.log(`
Usage: node scripts/repair-encoding.js [options]

Options:
  --dry-run, -n        Scan and report without writing changes.
  --batch-size=N       Number of articles fetched per page (default 100).
  --help, -h           Show this help.

Description:
  Repairs UTF-8/Latin-1 mojibake in Article.title, Article.originalTitle,
  Article.content, Article.summary and Article.keywords. Idempotent: only
  rows that contain the mojibake pattern are updated.
`);
}

async function main() {
    const args = parseArgs(process.argv);

    if (args.help) {
        printHelp();
        return;
    }

    const startedAt = Date.now();
    console.log(
        `[repair-encoding] Starting sweep dryRun=${args.dryRun} batchSize=${args.batchSize} cwd="${process.cwd()}"`
    );

    if (args.dryRun) {
        // For a dry run we just exercise the same scan loop and skip the write
        // path. We do this by importing the helper that does detection-only.
        const { repairArticleFieldsInPlace } = require('../services/rss');
        const prisma = require('../db');
        const REPAIRABLE = ['title', 'originalTitle', 'content', 'summary', 'keywords'];
        const fieldCounts = Object.fromEntries(REPAIRABLE.map((field) => [field, 0]));
        let scanned = 0;
        let wouldRepair = 0;
        let lastId = 0;
        while (true) {
            const batch = await prisma.article.findMany({
                where: { id: { gt: lastId } },
                orderBy: { id: 'asc' },
                take: args.batchSize,
                select: {
                    id: true,
                    title: true,
                    originalTitle: true,
                    content: true,
                    summary: true,
                    keywords: true
                }
            });
            if (batch.length === 0) break;
            for (const article of batch) {
                scanned += 1;
                lastId = article.id;
                const { changed, fields } = repairArticleFieldsInPlace(article);
                if (!changed) continue;
                wouldRepair += 1;
                for (const field of fields) {
                    fieldCounts[field] = (fieldCounts[field] || 0) + 1;
                }
            }
        }
        const elapsedMs = Date.now() - startedAt;
        console.log(
            `[repair-encoding] Dry run complete scanned=${scanned} wouldRepair=${wouldRepair} fields=${JSON.stringify(fieldCounts)} elapsedMs=${elapsedMs}`
        );
        return;
    }

    const summary = await repairAllArticlesEncoding({ batchSize: args.batchSize });
    const elapsedMs = Date.now() - startedAt;
    console.log(
        `[repair-encoding] Sweep complete scanned=${summary.scanned} repaired=${summary.repaired} fields=${JSON.stringify(summary.fieldCounts)} elapsedMs=${elapsedMs}`
    );

    // Disconnect so the script exits cleanly.
    const prisma = require('../db');
    await prisma.$disconnect();
}

main().catch((error) => {
    console.error(`[repair-encoding] Failed: ${error.message}`);
    console.error(error.stack);
    process.exitCode = 1;
});
