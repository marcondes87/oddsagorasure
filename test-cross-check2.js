const pData = require('./data/pinnacle-odds.json');
const beData = require('./data/betesporte-odds.json');

// Find the Queensland Lions match in Pinnacle
const match = pData.find(p => p.home.includes('Queensland') || p.away.includes('Queensland'));
if (match) {
  console.log('Pinnacle match found:');
  console.log(JSON.stringify(match, null, 2).slice(0, 800));
} else {
  console.log('Queensland not found in Pinnacle');
}

// Check the cross-reference Pin x BE matches more carefully
function normalizeTeam(name) {
  return String(name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9\s\/.-]/g, "").trim();
}
function extractLastNames(name) {
  return String(name || "").toLowerCase().split(/[\s\/.]+/).filter(s => s.length > 1 && !["the","de","do","da","dos","das","el","la","los","las"].includes(s));
}
function teamsMatch(a1,a2,b1,b2) {
  const na1=normalizeTeam(a1),na2=normalizeTeam(a2),nb1=normalizeTeam(b1),nb2=normalizeTeam(b2);
  if((na1===nb1&&na2===nb2)||(na1===nb2&&na2===nb1))return true;
  const a1p=extractLastNames(a1),a2p=extractLastNames(a2),b1p=extractLastNames(b1),b2p=extractLastNames(b2);
  const aN=new Set([...a1p,...a2p]),bN=new Set([...b1p,...b2p]);
  let m=0; aN.forEach(n=>{if(bN.has(n))m++;});
  return m>=Math.max(2,Math.min(aN.size,bN.size)-1);
}

// Show some Pin x BE match examples
console.log('\n=== Pin x BE match examples (first 5 with odds) ===');
let count = 0;
for (const be of beData) {
  const bH=normalizeTeam(be.home),bA=normalizeTeam(be.away);
  const match=pData.find(pe=>{
    const pH=normalizeTeam(pe.home),pA=normalizeTeam(pe.away);
    return teamsMatch(bH,bA,pH,pA);
  });
  if (match) {
    const beOut = (be.outcomes||[]).filter(o=>Number(o.odd)>1);
    const pinOut = (match.outcomes||[]).filter(o=>Number(o.odd)>1);
    const beML = beOut.filter(o=>o.typeId===1||o.typeId===1601||o.typeId===186||o.typeId===219||o.typeId===251||o.typeId===340||o.typeId===406);
    const pinML = pinOut.filter(o=>o.marketType==="moneyline"&&o.name&&o.name!=="Selecao"&&o.name!=="");
    if (beML.length>=2 && pinML.length>=2) {
      console.log(`\n${be.home} x ${be.away} (${be.league})`);
      console.log(`  BE odds: ${beML.map(o=>o.name+'='+o.odd).join(', ')}`);
      console.log(`  Pin odds: ${pinML.map(o=>o.name+'='+o.odd).join(', ')}`);
      // Quick surebet calc
      const combined = [
        ...beML.slice(0,3).map(o=>({name:o.name,odd:o.odd,bookmaker:'BetEsporte'})),
        ...pinML.slice(0,3).map(o=>({name:o.name,odd:o.odd,bookmaker:'Pinnacle'}))
      ];
      for(let i=0;i<combined.length;i++){
        for(let j=i+1;j<combined.length;j++){
          if(combined[i].name!==combined[j].name){
            const inv=1/combined[i].odd+1/combined[j].odd;
            if(inv<1){
              const profit=((1/inv-1)*100).toFixed(2);
              console.log(`  SURBET ${profit}%: ${combined[i].bookmaker} ${combined[i].name} @${combined[i].odd} + ${combined[j].bookmaker} ${combined[j].name} @${combined[j].odd}`);
            }
          }
        }
      }
      count++;
      if (count>=3) break;
    }
  }
}
console.log(`\nTotal PinxBE surebet examples found: ${count}`);
