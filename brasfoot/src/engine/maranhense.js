// Campeonato Maranhense — liga curta + mata-mata ida/volta (mesmo arquétipo
// do Amapaense/Tocantinense).
//
// 1ª FASE: 8 clubes, pontos corridos turno único → 7 rodadas, 28 jogos.
//          Top 4 ao mata-mata.
// SEMIS: 1×4 e 2×3, ida e volta; melhor campanha manda na volta (vantagem do
//        mando). Agregado empatado → pênaltis.
// FINAL: ida e volta; melhor campanha geral manda na volta. Agregado → pênaltis.

import { sortStandings } from "./season.js";
import { createCompetition } from "../models/competition.js";

export const MARANHENSE_PHASE1_ROUNDS = 7;
export const MARANHENSE_SEMI_LEG1_ROUND = 8;
export const MARANHENSE_SEMI_LEG2_ROUND = 9;
export const MARANHENSE_FINAL_LEG1_ROUND = 10;
export const MARANHENSE_FINAL_LEG2_ROUND = 11;
export const MARANHENSE_TOTAL_ROUNDS = 11;
export const MARANHENSE_CHAMPION_PRIZE = 3_000_000;

export const MARANHENSE_TEAM_IDS = [
  "mar", "sam", "mot", "ipe", "tnt", "lum", "itz", "imp",
];

// ==================== 1ª fase (pontos corridos, turno único) ====================

export function createMaranhensePhase1({ season, teamIds = MARANHENSE_TEAM_IDS } = {}) {
  if (teamIds.length !== 8) throw new Error("Maranhense exige exatamente 8 times.");
  const comp = createCompetition({
    id: "estadual_ma",
    name: "Campeonato Maranhense · 1ª Fase",
    tier: 0,
    season,
    teamIds,
    legs: 1,                 // turno único → 7 rodadas
    rules: { pointsWin: 3, pointsDraw: 1, format: "maranhense_league" },
  });
  comp.champion = null;
  return comp;
}

export function getMaranhenseStandings(phase1, teams) {
  return sortStandings(phase1, teams);
}

export function getMaranhenseQualified(phase1, teams) {
  return getMaranhenseStandings(phase1, teams).slice(0, 4).map(s => s.teamId);
}

// ==================== Mata-mata (semis + final, ida/volta) ====================

export function createMaranhenseKnockout(semifinalists) {
  const seedOf = {};
  semifinalists.forEach((id, i) => { seedOf[id] = i; });
  const semis = [
    makeTwoLegTie("sf0", bySeed(semifinalists[0], semifinalists[3], seedOf), MARANHENSE_SEMI_LEG1_ROUND, MARANHENSE_SEMI_LEG2_ROUND), // 1×4
    makeTwoLegTie("sf1", bySeed(semifinalists[1], semifinalists[2], seedOf), MARANHENSE_SEMI_LEG1_ROUND, MARANHENSE_SEMI_LEG2_ROUND), // 2×3
  ];
  return { seedOf, phase: "semis", semis, final: null, champion: null };
}

export function advanceMaranhenseKnockout(ko) {
  if (ko.phase === "semis") {
    if (!ko.semis.every(t => t.winnerId)) return false;
    const [a, b] = ko.semis.map(t => t.winnerId);
    ko.final = makeTwoLegTie("final", bySeed(a, b, ko.seedOf), MARANHENSE_FINAL_LEG1_ROUND, MARANHENSE_FINAL_LEG2_ROUND);
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

export function applyMaranhenseKnockoutResult(ko, leg, rng) {
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

export function getMaranhenseKnockoutLegs(ko, round) {
  const out = [];
  if (round === MARANHENSE_SEMI_LEG1_ROUND || round === MARANHENSE_SEMI_LEG2_ROUND) {
    for (const t of ko.semis) for (const l of t.legs) if (!l.played && l.round === round) out.push({ leg: l, tie: t, kind: "sf" });
  } else if (ko.final && (round === MARANHENSE_FINAL_LEG1_ROUND || round === MARANHENSE_FINAL_LEG2_ROUND)) {
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
    id: `maranhense_${tag}`,
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
  return { id: `m_maranhense_${tag}`, round, homeTeamId: homeId, awayTeamId: awayId, played: false, score: null, events: [], date: null };
}
