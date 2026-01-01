const { Mistral } = require('@mistralai/mistralai');
require('dotenv').config();

const apiKey = process.env.MISTRAL_API_KEY;
const client = new Mistral({ apiKey: apiKey });

let isAiDisabledUntil = 0;

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
    if (!apiKey || !text) return text;

    if (checkAiCooldown()) {
        return text;
    }

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
        console.error("Translation Error:", error);
        return text; // Fallback to original
    }
}

module.exports = { summarizeArticle, translateText };
