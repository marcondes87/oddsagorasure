fetch("https://arbipower-sb.onrender.com/api/surebets", {signal: AbortSignal.timeout(25000)})
  .then(r => r.json())
  .then(d => {
    d.rows?.forEach((r, i) => {
      const pct = r.surebet?.profitPercent;
      const books = [...new Set(r.outcomes?.map(o => o.bookmaker) || [])];
      console.log(`${i+1}. ${r.event} | ${pct ? pct.toFixed(2) + '%' : 'N/A'} | casas: ${books.join(', ')}`);
      r.outcomes?.forEach(o => {
        let flags = [];
        if (o.pinnacle) flags.push('PIN');
        if (o.betesporte) flags.push('BE');
        if (o.stake) flags.push('STAKE');
        console.log(`   ${o.bookmaker} -> ${o.name} @ ${o.odd}${flags.length ? ' [' + flags.join(',') + ']' : ''}`);
      });
    });
  })
  .catch(e => console.error("ERRO:", e.message));
