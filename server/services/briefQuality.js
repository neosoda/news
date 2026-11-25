function validateBrief(markdown, sourceCount) {
    if (typeof markdown !== 'string' || !markdown.trim() || markdown.length>16000) return false;
    if (/\[[^\]]+\]\([^)]*\)/.test(markdown)) return false;
    const sections = markdown.split(/^##\s+/m).slice(1);
    if (!sections.length || sections.length>5) return false;
    return sections.every(section => {
        const citations = [...section.matchAll(/\[(\d+)\]/g)].map(m=>Number(m[1]));
        return citations.length>0 && citations.every(n=>n>=1&&n<=sourceCount);
    });
}
function cachedBriefValid(value) {
    return Array.isArray(value) && value.length>0 && value.every(b=>b && typeof b.category==='string' && typeof b.summary==='string' && b.summary.trim() && b.summary!=='Impossible de générer le résumé pour le moment.' && Array.isArray(b.topArticles));
}
module.exports={validateBrief,cachedBriefValid};
