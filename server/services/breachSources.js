const prisma = require('../db');

const BREACH_SOURCES = Object.freeze([
    {
        name: 'Bonjour la fuite',
        url: 'https://bonjourlafuite.eu.org/feed.xml',
        category: 'Fuites de données'
    },
    {
        name: 'Fuites Infos',
        url: 'https://fuitesinfos.fr/feed.xml',
        category: 'Fuites de données'
    },
    {
        name: 'FrenchBreaches',
        url: 'https://frenchbreaches.com/feed.xml',
        category: 'Fuites de données'
    }
]);

async function ensureBreachSources() {
    await Promise.all(
        BREACH_SOURCES.map((source) =>
            prisma.source.upsert({
                where: { url: source.url },
                update: { name: source.name, category: source.category },
                create: source
            })
        )
    );
}

module.exports = {
    BREACH_SOURCES,
    ensureBreachSources
};
