const { Mistral } = require('@mistralai/mistralai');
require('dotenv').config();

const apiKey = process.env.MISTRAL_API_KEY;
const client = new Mistral({ apiKey: apiKey });

async function summarizeArticle(content) {
    if (!apiKey) {
        throw new Error("MISTRAL_API_KEY is not set");
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
        console.error("Mistral AI Error:", error);
        throw error;
    }
}

async function translateText(text) {
    if (!apiKey || !text) return text;
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
        console.error("Translation Error:", error);
        return text; // Fallback to original
    }
}

module.exports = { summarizeArticle, translateText };
