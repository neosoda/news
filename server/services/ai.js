const { Mistral } = require('@mistralai/mistralai');
const axios = require('axios');
require('dotenv').config();

const apiKey = process.env.MISTRAL_API_KEY;
const client = new Mistral({ apiKey: apiKey });

let isAiDisabledUntil = 0;
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

function checkAiCooldown() {
    if (Date.now() < isAiDisabledUntil) {
        return true;
    }
    return false;
}

function setAiCooldown(minutes = 5) {
    console.warn(`Mistral AI Rate Limited. Disabling AI features for ${minutes} minutes.`);
    isAiDisabledUntil = Date.now() + (minutes * 60 * 1000);
}

async function summarizeArticle(content) {
    if (!apiKey) {
        throw new Error("MISTRAL_API_KEY is not set");
    }

    if (checkAiCooldown()) {
        return "Résumé non disponible (IA en pause suite à une limite de débit).";
    }

    try {
        const response = await client.chat.complete({
            model: "mistral-tiny",
            messages: [
                { role: "system", content: "Tu es un assistant expert en synthèse de news tech. Résume cet article en français de manière concise (max 3 phrases). Analyse le sentiment (Positif/Neutre/Négatif) et extrais 3 mots-clés." },
                { role: "user", content: `Analyse et résume ce texte : \n\n${content.substring(0, 2000)}` }
            ]
        });

        return response.choices[0].message.content;
    } catch (error) {
        if (error.statusCode === 429) {
            setAiCooldown();
        }
        console.error("Mistral AI Error:", error);
        throw error;
    }
}

async function translateText(text) {
    if (!text) return text;

    // Use the user's external LibreTranslate instance
    const translationUrl = process.env.TRANSLATION_URL || 'https://translate.techsentinel.fr/translate';

    // If LibreTranslate was marked as unavailable, wait 10 minutes before checking again
    if (!isLibreTranslateAvailable && (Date.now() - lastLibreTranslateCheck < 10 * 60 * 1000)) {
        return await fallbackToMistral(text);
    }

    try {
        const response = await axios.post(translationUrl, {
            q: text,
            source: "auto",
            target: "fr",
            format: "text"
        }, { timeout: 3000 });

        if (response.data && response.data.translatedText) {
            isLibreTranslateAvailable = true;
            return response.data.translatedText;
        }
    } catch (error) {
        if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
            if (isLibreTranslateAvailable) {
                console.warn(`LibreTranslate unavailable at ${translationUrl}. Falling back to Mistral AI.`);
                isLibreTranslateAvailable = false;
                lastLibreTranslateCheck = Date.now();
            }
        } else {
            console.error("LibreTranslate Error:", error.response?.data || error.message);
        }
    }

    return await fallbackToMistral(text);
}

async function fallbackToMistral(text) {
    // Fallback to Mistral AI if local service fails
    if (!apiKey || checkAiCooldown()) return text;

    try {
        const response = await client.chat.complete({
            model: "mistral-tiny",
            messages: [
                { role: "system", content: "Tu es un traducteur professionnel. Traduis le texte suivant en français. Ne donne que la traduction, sans explications." },
                { role: "user", content: text.substring(0, 500) } // Limit length for titles/snippets
            ]
        });
        return response.choices[0].message.content;
    } catch (error) {
        if (error.statusCode === 429) {
            setAiCooldown();
        }
        console.error("Translation Error (Mistral):", error.message);
        return text; // Fallback to original
    }
}

async function categorizeArticle(title, content) {
    if (!apiKey) return "Autre";
    if (checkAiCooldown()) return null;

    try {
        const response = await client.chat.complete({
            model: "mistral-tiny",
            messages: [
                {
                    role: "system",
                    content: "Tu es un expert en classification de news tech. Analyse l'article. Est-ce un article 'Putaclic' (titre exagéré, piège à clics, vidéo sans résumé) ou purement 'Promotionnel' (publi-reportage, vente de produit) ? Si OUI, réponds uniquement 'Spam'. Sinon, classe l'article dans l'UNE de ces catégories : Cybersecurité, Intelligence Artificielle, Cloud, Développement, Hardware, Web, Société, Business, Autre. Réponds uniquement par le nom de la catégorie."
                },
                { role: "user", content: `Titre: ${title}\n\nContenu: ${content.substring(0, 1000)}` }
            ]
        });

        const rawCategory = response.choices[0].message.content.trim();
        const normalizedCategory = normalizeCategory(rawCategory);
        if (!normalizedCategory) {
            console.warn(`Categorization returned an invalid label: "${rawCategory}"`);
        }
        return normalizedCategory;
    } catch (error) {
        if (error.statusCode === 429) setAiCooldown();
        console.error("Categorization Error:", error.message);
        return null;
    }
}

async function generateCategoryBrief(category, articles) {
    if (!apiKey) return "Résumé indisponible (Clé API manquante).";
    if (checkAiCooldown()) return "Résumé indisponible (IA en pause).";
    if (articles.length === 0) return "Aucune actualité majeure dans cette catégorie aujourd'hui.";

    // Simplify input to save tokens: Title + first 100 chars of content
    const inputContent = articles
        .slice(0, 15) // Limit to top 15 stories to fit context window
        .map(a => `- ${a.title}: ${a.content ? a.content.substring(0, 100).replace(/\n/g, ' ') : ''}...`)
        .join('\n');

    try {
        const response = await client.chat.complete({
            model: "mistral-tiny",
            messages: [
                {
                    role: "system",
                    content: `Tu es un journaliste expert tech. Rédige un "Brief Quotidien" pour la catégorie "${category}".
Objectifs:
1. Synthétise les actualités fournies en un résumé fluide et structuré de 5 à 7 lignes maximum.
2. Adopte un ton neutre, factuel et professionnel ("presse tech premium").
3. Mets en avant les faits marquants et leurs impacts.
4. Évite les répétitions et ignore les sujets trop mineurs ou sensationnalistes.
5. Si aucune tendance claire ne se dégage, résume simplement les 2-3 infos les plus importantes.
IMPORTANT: Ne base ton résumé QUE sur les titres fournis. N'invente rien.`
                },
                { role: "user", content: `Voici les dernières actualités pour la catégorie ${category}:\n\n${inputContent}` }
            ]
        });

        return response.choices[0].message.content.trim();
    } catch (error) {
        if (error.statusCode === 429) setAiCooldown();
        console.error(`Daily Brief Error (${category}):`, error.message);
        return "Impossible de générer le résumé pour le moment.";
    }
}

module.exports = { summarizeArticle, translateText, categorizeArticle, generateCategoryBrief };
