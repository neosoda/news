/**
 * Encoding repair utilities.
 *
 * The aggregation pipeline (LibreTranslate instance on translate.techsentinel.fr,
 * various LLM providers) has historically returned responses suffering from
 * "double-encoding" / mojibake: UTF-8 bytes decoded as Latin-1 then re-encoded as
 * UTF-8. The classic symptom in French text is "donn\u00e9es" stored as
 * "donn\u00c3\u00a9es" (\u00c3 = \u00c3 = the Latin-1 interpretation of the
 * UTF-8 lead byte 0xC3).
 *
 * Repair strategy: take the corrupted string, treat each code point as a Latin-1
 * byte, then decode the resulting byte sequence as UTF-8. This is the inverse
 * of the corruption. We only apply it when the pattern strongly suggests the
 * input is mojibake, to avoid breaking already-clean text.
 */

// Matches the common mojibake markers left by UTF-8 -> Latin-1 -> UTF-8
// double encoding. The "â" lead (U+00E2) is the Latin-1 interpretation of the
// UTF-8 lead byte 0xE2 used by three-byte sequences. We accept any Latin-1
// control character (U+0080-U+009F), the Euro sign (U+20AC, mojibake of €),
// or any of the CJK/Latin extended second bytes (U+00A0-U+00BF) that follow
// the 0xE2 lead byte in the three-byte UTF-8 layout.
const MOJIBAKE_PATTERN = /[\uFFFD\u00C3\u00C2]|\u00E2[\u0080-\u00BF\u20AC]/u;

function containsMojibake(value) {
    if (typeof value !== 'string' || !value) {
        return false;
    }
    return MOJIBAKE_PATTERN.test(value);
}

/**
 * Re-interpret a mojibake string as if it were UTF-8 bytes that had been
 * decoded as Latin-1. Returns the original value when no mojibake is detected
 * or when the round-trip would produce a replacement character (in which case
 * the input was not actually mojibake and re-encoding would corrupt it).
 */
function repairMojibake(value) {
    if (typeof value !== 'string' || !value) {
        return value;
    }

    if (!MOJIBAKE_PATTERN.test(value)) {
        return value;
    }

    try {
        const repaired = Buffer.from(value, 'latin1').toString('utf8');
        // If re-encoding produced a replacement character, the original was
        // not actually mojibake (the suspicious code points were legitimate).
        if (repaired.includes('\uFFFD')) {
            return value;
        }
        return repaired;
    } catch {
        return value;
    }
}

/**
 * Repair every string field of an object recursively. Skips null/undefined,
 * primitives that aren't strings, and Buffer/Date instances. Returns a shallow
 * clone when at least one field was repaired, otherwise the original object.
 */
function repairMojibakeDeep(value) {
    if (value === null || value === undefined) {
        return value;
    }
    if (typeof value === 'string') {
        return repairMojibake(value);
    }
    if (Array.isArray(value)) {
        let changed = false;
        const next = value.map((entry) => {
            const repaired = repairMojibakeDeep(entry);
            if (repaired !== entry) {
                changed = true;
            }
            return repaired;
        });
        return changed ? next : value;
    }
    if (typeof value !== 'object') {
        return value;
    }
    if (value instanceof Date || Buffer.isBuffer(value)) {
        return value;
    }

    let changed = false;
    const next = {};
    for (const [key, entry] of Object.entries(value)) {
        const repaired = repairMojibakeDeep(entry);
        if (repaired !== entry) {
            changed = true;
        }
        next[key] = repaired;
    }
    return changed ? next : value;
}

module.exports = {
    MOJIBAKE_PATTERN,
    containsMojibake,
    repairMojibake,
    repairMojibakeDeep
};
