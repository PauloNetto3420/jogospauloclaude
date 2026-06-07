// Campeonato Rondoniense — pontos corridos (TURNO E RETURNO) + mata-mata
// ida/volta. Como o Amapaense, mas a 1ª fase é ida e volta e tem 7 times
// (ímpar → rodadas com bye).
//
// 1ª FASE: 7 clubes, todos contra todos ida e volta → 14 rodadas (com byes),
//          42 jogos. Top 4 ao mata-mata.
// SEMIS: 1×4 e 2×3, ida e volta (agregado → pênaltis).
// FINAL: ida e volta (agregado → pênaltis).

import { sortStandings } from "./season.js";
import { createCompetition } from "../models/competition.js";

export const RONDONIENSE_PHASE1_ROUNDS = 14;   // 7 times, turno e returno (com byes)
export const RONDONIENSE_SEMI_LEG1_ROUND = 15;
export const RONDONIENSE_SEMI_LEG2_ROUND = 16;
export const RONDONIENSE_FINAL_LEG1_ROUND = 17;
export const RONDONIENSE_FINAL_LEG2_ROUND = 18;
export const RONDONIENSE_TOTAL_ROUNDS = 18;
export const RONDONIENSE_CHAMPION_PRIZE = 3_000_000;

export const RONDONIENSE_TEAM_IDS = [
  "pvh", "gpr", "jip", "gen", "ron", "uca", "bvi",
];

// ==================== 1ª fase (pontos corridos, turno e returno) ====================

export function createRondoniensePhase1({ season, teamIds = RONDONIENSE_TEAM_IDS } = {}) {
  if (teamIds.length !== 7) throw new Error("Rondoniense exige exatamente 7 times.");
  const comp = createCompetition({
    id: "estadual_ro",
    name: "Campeonato Rondoniense · 1ª Fase",
    tier: 0,
    season,
    teamIds,
    legs: 2,                 // turno e returno → 14 rodadas (7 times, com byes)
    rules: { pointsWin: 3, pointsDraw: 1, format: "rondoniense_league" },
  });
  comp.champion = null;
  return comp;
}

export function getRondonienseStandings(phase1, teams) {
  return sortStandings(phase1, teams);
}

export function getRondonienseQualified(phase1, teams) {
  return getRondonienseStandings(phase1, teams).slice(0, 4).map(s => s.teamId);
}

// ==================== Mata-mata (semis + final, ida/volta) ====================

export function createRondonienseKnockout(semifinalists) {
  const seedOf = {};
  semifinalists.forEach((id, i) => { seedOf[id] = i; });
  const semis = [
    makeTwoLegTie("sf0", bySeed(semifinalists[0], semifinalists[3], seedOf), RONDONIENSE_SEMI_LEG1_ROUND, RONDONIENSE_SEMI_LEG2_ROUND), // 1×4
    makeTwoLegTie("sf1", bySeed(semifinalists[1], semifinalists[2], seedOf), RONDONIENSE_SEMI_LEG1_ROUND, RONDONIENSE_SEMI_LEG2_ROUND), // 2×3
  ];
  return { seedOf, phase: "semis", semis, final: null, champion: null };
}

export function advanceRondonienseKnockout(ko) {
  if (ko.phase === "semis") {
    if (!ko.semis.every(t => t.winnerId)) return false;
    const [a, b] = ko.semis.map(t => t.winnerId);
    ko.final = makeTwoLegTie("final", bySeed(a, b, ko.seedOf), RONDONIENSE_FINAL_LEG1_ROUND, RONDONIENSE_FINAL_LEG2_ROUND);
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

export function applyRondonienseKnockoutResult(ko, leg, rng) {
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

export function getRondonienseKnockoutLegs(ko, round) {
  const out = [];
  if (round === RONDONIENSE_SEMI_LEG1_ROUND || round === RONDONIENSE_SEMI_LEG2_ROUND) {
    for (const t of ko.semis) for (const l of t.legs) if (!l.played && l.round === round) out.push({ leg: l, tie: t, kind: "sf" });
  } else if (ko.final && (round === RONDONIENSE_FINAL_LEG1_ROUND || round === RONDONIENSE_FINAL_LEG2_ROUND)) {
    for (const l of ko.final.legs) if (!l.played && l.round === round) out.push({ leg: l, tie: ko.final, kind: "final" });
  }
  return out;
}

// ==================== helpers internos ====================

function bySeed(a, b, seedOf) {
  return seedOf[a] <= seedOf[b] ? [a, b] : [b, a];
}

function makeTwoLegTie(tag, [bestId, otherId], r1, r2) {
  return {
    id: `rondoniense_${tag}`,
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
  return { id: `m_rondoniense_${tag}`, round, homeTeamId: homeId, awayTeamId: awayId, played: false, score: null, events: [], date: null };
}
