const test = require('node:test');
const assert = require('node:assert/strict');
const {
    containsMojibake,
    repairMojibake,
    repairMojibakeDeep
} = require('../services/encoding');

// Helper: take a clean French string, produce the classic
// UTF-8 -> Latin-1 -> UTF-8 double encoding (the "donn\u00c3\u00a9es" pattern).
// Returns a JavaScript string whose code points are the Latin-1 interpretation
// of the input's UTF-8 bytes. This is the exact memory layout that the broken
// LibreTranslate response would produce.
function doubleEncode(value) {
    return Buffer.from(value, 'utf8').toString('latin1');
}

test('containsMojibake detects classic double-encoded accents', () => {
    assert.equal(containsMojibake('donn\u00e9es'), false);
    assert.equal(containsMojibake('donn\u00c3\u00a9es'), true);
    assert.equal(containsMojibake('fran\u00c3\u00a7aise'), true);
    assert.equal(containsMojibake('r\u00c3\u00a9gional'), true);
});

test('containsMojibake returns false for empty / non-string input', () => {
    assert.equal(containsMojibake(''), false);
    assert.equal(containsMojibake(null), false);
    assert.equal(containsMojibake(undefined), false);
    assert.equal(containsMojibake(42), false);
});

test('repairMojibake reverses UTF-8/Latin-1/UTF-8 double encoding', () => {
    const clean = 'Fuite de donn\u00e9es : 18 861 personnes concern\u00e9es';
    const corrupted = doubleEncode(clean);

    assert.notEqual(corrupted, clean);
    assert.equal(containsMojibake(corrupted), true);
    assert.equal(repairMojibake(corrupted), clean);
});

test('repairMojibake is a no-op on already-clean strings', () => {
    const clean = "Aujourd'hui, l'\u00e9l\u00e8ve \u00e9tudie la cybers\u00e9curit\u00e9.";
    assert.equal(repairMojibake(clean), clean);
});

test('repairMojibake repairs the screenshot corpus from the data-leak view', () => {
    const cases = [
        'Fuite de donn\u00c3\u00a9es Pass Pass : 18 861 personnes concern\u00c3\u00a9es',
        'Fuite de donn\u00c3\u00a9es La Maison Pour Tous : environ 8 000 noms',
        'Fuite de donn\u00c3\u00a9es YouFid : 7 880 personnes publi\u00c3\u00a9es',
        '40 221 participants : fuite revendiqu\u00c3\u00a9e chez Storia Mundi',
        'R\u00c3\u00a9par\u2019Stores confirme un incident de s\u00c3\u00a9curit\u00c3\u00a9',
        '15 964 clients d\u2019Accent Rouge touch\u00c3\u00a9s par une fuite',
        'Plateforme fran\u00c3\u00a7aise de programmes de fid\u00c3\u00a9lit\u00c3\u00a9',
        'Service de mobilit\u00c3\u00a9 des Hauts-de-France'
    ];

    for (const corrupted of cases) {
        const repaired = repairMojibake(corrupted);
        assert.equal(containsMojibake(repaired), false, `repaired still has mojibake: ${repaired}`);
        assert.notEqual(repaired, corrupted, `expected change for: ${corrupted}`);
    }
});

test('repairMojibake handles the em-dash / euro mojibake', () => {
    // "— résumé \u201d" (em-dash, accented word, smart close-quote) after
    // UTF-8 -> Latin-1 -> UTF-8 round-trip. The em-dash and smart-quote are
    // three-byte UTF-8 sequences (lead byte 0xE2) whose second byte lands in
    // the Latin-1 control range (U+0080-U+009F).
    const corrupted = doubleEncode('breach \u2014 r\u00e9sum\u00e9 \u201d');
    const repaired = repairMojibake(corrupted);
    assert.equal(containsMojibake(repaired), false);
    assert.equal(repaired, 'breach \u2014 r\u00e9sum\u00e9 \u201d');
});

test('repairMojibake handles the euro-sign mojibake (â€¬)', () => {
    // "100 \u20ac" -> mojibake "100 â¬" (0xE2 0x82 0xAC -> U+00E2, U+0082, U+20AC).
    const corrupted = doubleEncode('100 \u20ac vol\u00e9s');
    const repaired = repairMojibake(corrupted);
    assert.equal(containsMojibake(repaired), false);
    assert.equal(repaired, '100 \u20ac vol\u00e9s');
});

test('repairMojibake leaves edge cases alone when re-encoding would corrupt them', () => {
    // "Â" alone (U+00C2) is a valid Latin-1 character, not necessarily mojibake.
    // A naive round-trip would corrupt it. Our guard ensures we only repair
    // when the resulting UTF-8 decode contains no replacement character.
    const value = 'symbole Â attendu';
    assert.equal(repairMojibake(value), value);
});

test('repairMojibake returns non-string input unchanged', () => {
    assert.equal(repairMojibake(null), null);
    assert.equal(repairMojibake(undefined), undefined);
    assert.equal(repairMojibake(''), '');
    assert.equal(repairMojibake(42), 42);
});

test('repairMojibakeDeep walks nested objects and arrays without mutating clean data', () => {
    const clean = {
        title: 'L\u2019actualit\u00e9 tech',
        items: [
            { name: 'A', text: 'bonjour' },
            { name: 'B', text: 'caf\u00e9' }
        ],
        meta: { date: '2026-09-05', tags: ['s\u00e9curit\u00e9', 'cloud'] }
    };
    const result = repairMojibakeDeep(clean);
    assert.equal(result, clean, 'clean input must be returned as-is (no copy)');
});

test('repairMojibakeDeep repairs deeply nested mojibake in a single pass', () => {
    const corrupted = {
        title: 'Fuite de donn\u00c3\u00a9es',
        items: [
            { name: 'A', text: 'fran\u00c3\u00a7ais' },
            { name: 'B', text: 'r\u00c3\u00a9gional' }
        ],
        meta: { tags: ['s\u00c3\u00a9curit\u00c3\u00a9'] }
    };
    const result = repairMojibakeDeep(corrupted);

    assert.notEqual(result, corrupted);
    assert.equal(result.title, 'Fuite de donn\u00e9es');
    assert.equal(result.items[0].text, 'fran\u00e7ais');
    assert.equal(result.items[1].text, 'r\u00e9gional');
    assert.equal(result.meta.tags[0], 's\u00e9curit\u00e9');
});
