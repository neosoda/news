const { Mistral } = require('@mistralai/mistralai');
const axios = require('axios');
require('dotenv').config();

const apiKey = process.env.MISTRAL_API_KEY;
const client = new Mistral({ apiKey: apiKey });

let isAiDisabledUntil = 0;
let isLibreTranslateAvailable = true;
let lastLibreTranslateCheck = 0;

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

    // Use the service name 'libretranslate' for internal Docker networking
    const translationUrl = process.env.TRANSLATION_URL || 'http://libretranslate:5000/translate';

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

module.exports = { summarizeArticle, translateText };
