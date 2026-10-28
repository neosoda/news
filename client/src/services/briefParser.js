// Turns the Markdown produced by the brief LLM into a small editorial structure:
// { title, lede, points: [{ title, blocks, cites }], extra }.
// Tolerant on purpose: old cached briefs are plain text, and free models mix
// headings, bullet lists and bold prefixes freely.

const GENERIC_LINE = /^(le\s+)?(brief|r[ée]sum[ée]|synth[èe]se)\s+(quotidien|du\s+jour|journalier)\b|^voici\s+(le|la|les|un|une)\b|^(les\s+)?points?\s+cl[ée]s\s*:?$|^chap[ôo]\s*:?$/i;
const GENERIC_PREFIX = /^(le\s+)?(brief|r[ée]sum[ée]|synth[èe]se)\s+(quotidien|du\s+jour|journalier)[^:\n]{0,60}[:—–-]\s*/i;
const CITE_RE = /\s*\[(\d{1,2}(?:\s*[,;]\s*\d{1,2})*)\]/g;

function cleanHeading(text) {
    return text
        .replace(/^\*\*(.+)\*\*$/, '$1')
        .replace(/^__(.+)__$/, '$1')
        .replace(/^chap[ôo]\s*:\s*/i, '')
        .replace(/\s*[:：]\s*$/, '')
        .trim();
}

function plain(text) {
    return text.replace(/[*_`#>]/g, '').replace(CITE_RE, '').trim();
}

export function extractCites(text) {
    const cites = [];
    const stripped = text.replace(CITE_RE, (_, group) => {
        group.split(/[,;]/).forEach((n) => {
            const value = Number.parseInt(n, 10);
            if (value > 0 && !cites.includes(value)) cites.push(value);
        });
        return '';
    });
    return { text: stripped.replace(/\s+([.,;:!?])/g, '$1').trim(), cites };
}

function tokenize(markdown) {
    const blocks = [];
    let paragraph = null;
    let list = null;

    const flush = () => {
        if (paragraph) blocks.push({ type: 'p', text: paragraph.join(' ') });
        if (list) blocks.push(list);
        paragraph = null;
        list = null;
    };

    const lines = String(markdown || '')
        .replace(/\r\n?/g, '\n')
        .replace(/^```[a-z]*\s*$/gim, '')
        .split('\n');

    for (const raw of lines) {
        const line = raw.trim();
        if (!line || /^(-{3,}|\*{3,}|_{3,})$/.test(line)) {
            flush();
            continue;
        }

        const heading = line.match(/^(#{1,6})\s+(.+)$/);
        const boldLine = line.match(/^(\*\*|__)([^*_]+)\1\s*:?\s*$/);
        if (heading || boldLine) {
            flush();
            blocks.push({
                type: 'h',
                level: heading ? heading[1].length : 3,
                text: cleanHeading(heading ? heading[2] : boldLine[2])
            });
            continue;
        }

        const bullet = line.match(/^[-*•+]\s+(.+)$/);
        const ordered = line.match(/^\d{1,2}[.)]\s+(.+)$/);
        if (bullet || ordered) {
            const isOrdered = Boolean(ordered);
            if (paragraph) {
                blocks.push({ type: 'p', text: paragraph.join(' ') });
                paragraph = null;
            }
            if (!list || list.ordered !== isOrdered) {
                if (list) blocks.push(list);
                list = { type: 'list', ordered: isOrdered, items: [] };
            }
            list.items.push((bullet || ordered)[1]);
            continue;
        }

        const quote = line.match(/^>\s?(.*)$/);
        const text = quote ? quote[1] : line;
        if (list && raw.match(/^\s{2,}/)) {
            list.items[list.items.length - 1] += ` ${text}`;
            continue;
        }
        if (list) {
            blocks.push(list);
            list = null;
        }
        // Models rarely hard-wrap, so each line is its own paragraph
        if (paragraph) blocks.push({ type: 'p', text: paragraph.join(' ') });
        paragraph = [text];
    }
    flush();
    return blocks;
}

function isGeneric(block, category) {
    if (block.type === 'list') return false;
    const value = plain(block.text);
    if (!value) return true;
    if (category && value.toLowerCase() === category.toLowerCase()) return true;
    return GENERIC_LINE.test(value) && (block.type === 'h' || value.length < 80);
}

function splitBoldTitle(item) {
    const match = item.match(/^(\*\*|__)(.+?)\1\s*[:—–-]?\s*(.*)$/);
    if (!match || !match[3]) return { title: null, body: item };
    return { title: cleanHeading(match[2]), body: match[3].charAt(0).toUpperCase() + match[3].slice(1) };
}

function makePoint(title, blocks) {
    const cites = [];
    const cleaned = blocks.map((block) => {
        if (block.type === 'list') {
            return {
                ...block,
                items: block.items.map((item) => {
                    const result = extractCites(item);
                    result.cites.forEach((c) => !cites.includes(c) && cites.push(c));
                    return result.text;
                })
            };
        }
        const result = extractCites(block.text);
        result.cites.forEach((c) => !cites.includes(c) && cites.push(c));
        return { ...block, text: result.text };
    }).filter((block) => block.type === 'list' ? block.items.length : block.text);
    return { title: title ? extractCites(title).text : null, blocks: cleaned, cites };
}

export function parseBrief(markdown, category) {
    const blocks = tokenize(markdown)
        .map((block) => block.type === 'p' ? { ...block, text: block.text.replace(GENERIC_PREFIX, '').replace(/^chap[ôo]\s*:\s*/i, '') } : block)
        .filter((block) => !isGeneric(block, category));

    let title = null;
    const headings = blocks.filter((b) => b.type === 'h');
    if (blocks[0]?.type === 'h' && (blocks[0].level === 1 || (headings[1] && headings[1].level > blocks[0].level))) {
        title = extractCites(blocks.shift().text).text;
    }

    const ledeBlocks = [];
    while (blocks.length && blocks[0].type === 'p') ledeBlocks.push(blocks.shift());

    const points = [];
    let current = null;
    for (const block of blocks) {
        if (block.type === 'h') {
            if (current) points.push(current);
            current = { title: block.text, blocks: [] };
        } else if (current) {
            current.blocks.push(block);
        } else if (block.type === 'list') {
            block.items.forEach((item) => {
                const { title: itemTitle, body } = splitBoldTitle(item);
                points.push({ title: itemTitle, blocks: [{ type: 'p', text: body }] });
            });
        } else {
            points.push({ title: null, blocks: [block] });
        }
    }
    if (current) points.push(current);

    // Plain-text briefs: first paragraph becomes the lede, the rest become points.
    if (!points.length && ledeBlocks.length > 1) {
        ledeBlocks.splice(1).forEach((block) => points.push({ title: null, blocks: [block] }));
    }

    const lede = ledeBlocks.map((b) => extractCites(b.text).text).filter(Boolean).join(' ');

    return {
        title,
        lede: lede || null,
        points: points.map((p) => makePoint(p.title, p.blocks)).filter((p) => p.title || p.blocks.length)
    };
}

export function slugify(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}
