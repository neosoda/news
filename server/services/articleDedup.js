const crypto = require('crypto');

const TITLE_STOPWORDS = new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'in', 'is', 'it', 'of', 'on', 'or', 'that', 'the', 'to', 'with',
    'au', 'aux', 'avec', 'ce', 'ces', 'dans', 'de', 'des', 'du', 'en', 'et', 'est', 'la', 'le', 'les', 'leur', 'leurs', 'mais', 'ou', 'par', 'pas', 'pour', 'que', 'qui', 'se', 'sur', 'un', 'une'
]);

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

function computeArticleDedupKey({ title, contentSnippet, content }) {
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

module.exports = {
    normalizeWhitespace,
    normalizeText,
    computeArticleFingerprint,
    computeArticleDedupKey,
    computeLegacyArticleDedupKey
};
