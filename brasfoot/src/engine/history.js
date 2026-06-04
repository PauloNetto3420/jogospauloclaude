// Histórico & Recordes.
//
// O jogo recria todas as competições a cada virada de temporada, então
// tabelas finais e artilheiros se perdem. Aqui tiramos um SNAPSHOT por
// temporada concluída e guardamos em `state.history` (persiste no save).
//
// Fonte de verdade dupla, por desenho:
//   - `team.trophies` → galeria de títulos do clube (cumulativa, sobrevive a
//     saves antigos sem histórico).
//   - `state.history` → mural de campeões por temporada + chuteiras de ouro
//     (dados que de outra forma seriam descartados).
//
// recordSeasonHistory() é chamado em endSeason ANTES da recriação das
// competições, para ler standings/topScorers da temporada que terminou.

import { sortStandings } from "./season.js";

// Rótulos legíveis por competição. Estaduais usam prefixo "estadual_<uf>".
export const COMPETITION_LABELS = {
  brasileirao_a: "Brasileirão Série A",
  brasileirao_b: "Brasileirão Série B",
  brasileirao_c: "Brasileirão Série C",
  copa_brasil: "Copa do Brasil",
};

const ESTADUAL_UF_LABELS = {
  SP: "Paulistão", RJ: "Campeonato Carioca",
  MG: "Campeonato Mineiro", RS: "Campeonato Gaúcho",
};

// Nome amigável de uma competição a partir do seu competitionId
// (lida com "estadual_sp", "estadual_rj", ...).
export function competitionLabel(competitionId) {
  if (!competitionId) return "—";
  if (COMPETITION_LABELS[competitionId]) return COMPETITION_LABELS[competitionId];
  if (competitionId.startsWith("estadual_")) {
    const uf = competitionId.slice("estadual_".length).toUpperCase();
    return ESTADUAL_UF_LABELS[uf] || `Estadual ${uf}`;
  }
  return competitionId;
}

// Posição final (lista de teamIds, do 1º ao último) de uma liga de pontos
// corridos ainda não recriada. Devolve [] se a competição não existir.
function finalOrder(state, compId) {
  const comp = state.competitions[compId];
  if (!comp || !comp.standings?.length) return [];
  return sortStandings(comp, state.teams).map(row => row.teamId);
}

// Artilheiro (chuteira de ouro) de uma liga: o 1º de topScorers.
function goldenBoot(state, compId) {
  const comp = state.competitions[compId];
  const top = comp?.topScorers?.[0];
  if (!top || !top.goals) return null;
  return {
    playerId: top.playerId,
    playerName: top.playerName,
    teamId: top.teamId,
    goals: top.goals,
  };
}

// Monta e grava o snapshot da temporada que acabou de terminar.
// Idempotente: não duplica se já houver registro para report.season.
export function recordSeasonHistory(state, report) {
  if (!state.history) state.history = [];
  const season = report.season;
  if (state.history.some(h => h.season === season)) return state.history;

  // Campeões estaduais ainda estão em state.estaduais neste ponto do endSeason
  // (são apagados só depois, no showSeasonRecap).
  const estaduais = {};
  for (const e of Object.values(state.estaduais || {})) {
    if (e?.champion) estaduais[e.uf] = e.champion;
  }

  const entry = {
    season,
    champions: {
      brasileirao_a: report.champions?.brasileirao_a ?? null,
      brasileirao_b: report.champions?.brasileirao_b ?? null,
      brasileirao_c: report.champions?.brasileirao_c ?? null,
      copa_brasil: report.champions?.copa_brasil ?? null,
      estaduais, // { SP: teamId, RJ: teamId, ... }
    },
    standings: {
      brasileirao_a: finalOrder(state, "brasileirao_a"),
      brasileirao_b: finalOrder(state, "brasileirao_b"),
    },
    goldenBoots: {
      brasileirao_a: goldenBoot(state, "brasileirao_a"),
      brasileirao_b: goldenBoot(state, "brasileirao_b"),
    },
    movements: {
      promoted: report.promoted ?? [],
      relegated: report.relegated ?? [],
      relegatedToC: report.relegatedToC ?? [],
      promotedFromC: report.promotedFromC ?? [],
    },
  };

  state.history.push(entry);
  return state.history;
}

// -------------------- Seletores (puros, derivam do histórico) --------------------

export function getHistory(state) {
  return state.history || [];
}

// Galeria de títulos de um clube, agrupada por competição.
// Lê de team.trophies (cumulativo). Devolve:
//   [{ competitionId, label, count, seasons:[...desc] }] ordenado por count desc.
export function summarizeClubTitles(team) {
  if (!team?.trophies?.length) return [];
  const byComp = new Map();
  for (const t of team.trophies) {
    if (!byComp.has(t.competitionId)) byComp.set(t.competitionId, []);
    byComp.get(t.competitionId).push(t.season);
  }
  return [...byComp.entries()]
    .map(([competitionId, seasons]) => ({
      competitionId,
      label: competitionLabel(competitionId),
      count: seasons.length,
      seasons: [...seasons].sort((a, b) => b - a),
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

// Total de troféus de um clube (todas as competições somadas).
export function totalClubTitles(team) {
  return team?.trophies?.length || 0;
}

// Lista de chuteiras de ouro ao longo do histórico, mais recente primeiro:
//   [{ season, competitionId, label, playerId, playerName, teamId, goals }]
export function getGoldenBootRoll(state) {
  const roll = [];
  for (const h of getHistory(state)) {
    for (const compId of Object.keys(h.goldenBoots || {})) {
      const gb = h.goldenBoots[compId];
      if (gb) roll.push({ season: h.season, competitionId: compId, label: competitionLabel(compId), ...gb });
    }
  }
  return roll.sort((a, b) => b.season - a.season || b.goals - a.goals);
}

// Ranking de clubes por número de títulos nacionais/copa registrados no
// histórico (mais a soma dos estaduais). Útil pra um "quadro de honra".
//   [{ teamId, titles }] desc
export function getMostDecoratedTeams(state) {
  const tally = {};
  const bump = (id) => { if (id) tally[id] = (tally[id] || 0) + 1; };
  for (const h of getHistory(state)) {
    bump(h.champions.brasileirao_a);
    bump(h.champions.brasileirao_b);
    bump(h.champions.brasileirao_c);
    bump(h.champions.copa_brasil);
    for (const id of Object.values(h.champions.estaduais || {})) bump(id);
  }
  return Object.entries(tally)
    .map(([teamId, titles]) => ({ teamId, titles }))
    .sort((a, b) => b.titles - a.titles);
}
