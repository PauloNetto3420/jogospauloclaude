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
import {
  createPaulistaPhase1, createPaulistaKnockout, advancePaulistaKnockout,
  applyPaulistaKnockoutResult, getPaulistaKnockoutLegs,
  getPaulistaQualified, getPaulistaRelegated,
  PAULISTA_POTS, PAULISTA_TEAM_IDS, PAULISTA_GROUP_ROUNDS, PAULISTA_TOTAL_ROUNDS,
  PAULISTA_QUARTERS_ROUND, PAULISTA_SEMIS_ROUND,
  PAULISTA_FINAL_LEG1_ROUND, PAULISTA_FINAL_LEG2_ROUND, PAULISTA_CHAMPION_PRIZE,
} from "./paulista.js";
import {
  createCariocaPhase1, createCariocaKnockout, advanceCariocaKnockout,
  applyCariocaKnockoutResult, getCariocaKnockoutLegs, getCariocaQualified,
  CARIOCA_GROUP_ROUNDS, CARIOCA_TOTAL_ROUNDS, CARIOCA_CHAMPION_PRIZE,
} from "./carioca.js";
import {
  createMineiroPhase1, createMineiroKnockout, advanceMineiroKnockout,
  applyMineiroKnockoutResult, getMineiroKnockoutLegs, getMineiroQualified,
  MINEIRO_TEAM_IDS, MINEIRO_GROUP_ROUNDS, MINEIRO_TOTAL_ROUNDS,
  MINEIRO_SEMI_LEG1_ROUND, MINEIRO_CHAMPION_PRIZE,
} from "./mineiro.js";
import {
  createGauchoPhase1, createGauchoKnockout, advanceGauchoKnockout,
  applyGauchoKnockoutResult, getGauchoKnockoutLegs, getGauchoQualified,
  GAUCHO_GROUP_ROUNDS, GAUCHO_TOTAL_ROUNDS, GAUCHO_CHAMPION_PRIZE,
} from "./gaucho.js";

export const ESTADUAL_STATES = ["SP", "RJ", "MG", "RS"];

const ESTADUAL_NAMES = {
  SP: "Campeonato Paulista",
  RJ: "Campeonato Carioca",
  MG: "Campeonato Mineiro",
  RS: "Campeonato Gaúcho",
};

// Cria todos os estaduais. Retorna o objeto meta (state.estaduais).
// SP → formato Paulista (suíço); RJ → formato Carioca (grupos cruzados);
// MG/RS → formato de grupos clássico.
export function createEstaduais(state, season, rng) {
  const estaduais = {};
  for (const uf of ESTADUAL_STATES) {
    if (uf === "SP") { estaduais.SP = createPaulistaEstadual(state, season, rng); continue; }
    if (uf === "RJ") { estaduais.RJ = createCariocaEstadual(state, season, rng); continue; }
    if (uf === "MG") { estaduais.MG = createMineiroEstadual(state, season, rng); continue; }
    if (uf === "RS") { estaduais.RS = createGauchoEstadual(state, season, rng); continue; }
    const teamIds = Object.values(state.teams)
      .filter(t => t.state === uf)
      .map(t => t.id);
    if (teamIds.length < 4) continue;
    estaduais[uf] = createOneEstadual(state, uf, teamIds, season, rng);
  }
  return estaduais;
}

// Campeonato Carioca (Taça Guanabara). Monta a 1ª fase cruzada e registra a
// competição. Mata-mata criado quando a 1ª fase termina. format: "carioca".
function createCariocaEstadual(state, season, rng) {
  const phase1 = createCariocaPhase1({ season, rng });
  state.competitions.estadual_rj = phase1;
  return {
    uf: "RJ",
    name: ESTADUAL_NAMES.RJ,
    format: "carioca",
    teams: [...phase1.teams],
    phase: "groups",            // groups | quarters | semis | final | done
    knockout: null,
    champion: null,
    prize: CARIOCA_CHAMPION_PRIZE,
    schedule: {
      groupRounds: CARIOCA_GROUP_ROUNDS,    // 1..6
      finalRound: CARIOCA_TOTAL_ROUNDS,     // 10
    },
  };
}

