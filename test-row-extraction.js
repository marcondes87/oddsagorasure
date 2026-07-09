const puppeteer = require('puppeteer');
(async()=>{
  const b=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-gpu','--disable-images']});
  const p=await b.newPage();
  await p.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
  await p.setViewport({width:1280,height:800});
  await p.setRequestInterception(true);
  p.on('request',req=>{if(['image','font','media'].includes(req.resourceType()))req.abort();else req.continue();});
  await p.goto('https://www.oddsagora.com.br/football/h2h/vitoria-8bSbHipn/vasco-2RABlYFn/',{waitUntil:'networkidle0',timeout:25000});
  await new Promise(r=>setTimeout(r,3000));
  const r=await p.evaluate(()=>{
    const oddsCells=document.querySelectorAll('.odds-cell');
    const rows=new Map();
    oddsCells.forEach(cell=>{
      const parent=cell.parentElement;
      if(!parent)return;
      if(!rows.has(parent)){
        const fc=parent.children[0];
        const links=fc.querySelectorAll('a');
        let name='',url='';
        links.forEach(a=>{const t=a.textContent.trim();if(t&&t.length>1&&t.length<30&&!t.includes('Casas')){name=t;url=a.href;}});
        if(!name)name=fc.textContent.trim();
        rows.set(parent,{name,url,cells:[]});
      }
      rows.get(parent).cells.push(cell);
    });
    const out=[];
    rows.forEach((v)=>{
      const odds=[];
      v.cells.forEach(c=>{
        const text=c.textContent.trim();
        if(!text.includes('%')){
          const cl=c.querySelector('a');
          const val=parseFloat(cl?cl.textContent.trim():text);
          if(!isNaN(val))odds.push(val);
        }
      });
      if(odds.length>=2)out.push(v.name+' | '+odds.join(' | '));
    });
    return out;
  });
  console.log('Rows:',r.length);
  r.forEach(x=>console.log(x));
  await b.close();
})().catch(e=>console.log('Error:',e.message));
