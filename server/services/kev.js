const axios = require('axios');
const URL = 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json';
const MIRROR = 'https://raw.githubusercontent.com/cisagov/kev-data/develop/known_exploited_vulnerabilities.json';
const CVE = /^CVE-\d{4}-\d{4,}$/;
function normalizeKev(payload) {
    if (!Array.isArray(payload?.vulnerabilities) || !payload.vulnerabilities.length) throw new Error('Invalid KEV catalog');
    const unique = new Map();
    for (const v of payload.vulnerabilities) {
        if (!CVE.test(v.cveID || '') || !/^\d{4}-\d{2}-\d{2}$/.test(v.dateAdded||'')) continue;
        const text = k => typeof v[k] === 'string' ? v[k].slice(0,4000) : '';
        unique.set(v.cveID, {cve:v.cveID,vendor:text('vendorProject'),product:text('product'),name:text('vulnerabilityName'),
            description:text('shortDescription'),action:text('requiredAction'),added:v.dateAdded,due:text('dueDate'),ransomware:v.knownRansomwareCampaignUse==='Known'?'Known':'Unknown'});
    }
    if (!unique.size) throw new Error('Empty KEV catalog');
    return {version:typeof payload.catalogVersion==='string'?payload.catalogVersion:'',released:payload.dateReleased||null,
        entries:[...unique.values()].sort((a,b)=>b.added.localeCompare(a.added)||a.cve.localeCompare(b.cve))};
}
function createKevService(load, now=Date.now) {
    let cache, pending, retryAt=0;
    return async function getCatalog() {
        if (cache && now()-cache.at<3600000) return {...cache.data,stale:false};
        if (pending) return pending;
        if(now()<retryAt) {
            if(cache)return {...cache.data,stale:true};
            throw new Error('KEV temporarily unavailable');
        }
        pending=(async()=>{
            try {
                const data=normalizeKev(await load());
                cache={at:now(),data:{...data,fetchedAt:new Date(now()).toISOString()}};
                return {...cache.data,stale:false};
            } catch(error) {
                retryAt=now()+60000;
                if(cache)return {...cache.data,stale:true};
                throw error;
            } finally {pending=null;}
        })();
        return pending;
    };
}
const getCatalog=createKevService(async()=>{
    const options={timeout:12000,maxContentLength:8*1024*1024,maxRedirects:0};
    try {return (await axios.get(URL,options)).data;}
    catch {return (await axios.get(MIRROR,options)).data;}
});
module.exports={getCatalog,normalizeKev,createKevService};
