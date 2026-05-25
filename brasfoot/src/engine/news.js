// Gerador de manchetes a partir dos eventos da rodada e do encerramento de temporada.
// Cada item:
//   { id, date, type, priority, subject, body, read, teamFocus? }
//
// types:  highlight | injury | result | transfer | season
// priority: high | normal | low

const MAX_INBOX = 80;

export function pushNews(state, news) {
  state.inbox = state.inbox || [];
  state.inbox.push(...news);
  if (state.inbox.length > MAX_INBOX) {
    state.inbox.splice(0, state.inbox.length - MAX_INBOX);
  }
}

export function generateNewsForRound(state, round, results, myTeamId) {
  const date = state.currentDate;
  const news = [];

  // 1. Resumo da partida do usuário (sempre primeiro)
  const myResult = results.find(r => r.homeTeamId === myTeamId || r.awayTeamId === myTeamId);
  if (myResult) {
    const isHome = myResult.homeTeamId === myTeamId;
    const myScore  = isHome ? myResult.score.home : myResult.score.away;
    const oppScore = isHome ? myResult.score.away : myResult.score.home;
    const opp = state.teams[isHome ? myResult.awayTeamId : myResult.homeTeamId];
    const won  = myScore > oppScore;
    const lost = myScore < oppScore;
    const emoji = won ? "✅" : lost ? "❌" : "⚖️";
    const verb  = won ? "vence" : lost ? "perde para" : "empata com";
    news.push({
      id: nid(date, "my", round),
      date, type: "result", priority: won || lost ? "high" : "normal",
      subject: `${emoji} ${state.teams[myTeamId].shortName} ${verb} ${opp.shortName} (${myScore}×${oppScore})`,
      body: buildMatchBody(state, myResult, myTeamId),
      read: false, teamFocus: myTeamId,
    });
  }

  // 2. Hat-tricks e duplas
  for (const result of results) {
    const goalsByPlayer = {};
    for (const ev of result.events) {
      if (ev.type === "goal") {
        goalsByPlayer[ev.playerId] = (goalsByPlayer[ev.playerId] || 0) + 1;
      }
    }
    for (const [pid, goals] of Object.entries(goalsByPlayer)) {
      const p = state.players[pid];
      if (!p) continue;
      const team = state.teams[p.teamId];
      const oppId = result.homeTeamId === p.teamId ? result.awayTeamId : result.homeTeamId;
      const opp = state.teams[oppId];

      if (goals >= 3) {
        news.push({
          id: nid(date, pid, "ht"),
          date, type: "highlight", priority: "high",
          subject: `🎯 ${p.name} marca ${goals} contra o ${opp.shortName}`,
          body: `Atuação histórica do ${p.name} (${team.shortName}, OVR ${p.overall}) na rodada ${round}: ${goals} gols contra o ${opp.name}.`,
          read: false,
        });
      } else if (goals === 2 && (p.teamId === myTeamId || oppId === myTeamId || p.overall >= 82)) {
        news.push({
          id: nid(date, pid, "br"),
          date, type: "highlight", priority: "normal",
          subject: `⚽ ${p.name} faz dois pelo ${team.shortName}`,
          body: `Dois gols de ${p.name} (${team.shortName}) na partida contra o ${opp.name}.`,
          read: false,
        });
      }
    }
  }

  // 3. Lesões graves (6+ semanas)
  for (const result of results) {
    for (const ev of result.events) {
      if (ev.type === "injury" && ev.weeksOut >= 6) {
        const p = state.players[ev.playerId];
        const team = p ? state.teams[p.teamId] : null;
        if (!team) continue;
        const isMine = p.teamId === myTeamId;
        news.push({
          id: nid(date, ev.playerId, "inj"),
          date, type: "injury",
          priority: isMine ? "high" : (ev.weeksOut >= 10 ? "high" : "normal"),
          subject: `🤕 ${ev.playerName} sofre lesão grave (${ev.weeksOut} semanas)`,
          body: `${ev.playerName} do ${team.name} ficará afastado por ${ev.weeksOut} semanas após sair lesionado na rodada ${round}.${isMine ? " Vale considerar um reforço imediato no mercado." : ""}`,
          read: false, teamFocus: p.teamId,
        });
      }
    }
  }

  // 4. Goleadas (diferença ≥ 4)
  for (const result of results) {
    const diff = Math.abs(result.score.home - result.score.away);
    if (diff >= 4) {
      const winnerId = result.score.home > result.score.away ? result.homeTeamId : result.awayTeamId;
      const loserId  = result.score.home > result.score.away ? result.awayTeamId : result.homeTeamId;
      const winner = state.teams[winnerId];
      const loser  = state.teams[loserId];
      news.push({
        id: nid(date, winnerId, loserId, "rout"),
        date, type: "result", priority: "high",
        subject: `💥 ${winner.shortName} ${result.score.home > result.score.away ? result.score.home : result.score.away}×${result.score.home > result.score.away ? result.score.away : result.score.home} ${loser.shortName}`,
        body: `Goleada na rodada ${round}: ${winner.name} aplicou ${diff} gols de vantagem sobre o ${loser.name}.`,
        read: false,
      });
    }
  }

  // 5. Expulsões (raras)
  for (const result of results) {
    for (const ev of result.events) {
      if (ev.type === "red") {
        const p = state.players[ev.playerId];
        if (!p) continue;
        const isMine = p.teamId === myTeamId;
        if (!isMine && p.overall < 78) continue;  // só interessa se for craque ou do usuário
        news.push({
          id: nid(date, ev.playerId, "red"),
          date, type: "highlight", priority: isMine ? "high" : "normal",
          subject: `🟥 ${ev.playerName} expulso de campo`,
          body: `${ev.playerName} (${state.teams[p.teamId]?.shortName ?? "?"}) foi expulso na rodada ${round}.`,
          read: false, teamFocus: p.teamId,
        });
      }
    }
  }

  pushNews(state, news);
  return news;
}

