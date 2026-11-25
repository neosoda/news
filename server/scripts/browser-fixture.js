// CI-only fixture server. No production database or external service calls.
const express=require('express');
const path=require('node:path');
const prisma=require('../db');
const kev=require('../services/kev');
kev.getCatalog=async()=>({version:'test-fixture',released:'2026-11-24',fetchedAt:new Date().toISOString(),stale:false,entries:[{cve:'CVE-2026-12345',vendor:'ExampleVendor',product:'Fixture OS',name:'Test vulnerability',description:'Test only',action:'Apply fixture update',added:'2026-11-24',due:'2026-12-10',ransomware:'Unknown'}]});
const routes=require('../routes');
(async()=>{
    const now=new Date();
    const source=await prisma.source.create({data:{name:'Fixture Technology',url:'https://example.com/tech.xml',category:'Cloud',lastFetched:now}});
    const second=await prisma.source.create({data:{name:'Fixture News',url:'https://example.com/news.xml',category:'Cloud',lastFetched:now}});
    const cert=await prisma.source.create({data:{name:'CERT-FR Fixture',url:'https://example.com/cert.xml',category:'Cybersecurité',lastFetched:now}});
    const items=await Promise.all([
        prisma.article.create({data:{title:'Microsoft Azure Kubernetes cluster migration',link:'https://example.com/article/1',date:now,sourceId:source.id,category:'Cloud',content:'A test article about Azure.',summary:'Fixture summary.'}}),
        prisma.article.create({data:{title:'Microsoft Azure Kubernetes cluster migration guide',link:'https://example.com/article/2',date:now,sourceId:second.id,category:'Cloud',content:'A second test article.'}}),
        prisma.article.create({data:{title:'Fixture CERT advisory CVE-2026-12345',link:'https://example.com/article/3',date:now,sourceId:cert.id,category:'Cybersecurité',content:'Test alert CVE-2026-12345'}})
    ]);
    const dateKey='2026-01-01';
    await prisma.dailyBrief.create({data:{dateKey,payload:JSON.stringify([{category:'Cloud',summary:'# Fixture edition\n## Migration Azure\nUn article de test [1].',articleCount:1,topArticles:[{id:items[0].id,title:items[0].title,link:items[0].link,date:now,source:{name:source.name}}]}])}});
    const app=express();app.use(express.json());app.get('/api/daily-brief',(req,res)=>res.json([]));app.use('/api',routes);
    const dist=path.resolve(__dirname,'../../client/dist');
    app.use(express.static(dist));
    app.get(/.*/, (req,res)=>res.sendFile(path.join(dist,'index.html')));
    app.listen(4179,'127.0.0.1',()=>console.log('Fixture server ready'));
})().catch(error=>{console.error(error);process.exit(1);});
