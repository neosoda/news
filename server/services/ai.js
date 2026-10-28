const axios = require('axios');
const { generateResponse } = require('./openrouter');
const { repairMojibake } = require('./encoding');

let isLibreTranslateAvailable = true;
let lastLibreTranslateCheck = 0;

const VALID_CATEGORIES = [
    'Cybersecurité',
    'Intelligence Artificielle',
    'Cloud',
    'Développement',
    'Hardware',
    'Web',
    'Société',
    'Business',
    'Autre'
];

const CATEGORY_ALIASES = new Map([
    ['cybersecurity', 'Cybersecurité'],
    ['cyber security', 'Cybersecurité'],
    ['cybersecurite', 'Cybersecurité'],
    ['sécurité', 'Cybersecurité'],
    ['securite', 'Cybersecurité'],
    ['security', 'Cybersecurité'],
    ['ai', 'Intelligence Artificielle'],
    ['ia', 'Intelligence Artificielle'],
    ['artificial intelligence', 'Intelligence Artificielle'],
    ['machine learning', 'Intelligence Artificielle'],
    ['llm', 'Intelligence Artificielle'],
    ['dev', 'Développement'],
    ['developer', 'Développement'],
    ['software', 'Développement'],
    ['programmation', 'Développement'],
    ['saas', 'Business'],
    ['startup', 'Business'],
    ['business', 'Business']
]);