// Campeonato Mineiro (3 grupos cruzados). 1ª fase 1..12, semi direta 13/14,
// final 15. Mata-mata criado ao fim da 1ª fase. format: "mineiro".
function createMineiroEstadual(state, season, rng) {
  const phase1 = createMineiroPhase1({ season, rng, teamIds: MINEIRO_TEAM_IDS });
  state.competitions.estadual_mg = phase1;
  return {
    uf: "MG",
    name: ESTADUAL_NAMES.MG,
    format: "mineiro",
    teams: [...phase1.teams],
    phase: "groups",            // groups | semis | final | done
    knockout: null,
    champion: null,
    prize: MINEIRO_CHAMPION_PRIZE,
    schedule: {
      groupRounds: MINEIRO_GROUP_ROUNDS,    // 1..12
      finalRound: MINEIRO_TOTAL_ROUNDS,     // 15
    },
  };
}

// Campeonato Gaúcho (2 grupos cruzados, final ida/volta). 1ª fase 1..6,
// quartas 7, semis 8/9, final 10/11. format: "gaucho".
function createGauchoEstadual(state, season, rng) {
  const phase1 = createGauchoPhase1({ season, rng });
  state.competitions.estadual_rs = phase1;
  return {
    uf: "RS",
    name: ESTADUAL_NAMES.RS,
    format: "gaucho",
    teams: [...phase1.teams],
    phase: "groups",            // groups | quarters | semis | final | done
    knockout: null,
    champion: null,
    prize: GAUCHO_CHAMPION_PRIZE,
    schedule: {
      groupRounds: GAUCHO_GROUP_ROUNDS,     // 1..6
      finalRound: GAUCHO_TOTAL_ROUNDS,      // 11
    },
  };
}

// Campeonato Paulista (formato suíço). Monta a 1ª fase a partir dos potes
// oficiais e registra a competição. O mata-mata é criado quando a 1ª fase
// termina (advanceEstadualPhase). Marcado com format: "paulista" pra que os
// pontos de entrada (jogos da rodada, avanço de fase) saibam bifurcar.
function createPaulistaEstadual(state, season, rng) {
  const phase1 = createPaulistaPhase1({ season, pots: PAULISTA_POTS, rng });
  state.competitions.estadual_sp = phase1;

  return {
    uf: "SP",
    name: ESTADUAL_NAMES.SP,
    format: "paulista",
    teams: [...PAULISTA_TEAM_IDS],
    phase: "groups",            // groups | quarters | semis | final | done
    knockout: null,             // criado por advanceEstadualPhase ao fim da 1ª fase
    champion: null,
    prize: PAULISTA_CHAMPION_PRIZE,   // R$ 5M (lido por finishEstadualPhase)
    schedule: {
      groupRounds: PAULISTA_GROUP_ROUNDS,   // 1..8
      // mata-mata ocupa 9..12 (constantes em paulista.js)
      finalRound: PAULISTA_TOTAL_ROUNDS,    // 12 — usado por estadualTotalRounds
    },
  };
}

// Formato de grupos genérico (fallback). Exportado pra teste — os 4 UFs
// oficiais hoje usam formatos especiais, mas este caminho segue válido pra
// qualquer estado adicional futuro com 4+ times.
export function createOneEstadual(state, uf, teamIds, season, rng) {
  const ufName = ESTADUAL_NAMES[uf] || `Campeonato ${uf}`;
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
      name: `${ufName} · ${g.name}`,
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
    name: ufName,
    teams: shuffled,
    twoGroups,
    groupIds,
    phase: "groups",          // groups | semis | final | done
    knockout: { semis: [], final: null },
    champion: null,
    prize: 3_000_000,         // prêmio padrão dos estaduais menores
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
  if (estadual.format === "paulista") return getPaulistaMatchesForRound(state, estadual, round);
  if (estadual.format === "carioca") return getCariocaMatchesForRound(state, estadual, round);
  if (estadual.format === "mineiro") return getMineiroMatchesForRound(state, estadual, round);
  if (estadual.format === "gaucho") return getGauchoMatchesForRound(state, estadual, round);

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
  if (estadual.format === "paulista") return advancePaulistaEstadual(state, estadual, season, rng);
  if (estadual.format === "carioca") return advanceCariocaEstadual(state, estadual, season, rng);
  if (estadual.format === "mineiro") return advanceMineiroEstadual(state, estadual, season, rng);
  if (estadual.format === "gaucho") return advanceGauchoEstadual(state, estadual, season, rng);

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
  if (estadual.format === "paulista") {
    applyPaulistaKnockoutResult(estadual.knockout, leg, rng);
    return;
  }
  if (estadual.format === "carioca") {
    applyCariocaKnockoutResult(estadual.knockout, leg, rng);
    return;
  }
  if (estadual.format === "mineiro") {
    applyMineiroKnockoutResult(estadual.knockout, leg, rng);
    return;
  }
  if (estadual.format === "gaucho") {
    applyGauchoKnockoutResult(estadual.knockout, leg, rng);
    return;
  }
  // Encontra o tie
  let tie = estadual.knockout.semis.find(t => t.leg.id === leg.id);
  if (!tie && estadual.knockout.final?.leg.id === leg.id) tie = estadual.knockout.final;
  if (!tie) return;

  const { home, away } = leg.score;
  if (home > away) tie.winnerId = leg.homeTeamId;
  else if (away > home) tie.winnerId = leg.awayTeamId;
  else tie.winnerId = rng.chance(0.55) ? leg.homeTeamId : leg.awayTeamId; // mandante leve favorito
}

