// Campeonato Sul-mato-grossense — liga curta + mata-mata tudo ida/volta.
//
// 1ª FASE: 10 clubes, pontos corridos turno único → 9 rodadas, 45 jogos.
//          1º e 2º vão DIRETO às semifinais.
// QUARTAS: 3º a 6º em ida/volta (3º×6º e 4º×5º).
// SEMIS e FINAL: ida e volta. Os 2 vencedores das quartas enfrentam 1º/2º.
//          Melhor campanha manda na volta; pênaltis no empate do agregado.
//
// Calendário: 1ª fase 1..9 · quartas 10/11 · semis 12/13 · final 14/15.

import { sortStandings } from "./season.js";
import { createCompetition } from "../models/competition.js";

export const SULMS_PHASE1_ROUNDS = 9;
export const SULMS_QUARTERS_LEG1_ROUND = 10;
export const SULMS_QUARTERS_LEG2_ROUND = 11;
export const SULMS_SEMI_LEG1_ROUND = 12;
export const SULMS_SEMI_LEG2_ROUND = 13;
export const SULMS_FINAL_LEG1_ROUND = 14;
export const SULMS_FINAL_LEG2_ROUND = 15;
export const SULMS_TOTAL_ROUNDS = 15;
export const SULMS_CHAMPION_PRIZE = 3_500_000;

export const SULMS_TEAM_IDS = [
  "oms", "bat", "nav", "pan", "crm", "agn", "dou", "cbe", "ivi", "cra",
];

// ==================== 1ª fase (pontos corridos, turno único) ====================

export function createSulmatogrossensePhase1({ season, teamIds = SULMS_TEAM_IDS } = {}) {
  if (teamIds.length !== 10) throw new Error("Sul-mato-grossense exige exatamente 10 times.");
  const comp = createCompetition({
    id: "estadual_ms",
    name: "Campeonato Sul-mato-grossense · 1ª Fase",
    tier: 0,
    season,
    teamIds,
    legs: 1,                 // turno único → 9 rodadas
    rules: { pointsWin: 3, pointsDraw: 1, format: "sulms_league" },
  });
  comp.champion = null;
  return comp;
}

export function getSulmatogrossenseStandings(phase1, teams) {
  return sortStandings(phase1, teams);
}

// Os 6 primeiros (1º-2º diretos; 3º-6º para as quartas).
export function getSulmatogrossenseQualified(phase1, teams) {
  return getSulmatogrossenseStandings(phase1, teams).slice(0, 6).map(s => s.teamId);
}

// ==================== Mata-mata (quartas → semis → final, tudo ida/volta) ====================

// qualified = [1º..6º]. 1º/2º diretos; quartas 3º×6º e 4º×5º.
export function createSulmatogrossenseKnockout(qualified) {
  const seedOf = {};
  qualified.forEach((id, i) => { seedOf[id] = i; });

  const R1 = SULMS_QUARTERS_LEG1_ROUND, R2 = SULMS_QUARTERS_LEG2_ROUND;
  const quarters = [
    makeTwoLegTie("qf0", bySeed(qualified[2], qualified[5], seedOf), R1, R2), // 3º×6º
    makeTwoLegTie("qf1", bySeed(qualified[3], qualified[4], seedOf), R1, R2), // 4º×5º
  ];

  return {
    seedOf,
    phase: "quarters",
    direct: [qualified[0], qualified[1]],
    quarters,
    semis: [],
    final: null,
    champion: null,
  };
}

export function advanceSulmatogrossenseKnockout(ko) {
  if (ko.phase === "quarters") {
    if (!ko.quarters.every(t => t.winnerId)) return false;
    const winners = ko.quarters.map(t => t.winnerId);
    // Semifinalistas: 2 diretos + 2 vencedores das quartas, semeados por
    // campanha (menor seed = melhor). Cruzamento padrão 1×4, 2×3.
    const four = [...ko.direct, ...winners].sort((a, b) => ko.seedOf[a] - ko.seedOf[b]);
    ko.semis = [
      makeTwoLegTie("sf0", bySeed(four[0], four[3], ko.seedOf), SULMS_SEMI_LEG1_ROUND, SULMS_SEMI_LEG2_ROUND),
      makeTwoLegTie("sf1", bySeed(four[1], four[2], ko.seedOf), SULMS_SEMI_LEG1_ROUND, SULMS_SEMI_LEG2_ROUND),
    ];
    ko.phase = "semis";
    return true;
  }
  if (ko.phase === "semis") {
    if (!ko.semis.every(t => t.winnerId)) return false;
    const [a, b] = ko.semis.map(t => t.winnerId);
    ko.final = makeTwoLegTie("final", bySeed(a, b, ko.seedOf), SULMS_FINAL_LEG1_ROUND, SULMS_FINAL_LEG2_ROUND);
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

export function applySulmatogrossenseKnockoutResult(ko, leg, rng) {
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
  else tie.winnerId = rng.chance(0.5) ? tie.teamAId : tie.teamBId; // prorrogação/pênaltis
  tie.aggregate = { teamA: aTotal, teamB: bTotal };
}

export function getSulmatogrossenseKnockoutLegs(ko, round) {
  const out = [];
  const collect = (ties, kind) => {
    for (const t of ties) for (const l of t.legs) if (!l.played && l.round === round) out.push({ leg: l, tie: t, kind });
  };
  if (round === SULMS_QUARTERS_LEG1_ROUND || round === SULMS_QUARTERS_LEG2_ROUND) collect(ko.quarters, "qf");
  else if (round === SULMS_SEMI_LEG1_ROUND || round === SULMS_SEMI_LEG2_ROUND) collect(ko.semis, "sf");
  else if (ko.final && (round === SULMS_FINAL_LEG1_ROUND || round === SULMS_FINAL_LEG2_ROUND)) collect([ko.final], "final");
  return out;
}

// ==================== helpers internos ====================

function bySeed(a, b, seedOf) {
  return seedOf[a] <= seedOf[b] ? [a, b] : [b, a];
}

function makeTwoLegTie(tag, [bestId, otherId], r1, r2) {
  return {
    id: `sulms_${tag}`,
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
  return { id: `m_sulms_${tag}`, round, homeTeamId: homeId, awayTeamId: awayId, played: false, score: null, events: [], date: null };
}
