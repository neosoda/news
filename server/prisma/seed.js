const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const sources = [
        // Cybersecurity
        { name: 'CERT-FR Alertes', url: 'https://www.cert.ssi.gouv.fr/feed/alertes/', category: 'Cybersecurité' },
        { name: 'CERT-FR Avis', url: 'https://www.cert.ssi.gouv.fr/feed/avis/', category: 'Cybersecurité' },
        { name: 'Cybermalveillance.gouv.fr', url: 'https://www.cybermalveillance.gouv.fr/tous-nos-contenus/actualites/rss', category: 'Cybersecurité' },
        { name: 'ESET Blog Security', url: 'https://www.eset.com/fr/rss/', category: 'Cybersecurité' },
        { name: 'Le Monde Informatique - Sécurité', url: 'https://www.lemondeinformatique.fr/flux-rss/securite/page-1.html', category: 'Cybersecurité' },
        { name: 'Cyber.gouv.fr', url: 'https://cyber.gouv.fr/actualites/feed', category: 'Cybersecurité' },
        { name: 'ZATAZ (RSS)', url: 'https://www.zataz.com/rss/zataz-news.rss', category: 'Cybersecurité' },
        { name: 'SecurityWeek', url: 'https://www.securityweek.com/feed', category: 'Cybersecurité' },
        { name: 'The Hacker News', url: 'https://feeds.feedburner.com/TheHackersNews', category: 'Cybersecurité' },
        { name: 'UnderNews', url: 'https://www.undernews.fr/feed', category: 'Cybersecurité' },
        { name: 'Malekal', url: 'https://www.malekal.com/feed/', category: 'Cybersecurité' },
        { name: 'ANSSI Actualités', url: 'https://www.ssi.gouv.fr/actualite/feed/', category: 'Cybersecurité' },
        { name: 'ANSSI Guides', url: 'https://www.ssi.gouv.fr/guide/feed/', category: 'Cybersecurité' },
        { name: 'CERT-FR CTI', url: 'https://www.cert.ssi.gouv.fr/cti/feed/', category: 'Cybersecurité' },
        { name: 'Le Big Data - Cybersecurite', url: 'https://www.lebigdata.fr/categorie/cybersecurite/feed/', category: 'Cybersecurité' },
        { name: 'ZATAZ (Feed)', url: 'https://www.zataz.com/feed/', category: 'Cybersecurité' },

        // Intelligence Artificielle
        { name: 'ActuIA', url: 'https://www.actuia.com/feed/', category: 'AI' },
        { name: 'Le Big Data - AI', url: 'https://www.lebigdata.fr/categorie/ia/feed/', category: 'AI' },
        { name: 'L\'Usine Digitale - IA', url: 'https://www.usine-digitale.fr/ia/rss', category: 'AI' },

        // Actualités Tech
        { name: '01net', url: 'https://www.01net.com/info/flux-rss/', category: 'Tech News' },
        { name: 'Le Mag IT', url: 'https://www.lemagit.fr/rss', category: 'Tech News' },
        { name: 'IT-Connect', url: 'https://www.it-connect.fr/tag/rss/', category: 'Tech News' },
        { name: 'Journal du Net', url: 'https://www.journaldunet.com/informatique/rss.xml', category: 'Tech News' },
        { name: 'ZDNet', url: 'https://www.zdnet.fr/feeds/rss/actualites/', category: 'Tech News' },
        { name: 'Next INpact', url: 'https://www.nextinpact.com/rss/actualites.xml', category: 'Tech News' },
        { name: 'Numerama', url: 'https://www.numerama.com/feed/', category: 'Tech News' },
        { name: '01net (Feed)', url: 'https://www.01net.com/feed/', category: 'Tech News' },
        { name: 'Clubic', url: 'https://www.clubic.com/rss', category: 'Tech News' },
        { name: 'Frandroid', url: 'https://www.frandroid.com/feed', category: 'Tech News' },
        { name: 'Journal du Geek', url: 'https://www.journaldugeek.com/feed/', category: 'Tech News' },
        { name: 'Korben', url: 'https://korben.info/feed', category: 'Tech News' },
        { name: 'PhonAndroid', url: 'https://www.phonandroid.com/feed', category: 'Tech News' },
        { name: 'Les Numériques', url: 'https://www.lesnumeriques.com/rss.xml', category: 'Tech News' },
        { name: 'Tom\'s Hardware', url: 'https://www.tomshardware.fr/feed/', category: 'Tech News' },
        { name: 'Tom\'s Guide', url: 'https://www.tomsguide.fr/feed/', category: 'Tech News' },
        { name: 'Futura Tech', url: 'https://www.futura-sciences.com/rss/actualites/tech/', category: 'Tech News' },
        { name: 'Futura High-Tech', url: 'https://www.futura-sciences.com/rss/actualites/high-tech/', category: 'Tech News' },
        { name: 'L\'Usine Digitale', url: 'https://www.usine-digitale.fr/rss', category: 'Tech News' },

        // Développement & IT
        { name: 'Developpez.com', url: 'https://www.developpez.com/index/rss', category: 'Development' },
        { name: 'LinuxFr', url: 'https://linuxfr.org/news.rss', category: 'Open Source' },
        { name: 'Silicon', url: 'https://www.silicon.fr/feed', category: 'IT' },
        { name: 'CIO Online', url: 'https://www.cio-online.com/actualites/rss', category: 'IT' },
        { name: 'Journal du Hacker', url: 'https://www.journalduhacker.net/rss', category: 'Development' },
        { name: 'Programmez!', url: 'https://www.programmez.com/rss.xml', category: 'Development' },
        { name: 'IT-Connect (Main)', url: 'https://www.it-connect.fr/feed/', category: 'IT' },

        // Cloud & Infrastructure
        { name: 'OVHcloud Blog', url: 'https://blog.ovhcloud.com/fr/feed/', category: 'Cloud' },
        { name: 'Scaleway Blog', url: 'https://www.scaleway.com/fr/blog/feed.xml', category: 'Cloud' },
        { name: 'Clever Cloud Blog', url: 'https://www.clever-cloud.com/fr/feed/', category: 'Cloud' },
        { name: 'OCTO Blog', url: 'https://blog.octo.com/feed/', category: 'IT' },
        { name: 'Publicis Sapient Engineering', url: 'https://blog.engineering.publicissapient.fr/feed/', category: 'IT' },
        { name: 'Google Cloud Developers', url: 'https://cloud.google.com/blog/fr/topics/developers-practitioners/rss/', category: 'Cloud' },
        { name: 'Azure Blog', url: 'https://azure.microsoft.com/fr-fr/blog/feed/', category: 'Cloud' },
        { name: 'AWS Blog France', url: 'https://aws.amazon.com/fr/blogs/france/feed/', category: 'Cloud' },
        { name: 'Red Hat Blog', url: 'https://www.redhat.com/fr/rss/blog', category: 'IT' },

        // Société & Divers
        { name: 'CNIL', url: 'https://www.cnil.fr/fr/rss.xml', category: 'Legal' },
        { name: 'Framablog', url: 'https://framablog.org/feed/', category: 'Open Source' },
        { name: 'OpenClassrooms Blog', url: 'https://blog.openclassrooms.com/fr/feed/', category: 'Education' },
        { name: 'DataScientest', url: 'https://datascientest.com/feed/', category: 'Education' },
    ];

    console.log('Seeding sources...');

    for (const source of sources) {
        await prisma.source.upsert({
            where: { url: source.url },
            update: { name: source.name, category: source.category },
            create: { name: source.name, url: source.url, category: source.category },
        });
    }

    console.log(`Seeding complete. ${sources.length} sources processed.`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