// -------------------- Formato Paulista (bifurcações) --------------------

// Jogos do Paulista numa rodada: 1ª fase (1..8) via fixtures da comp; mata-mata
// (9..12) via knockout. kind compatível com o consumidor: "group" pra 1ª fase
// (usa applyMatchResult+standings) e "semi"/"final" pro mata-mata.
function getPaulistaMatchesForRound(state, estadual, round) {
  const out = [];
  if (round <= PAULISTA_GROUP_ROUNDS) {
    const comp = state.competitions.estadual_sp;
    if (comp) {
      for (const m of comp.fixtures) {
        if (m.round === round) out.push({ match: m, kind: "group", compId: "estadual_sp" });
      }
    }
    return out;
  }
  // Mata-mata
  if (!estadual.knockout) return out;
  for (const entry of getPaulistaKnockoutLegs(estadual.knockout, round)) {
    // kind "semi" reaproveita o caminho de mata-mata (jogo único / leg da final)
    const kind = entry.kind === "final" ? "final" : "semi";
    out.push({ match: entry.leg, kind, tie: entry.tie });
  }
  return out;
}

// Avança o Paulista: cria o mata-mata quando a 1ª fase acaba; depois delega
// ao advancePaulistaKnockout; ao terminar, premia o campeão.
function advancePaulistaEstadual(state, estadual, season, rng) {
  if (estadual.phase === "groups") {
    const comp = state.competitions.estadual_sp;
    if (comp && comp.fixtures.every(m => m.played)) {
      const qualified = getPaulistaQualified(comp);
      estadual.knockout = createPaulistaKnockout(qualified);
      estadual.relegated = getPaulistaRelegated(comp);   // sem efeito ainda
      estadual.phase = "quarters";
    }
    return;
  }
  // Fases de mata-mata: espelha estadual.phase no knockout.phase
  const ko = estadual.knockout;
  if (!ko) return;
  advancePaulistaKnockout(ko, season);
  estadual.phase = ko.phase;            // quarters | semis | final | done
  if (ko.phase === "done" && ko.champion && !estadual.champion) {
    estadual.champion = ko.champion;
    // Premiação (R$ 5M) é paga de forma centralizada em finishEstadualPhase,
    // que lê estadual.prize. Evita dupla premiação.
  }
}

// -------------------- Formato Carioca (bifurcações) --------------------

// Jogos do Carioca numa rodada: 1ª fase (1..6) via fixtures; mata-mata (7..10)
// via knockout. kind "group" pra 1ª fase (standings), "semi"/"final" pro KO.
function getCariocaMatchesForRound(state, estadual, round) {
  const out = [];
  if (round <= CARIOCA_GROUP_ROUNDS) {
    const comp = state.competitions.estadual_rj;
    if (comp) {
      for (const m of comp.fixtures) {
        if (m.round === round) out.push({ match: m, kind: "group", compId: "estadual_rj" });
      }
    }
    return out;
  }
  if (!estadual.knockout) return out;
  for (const entry of getCariocaKnockoutLegs(estadual.knockout, round)) {
    const kind = entry.kind === "final" ? "final" : "semi";
    out.push({ match: entry.leg, kind, tie: entry.tie });
  }
  return out;
}

