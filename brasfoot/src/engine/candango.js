// Campeonato Candango (Distrito Federal) — liga turno único (10 times) +
// mata-mata ida/volta. Mesmo arquétipo do Paraibano.
//
// 1ª FASE: 10 clubes, pontos corridos turno único → 9 rodadas, 45 jogos.
//          Top 4 ao mata-mata.
// SEMIS: 1×4 e 2×3, ida e volta (agregado → pênaltis).
// FINAL: ida e volta; melhor campanha geral manda na volta. Agregado → pênaltis.

import { sortStandings } from "./season.js";
import { createCompetition } from "../models/competition.js";

export const CANDANGO_PHASE1_ROUNDS = 9;
export const CANDANGO_SEMI_LEG1_ROUND = 10;
export const CANDANGO_SEMI_LEG2_ROUND = 11;
export const CANDANGO_FINAL_LEG1_ROUND = 12;
export const CANDANGO_FINAL_LEG2_ROUND = 13;
export const CANDANGO_TOTAL_ROUNDS = 13;
export const CANDANGO_CHAMPION_PRIZE = 3_500_000;

export const CANDANGO_TEAM_IDS = [
  "gam", "bsl", "cei", "sob", "smb", "cap", "rbr", "pno", "aru", "bdf",
];

// ==================== 1ª fase (pontos corridos, turno único) ====================

export function createCandangoPhase1({ season, teamIds = CANDANGO_TEAM_IDS } = {}) {
  if (teamIds.length !== 10) throw new Error("Candango exige exatamente 10 times.");
  const comp = createCompetition({
    id: "estadual_df",
    name: "Campeonato Candango · 1ª Fase",
    tier: 0,
    season,
    teamIds,
    legs: 1,                 // turno único → 9 rodadas
    rules: { pointsWin: 3, pointsDraw: 1, format: "candango_league" },
  });
  comp.champion = null;
  return comp;
}

export function getCandangoStandings(phase1, teams) {
  return sortStandings(phase1, teams);
}

export function getCandangoQualified(phase1, teams) {
  return getCandangoStandings(phase1, teams).slice(0, 4).map(s => s.teamId);
}

// ==================== Mata-mata (semis + final, ida/volta) ====================

export function createCandangoKnockout(semifinalists) {
  const seedOf = {};
  semifinalists.forEach((id, i) => { seedOf[id] = i; });
  const semis = [
    makeTwoLegTie("sf0", bySeed(semifinalists[0], semifinalists[3], seedOf), CANDANGO_SEMI_LEG1_ROUND, CANDANGO_SEMI_LEG2_ROUND), // 1×4
    makeTwoLegTie("sf1", bySeed(semifinalists[1], semifinalists[2], seedOf), CANDANGO_SEMI_LEG1_ROUND, CANDANGO_SEMI_LEG2_ROUND), // 2×3
  ];
  return { seedOf, phase: "semis", semis, final: null, champion: null };
}

export function advanceCandangoKnockout(ko) {
  if (ko.phase === "semis") {
    if (!ko.semis.every(t => t.winnerId)) return false;
    const [a, b] = ko.semis.map(t => t.winnerId);
    ko.final = makeTwoLegTie("final", bySeed(a, b, ko.seedOf), CANDANGO_FINAL_LEG1_ROUND, CANDANGO_FINAL_LEG2_ROUND);
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

export function applyCandangoKnockoutResult(ko, leg, rng) {
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

export function getCandangoKnockoutLegs(ko, round) {
  const out = [];
  if (round === CANDANGO_SEMI_LEG1_ROUND || round === CANDANGO_SEMI_LEG2_ROUND) {
    for (const t of ko.semis) for (const l of t.legs) if (!l.played && l.round === round) out.push({ leg: l, tie: t, kind: "sf" });
  } else if (ko.final && (round === CANDANGO_FINAL_LEG1_ROUND || round === CANDANGO_FINAL_LEG2_ROUND)) {
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
    id: `candango_${tag}`,
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
  return { id: `m_candango_${tag}`, round, homeTeamId: homeId, awayTeamId: awayId, played: false, score: null, events: [], date: null };
}
