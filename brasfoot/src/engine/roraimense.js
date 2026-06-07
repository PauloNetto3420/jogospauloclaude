// Campeonato Roraimense — liga turno único + mata-mata em JOGO ÚNICO.
// Mesmo arquétipo do Baiano, mas com 9 times (ímpar → rodadas com bye).
//
// 1ª FASE: 9 clubes, pontos corridos turno único → 9 rodadas (com byes),
//          36 jogos. Top 4 ao mata-mata.
// SEMIS/FINAL: jogo único, mando do melhor na campanha geral, empate → pênaltis.

import { sortStandings } from "./season.js";
import { createCompetition } from "../models/competition.js";

export const RORAIMENSE_PHASE1_ROUNDS = 9;   // 9 times, turno único (com byes)
export const RORAIMENSE_SEMI_ROUND = 10;
export const RORAIMENSE_FINAL_ROUND = 11;
export const RORAIMENSE_TOTAL_ROUNDS = 11;
export const RORAIMENSE_CHAMPION_PRIZE = 3_000_000;

export const RORAIMENSE_TEAM_IDS = [
  "gas", "srr", "bre", "mro", "riv", "pro", "atr", "rng", "nrr",
];

// ==================== 1ª fase (pontos corridos, turno único) ====================

export function createRoraimensePhase1({ season, teamIds = RORAIMENSE_TEAM_IDS } = {}) {
  if (teamIds.length !== 9) throw new Error("Roraimense exige exatamente 9 times.");
  const comp = createCompetition({
    id: "estadual_rr",
    name: "Campeonato Roraimense · 1ª Fase",
    tier: 0,
    season,
    teamIds,
    legs: 1,                 // turno único → 9 rodadas (9 times, com byes)
    rules: { pointsWin: 3, pointsDraw: 1, format: "roraimense_league" },
  });
  comp.champion = null;
  return comp;
}

export function getRoraimenseStandings(phase1, teams) {
  return sortStandings(phase1, teams);
}

export function getRoraimenseQualified(phase1, teams) {
  return getRoraimenseStandings(phase1, teams).slice(0, 4).map(s => s.teamId);
}

// ==================== Mata-mata (semis + final, jogo único) ====================

// qualified = [1º, 2º, 3º, 4º]. Mando do melhor: 1º×4º, 2º×3º.
export function createRoraimenseKnockout(qualified) {
  const seedOf = {};
  qualified.forEach((id, i) => { seedOf[id] = i; });
  const semis = [
    makeSingleTie("sf0", qualified[0], qualified[3], RORAIMENSE_SEMI_ROUND), // 1×4
    makeSingleTie("sf1", qualified[1], qualified[2], RORAIMENSE_SEMI_ROUND), // 2×3
  ];
  return { seedOf, phase: "semis", semis, final: null, champion: null };
}

export function advanceRoraimenseKnockout(ko) {
  if (ko.phase === "semis") {
    if (!ko.semis.every(t => t.winnerId)) return false;
    const [w0, w1] = ko.semis.map(t => t.winnerId);
    const [home, away] = ko.seedOf[w0] <= ko.seedOf[w1] ? [w0, w1] : [w1, w0];
    ko.final = makeSingleTie("final", home, away, RORAIMENSE_FINAL_ROUND);
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

export function applyRoraimenseKnockoutResult(ko, leg, rng) {
  const tie = ko.semis.find(t => t.leg?.id === leg.id)
           || (ko.final?.leg?.id === leg.id ? ko.final : null);
  if (!tie) return;
  const { home, away } = leg.score;
  if (home > away) tie.winnerId = leg.homeTeamId;
  else if (away > home) tie.winnerId = leg.awayTeamId;
  else tie.winnerId = rng.chance(0.5) ? leg.homeTeamId : leg.awayTeamId; // pênaltis
}

export function getRoraimenseKnockoutLegs(ko, round) {
  const out = [];
  if (round === RORAIMENSE_SEMI_ROUND) {
    for (const t of ko.semis) if (t.leg && !t.leg.played) out.push({ leg: t.leg, tie: t, kind: "sf" });
  } else if (ko.final && round === RORAIMENSE_FINAL_ROUND) {
    if (!ko.final.leg.played) out.push({ leg: ko.final.leg, tie: ko.final, kind: "final" });
  }
  return out;
}

// ==================== helpers internos ====================

function makeSingleTie(tag, homeId, awayId, round) {
  return {
    id: `roraimense_${tag}`,
    teamAId: homeId, teamBId: awayId,   // melhor campanha (manda)
    leg: makeKoLeg(tag, homeId, awayId, round),
    winnerId: null,
  };
}

function makeKoLeg(tag, homeId, awayId, round) {
  return { id: `m_roraimense_${tag}`, round, homeTeamId: homeId, awayTeamId: awayId, played: false, score: null, events: [], date: null };
}