// Avança o Carioca: cria o mata-mata ao fim da 1ª fase; depois delega ao
// advanceCariocaKnockout. Premiação centralizada em finishEstadualPhase.
function advanceCariocaEstadual(state, estadual, season, rng) {
  if (estadual.phase === "groups") {
    const comp = state.competitions.estadual_rj;
    if (comp && comp.fixtures.every(m => m.played)) {
      const qualified = getCariocaQualified(comp);
      estadual.knockout = createCariocaKnockout(qualified);
      estadual.phase = "quarters";
    }
    return;
  }
  const ko = estadual.knockout;
  if (!ko) return;
  advanceCariocaKnockout(ko);
  estadual.phase = ko.phase;
  if (ko.phase === "done" && ko.champion && !estadual.champion) {
    estadual.champion = ko.champion;
  }
}

// -------------------- Formato Mineiro (bifurcações) --------------------

// Jogos do Mineiro numa rodada: 1ª fase (1..12) via fixtures; mata-mata
// (13..15) via knockout. kind "group" pra 1ª fase, "semi"/"final" pro KO.
function getMineiroMatchesForRound(state, estadual, round) {
  const out = [];
  if (round <= MINEIRO_GROUP_ROUNDS) {
    const comp = state.competitions.estadual_mg;
    if (comp) {
      for (const m of comp.fixtures) {
        if (m.round === round) out.push({ match: m, kind: "group", compId: "estadual_mg" });
      }
    }
    return out;
  }
  if (!estadual.knockout) return out;
  for (const entry of getMineiroKnockoutLegs(estadual.knockout, round)) {
    const kind = entry.kind === "final" ? "final" : "semi";
    out.push({ match: entry.leg, kind, tie: entry.tie });
  }
  return out;
}

// Avança o Mineiro: cria o mata-mata (semi direta) ao fim da 1ª fase.
function advanceMineiroEstadual(state, estadual, season, rng) {
  if (estadual.phase === "groups") {
    const comp = state.competitions.estadual_mg;
    if (comp && comp.fixtures.every(m => m.played)) {
      const qualified = getMineiroQualified(comp);
      estadual.knockout = createMineiroKnockout(qualified);
      estadual.phase = "semis";
    }
    return;
  }
  const ko = estadual.knockout;
  if (!ko) return;
  advanceMineiroKnockout(ko);
  estadual.phase = ko.phase;
  if (ko.phase === "done" && ko.champion && !estadual.champion) {
    estadual.champion = ko.champion;
  }
}

// -------------------- Formato Gaúcho (bifurcações) --------------------

// Jogos do Gaúcho numa rodada: 1ª fase (1..6) via fixtures; mata-mata (7..11)
// via knockout. kind "group" pra 1ª fase, "semi"/"final" pro KO.
function getGauchoMatchesForRound(state, estadual, round) {
  const out = [];
  if (round <= GAUCHO_GROUP_ROUNDS) {
    const comp = state.competitions.estadual_rs;
    if (comp) {
      for (const m of comp.fixtures) {
        if (m.round === round) out.push({ match: m, kind: "group", compId: "estadual_rs" });
      }
    }
    return out;
  }
  if (!estadual.knockout) return out;
  for (const entry of getGauchoKnockoutLegs(estadual.knockout, round)) {
    const kind = entry.kind === "final" ? "final" : "semi";
    out.push({ match: entry.leg, kind, tie: entry.tie });
  }
  return out;
}

// Avança o Gaúcho: cria o mata-mata ao fim da 1ª fase; delega ao KO.
function advanceGauchoEstadual(state, estadual, season, rng) {
  if (estadual.phase === "groups") {
    const comp = state.competitions.estadual_rs;
    if (comp && comp.fixtures.every(m => m.played)) {
      const qualified = getGauchoQualified(comp);
      estadual.knockout = createGauchoKnockout(qualified);
      estadual.phase = "quarters";
    }
    return;
  }
  const ko = estadual.knockout;
  if (!ko) return;
  advanceGauchoKnockout(ko);
  estadual.phase = ko.phase;
  if (ko.phase === "done" && ko.champion && !estadual.champion) {
    estadual.champion = ko.champion;
  }
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
