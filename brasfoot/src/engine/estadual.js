// Campeonatos Estaduais (pré-temporada).
//
// MVP: 4 estados (SP, RJ, MG, RS). Cada estadual tem:
//   - Fase de grupos (turno único dentro de cada grupo)
//     · > 8 times → 2 grupos · ≤ 8 times → 1 grupo
//   - Mata-mata: classificados → semifinais (jogo único) → final (jogo único)
//     · 2 grupos → top 2 de cada (1A×2B, 1B×2A)
//     · 1 grupo  → top 4 (1×4, 2×3)
//
// Cada GRUPO é uma competição comum (createCompetition) guardada em
// state.competitions["estadual_<uf>_g<i>"] — assim reaproveita applyMatchResult
// e getMatchesOfRound. O mata-mata vive em state.estaduais[uf].knockout.
//
// O conjunto roda numa FASE de pré-temporada, antes do Brasileirão.

import { createCompetition } from "../models/competition.js";

export const ESTADUAL_STATES = ["SP", "RJ", "MG", "RS"];

const ESTADUAL_NAMES = {
  SP: "Campeonato Paulista",
  RJ: "Campeonato Carioca",
  MG: "Campeonato Mineiro",
  RS: "Campeonato Gaúcho",
};

// Cria todos os estaduais. Retorna o objeto meta (state.estaduais).
export function createEstaduais(state, season, rng) {
  const estaduais = {};
  for (const uf of ESTADUAL_STATES) {
    const teamIds = Object.values(state.teams)
      .filter(t => t.state === uf)
      .map(t => t.id);
    if (teamIds.length < 4) continue;
    estaduais[uf] = createOneEstadual(state, uf, teamIds, season, rng);
  }
  return estaduais;
}

function createOneEstadual(state, uf, teamIds, season, rng) {
  const shuffled = shuffle([...teamIds], rng);
  const twoGroups = shuffled.length > 8;

  const groupDefs = [];
  if (twoGroups) {
    const half = Math.ceil(shuffled.length / 2);
    groupDefs.push({ name: "Grupo A", teamIds: shuffled.slice(0, half) });
    groupDefs.push({ name: "Grupo B", teamIds: shuffled.slice(half) });
  } else {
    groupDefs.push({ name: "Grupo Único", teamIds: shuffled });
  }

  // Cria competições de grupo (turno único)
  const groupIds = [];
  let maxGroupRounds = 0;
  groupDefs.forEach((g, i) => {
    const compId = `estadual_${uf.toLowerCase()}_g${i}`;
    const comp = createCompetition({
      id: compId,
      name: `${ESTADUAL_NAMES[uf]} · ${g.name}`,
      tier: 0,
      season,
      teamIds: g.teamIds,
      legs: 1,
      rules: { format: "estadual_group" },
    });
    state.competitions[compId] = comp;
    groupIds.push(compId);
    const rounds = comp.fixtures.length ? Math.max(...comp.fixtures.map(m => m.round)) : 0;
    if (rounds > maxGroupRounds) maxGroupRounds = rounds;
  });

  return {
    uf,
    name: ESTADUAL_NAMES[uf],
    teams: shuffled,
    twoGroups,
    groupIds,
    phase: "groups",          // groups | semis | final | done
    knockout: { semis: [], final: null },
    champion: null,
    schedule: {
      groupRounds: maxGroupRounds,    // grupos ocupam rodadas 1..maxGroupRounds
      semisRound: maxGroupRounds + 1,
      finalRound: maxGroupRounds + 2,
    },
  };
}

// Standings ordenadas de uma competição de grupo
function sortGroup(comp) {
  return [...comp.standings].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    const sgA = a.goalsFor - a.goalsAgainst;
    const sgB = b.goalsFor - b.goalsAgainst;
    if (sgB !== sgA) return sgB - sgA;
    return b.goalsFor - a.goalsFor;
  });
}

// Retorna as partidas do estadual nesta rodada (de pré-temporada).
// Inclui jogos de grupo (rodada ≤ groupRounds) e legs de mata-mata.
export function getEstadualMatchesForRound(state, estadual, round) {
  const out = [];
  // Grupos
  if (round <= estadual.schedule.groupRounds) {
    for (const gid of estadual.groupIds) {
      const comp = state.competitions[gid];
      if (!comp) continue;
      for (const m of comp.fixtures) {
        if (m.round === round) out.push({ match: m, kind: "group", compId: gid });
      }
    }
  }
  // Semifinais
  if (round === estadual.schedule.semisRound) {
    for (const tie of estadual.knockout.semis) {
      if (tie?.leg && !tie.leg.played) out.push({ match: tie.leg, kind: "semi", tie });
    }
  }
  // Final
  if (round === estadual.schedule.finalRound) {
    const f = estadual.knockout.final;
    if (f?.leg && !f.leg.played) out.push({ match: f.leg, kind: "final", tie: f });
  }
  return out;
}

