const crypto = require('crypto');

const TITLE_STOPWORDS = new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'in', 'is', 'it', 'of', 'on', 'or', 'that', 'the', 'to', 'with',
    'au', 'aux', 'avec', 'ce', 'ces', 'dans', 'de', 'des', 'du', 'en', 'et', 'est', 'la', 'le', 'les', 'leur', 'leurs', 'mais', 'ou', 'par', 'pas', 'pour', 'que', 'qui', 'se', 'sur', 'un', 'une',
    'voici', 'comment', 'pourquoi', 'nouveau', 'nouvelle', 'nouvelles', 'mise', 'jour'
]);

const MIN_STRONG_TITLE_TOKENS = 5;

function normalizeWhitespace(value) {
    if (typeof value !== 'string') {
        return '';
    }
    return value.replace(/\s+/g, ' ').trim();
}

function normalizeText(value) {
    const base = normalizeWhitespace(value).toLowerCase();
    if (!base) {
        return '';
    }

    return base
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/https?:\/\/\S+/g, ' ')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function tokenizeForTitle(value) {
    const normalized = normalizeText(value);
    if (!normalized) {
        return [];
    }

    return normalized
        .split(' ')
        .filter(token => token.length >= 3 && !TITLE_STOPWORDS.has(token));
}

function buildTitleSignature(title) {
    const tokens = tokenizeForTitle(title);
    if (tokens.length === 0) {
        return '';
    }

    const uniqueSortedTokens = [...new Set(tokens)].sort();
    return uniqueSortedTokens.slice(0, 14).join(' ');
}

// Signature courte et stable, utilisée comme clé de dédup intra-source
// (exact-match rapide). Pour les cas où l'originalTitle varie d'1-2 mots
// (suffixe promo, "2024", "Pro"), cette signature peut diverger — c'est
// pour ça qu'on combine avec un check Jaccard (voir findIntraSourceTitleDuplicates).
const TITLE_SIGNATURE_TOKEN_COUNT = 6;

function buildShortTitleSignature(title) {
    const tokens = tokenizeForTitle(title);
    if (tokens.length === 0) {
        return '';
    }

    const uniqueSortedTokens = [...new Set(tokens)].sort();
    return uniqueSortedTokens.slice(0, TITLE_SIGNATURE_TOKEN_COUNT).join(' ');
}

// Retourne la liste triée unique des tokens "forts" d'un titre (sans accents,
// sans ponctuation, sans stopwords). Sert de représentation canonique pour
// le calcul de Jaccard entre titres.
function tokenizeTitleToSortedSet(title) {
    const tokens = tokenizeForTitle(title);
    if (tokens.length === 0) {
        return [];
    }
    return [...new Set(tokens)].sort();
}

// Sérialise un set de tokens pour stockage/lookup. On stocke côté DB (colonne
// titleTokens) pour éviter de re-tokenizer à chaque check.
function serializeTitleTokenSet(tokens) {
    return Array.isArray(tokens) ? tokens.join(' ') : '';
}

// Jaccard entre deux ensembles de tokens. Tolère les variations de 1-2 mots
// (suffixe promo, ajout "2024", reformulation légère) tant que le sujet
// reste identique.
const TITLE_DEDUP_JACCARD_THRESHOLD = 0.7;

function jaccardTitleSimilarity(tokensA, tokensB) {
    if (!Array.isArray(tokensA) || !Array.isArray(tokensB)) return 0;
    if (tokensA.length === 0 || tokensB.length === 0) return 0;
    const setA = new Set(tokensA);
    const setB = new Set(tokensB);
    let intersection = 0;
    for (const token of setA) {
        if (setB.has(token)) intersection++;
    }
    const union = setA.size + setB.size - intersection;
    return union === 0 ? 0 : intersection / union;
}

function hasStrongTitleSignature(title) {
    return tokenizeForTitle(title).length >= MIN_STRONG_TITLE_TOKENS;
}

function tokenizeContent(value) {
    const normalized = normalizeText(value);
    if (!normalized) {
        return [];
    }

    return normalized
        .split(' ')
        .filter(token => token.length >= 3 && !TITLE_STOPWORDS.has(token));
}

function buildContentSignature(contentSnippet, content) {
    const snippetTokens = tokenizeContent(contentSnippet);
    const contentTokens = snippetTokens.length > 0 ? snippetTokens : tokenizeContent(content);

    if (contentTokens.length === 0) {
        return '';
    }

    return contentTokens.slice(0, 28).join(' ');
}

function hashString(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function computeArticleFingerprint({ title, contentSnippet, content }) {
    const normalizedTitle = normalizeText(title);
    const contentSignature = buildContentSignature(contentSnippet, content);

    const fingerprintSource = [normalizedTitle, contentSignature].filter(Boolean).join('|');

    if (!fingerprintSource) {
        return null;
    }

    return hashString(fingerprintSource);
}

function computeLegacyArticleDedupKey({ title, contentSnippet, content }) {
    const normalizedTitle = normalizeText(title);
    const normalizedSnippet = normalizeText(contentSnippet);
    const normalizedContent = normalizeText(content);

    if (!normalizedTitle) {
        return null;
    }

    const contentBasis = normalizedSnippet || normalizedContent.slice(0, 500);
    const source = contentBasis
        ? `${normalizedTitle}|${contentBasis}`
        : `title-only:${normalizedTitle}`;

    return hashString(source);
}

function computeContentAwareArticleDedupKey({ title, contentSnippet, content }) {
    const titleSignature = buildTitleSignature(title);

    if (!titleSignature) {
        return null;
    }

    const contentSignature = buildContentSignature(contentSnippet, content);
    const source = contentSignature
        ? `${titleSignature}|${contentSignature}`
        : `title-only:${titleSignature}`;

    return hashString(source);
}

function computeArticleDedupKey({ title, contentSnippet, content }) {
    const titleSignature = buildTitleSignature(title);

    if (!titleSignature) {
        return null;
    }

    if (hasStrongTitleSignature(title)) {
        return hashString(`title:${titleSignature}`);
    }

    return computeContentAwareArticleDedupKey({ title, contentSnippet, content });
}

module.exports = {
    normalizeWhitespace,
    normalizeText,
    computeArticleFingerprint,
    computeArticleDedupKey,
    computeContentAwareArticleDedupKey,
    computeLegacyArticleDedupKey,
    buildTitleSignature,
    buildShortTitleSignature,
    tokenizeTitleToSortedSet,
    serializeTitleTokenSet,
    jaccardTitleSimilarity,
    TITLE_DEDUP_JACCARD_THRESHOLD
};
