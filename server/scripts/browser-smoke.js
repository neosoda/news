// Real browser against an isolated fixture server, using Node 22 CDP WebSocket.
const {spawn,spawnSync}=require('node:child_process');
const {mkdtempSync,readFileSync,writeFileSync,mkdirSync,existsSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os');
const {join}=require('node:path');
const assert=require('node:assert/strict');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,description,timeout=20000){
    const end=Date.now()+timeout;
    let error;
    while(Date.now()<end){try{const result=await fn();if(result)return result;}catch(e){error=e;}await delay(150);}
    throw Error('Timeout: '+description+(error?' ('+error.message+')':''));
}
async function main(){
    const dir=mkdtempSync(join(tmpdir(),'newsai-chrome-'));
    const screenshots='/tmp/newsai-browser-screenshots';mkdirSync(screenshots,{recursive:true});
    const bin=['google-chrome','chromium','chromium-browser'].find(x=>spawnSync('which',[x],{stdio:'ignore'}).status===0);
    assert.ok(bin,'Chromium or Google Chrome is required');
    const app=spawn(process.execPath,[join(__dirname,'browser-fixture.js')],{stdio:'inherit'});
    const chrome=spawn(bin,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-background-networking','--remote-debugging-port=0','--user-data-dir='+dir,'about:blank'],{stdio:'ignore'});
    let ws;
    try{
        await until(async()=> (await fetch('http://127.0.0.1:4179/api/health')).ok,'fixture server');
        const port=await until(()=>existsSync(join(dir,'DevToolsActivePort'))&&readFileSync(join(dir,'DevToolsActivePort'),'utf8').split('\n')[0],'Chrome port');
        const targets=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();
        const target=targets.find(t=>t.type==='page');assert.ok(target);
        ws=new WebSocket(target.webSocketDebuggerUrl);
        await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
        let seq=0;const pending=new Map();
        ws.addEventListener('message',event=>{const msg=JSON.parse(event.data);const p=pending.get(msg.id);if(p){pending.delete(msg.id);msg.error?p.reject(Error(msg.error.message)):p.resolve(msg.result);}});
        const cdp=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
        const evaluate=async expression=>{const r=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text);return r.result.value;};
        const waitText=text=>until(()=>evaluate('document.body.innerText.includes('+JSON.stringify(text)+')'),'text: '+text);
        const nav=async path=>{const url='http://127.0.0.1:4179'+path;await cdp('Page.navigate',{url});await until(()=>evaluate('location.href==='+JSON.stringify(url)+' && document.readyState!=="loading"'),'navigation '+path);};
        const shot=async name=>{const r=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});writeFileSync(join(screenshots,name+'.png'),Buffer.from(r.data,'base64'));};
        await cdp('Page.enable');await cdp('Runtime.enable');
        await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
        await nav('/');await waitText('Microsoft Azure Kubernetes cluster migration');await shot('home-desktop');
        await until(()=>evaluate('Boolean(document.querySelector("article a[href=\\\"https://example.com/article/1\\\"]"))'),'fixture article');
        await evaluate('document.querySelector("article a[href=\\\"https://example.com/article/1\\\"]").closest("article").querySelector("button[aria-label=\\\"Ajouter aux favoris\\\"]").click()');
        await until(()=>evaluate('JSON.parse(localStorage.getItem("newsai-bookmarks-v1")||"[]").length===1'),'bookmark persisted');
        await nav('/bookmarks');await waitText('Microsoft Azure Kubernetes cluster migration');
        await evaluate('(()=>{const a=document.querySelector("main a[href=\\\"https://example.com/article/1\\\"]");a.addEventListener("click",e=>e.preventDefault(),{once:true});a.click();})()');
        await until(()=>evaluate('JSON.parse(localStorage.getItem("newsai-opened-articles-v1")||"[]").length===1'),'history persisted');
        await nav('/history');await waitText('Microsoft Azure Kubernetes cluster migration');
        await nav('/?q=Azure&period=24h');await waitText('Microsoft Azure Kubernetes cluster migration');
        await until(()=>evaluate('!document.querySelector("main section[aria-label=\\\"Actualités\\\"]")?.innerText.includes("Fixture CERT advisory")'),'filtered results');
        await nav('/');await waitText('Microsoft Azure Kubernetes cluster migration');
        await until(()=>evaluate('Boolean([...document.querySelectorAll("label")].find(x=>x.innerText.trim()==="Fixture Technology"&&x.querySelector("input[type=checkbox]")))'),'source preferences');
        await evaluate('(()=>{const label=[...document.querySelectorAll("label")].find(x=>x.innerText.trim()==="Fixture Technology"&&x.querySelector("input[type=checkbox]"));label.closest("details").open=true;label.querySelector("input").click();})()');
        await until(()=>evaluate('JSON.parse(localStorage.getItem("newsai-hidden-sources-v1")||"[]").length===1 && !document.querySelector("main section[aria-label=\\\"Actualités\\\"] a[href=\\\"https://example.com/article/1\\\"]")'),'source hidden');
        await evaluate('localStorage.removeItem("newsai-hidden-sources-v1")');
        await nav('/editorial');await waitText('2 sources');await shot('editorial-desktop');
        await nav('/cyber');await waitText('ExampleVendor');await waitText('Fixture CERT advisory');await shot('cyber-desktop');
        await nav('/observatory');await waitText('Fixture Technology');
        // The live brief is deliberately not generated in the fixture. Select an archived edition.
        await nav('/daily-brief');await until(()=>evaluate('Boolean(document.querySelector("option[value=\\\"2026-01-01\\\"]"))'),'archive option');
        await evaluate('(()=>{const el=document.querySelector("select");el.value="2026-01-01";el.dispatchEvent(new Event("change",{bubbles:true}));})()');
        await waitText('Fixture edition');await shot('brief-desktop');
        for(const width of [390,768]){
            await cdp('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:false});
            await nav('/');await waitText('Microsoft Azure Kubernetes cluster migration');
            assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth+1'),true,'horizontal overflow at '+width);
            await shot('home-'+width);
            await nav('/cyber');await waitText('ExampleVendor');await shot('cyber-'+width);
        }
        console.log('PASS: home, search, bookmarks, local history, hidden sources, dossiers, Cyber Radar, source observatory, archived brief, desktop and mobile viewport smoke checks');
    }finally{ws?.close();app.kill();chrome.kill();await delay(500);rmSync(dir,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
