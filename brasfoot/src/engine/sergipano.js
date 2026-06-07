// Campeonato Sergipano — liga curta + repescagem de acesso às semis (mesmo
// arquétipo do Pernambucano/Potiguar, com 10 clubes e só 1 vaga direta).
//
// 1ª FASE: 10 clubes, pontos corridos turno único → 9 rodadas, 45 jogos.
//          1º vai DIRETO à semifinal.
// REPESCAGEM: 2º a 7º disputam ida/volta por mais 3 vagas (2º×7º, 3º×6º, 4º×5º).
// SEMIS e FINAL: ida e volta. Melhor campanha manda na volta; pênaltis no
//          empate do agregado.
//
// Calendário: 1ª fase 1..9 · repescagem 10/11 · semis 12/13 · final 14/15.

import { sortStandings } from "./season.js";
import { createCompetition } from "../models/competition.js";

export const SERGIPANO_PHASE1_ROUNDS = 9;
export const SERGIPANO_PLAYOFF_LEG1_ROUND = 10;
export const SERGIPANO_PLAYOFF_LEG2_ROUND = 11;
export const SERGIPANO_SEMI_LEG1_ROUND = 12;
export const SERGIPANO_SEMI_LEG2_ROUND = 13;
export const SERGIPANO_FINAL_LEG1_ROUND = 14;
export const SERGIPANO_FINAL_LEG2_ROUND = 15;
export const SERGIPANO_TOTAL_ROUNDS = 15;
export const SERGIPANO_CHAMPION_PRIZE = 3_500_000;

export const SERGIPANO_TEAM_IDS = [
  "conf", "sgp", "ita", "lgt", "flc", "ase", "gpf", "dor", "agl", "dac",
];

// ==================== 1ª fase (pontos corridos, turno único) ====================

export function createSergipanoPhase1({ season, teamIds = SERGIPANO_TEAM_IDS } = {}) {
  if (teamIds.length !== 10) throw new Error("Sergipano exige exatamente 10 times.");
  const comp = createCompetition({
    id: "estadual_se",
    name: "Campeonato Sergipano · 1ª Fase",
    tier: 0,
    season,
    teamIds,
    legs: 1,                 // turno único → 9 rodadas
    rules: { pointsWin: 3, pointsDraw: 1, format: "sergipano_league" },
  });
  comp.champion = null;
  return comp;
}

export function getSergipanoStandings(phase1, teams) {
  return sortStandings(phase1, teams);
}

// Os 7 primeiros (1º direto; 2º-7º para a repescagem).
export function getSergipanoQualified(phase1, teams) {
  return getSergipanoStandings(phase1, teams).slice(0, 7).map(s => s.teamId);
}

// ==================== Mata-mata (repescagem → semis → final) ====================

// qualified = [1º..7º]. 1º direto; repescagem 2º×7º, 3º×6º e 4º×5º.
export function createSergipanoKnockout(qualified) {
  const seedOf = {};
  qualified.forEach((id, i) => { seedOf[id] = i; });

  const R1 = SERGIPANO_PLAYOFF_LEG1_ROUND, R2 = SERGIPANO_PLAYOFF_LEG2_ROUND;
  const playoffs = [
    makeTwoLegTie("po0", bySeed(qualified[1], qualified[6], seedOf), R1, R2), // 2º×7º
    makeTwoLegTie("po1", bySeed(qualified[2], qualified[5], seedOf), R1, R2), // 3º×6º
    makeTwoLegTie("po2", bySeed(qualified[3], qualified[4], seedOf), R1, R2), // 4º×5º
  ];

  return {
    seedOf,
    phase: "playoffs",
    direct: [qualified[0]],
    playoffs,
    semis: [],
    final: null,
    champion: null,
  };
}

export function advanceSergipanoKnockout(ko) {
  if (ko.phase === "playoffs") {
    if (!ko.playoffs.every(t => t.winnerId)) return false;
    const winners = ko.playoffs.map(t => t.winnerId);
    // Semifinalistas: 1 direto + 3 vencedores da repescagem, semeados por
    // campanha (menor seed = melhor). Cruzamento padrão 1×4, 2×3.
    const four = [...ko.direct, ...winners].sort((a, b) => ko.seedOf[a] - ko.seedOf[b]);
    ko.semis = [
      makeTwoLegTie("sf0", bySeed(four[0], four[3], ko.seedOf), SERGIPANO_SEMI_LEG1_ROUND, SERGIPANO_SEMI_LEG2_ROUND),
      makeTwoLegTie("sf1", bySeed(four[1], four[2], ko.seedOf), SERGIPANO_SEMI_LEG1_ROUND, SERGIPANO_SEMI_LEG2_ROUND),
    ];
    ko.phase = "semis";
    return true;
  }
  if (ko.phase === "semis") {
    if (!ko.semis.every(t => t.winnerId)) return false;
    const [a, b] = ko.semis.map(t => t.winnerId);
    ko.final = makeTwoLegTie("final", bySeed(a, b, ko.seedOf), SERGIPANO_FINAL_LEG1_ROUND, SERGIPANO_FINAL_LEG2_ROUND);
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

export function applySergipanoKnockoutResult(ko, leg, rng) {
  const tie = ko.playoffs.find(t => t.legs?.some(l => l.id === leg.id))
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

export function getSergipanoKnockoutLegs(ko, round) {
  const out = [];
  const collect = (ties, kind) => {
    for (const t of ties) for (const l of t.legs) if (!l.played && l.round === round) out.push({ leg: l, tie: t, kind });
  };
  if (round === SERGIPANO_PLAYOFF_LEG1_ROUND || round === SERGIPANO_PLAYOFF_LEG2_ROUND) collect(ko.playoffs, "po");
  else if (round === SERGIPANO_SEMI_LEG1_ROUND || round === SERGIPANO_SEMI_LEG2_ROUND) collect(ko.semis, "sf");
  else if (ko.final && (round === SERGIPANO_FINAL_LEG1_ROUND || round === SERGIPANO_FINAL_LEG2_ROUND)) collect([ko.final], "final");
  return out;
}

// ==================== helpers internos ====================

function bySeed(a, b, seedOf) {
  return seedOf[a] <= seedOf[b] ? [a, b] : [b, a];
}

function makeTwoLegTie(tag, [bestId, otherId], r1, r2) {
  return {
    id: `sergipano_${tag}`,
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
  return { id: `m_sergipano_${tag}`, round, homeTeamId: homeId, awayTeamId: awayId, played: false, score: null, events: [], date: null };
}
