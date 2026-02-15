const { PrismaClient } = require('@prisma/client');
const { fetchAndProcessFeed } = require('./services/rss');

const prisma = new PrismaClient();

async function testAllSources() {
    console.log('========================================');
    console.log('TEST DE TOUTES LES SOURCES RSS');
    console.log('========================================\n');

    try {
        const sources = await prisma.source.findMany({
            orderBy: { category: 'asc' }
        });

        console.log(`Total de sources à tester: ${sources.length}\n`);

        const results = {
            success: [],
            failed: [],
            total: sources.length
        };

        for (let i = 0; i < sources.length; i++) {
            const source = sources[i];
            console.log(`\n[${i + 1}/${sources.length}] Test de: ${source.name}`);
            console.log(`Category: ${source.category}`);
            console.log(`URL: ${source.url}`);

            try {
                const articlesAdded = await fetchAndProcessFeed(source);

                if (articlesAdded >= 0) {
                    results.success.push({
                        name: source.name,
                        category: source.category,
                        url: source.url,
                        articlesAdded
                    });
                    console.log(`✓ SUCCESS: ${articlesAdded} articles ajoutés`);
                } else {
                    results.failed.push({
                        name: source.name,
                        category: source.category,
                        url: source.url,
                        error: 'Returned negative count'
                    });
                    console.log(`✗ FAILED: Count négatif`);
                }
            } catch (error) {
                results.failed.push({
                    name: source.name,
                    category: source.category,
                    url: source.url,
                    error: error.message
                });
                console.log(`✗ FAILED: ${error.message}`);
            }

            // Petit délai entre chaque test pour éviter de surcharger
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        console.log('\n========================================');
        console.log('RÉSUMÉ DES TESTS');
        console.log('========================================\n');

        console.log(`✓ Sources fonctionnelles: ${results.success.length}/${results.total}`);
        console.log(`✗ Sources échouées: ${results.failed.length}/${results.total}`);
        console.log(`Taux de succès: ${((results.success.length / results.total) * 100).toFixed(2)}%\n`);

        if (results.failed.length > 0) {
            console.log('\n========================================');
            console.log('SOURCES ÉCHOUÉES - DÉTAILS');
            console.log('========================================\n');

            results.failed.forEach((source, index) => {
                console.log(`${index + 1}. ${source.name}`);
                console.log(`   Category: ${source.category}`);
                console.log(`   URL: ${source.url}`);
                console.log(`   Error: ${source.error}\n`);
            });
        }

        // Statistiques détaillées par catégorie
        console.log('\n========================================');
        console.log('STATISTIQUES PAR CATÉGORIE');
        console.log('========================================\n');

        const categoryStats = {};

        results.success.forEach(source => {
            if (!categoryStats[source.category]) {
                categoryStats[source.category] = { success: 0, failed: 0, total: 0, articles: 0 };
            }
            categoryStats[source.category].success++;
            categoryStats[source.category].total++;
            categoryStats[source.category].articles += source.articlesAdded;
        });

        results.failed.forEach(source => {
            if (!categoryStats[source.category]) {
                categoryStats[source.category] = { success: 0, failed: 0, total: 0, articles: 0 };
            }
            categoryStats[source.category].failed++;
            categoryStats[source.category].total++;
        });

        Object.keys(categoryStats).sort().forEach(category => {
            const stats = categoryStats[category];
            console.log(`${category}:`);
            console.log(`  ✓ ${stats.success}/${stats.total} sources (${stats.articles} articles)`);
            if (stats.failed > 0) {
                console.log(`  ✗ ${stats.failed} échec(s)`);
            }
            console.log('');
        });

    } catch (error) {
        console.error('Erreur lors du test:', error);
    } finally {
        await prisma.$disconnect();
    }
}

testAllSources();
