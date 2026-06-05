// Campeonato Alagoano — liga curta + mata-mata ida/volta.
//
// 1ª FASE: 8 clubes, pontos corridos turno único → 7 rodadas, 28 jogos.
//          Top 4 ao mata-mata; o 8º (último) seria rebaixado à 2ª divisão
//          (consolação — sem efeito nacional ainda).
// SEMIS: cruzamento olímpico 1×4 e 2×3, ida e volta (agregado → pênaltis).
// FINAL: ida e volta, sem vantagem de empate (agregado → pênaltis).

import { sortStandings } from "./season.js";
import { createCompetition } from "../models/competition.js";

export const ALAGOANO_PHASE1_ROUNDS = 7;
export const ALAGOANO_SEMI_LEG1_ROUND = 8;
export const ALAGOANO_SEMI_LEG2_ROUND = 9;
export const ALAGOANO_FINAL_LEG1_ROUND = 10;
export const ALAGOANO_FINAL_LEG2_ROUND = 11;
export const ALAGOANO_TOTAL_ROUNDS = 11;
export const ALAGOANO_CHAMPION_PRIZE = 3_500_000;

// Os 8 oficiais (CRB já em B/C/D + 7 figurantes).
export const ALAGOANO_TEAM_IDS = [
  "crb", "csa", "asa", "mur", "czl", "crp", "pen", "cse",
];

// ==================== 1ª fase (pontos corridos, turno único) ====================

export function createAlagoanoPhase1({ season, teamIds = ALAGOANO_TEAM_IDS } = {}) {
  if (teamIds.length !== 8) throw new Error("Alagoano exige exatamente 8 times.");
  const comp = createCompetition({
    id: "estadual_al",
    name: "Campeonato Alagoano · 1ª Fase",
    tier: 0,
    season,
    teamIds,
    legs: 1,                 // turno único → 7 rodadas
    rules: { pointsWin: 3, pointsDraw: 1, format: "alagoano_league" },
  });
  comp.champion = null;
  return comp;
}

export function getAlagoanoStandings(phase1, teams) {
  return sortStandings(phase1, teams);
}

// Top 4 (mata-mata) + 8º (rebaixado).
export function getAlagoanoQualified(phase1, teams) {
  const sorted = getAlagoanoStandings(phase1, teams);
  return {
    semifinalists: sorted.slice(0, 4).map(s => s.teamId),
    relegated: sorted.length >= 8 ? sorted[sorted.length - 1].teamId : null,
  };
}

// ==================== Mata-mata (semis + final, ida/volta) ====================

// semifinalists = [1º, 2º, 3º, 4º]. Cruzamento olímpico: 1×4 e 2×3.
export function createAlagoanoKnockout(semifinalists) {
  const seedOf = {};
  semifinalists.forEach((id, i) => { seedOf[id] = i; });
  const semis = [
    makeTwoLegTie("sf0", bySeed(semifinalists[0], semifinalists[3], seedOf), ALAGOANO_SEMI_LEG1_ROUND, ALAGOANO_SEMI_LEG2_ROUND), // 1×4
    makeTwoLegTie("sf1", bySeed(semifinalists[1], semifinalists[2], seedOf), ALAGOANO_SEMI_LEG1_ROUND, ALAGOANO_SEMI_LEG2_ROUND), // 2×3
  ];
  return { seedOf, phase: "semis", semis, final: null, champion: null };
}

export function advanceAlagoanoKnockout(ko) {
  if (ko.phase === "semis") {
    if (!ko.semis.every(t => t.winnerId)) return false;
    const [a, b] = ko.semis.map(t => t.winnerId);
    ko.final = makeTwoLegTie("final", bySeed(a, b, ko.seedOf), ALAGOANO_FINAL_LEG1_ROUND, ALAGOANO_FINAL_LEG2_ROUND);
    ko.phase = "final";
    return true;
  }
  if (ko.phase === "final") {
    if (!ko.final.winnerId) return false;
    ko.champion = ko.final.winnerId;
    ko.phase = "done";
    return true;
  }
  return false;
}

export function applyAlagoanoKnockoutResult(ko, leg, rng) {
  const tie = ko.semis.find(t => t.legs?.some(l => l.id === leg.id))
           || (ko.final?.legs?.some(l => l.id === leg.id) ? ko.final : null);
  if (!tie) return;
  const [l1, l2] = tie.legs;
  if (!l1.played || !l2.played) return;
  const aTotal = l1.score.away + l2.score.home; // teamA (melhor) manda na volta
  const bTotal = l1.score.home + l2.score.away;
  if (aTotal > bTotal) tie.winnerId = tie.teamAId;
  else if (bTotal > aTotal) tie.winnerId = tie.teamBId;
  else tie.winnerId = rng.chance(0.5) ? tie.teamAId : tie.teamBId; // pênaltis
  tie.aggregate = { teamA: aTotal, teamB: bTotal };
}

export function getAlagoanoKnockoutLegs(ko, round) {
  const out = [];
  if (round === ALAGOANO_SEMI_LEG1_ROUND || round === ALAGOANO_SEMI_LEG2_ROUND) {
    for (const t of ko.semis) for (const l of t.legs) if (!l.played && l.round === round) out.push({ leg: l, tie: t, kind: "sf" });
  } else if (ko.final && (round === ALAGOANO_FINAL_LEG1_ROUND || round === ALAGOANO_FINAL_LEG2_ROUND)) {
    for (const l of ko.final.legs) if (!l.played && l.round === round) out.push({ leg: l, tie: ko.final, kind: "final" });
  }
  return out;
}

// ==================== helpers internos ====================

function bySeed(a, b, seedOf) {
  return seedOf[a] <= seedOf[b] ? [a, b] : [b, a];
}

// [bestId, otherId] ordenado por seed. teamA (melhor) joga a VOLTA em casa.
function makeTwoLegTie(tag, [bestId, otherId], r1, r2) {
  return {
    id: `alagoano_${tag}`,
    teamAId: bestId, teamBId: otherId,
    legs: [
      makeKoLeg(`${tag}1`, otherId, bestId, r1),
      makeKoLeg(`${tag}2`, bestId, otherId, r2),
    ],
    aggregate: null,
    winnerId: null,
  };
}

function makeKoLeg(tag, homeId, awayId, round) {
  return { id: `m_alagoano_${tag}`, round, homeTeamId: homeId, awayTeamId: awayId, played: false, score: null, events: [], date: null };
}
