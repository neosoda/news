const test = require('node:test');
const assert = require('node:assert/strict');
const { validateBrief, cachedBriefValid } = require('../services/briefQuality');

test('brief requires bounded source references in every section', () => {
    assert.equal(validateBrief('# Titre\n## Sujet\nInformation [1][2]', 2), true);
    assert.equal(validateBrief('# Titre\n## Sujet\nInformation [1, 2]', 2), true);
    assert.equal(validateBrief('# Titre\n### Sujet\nInformation [1]', 2), true);
    assert.equal(validateBrief('# Titre\n## Sujet\nInformation [3]', 2), false);
    assert.equal(validateBrief('# Titre\n## Sujet\nSans source', 2), false);
    assert.equal(validateBrief('# Titre\n## Sujet\n[site](https://example.com) [1]', 2), false);
    assert.equal(validateBrief('# Titre\n## Sujet\nInformation [0]', 2), false);
});

test('rejects failed or malformed cached editions', () => {
    assert.equal(
        cachedBriefValid([{ category: 'Cloud', summary: 'Impossible de générer le résumé pour le moment.', topArticles: [] }]),
        false
    );
    assert.equal(
        cachedBriefValid([{ category: 'Cloud', summary: 'Une synthèse.', topArticles: [] }]),
        true
    );
    assert.equal(cachedBriefValid([null]), false);
    assert.equal(cachedBriefValid([]), false);
});
