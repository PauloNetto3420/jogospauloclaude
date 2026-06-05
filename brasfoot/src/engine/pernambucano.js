// Campeonato Pernambucano — liga curta + playoff de acesso às semis.
//
// 1ª FASE: 8 clubes, pontos corridos turno único → 7 rodadas, 28 jogos.
//          1º e 2º vão DIRETO às semifinais.
// PLAYOFF: 3º a 6º disputam ida/volta por mais 2 vagas (3º×6º e 4º×5º).
// SEMIS e FINAL: ida e volta. Melhor campanha manda na volta; pênaltis no
//          empate do agregado.
//
// Calendário: 1ª fase 1..7 · playoff 8/9 · semis 10/11 · final 12/13.

import { sortStandings } from "./season.js";
import { createCompetition } from "../models/competition.js";

export const PERNAMBUCANO_PHASE1_ROUNDS = 7;
export const PERNAMBUCANO_PLAYOFF_LEG1_ROUND = 8;
export const PERNAMBUCANO_PLAYOFF_LEG2_ROUND = 9;
export const PERNAMBUCANO_SEMI_LEG1_ROUND = 10;
export const PERNAMBUCANO_SEMI_LEG2_ROUND = 11;
export const PERNAMBUCANO_FINAL_LEG1_ROUND = 12;
export const PERNAMBUCANO_FINAL_LEG2_ROUND = 13;
export const PERNAMBUCANO_TOTAL_ROUNDS = 13;
export const PERNAMBUCANO_CHAMPION_PRIZE = 3_500_000;

// Os 8 oficiais (Sport, Náutico e Santa Cruz já em B/C/D + 5 figurantes).
export const PERNAMBUCANO_TEAM_IDS = [
  "spt", "nau", "stc", "ret", "mag", "dec", "jag", "vdt",
];

// ==================== 1ª fase (pontos corridos, turno único) ====================

export function createPernambucanoPhase1({ season, teamIds = PERNAMBUCANO_TEAM_IDS } = {}) {
  if (teamIds.length !== 8) throw new Error("Pernambucano exige exatamente 8 times.");
  const comp = createCompetition({
    id: "estadual_pe",
    name: "Campeonato Pernambucano · 1ª Fase",
    tier: 0,
    season,
    teamIds,
    legs: 1,                 // turno único → 7 rodadas
    rules: { pointsWin: 3, pointsDraw: 1, format: "pernambucano_league" },
  });
  comp.champion = null;
  return comp;
}

export function getPernambucanoStandings(phase1, teams) {
  return sortStandings(phase1, teams);
}

// Os 6 primeiros (1º-2º diretos; 3º-6º para o playoff).
export function getPernambucanoQualified(phase1, teams) {
  return getPernambucanoStandings(phase1, teams).slice(0, 6).map(s => s.teamId);
}

// ==================== Mata-mata (playoff → semis → final) ====================

// qualified = [1º..6º]. 1º/2º diretos; playoff 3º×6º e 4º×5º.
export function createPernambucanoKnockout(qualified) {
  const seedOf = {};
  qualified.forEach((id, i) => { seedOf[id] = i; });

  const R1 = PERNAMBUCANO_PLAYOFF_LEG1_ROUND, R2 = PERNAMBUCANO_PLAYOFF_LEG2_ROUND;
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

export function advancePernambucanoKnockout(ko) {
  if (ko.phase === "playoffs") {
    if (!ko.playoffs.every(t => t.winnerId)) return false;
    const winners = ko.playoffs.map(t => t.winnerId);
    // Semifinalistas: 2 diretos + 2 vencedores do playoff, semeados por
    // campanha (menor seed = melhor). Cruzamento padrão 1×4, 2×3.
    const four = [...ko.direct, ...winners].sort((a, b) => ko.seedOf[a] - ko.seedOf[b]);
    ko.semis = [
      makeTwoLegTie("sf0", bySeed(four[0], four[3], ko.seedOf), PERNAMBUCANO_SEMI_LEG1_ROUND, PERNAMBUCANO_SEMI_LEG2_ROUND),
      makeTwoLegTie("sf1", bySeed(four[1], four[2], ko.seedOf), PERNAMBUCANO_SEMI_LEG1_ROUND, PERNAMBUCANO_SEMI_LEG2_ROUND),
    ];
    ko.phase = "semis";
    return true;
  }
  if (ko.phase === "semis") {
    if (!ko.semis.every(t => t.winnerId)) return false;
    const [a, b] = ko.semis.map(t => t.winnerId);
    ko.final = makeTwoLegTie("final", bySeed(a, b, ko.seedOf), PERNAMBUCANO_FINAL_LEG1_ROUND, PERNAMBUCANO_FINAL_LEG2_ROUND);
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

export function applyPernambucanoKnockoutResult(ko, leg, rng) {
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

export function getPernambucanoKnockoutLegs(ko, round) {
  const out = [];
  const collect = (ties, kind) => {
    for (const t of ties) for (const l of t.legs) if (!l.played && l.round === round) out.push({ leg: l, tie: t, kind });
  };
  if (round === PERNAMBUCANO_PLAYOFF_LEG1_ROUND || round === PERNAMBUCANO_PLAYOFF_LEG2_ROUND) collect(ko.playoffs, "po");
  else if (round === PERNAMBUCANO_SEMI_LEG1_ROUND || round === PERNAMBUCANO_SEMI_LEG2_ROUND) collect(ko.semis, "sf");
  else if (ko.final && (round === PERNAMBUCANO_FINAL_LEG1_ROUND || round === PERNAMBUCANO_FINAL_LEG2_ROUND)) collect([ko.final], "final");
  return out;
}

// ==================== helpers internos ====================

function bySeed(a, b, seedOf) {
  return seedOf[a] <= seedOf[b] ? [a, b] : [b, a];
}

// [bestId, otherId] ordenado por seed. teamA (melhor) joga a VOLTA em casa.
function makeTwoLegTie(tag, [bestId, otherId], r1, r2) {
  return {
    id: `pernambucano_${tag}`,
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
  return { id: `m_pernambucano_${tag}`, round, homeTeamId: homeId, awayTeamId: awayId, played: false, score: null, events: [], date: null };
}
