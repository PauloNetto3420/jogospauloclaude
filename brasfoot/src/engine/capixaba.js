// Campeonato Capixaba (Espírito Santo) — liga turno único (10 times) +
// mata-mata top 8, tudo ida/volta.
//
// 1ª FASE: 10 clubes, pontos corridos turno único → 9 rodadas, 45 jogos.
//          Top 8 ao mata-mata; os 2 últimos rebaixados (sem efeito nacional
//          modelado ainda — registrado em estadual.relegated).
// QUARTAS: 1×8, 2×7, 3×6, 4×5, ida/volta (chaveamento para 1º/2º só se
//          cruzarem na final).
// SEMIS e FINAL: ida e volta. Melhor campanha manda na volta; pênaltis no
//          empate do agregado.
//
// Calendário: 1ª fase 1..9 · quartas 10/11 · semis 12/13 · final 14/15.

import { sortStandings } from "./season.js";
import { createCompetition } from "../models/competition.js";

export const CAPIXABA_PHASE1_ROUNDS = 9;
export const CAPIXABA_QUARTERS_LEG1_ROUND = 10;
export const CAPIXABA_QUARTERS_LEG2_ROUND = 11;
export const CAPIXABA_SEMI_LEG1_ROUND = 12;
export const CAPIXABA_SEMI_LEG2_ROUND = 13;
export const CAPIXABA_FINAL_LEG1_ROUND = 14;
export const CAPIXABA_FINAL_LEG2_ROUND = 15;
export const CAPIXABA_TOTAL_ROUNDS = 15;
export const CAPIXABA_CHAMPION_PRIZE = 3_500_000;

export const CAPIXABA_TEAM_IDS = [
  "rbc", "def", "rno", "pvi", "vix", "rbv", "vlv", "cxb", "ser", "fte",
];

// ==================== 1ª fase (pontos corridos, turno único) ====================

export function createCapixabaPhase1({ season, teamIds = CAPIXABA_TEAM_IDS } = {}) {
  if (teamIds.length !== 10) throw new Error("Capixaba exige exatamente 10 times.");
  const comp = createCompetition({
    id: "estadual_es",
    name: "Campeonato Capixaba · 1ª Fase",
    tier: 0,
    season,
    teamIds,
    legs: 1,                 // turno único → 9 rodadas
    rules: { pointsWin: 3, pointsDraw: 1, format: "capixaba_league" },
  });
  comp.champion = null;
  return comp;
}

export function getCapixabaStandings(phase1, teams) {
  return sortStandings(phase1, teams);
}

// Os 8 melhores (seeds 0..7) avançam ao mata-mata.
export function getCapixabaQualified(phase1, teams) {
  return getCapixabaStandings(phase1, teams).slice(0, 8).map(s => s.teamId);
}

// Os 2 últimos (rebaixados — sem efeito nacional modelado ainda).
export function getCapixabaRelegated(phase1, teams) {
  return getCapixabaStandings(phase1, teams).slice(8).map(s => s.teamId);
}

// ==================== Mata-mata (quartas/semis/final, ida/volta) ====================

// qualified = [1º..8º]. Chaveamento por seed (1×8, 4×5, 2×7, 3×6) para que
// 1º e 2º só se cruzem na final.
export function createCapixabaKnockout(qualified) {
  const seedOf = {};
  qualified.forEach((id, i) => { seedOf[id] = i; });
  const R1 = CAPIXABA_QUARTERS_LEG1_ROUND, R2 = CAPIXABA_QUARTERS_LEG2_ROUND;
  const quarters = [
    makeTwoLegTie("qf0", bySeed(qualified[0], qualified[7], seedOf), R1, R2), // 1×8
    makeTwoLegTie("qf1", bySeed(qualified[3], qualified[4], seedOf), R1, R2), // 4×5
    makeTwoLegTie("qf2", bySeed(qualified[1], qualified[6], seedOf), R1, R2), // 2×7
    makeTwoLegTie("qf3", bySeed(qualified[2], qualified[5], seedOf), R1, R2), // 3×6
  ];
  return { seedOf, phase: "quarters", quarters, semis: [], final: null, champion: null };
}

export function advanceCapixabaKnockout(ko) {
  if (ko.phase === "quarters") {
    if (!ko.quarters.every(t => t.winnerId)) return false;
    const w = ko.quarters.map(t => t.winnerId);
    // SF1: vencedor(1×8) × vencedor(4×5); SF2: vencedor(2×7) × vencedor(3×6).
    ko.semis = [
      makeTwoLegTie("sf0", bySeed(w[0], w[1], ko.seedOf), CAPIXABA_SEMI_LEG1_ROUND, CAPIXABA_SEMI_LEG2_ROUND),
      makeTwoLegTie("sf1", bySeed(w[2], w[3], ko.seedOf), CAPIXABA_SEMI_LEG1_ROUND, CAPIXABA_SEMI_LEG2_ROUND),
    ];
    ko.phase = "semis";
    return true;
  }
  if (ko.phase === "semis") {
    if (!ko.semis.every(t => t.winnerId)) return false;
    const [a, b] = ko.semis.map(t => t.winnerId);
    ko.final = makeTwoLegTie("final", bySeed(a, b, ko.seedOf), CAPIXABA_FINAL_LEG1_ROUND, CAPIXABA_FINAL_LEG2_ROUND);
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

export function applyCapixabaKnockoutResult(ko, leg, rng) {
  const tie = ko.quarters.find(t => t.legs?.some(l => l.id === leg.id))
           || ko.semis.find(t => t.legs?.some(l => l.id === leg.id))
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

export function getCapixabaKnockoutLegs(ko, round) {
  const out = [];
  const collect = (ties, kind) => {
    for (const t of ties) for (const l of t.legs) if (!l.played && l.round === round) out.push({ leg: l, tie: t, kind });
  };
  if (round === CAPIXABA_QUARTERS_LEG1_ROUND || round === CAPIXABA_QUARTERS_LEG2_ROUND) collect(ko.quarters, "qf");
  else if (round === CAPIXABA_SEMI_LEG1_ROUND || round === CAPIXABA_SEMI_LEG2_ROUND) collect(ko.semis, "sf");
  else if (ko.final && (round === CAPIXABA_FINAL_LEG1_ROUND || round === CAPIXABA_FINAL_LEG2_ROUND)) collect([ko.final], "final");
  return out;
}

// ==================== helpers internos ====================

function bySeed(a, b, seedOf) {
  return seedOf[a] <= seedOf[b] ? [a, b] : [b, a];
}

function makeTwoLegTie(tag, [bestId, otherId], r1, r2) {
  return {
    id: `capixaba_${tag}`,
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
  return { id: `m_capixaba_${tag}`, round, homeTeamId: homeId, awayTeamId: awayId, played: false, score: null, events: [], date: null };
}
