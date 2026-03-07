const axios = require('axios');
const { generateResponse } = require('./openrouter');

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

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

    const matchedCategory = VALID_CATEGORIES.find((category) =>
        new RegExp(`\\b${escapeRegExp(category)}\\b`, 'i').test(trimmed)
    );

    return matchedCategory || null;
}

async function summarizeArticle(content) {
    if (!content || typeof content !== 'string') {
        return 'Résumé non disponible.';
    }

    try {
        return await generateResponse(content.substring(0, 2000), {
            systemPrompt: 'Tu es un assistant expert en synthèse de news tech. Résume cet article en français de manière concise (max 3 phrases). Analyse le sentiment (Positif/Neutre/Négatif) et extrais 3 mots-clés.',
            temperature: 0.3,
            maxTokens: 400,
            timeoutMs: 20000
        });
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
        }, { timeout: 3000 });

        if (response.data && response.data.translatedText) {
            isLibreTranslateAvailable = true;
            return response.data.translatedText;
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
        return await generateResponse(text.substring(0, 500), {
            systemPrompt: 'Tu es un traducteur professionnel. Traduis le texte suivant en français. Ne donne que la traduction, sans explications.',
            temperature: 0,
            maxTokens: 300,
            timeoutMs: 15000
        });
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

        const normalizedCategory = normalizeCategory(rawCategory);
        if (!normalizedCategory) {
            console.warn(`Categorization returned an invalid label: "${rawCategory}"`);
        }
        return normalizedCategory;
    } catch (error) {
        console.error('Categorization Error:', error.message, error.failures || '');
        return null;
    }
}

async function generateCategoryBrief(category, articles) {
    if (articles.length === 0) return "Aucune actualité majeure dans cette catégorie aujourd'hui.";

    const inputContent = articles
        .slice(0, 15)
        .map(a => `- ${a.title}: ${a.content ? a.content.substring(0, 100).replace(/\n/g, ' ') : ''}...`)
        .join('\n');

    try {
        return await generateResponse(
            `Voici les dernières actualités pour la catégorie ${category}:\n\n${inputContent}`,
            {
                systemPrompt: `Tu es un journaliste expert tech. Rédige un "Brief Quotidien" pour la catégorie "${category}".
Objectifs:
1. Synthétise les actualités fournies en un résumé fluide et structuré de 5 à 7 lignes maximum.
2. Adopte un ton neutre, factuel et professionnel ("presse tech premium").
3. Mets en avant les faits marquants et leurs impacts.
4. Évite les répétitions et ignore les sujets trop mineurs ou sensationnalistes.
5. Si aucune tendance claire ne se dégage, résume simplement les 2-3 infos les plus importantes.
IMPORTANT: Ne base ton résumé QUE sur les titres fournis. N'invente rien.`,
                temperature: 0.4,
                maxTokens: 500,
                timeoutMs: 25000
            }
        );
    } catch (error) {
        console.error(`Daily Brief Error (${category}):`, error.message, error.failures || '');
        return 'Impossible de générer le résumé pour le moment.';
    }
}

module.exports = { summarizeArticle, translateText, categorizeArticle, generateCategoryBrief };