const CATEGORY_KEYWORDS = [
    {
        category: 'Cybersecurité',
        terms: ['cve', 'vulnerability', 'vulnerabilite', 'faille', 'ransomware', 'malware', 'phishing', 'zero day', 'zeroday', 'patch tuesday', 'exploit', 'breach', 'piratage', 'cyberattaque']
    },
    {
        category: 'Intelligence Artificielle',
        terms: ['openai', 'anthropic', 'mistral', 'llm', 'chatgpt', 'claude', 'gemini', 'machine learning', 'deep learning', 'model', 'modele', 'agents ia', 'intelligence artificielle', 'generative ai']
    },
    {
        category: 'Cloud',
        terms: ['aws', 'azure', 'gcp', 'kubernetes', 'docker', 'serverless', 'cloudflare', 'terraform', 'devops', 's3', 'cloud']
    },
    {
        category: 'Développement',
        terms: ['javascript', 'typescript', 'react', 'node.js', 'nodejs', 'python', 'rust', 'go ', 'golang', 'api', 'framework', 'github', 'gitlab', 'sdk', 'release', 'version']
    },
    {
        category: 'Hardware',
        terms: ['gpu', 'cpu', 'nvidia', 'amd', 'intel', 'arm', 'puce', 'processeur', 'raspberry', 'ssd', 'serveur']
    },
    {
        category: 'Web',
        terms: ['browser', 'navigateur', 'chrome', 'firefox', 'safari', 'web', 'css', 'html', 'seo', 'frontend']
    },
    {
        category: 'Business',
        terms: ['startup', 'levee de fonds', 'acquisition', 'ipo', 'licenciement', 'revenu', 'croissance', 'marche', 'microsoft', 'google', 'apple']
    },
    {
        category: 'Société',
        terms: ['regulation', 'régulation', 'loi', 'privacy', 'vie privee', 'rgpd', 'copyright', 'justice', 'education', 'societe']
    }
];

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeForMatching(value) {
    if (typeof value !== 'string') {
        return '';
    }

    return value
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9+#.\s-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeCategory(value) {
    if (!value || typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim().replace(/["'`]/g, '');
    if (!trimmed) return null;

    if (/spam/i.test(trimmed)) {
        return 'Spam';
    }

    const exactMatch = VALID_CATEGORIES.find(
        (category) => category.toLowerCase() === trimmed.toLowerCase()
    );
    if (exactMatch) return exactMatch;

    const alias = CATEGORY_ALIASES.get(normalizeForMatching(trimmed));
    if (alias) return alias;

    const matchedCategory = VALID_CATEGORIES.find((category) =>
        new RegExp(`\\b${escapeRegExp(category)}\\b`, 'i').test(trimmed)
    );

    return matchedCategory || null;
}

function categorizeArticleLocally(title, content) {
    const normalizedPayload = normalizeForMatching(`${title || ''} ${content || ''}`.slice(0, 2500));
    if (!normalizedPayload) {
        return 'Autre';
    }

    let bestCategory = 'Autre';
    let bestScore = 0;

    for (const candidate of CATEGORY_KEYWORDS) {
        let score = 0;
        for (const term of candidate.terms) {
            const normalizedTerm = normalizeForMatching(term);
            if (!normalizedTerm) continue;

            const pattern = new RegExp(`(^|\\s)${escapeRegExp(normalizedTerm)}($|\\s)`, 'i');
            if (pattern.test(normalizedPayload)) {
                score++;
            }
        }

        if (score > bestScore) {
            bestScore = score;
            bestCategory = candidate.category;
        }
    }

    return bestScore > 0 ? bestCategory : 'Autre';
}

async function summarizeArticle(content) {
    if (!content || typeof content !== 'string') {
        return 'Résumé non disponible.';
    }

    try {
        const raw = await generateResponse(content.substring(0, 2000), {
            systemPrompt: 'Tu es un assistant expert en synthèse de news tech. Résume cet article en français de manière concise (max 3 phrases). Analyse le sentiment (Positif/Neutre/Négatif) et extrais 3 mots-clés.',
            temperature: 0.3,
            maxTokens: 400,
            timeoutMs: 20000
        });
        return repairMojibake(raw);
    } catch (error) {
        console.error('Summarization Error:', error.message, error.failures || '');
        throw error;
    }
}

async function translateText(text) {
    if (!text) return text;

    const translationUrl = process.env.TRANSLATION_URL || 'https://translate.techsentinel.fr/translate';

    if (!isLibreTranslateAvailable && (Date.now() - lastLibreTranslateCheck < 10 * 60 * 1000)) {
        return await fallbackToLLM(text);
    }

    try {
        const response = await axios.post(translationUrl, {
            q: text,
            source: 'auto',
            target: 'fr',
            format: 'text'
        }, {
            timeout: 3000,
            // Force UTF-8 decoding regardless of any wrong charset the
            // LibreTranslate server may advertise. Its Flask deployment has
            // historically returned Latin-1-looking bytes inside a JSON body,
            // which axios would otherwise treat as Latin-1 and mangle into
            // the "donn\u00c3\u00a9es" mojibake.
            responseEncoding: 'utf8',
            transitional: { silentJSONParsing: false }
        });

        if (response.data && response.data.translatedText) {
            isLibreTranslateAvailable = true;
            return repairMojibake(response.data.translatedText);
        }
    } catch (error) {
        if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
            if (isLibreTranslateAvailable) {
                console.warn(`LibreTranslate unavailable at ${translationUrl}. Falling back to LLM (Groq → Mistral → OpenRouter).`);
                isLibreTranslateAvailable = false;
                lastLibreTranslateCheck = Date.now();
            }
        } else {
            console.error('LibreTranslate Error:', error.response?.data || error.message);
        }
    }

    return await fallbackToLLM(text);
}

async function fallbackToLLM(text) {
    try {
        const raw = await generateResponse(text.substring(0, 500), {
            systemPrompt: 'Tu es un traducteur professionnel. Traduis le texte suivant en français. Ne donne que la traduction, sans explications.',
            temperature: 0,
            maxTokens: 300,
            timeoutMs: 15000
        });
        return repairMojibake(raw);
    } catch (error) {
        console.error('Translation Error (LLM fallback):', error.message, error.failures || '');
        return text;
    }
}

async function categorizeArticle(title, content) {
    if (!title && !content) return 'Autre';

    try {
        const rawCategory = await generateResponse(
            `Titre: ${title || ''}\n\nContenu: ${(content || '').substring(0, 1000)}`,
            {
                systemPrompt: "Tu es un expert en classification de news tech. Analyse l'article. Est-ce un article 'Putaclic' (titre exagéré, piège à clics, vidéo sans résumé) ou purement 'Promotionnel' (publi-reportage, vente de produit) ? Si OUI, réponds uniquement 'Spam'. Sinon, classe l'article dans l'UNE de ces catégories : Cybersecurité, Intelligence Artificielle, Cloud, Développement, Hardware, Web, Société, Business, Autre. Réponds uniquement par le nom de la catégorie.",
                temperature: 0,
                maxTokens: 40,
                timeoutMs: 15000
            }
        );

        const repairedCategory = repairMojibake(rawCategory);
        const normalizedCategory = normalizeCategory(repairedCategory);
        if (!normalizedCategory) {
            console.warn(`Categorization returned an invalid label: "${repairedCategory}"`);
            return categorizeArticleLocally(title, content);
        }
        return normalizedCategory;
    } catch (error) {
        console.error('Categorization Error:', error.message, error.failures || '');
        return categorizeArticleLocally(title, content);
    }
}

// Articles sent to the model, numbered [1]..[N]; the route exposes the same
// slice as `topArticles` so the [n] citations map to the right links.
const BRIEF_SOURCE_LIMIT = 10;

function briefSnippet(content) {
    if (!content) return '';
    return content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 160);
}

async function generateCategoryBrief(category, articles) {
    if (articles.length === 0) return "Aucune actualité majeure dans cette catégorie aujourd'hui.";

    const inputContent = articles
        .slice(0, BRIEF_SOURCE_LIMIT)
        .map((a, i) => {
            const snippet = briefSnippet(a.content);
            const source = a.source?.name ? ` (${a.source.name})` : '';
            return `[${i + 1}] ${a.title}${source}${snippet ? ` — ${snippet}` : ''}`;
        })
        .join('\n');

    try {
        const raw = await generateResponse(
            `Rubrique : ${category}\nArticles :\n${inputContent}`,
            {
                systemPrompt: `Tu es rédacteur en chef d'un média tech francophone. Rédige la synthèse du jour de la rubrique à partir des articles numérotés.

Format Markdown strict :
# Titre éditorial informatif (8 mots max, sans le nom de la rubrique ni le mot « brief »)
Chapô : une ou deux phrases qui donnent l'essentiel.

## Titre court de l'actualité (6 mots max)
Deux ou trois phrases factuelles : quoi, qui, pourquoi c'est important. Termine par les numéros des articles utilisés, ex. [2][5].

Règles :
- 1 à 5 actualités selon la matière disponible, la plus importante d'abord. Regroupe les articles qui traitent du même sujet.
- Mets en **gras** 2 ou 3 éléments clés par actualité : entreprises, produits, chiffres.
- Français naturel, ton neutre de presse. Pas d'introduction, de conclusion ni de formule générique.
- Utilise uniquement les informations fournies : aucun chiffre, nom ou date inventé. Ne cite que les articles qui appuient réellement le paragraphe.`,
                temperature: 0.3,
                maxTokens: 700,
                timeoutMs: 25000
            }
        );
        return repairMojibake(raw);
    } catch (error) {
        console.error(`Daily Brief Error (${category}):`, error.message, error.failures || '');
        return 'Impossible de générer le résumé pour le moment.';
    }
}

module.exports = { summarizeArticle, translateText, categorizeArticle, generateCategoryBrief, BRIEF_SOURCE_LIMIT, normalizeCategory, categorizeArticleLocally };
