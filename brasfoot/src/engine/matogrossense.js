// Campeonato Mato-grossense — liga curta + mata-mata híbrido.
//
// 1ª FASE: 10 clubes, pontos corridos turno único → 9 rodadas, 45 jogos.
//          1º e 2º vão DIRETO às semifinais.
// QUARTAS: 3º a 6º em JOGO ÚNICO (3º×6º e 4º×5º), mando do melhor campanha.
// SEMIS e FINAL: ida e volta (agregado; melhor campanha manda na volta;
//          pênaltis no empate do agregado).
//
// Calendário: 1ª fase 1..9 · quartas 10 · semis 11/12 · final 13/14.

import { sortStandings } from "./season.js";
import { createCompetition } from "../models/competition.js";

export const MATOGROSSENSE_PHASE1_ROUNDS = 9;
export const MATOGROSSENSE_QUARTERS_ROUND = 10;
export const MATOGROSSENSE_SEMI_LEG1_ROUND = 11;
export const MATOGROSSENSE_SEMI_LEG2_ROUND = 12;
export const MATOGROSSENSE_FINAL_LEG1_ROUND = 13;
export const MATOGROSSENSE_FINAL_LEG2_ROUND = 14;
export const MATOGROSSENSE_TOTAL_ROUNDS = 14;
export const MATOGROSSENSE_CHAMPION_PRIZE = 3_500_000;

export const MATOGROSSENSE_TEAM_IDS = [
  "cui", "mix", "luv", "ovg", "urd", "nmt", "ssn", "pri", "chp", "vgd",
];

// ==================== 1ª fase (pontos corridos, turno único) ====================

export function createMatogrossensePhase1({ season, teamIds = MATOGROSSENSE_TEAM_IDS } = {}) {
  if (teamIds.length !== 10) throw new Error("Mato-grossense exige exatamente 10 times.");
  const comp = createCompetition({
    id: "estadual_mt",
    name: "Campeonato Mato-grossense · 1ª Fase",
    tier: 0,
    season,
    teamIds,
    legs: 1,                 // turno único → 9 rodadas
    rules: { pointsWin: 3, pointsDraw: 1, format: "matogrossense_league" },
  });
  comp.champion = null;
  return comp;
}

export function getMatogrossenseStandings(phase1, teams) {
  return sortStandings(phase1, teams);
}

// Os 6 primeiros (1º-2º diretos; 3º-6º para as quartas).
export function getMatogrossenseQualified(phase1, teams) {
  return getMatogrossenseStandings(phase1, teams).slice(0, 6).map(s => s.teamId);
}

// ==================== Mata-mata (quartas jogo único → semis → final) ====================

// qualified = [1º..6º]. 1º/2º diretos; quartas jogo único 3º×6º e 4º×5º.
export function createMatogrossenseKnockout(qualified) {
  const seedOf = {};
  qualified.forEach((id, i) => { seedOf[id] = i; });

  // Mando do melhor campanha (menor seed) no jogo único.
  const quarters = [
    makeSingleTie("qf0", ...bySeed(qualified[2], qualified[5], seedOf), MATOGROSSENSE_QUARTERS_ROUND), // 3º×6º
    makeSingleTie("qf1", ...bySeed(qualified[3], qualified[4], seedOf), MATOGROSSENSE_QUARTERS_ROUND), // 4º×5º
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

export function advanceMatogrossenseKnockout(ko) {
  if (ko.phase === "quarters") {
    if (!ko.quarters.every(t => t.winnerId)) return false;
    const winners = ko.quarters.map(t => t.winnerId);
    // Semifinalistas: 2 diretos + 2 vencedores das quartas, semeados por
    // campanha (menor seed = melhor). Cruzamento padrão 1×4, 2×3.
    const four = [...ko.direct, ...winners].sort((a, b) => ko.seedOf[a] - ko.seedOf[b]);
    ko.semis = [
      makeTwoLegTie("sf0", bySeed(four[0], four[3], ko.seedOf), MATOGROSSENSE_SEMI_LEG1_ROUND, MATOGROSSENSE_SEMI_LEG2_ROUND),
      makeTwoLegTie("sf1", bySeed(four[1], four[2], ko.seedOf), MATOGROSSENSE_SEMI_LEG1_ROUND, MATOGROSSENSE_SEMI_LEG2_ROUND),
    ];
    ko.phase = "semis";
    return true;
  }
  if (ko.phase === "semis") {
    if (!ko.semis.every(t => t.winnerId)) return false;
    const [a, b] = ko.semis.map(t => t.winnerId);
    ko.final = makeTwoLegTie("final", bySeed(a, b, ko.seedOf), MATOGROSSENSE_FINAL_LEG1_ROUND, MATOGROSSENSE_FINAL_LEG2_ROUND);
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

export function applyMatogrossenseKnockoutResult(ko, leg, rng) {
  // jogo único: quartas
  const qf = ko.quarters.find(t => t.leg?.id === leg.id);
  if (qf) {
    const { home, away } = leg.score;
    if (home > away) qf.winnerId = leg.homeTeamId;
    else if (away > home) qf.winnerId = leg.awayTeamId;
    else qf.winnerId = rng.chance(0.5) ? leg.homeTeamId : leg.awayTeamId; // pênaltis
    return;
  }
  // ida e volta: semis ou final
  const tie = ko.semis.find(t => t.legs?.some(l => l.id === leg.id))
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

export function getMatogrossenseKnockoutLegs(ko, round) {
  const out = [];
  if (round === MATOGROSSENSE_QUARTERS_ROUND) {
    for (const t of ko.quarters) if (t.leg && !t.leg.played) out.push({ leg: t.leg, tie: t, kind: "qf" });
  } else if (round === MATOGROSSENSE_SEMI_LEG1_ROUND || round === MATOGROSSENSE_SEMI_LEG2_ROUND) {
    for (const t of ko.semis) for (const l of t.legs) if (!l.played && l.round === round) out.push({ leg: l, tie: t, kind: "sf" });
  } else if (ko.final && (round === MATOGROSSENSE_FINAL_LEG1_ROUND || round === MATOGROSSENSE_FINAL_LEG2_ROUND)) {
    for (const l of ko.final.legs) if (!l.played && l.round === round) out.push({ leg: l, tie: ko.final, kind: "final" });
  }
  return out;
}

// ==================== helpers internos ====================

function bySeed(a, b, seedOf) {
  return seedOf[a] <= seedOf[b] ? [a, b] : [b, a];
}

// Jogo único: melhor campanha (homeId) joga em casa.
function makeSingleTie(tag, homeId, awayId, round) {
  return { id: `matogrossense_${tag}`, teamAId: homeId, teamBId: awayId, leg: makeKoLeg(tag, homeId, awayId, round), winnerId: null };
}

function makeTwoLegTie(tag, [bestId, otherId], r1, r2) {
  return {
    id: `matogrossense_${tag}`,
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
  return { id: `m_matogrossense_${tag}`, round, homeTeamId: homeId, awayTeamId: awayId, played: false, score: null, events: [], date: null };
}