// Quantas rodadas o estadual inteiro tem
export function estadualTotalRounds(estadual) {
  return estadual.schedule.finalRound;
}

// Verifica se o estadual inteiro terminou
export function isEstadualDone(estadual) {
  return estadual.phase === "done";
}

// Avança fases quando a anterior termina. Chamar ao fim de cada rodada.
export function advanceEstadualPhase(state, estadual, season, rng) {
  if (estadual.phase === "groups") {
    const groupsDone = estadual.groupIds.every(gid =>
      state.competitions[gid].fixtures.every(m => m.played)
    );
    if (groupsDone) {
      buildSemis(state, estadual, season);
      estadual.phase = "semis";
    }
  } else if (estadual.phase === "semis") {
    const semisDone = estadual.knockout.semis.every(t => t.winnerId);
    if (semisDone) {
      buildFinal(state, estadual, season, rng);
      estadual.phase = "final";
    }
  } else if (estadual.phase === "final") {
    const f = estadual.knockout.final;
    if (f && f.winnerId) {
      estadual.champion = f.winnerId;
      estadual.phase = "done";
    }
  }
}

// Monta as 2 semifinais com base nas classificações de grupo.
function buildSemis(state, estadual, season) {
  let qualified;
  if (estadual.twoGroups) {
    const [gaComp, gbComp] = estadual.groupIds.map(gid => state.competitions[gid]);
    const ga = sortGroup(gaComp);
    const gb = sortGroup(gbComp);
    // 1A × 2B  e  1B × 2A
    qualified = [
      [ga[0].teamId, gb[1].teamId],
      [gb[0].teamId, ga[1].teamId],
    ];
  } else {
    const g = sortGroup(state.competitions[estadual.groupIds[0]]);
    // 1 × 4  e  2 × 3
    qualified = [
      [g[0].teamId, g[3].teamId],
      [g[1].teamId, g[2].teamId],
    ];
  }

  estadual.knockout.semis = qualified.map(([homeId, awayId], idx) => ({
    id: `estadual_${estadual.uf.toLowerCase()}_semi${idx}`,
    homeTeamId: homeId,  // melhor campanha manda
    awayTeamId: awayId,
    leg: makeKnockoutLeg(estadual, `semi${idx}`, homeId, awayId, season, estadual.schedule.semisRound),
    winnerId: null,
  }));
}

// Monta a final com os vencedores das semis.
function buildFinal(state, estadual, season, rng) {
  const [s0, s1] = estadual.knockout.semis;
  const a = s0.winnerId;
  const b = s1.winnerId;
  // Mando da final: melhor campanha geral nos grupos (proxy: reputação)
  const teamA = state.teams[a], teamB = state.teams[b];
  const homeId = teamA.reputation >= teamB.reputation ? a : b;
  const awayId = homeId === a ? b : a;
  estadual.knockout.final = {
    id: `estadual_${estadual.uf.toLowerCase()}_final`,
    homeTeamId: homeId,
    awayTeamId: awayId,
    leg: makeKnockoutLeg(estadual, "final", homeId, awayId, season, estadual.schedule.finalRound),
    winnerId: null,
  };
}

function makeKnockoutLeg(estadual, tag, homeId, awayId, season, round) {
  return {
    id: `m_estadual_${estadual.uf.toLowerCase()}_${tag}_${season}`,
    round,
    homeTeamId: homeId,
    awayTeamId: awayId,
    played: false,
    score: null,
    events: [],
    date: null,
    estadualUf: estadual.uf,
    estadualTag: tag,
  };
}

// Aplica resultado de um leg de mata-mata estadual (jogo único; empate → pênaltis simples).
export function applyEstadualKnockoutResult(estadual, leg, rng) {
  // Encontra o tie
  let tie = estadual.knockout.semis.find(t => t.leg.id === leg.id);
  if (!tie && estadual.knockout.final?.leg.id === leg.id) tie = estadual.knockout.final;
  if (!tie) return;

  const { home, away } = leg.score;
  if (home > away) tie.winnerId = leg.homeTeamId;
  else if (away > home) tie.winnerId = leg.awayTeamId;
  else tie.winnerId = rng.chance(0.55) ? leg.homeTeamId : leg.awayTeamId; // mandante leve favorito
}

// Helpers de UI: lista IDs de competições de grupo de um estadual
export function getEstadualGroupComps(state, estadual) {
  return estadual.groupIds.map(gid => state.competitions[gid]).filter(Boolean);
}

function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
