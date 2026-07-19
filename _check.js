fetch("https://arbipower-sb.onrender.com/api/surebets", {signal: AbortSignal.timeout(25000)})
  .then(r => r.json())
  .then(d => {
    console.log("=== Server Data ===");
    console.log("Source:", d.source);
    console.log("Updated:", d.updatedAt);
    console.log("Total rows:", d.rows?.length);
    console.log("OA imported:", d.source === "import" ? "yes" : "no");
    console.log("Pinnacle:", d.pinnacleCount, "ev,", d.pinnacleMatched, "cruz");
    console.log("BetEsporte:", d.betesporteCount, "ev,", d.betesporteMatched, "cruz");
    console.log("Stake:", d.stakeCount, "ev,", d.stakeMatched, "cruz");
    console.log("PINxBE:", d.pinBeCross, "| PINxStake:", d.pinStakeCross, "| BExStake:", d.beStakeCross);
    
    // Show all surebets
    d.rows?.forEach((r, i) => {
      const pct = r.surebet?.profitPercent;
      console.log(`\n${i+1}. ${r.event} | ${r.market} | ${pct ? pct.toFixed(2) + '%' : 'N/A'} | isSurebet: ${r.isSurebet}`);
      r.outcomes?.forEach(o => {
        let flags = [];
        if (o.pinnacle) flags.push('PIN');
        if (o.betesporte) flags.push('BE');
        if (o.stake) flags.push('STAKE');
        console.log(`   ${o.bookmaker} -> ${o.name} @ ${o.odd}${flags.length ? ' [' + flags.join(',') + ']' : ''}${o.url ? ' URL:ok' : ' URL:none'}`);
      });
    });
  })
  .catch(e => console.error("ERRO:", e.message));
