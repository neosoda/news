const test=require('node:test');
const assert=require('node:assert/strict');
const {normalizeKev,createKevService}=require('../services/kev');
const fixture={catalogVersion:'fixture',vulnerabilities:[{cveID:'CVE-2026-12345',dateAdded:'2026-11-24',vendorProject:'Example',knownRansomwareCampaignUse:'Known'},{cveID:'invalid',dateAdded:'2026-11-24'}]};
test('KEV accepts valid CVEs and discards malformed records',()=>{
    const data=normalizeKev(fixture);assert.equal(data.entries.length,1);assert.equal(data.entries[0].ransomware,'Known');assert.throws(()=>normalizeKev({}));
});
test('KEV cache coalesces requests and retains stale catalog on failure',async()=>{
    let calls=0,clock=0,fail=false;
    const get=createKevService(async()=>{calls++;if(fail)throw Error('offline');return fixture;},()=>clock);
    await Promise.all([get(),get()]);assert.equal(calls,1);
    clock=3600001;fail=true;
    const data=await get();assert.equal(data.stale,true);assert.equal(data.entries.length,1);
    await get();assert.equal(calls,2);
});
