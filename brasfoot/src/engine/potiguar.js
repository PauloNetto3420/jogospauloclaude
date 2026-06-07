// Campeonato Potiguar — liga curta + repescagem de acesso às semis (mesmo
// arquétipo do Pernambucano).
//
// 1ª FASE: 8 clubes, pontos corridos turno único → 7 rodadas, 28 jogos.
//          1º e 2º vão DIRETO às semifinais.
// REPESCAGEM: 3º a 6º disputam ida/volta por mais 2 vagas (3º×6º e 4º×5º).
// SEMIS e FINAL: ida e volta. Melhor campanha manda na volta; pênaltis no
//          empate do agregado.
//
// Calendário: 1ª fase 1..7 · repescagem 8/9 · semis 10/11 · final 12/13.

import { sortStandings } from "./season.js";
import { createCompetition } from "../models/competition.js";

export const POTIGUAR_PHASE1_ROUNDS = 7;
export const POTIGUAR_PLAYOFF_LEG1_ROUND = 8;
export const POTIGUAR_PLAYOFF_LEG2_ROUND = 9;
export const POTIGUAR_SEMI_LEG1_ROUND = 10;
export const POTIGUAR_SEMI_LEG2_ROUND = 11;
export const POTIGUAR_FINAL_LEG1_ROUND = 12;
export const POTIGUAR_FINAL_LEG2_ROUND = 13;
export const POTIGUAR_TOTAL_ROUNDS = 13;
export const POTIGUAR_CHAMPION_PRIZE = 3_500_000;

export const POTIGUAR_TEAM_IDS = [
  "abc", "arn", "glb", "lag", "ptm", "psd", "qfc", "scn",
];

// ==================== 1ª fase (pontos corridos, turno único) ====================

export function createPotiguarPhase1({ season, teamIds = POTIGUAR_TEAM_IDS } = {}) {
  if (teamIds.length !== 8) throw new Error("Potiguar exige exatamente 8 times.");
  const comp = createCompetition({
    id: "estadual_rn",
    name: "Campeonato Potiguar · 1ª Fase",
    tier: 0,
    season,
    teamIds,
    legs: 1,                 // turno único → 7 rodadas
    rules: { pointsWin: 3, pointsDraw: 1, format: "potiguar_league" },
  });
  comp.champion = null;
  return comp;
}

export function getPotiguarStandings(phase1, teams) {
  return sortStandings(phase1, teams);
}

// Os 6 primeiros (1º-2º diretos; 3º-6º para a repescagem).
export function getPotiguarQualified(phase1, teams) {
  return getPotiguarStandings(phase1, teams).slice(0, 6).map(s => s.teamId);
}

// ==================== Mata-mata (repescagem → semis → final) ====================

// qualified = [1º..6º]. 1º/2º diretos; repescagem 3º×6º e 4º×5º.
export function createPotiguarKnockout(qualified) {
  const seedOf = {};
  qualified.forEach((id, i) => { seedOf[id] = i; });

  const R1 = POTIGUAR_PLAYOFF_LEG1_ROUND, R2 = POTIGUAR_PLAYOFF_LEG2_ROUND;
  const playoffs = [
    makeTwoLegTie("po0", bySeed(qualified[2], qualified[5], seedOf), R1, R2), // 3º×6º
    makeTwoLegTie("po1", bySeed(qualified[3], qualified[4], seedOf), R1, R2), // 4º×5º
  ];

  return {
    seedOf,
    phase: "playoffs",
    direct: [qualified[0], qualified[1]],
    playoffs,
    semis: [],
    final: null,
    champion: null,
  };
}

export function advancePotiguarKnockout(ko) {
  if (ko.phase === "playoffs") {
    if (!ko.playoffs.every(t => t.winnerId)) return false;
    const winners = ko.playoffs.map(t => t.winnerId);
    // Semifinalistas: 2 diretos + 2 vencedores da repescagem, semeados por
    // campanha (menor seed = melhor). Cruzamento padrão 1×4, 2×3.
    const four = [...ko.direct, ...winners].sort((a, b) => ko.seedOf[a] - ko.seedOf[b]);
    ko.semis = [
      makeTwoLegTie("sf0", bySeed(four[0], four[3], ko.seedOf), POTIGUAR_SEMI_LEG1_ROUND, POTIGUAR_SEMI_LEG2_ROUND),
      makeTwoLegTie("sf1", bySeed(four[1], four[2], ko.seedOf), POTIGUAR_SEMI_LEG1_ROUND, POTIGUAR_SEMI_LEG2_ROUND),
    ];
    ko.phase = "semis";
    return true;
  }
  if (ko.phase === "semis") {
    if (!ko.semis.every(t => t.winnerId)) return false;
    const [a, b] = ko.semis.map(t => t.winnerId);
    ko.final = makeTwoLegTie("final", bySeed(a, b, ko.seedOf), POTIGUAR_FINAL_LEG1_ROUND, POTIGUAR_FINAL_LEG2_ROUND);
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

export function applyPotiguarKnockoutResult(ko, leg, rng) {
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

export function getPotiguarKnockoutLegs(ko, round) {
  const out = [];
  const collect = (ties, kind) => {
    for (const t of ties) for (const l of t.legs) if (!l.played && l.round === round) out.push({ leg: l, tie: t, kind });
  };
  if (round === POTIGUAR_PLAYOFF_LEG1_ROUND || round === POTIGUAR_PLAYOFF_LEG2_ROUND) collect(ko.playoffs, "po");
  else if (round === POTIGUAR_SEMI_LEG1_ROUND || round === POTIGUAR_SEMI_LEG2_ROUND) collect(ko.semis, "sf");
  else if (ko.final && (round === POTIGUAR_FINAL_LEG1_ROUND || round === POTIGUAR_FINAL_LEG2_ROUND)) collect([ko.final], "final");
  return out;
}

// ==================== helpers internos ====================

function bySeed(a, b, seedOf) {
  return seedOf[a] <= seedOf[b] ? [a, b] : [b, a];
}

function makeTwoLegTie(tag, [bestId, otherId], r1, r2) {
  return {
    id: `potiguar_${tag}`,
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
  return { id: `m_potiguar_${tag}`, round, homeTeamId: homeId, awayTeamId: awayId, played: false, score: null, events: [], date: null };
}
