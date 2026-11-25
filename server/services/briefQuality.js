function extractCitationNumbers(text) {
    const numbers = [];
    for (const match of text.matchAll(/\[(\d{1,2}(?:\s*[,;]\s*\d{1,2})*)\]/g)) {
        for (const part of match[1].split(/[,;]/)) {
            const value = Number.parseInt(part.trim(), 10);
            if (Number.isInteger(value)) {
                numbers.push(value);
            }
        }
    }
    return numbers;
}

function validateBrief(markdown, sourceCount) {
    if (typeof markdown !== 'string' || !markdown.trim() || markdown.length > 16000) {
        return false;
    }
    if (!Number.isInteger(sourceCount) || sourceCount < 1) {
        return false;
    }
    // Reject LLM-fabricated Markdown links; only numeric citations [1]..[N] are allowed.
    if (/\[[^\]]+\]\([^)]*\)/.test(markdown)) {
        return false;
    }

    const sections = markdown.split(/^#{2,3}\s+/m).slice(1);
    if (sections.length === 0 || sections.length > 6) {
        return false;
    }

    return sections.every((section) => {
        const citations = extractCitationNumbers(section);
        return citations.length > 0 && citations.every((n) => n >= 1 && n <= sourceCount);
    });
}

function cachedBriefValid(value) {
    return (
        Array.isArray(value) &&
        value.length > 0 &&
        value.every(
            (section) =>
                section &&
                typeof section.category === 'string' &&
                typeof section.summary === 'string' &&
                section.summary.trim().length > 0 &&
                section.summary !== 'Impossible de générer le résumé pour le moment.' &&
                Array.isArray(section.topArticles)
        )
    );
}

module.exports = {
    validateBrief,
    cachedBriefValid
};
