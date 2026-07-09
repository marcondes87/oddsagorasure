// Debug cross-reference matching
const rows = [
  {event:"Queensland Lions - Eastern Suburbs", league:"Premier League Nacional - Queensland", market:"Acima/Abaixo 1.5 gols"},
  {event:"Ahn A. - Foshee I.", league:"ITF W15 Rancho Santa Fe, CA Mulheres", market:"Casa/Fora"},
];

const pData = require('./data/pinnacle-odds.json');
const beData = require('./data/betesporte-odds.json');

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
  let matches=0; aN.forEach(n=>{if(bN.has(n))matches++;});
  const minR=Math.min(aN.size,bN.size);
  return matches>=Math.max(2,minR-1);
}
function extractTeams(eventName) {
  const name=String(eventName||""); const separators=[" vs "," x ","  -  "," - ","  x  "];
  for(const sep of separators){const idx=name.indexOf(sep);if(idx>0){const t1=name.slice(0,idx).trim(),t2=name.slice(idx+sep.length).trim();if(t1&&t2&&t1.length>1&&t2.length>1)return[t1,t2];}}
  return[name,""];
}

console.log("=== Pinnacle matching ===");
rows.forEach(row => {
  const [t1,t2]=extractTeams(row.event);
  const rH=normalizeTeam(t1),rA=normalizeTeam(t2);
  const match=pData.find(pe=>{
    const pH=normalizeTeam(pe.home),pA=normalizeTeam(pe.away);
    return teamsMatch(rH,rA,pH,pA);
  });
  console.log(`${row.event} -> Pinnacle match: ${match ? match.home+' x '+match.away+' ('+match.league+')' : 'NONE'}`);
});

console.log("\n=== BetEsporte matching ===");
rows.forEach(row => {
  const [t1,t2]=extractTeams(row.event);
  const rH=normalizeTeam(t1),rA=normalizeTeam(t2);
  const match=beData.find(be=>{
    const bH=normalizeTeam(be.home),bA=normalizeTeam(be.away);
    return teamsMatch(rH,rA,bH,bA);
  });
  console.log(`${row.event} -> BetEsporte match: ${match ? match.home+' x '+match.away+' ('+match.league+')' : 'NONE'}`);
});

// Also check Pin x BE cross directly
console.log("\n=== Pin x BE direct cross (first 100 events) ===");
let pinBeMatches=0;
for(const be of beData.slice(0,100)){
  const bH=normalizeTeam(be.home),bA=normalizeTeam(be.away);
  const match=pData.find(pe=>{
    const pH=normalizeTeam(pe.home),pA=normalizeTeam(pe.away);
    return teamsMatch(bH,bA,pH,pA);
  });
  if(match)pinBeMatches++;
}
console.log(`Pin x BE matches (first 100 BE events): ${pinBeMatches}`);