// Notícias da virada de temporada (campeões, rebaixados, promovidos)
export function generateSeasonEndNews(state, report) {
  const date = state.currentDate;
  const news = [];

  for (const [compId, champId] of Object.entries(report.champions || {})) {
    const comp = state.competitions[compId];
    const team = state.teams[champId];
    if (!team || !comp) continue;
    news.push({
      id: nid(date, "champ", compId),
      date, type: "season", priority: "high",
      subject: `🏆 ${team.name} é campeão do ${comp.name} ${report.season}`,
      body: `Encerrada a temporada ${report.season}: o ${team.name} ergueu a taça do ${comp.name}.`,
      read: false, teamFocus: champId,
    });
  }

  if (report.relegated?.length) {
    news.push({
      id: nid(date, "rel"),
      date, type: "season", priority: "high",
      subject: `⬇️ Rebaixados da Série A: ${report.relegated.map(id => state.teams[id]?.shortName).join(", ")}`,
      body: `Após o fim da temporada ${report.season}, os clubes ${report.relegated.map(id => state.teams[id]?.name).join(", ")} foram rebaixados para a Série B.`,
      read: false,
    });
  }

  if (report.promoted?.length) {
    news.push({
      id: nid(date, "pro"),
      date, type: "season", priority: "high",
      subject: `⬆️ Promovidos à Série A: ${report.promoted.map(id => state.teams[id]?.shortName).join(", ")}`,
      body: `Após o fim da temporada ${report.season}, os clubes ${report.promoted.map(id => state.teams[id]?.name).join(", ")} subiram para a Série A.`,
      read: false,
    });
  }

  if (report.retired?.length) {
    const stars = report.retired
      .map(id => state.players[id])
      .filter(p => p && p.overall >= 75)
      .slice(0, 5);
    if (stars.length) {
      news.push({
        id: nid(date, "ret"),
        date, type: "season", priority: "normal",
        subject: `👋 Aposentadorias notáveis da temporada ${report.season}`,
        body: stars.map(p => `${p.name} (OVR ${p.overall})`).join(", ") + " penduraram as chuteiras.",
        read: false,
      });
    }
  }

  // Mercado renovado: novos agentes livres
  if (report.newFreeAgents) {
    news.push({
      id: nid(date, "agents"),
      date, type: "season", priority: "normal",
      subject: `📋 ${report.newFreeAgents} novos agentes livres no mercado`,
      body: `Sangue novo disponível para contratação na aba Mercado.`,
      read: false,
    });
  }

  // Prospectos da base que foram auto-liberados (passaram dos 19)
  if (report.academyReleased?.length) {
    news.push({
      id: nid(date, "youth-released"),
      date, type: "season", priority: "high",
      subject: `🌱 ${report.academyReleased.length} prospecto${report.academyReleased.length > 1 ? "s" : ""} liberado${report.academyReleased.length > 1 ? "s" : ""} da base`,
      body: `Atingiram 19 anos sem promoção e foram dispensados: ${report.academyReleased.map(r => r.name).join(", ")}.`,
      read: false,
    });
  }

  // Resumo dos prospectos gerados para a temporada que está começando
  if (report.academyGenerated) {
    const myTeamId = state.managedTeamId;
    const myGen = report.academyGenerated.perTeam[myTeamId];
    if (myGen?.generated?.length) {
      const team = state.teams[myTeamId];
      const newPlayers = myGen.generated.map(id => state.players[id]).filter(Boolean);
      const joias = newPlayers.filter(p => p.potential >= 80)
        .sort((a, b) => b.potential - a.potential);
      const joiasStr = joias.length
        ? ` Destaque${joias.length > 1 ? "s" : ""}: ${joias.map(p => `${p.name} (POT ${p.potential})`).join(", ")}.`
        : "";
      const missedStr = myGen.missed > 0
        ? ` ⚠️ ${myGen.missed} prospecto${myGen.missed > 1 ? "s foram perdidos" : " foi perdido"} por falta de vaga na base.`
        : "";
      news.push({
        id: nid(date, "youth-promoted", myTeamId),
        date, type: "highlight",
        priority: joias.length ? "high" : "normal",
        subject: `🌱 ${team.shortName} promove ${newPlayers.length} jovem${newPlayers.length > 1 ? "ns" : ""} da base${joias.length ? " ✨" : ""}`,
        body: `Nova safra da base do ${team.name}: ${newPlayers.map(p => `${p.name} (${p.position}, ${p.age}a · POT ${p.potential})`).join(" · ")}.${joiasStr}${missedStr}`,
        read: false, teamFocus: myTeamId,
      });
    }
    // Resumo geral
    news.push({
      id: nid(date, "youth-summary"),
      date, type: "season", priority: "low",
      subject: `🌱 Categorias de base promovem ${report.academyGenerated.total} jovens na liga`,
      body: `Total de prospectos gerados nas categorias de base dos 60 clubes para a temporada ${state.season}.`,
      read: false,
    });
  }

  pushNews(state, news);
  return news;
}

// -------------------- Helpers --------------------
function buildMatchBody(state, result, myTeamId) {
  const isHome = result.homeTeamId === myTeamId;
  const ours = isHome ? "home" : "away";
  const myGoals = result.events.filter(e => e.type === "goal" && e.side === ours);
  const myCards = result.events.filter(e => (e.type === "yellow" || e.type === "red") && e.side === ours);
  const myInj   = result.events.filter(e => e.type === "injury" && e.side === ours);

  const lines = [];
  if (myGoals.length) {
    lines.push("Gols: " + myGoals.map(e => `${e.playerName} (${e.minute}')`).join(", "));
  }
  if (myCards.length) {
    lines.push("Cartões: " + myCards.map(e => `${e.playerName} (${e.type === "red" ? "🟥" : "🟨"} ${e.minute}')`).join(", "));
  }
  if (myInj.length) {
    lines.push("Lesões: " + myInj.map(e => `${e.playerName} (${e.weeksOut}sem)`).join(", "));
  }
  if (!lines.length) lines.push("Jogo sem grandes destaques.");
  return lines.join(" · ");
}

function nid(...parts) {
  return "n_" + parts.join("_");
}
