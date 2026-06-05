// Campeonato Acreano — liga curta + semis ida/volta (com vantagem do empate
// para a melhor campanha) + final em jogo único.
//
// 1ª FASE: 8 clubes, pontos corridos turno único → 7 rodadas, 28 jogos.
//          Top 4 ao mata-mata.
// SEMIS: cruzamento olímpico 1×4 e 2×3, ida e volta. No agregado EMPATADO,
//        avança quem fez melhor campanha (sem pênaltis — "vantagem do empate").
// FINAL: jogo único; empate no tempo normal → pênaltis.
// (Disputa de 3º lugar pela vaga na Copa do Brasil: não modelada — sem efeito
//  nacional ainda, como as demais consolações.)

import { sortStandings } from "./season.js";
import { createCompetition } from "../models/competition.js";

export const ACREANO_PHASE1_ROUNDS = 7;
export const ACREANO_SEMI_LEG1_ROUND = 8;
export const ACREANO_SEMI_LEG2_ROUND = 9;
export const ACREANO_FINAL_ROUND = 10;     // jogo único
export const ACREANO_TOTAL_ROUNDS = 10;
export const ACREANO_CHAMPION_PRIZE = 3_000_000;

// Os 8 oficiais (todos figurantes — nenhum nas divisões nacionais).
export const ACREANO_TEAM_IDS = [
  "rba", "gav", "hum", "idp", "scz", "vac", "adg", "sfa",
];

// ==================== 1ª fase (pontos corridos, turno único) ====================

export function createAcreanoPhase1({ season, teamIds = ACREANO_TEAM_IDS } = {}) {
  if (teamIds.length !== 8) throw new Error("Acreano exige exatamente 8 times.");
  const comp = createCompetition({
    id: "estadual_ac",
    name: "Campeonato Acreano · 1ª Fase",
    tier: 0,
    season,
    teamIds,
    legs: 1,                 // turno único → 7 rodadas
    rules: { pointsWin: 3, pointsDraw: 1, format: "acreano_league" },
  });
  comp.champion = null;
  return comp;
}

export function getAcreanoStandings(phase1, teams) {
  return sortStandings(phase1, teams);
}

// Top 4 da tabela (seeds 0..3).
export function getAcreanoQualified(phase1, teams) {
  return getAcreanoStandings(phase1, teams).slice(0, 4).map(s => s.teamId);
}

// ==================== Mata-mata (semis ida/volta + final jogo único) ====================

// semifinalists = [1º, 2º, 3º, 4º]. Cruzamento olímpico: 1×4 e 2×3.
export function createAcreanoKnockout(semifinalists) {
  const seedOf = {};
  semifinalists.forEach((id, i) => { seedOf[id] = i; });
  const semis = [
    makeTwoLegTie("sf0", bySeed(semifinalists[0], semifinalists[3], seedOf), ACREANO_SEMI_LEG1_ROUND, ACREANO_SEMI_LEG2_ROUND), // 1×4
    makeTwoLegTie("sf1", bySeed(semifinalists[1], semifinalists[2], seedOf), ACREANO_SEMI_LEG1_ROUND, ACREANO_SEMI_LEG2_ROUND), // 2×3
  ];
  return { seedOf, phase: "semis", semis, final: null, champion: null };
}

export function advanceAcreanoKnockout(ko) {
  if (ko.phase === "semis") {
    if (!ko.semis.every(t => t.winnerId)) return false;
    const [a, b] = ko.semis.map(t => t.winnerId);
    // Final em jogo único; manda quem tem melhor campanha (menor seed).
    const [home, away] = ko.seedOf[a] <= ko.seedOf[b] ? [a, b] : [b, a];
    ko.final = makeSingleTie("final", [home, away], ACREANO_FINAL_ROUND);
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

export function applyAcreanoKnockoutResult(ko, leg, rng) {
  // Semis: ida e volta. Agregado empatado → VANTAGEM do melhor (teamA), sem pênaltis.
  const semi = ko.semis.find(t => t.legs?.some(l => l.id === leg.id));
  if (semi) {
    const [l1, l2] = semi.legs;
    if (!l1.played || !l2.played) return;
    const aTotal = l1.score.away + l2.score.home; // teamA (melhor) manda na volta
    const bTotal = l1.score.home + l2.score.away;
    if (aTotal >= bTotal) semi.winnerId = semi.teamAId; // empate → melhor campanha avança
    else semi.winnerId = semi.teamBId;
    semi.aggregate = { teamA: aTotal, teamB: bTotal };
    return;
  }
  // Final: jogo único. Empate → pênaltis.
  if (ko.final?.leg?.id === leg.id) {
    const { home, away } = leg.score;
    if (home > away) ko.final.winnerId = leg.homeTeamId;
    else if (away > home) ko.final.winnerId = leg.awayTeamId;
    else ko.final.winnerId = rng.chance(0.5) ? leg.homeTeamId : leg.awayTeamId; // pênaltis
  }
}

export function getAcreanoKnockoutLegs(ko, round) {
  const out = [];
  if (round === ACREANO_SEMI_LEG1_ROUND || round === ACREANO_SEMI_LEG2_ROUND) {
    for (const t of ko.semis) for (const l of t.legs) if (!l.played && l.round === round) out.push({ leg: l, tie: t, kind: "sf" });
  } else if (ko.final && round === ACREANO_FINAL_ROUND) {
    if (!ko.final.leg.played) out.push({ leg: ko.final.leg, tie: ko.final, kind: "final" });
  }
  return out;
}

// ==================== helpers internos ====================

function bySeed(a, b, seedOf) {
  return seedOf[a] <= seedOf[b] ? [a, b] : [b, a];
}

// Jogo único: melhor seed (teamA) manda em casa.
function makeSingleTie(tag, [bestId, otherId], round) {
  return {
    id: `acreano_${tag}`,
    teamAId: bestId, teamBId: otherId,
    leg: makeKoLeg(tag, bestId, otherId, round),
    winnerId: null,
  };
}

// Ida e volta: melhor seed (teamA) joga a VOLTA em casa.
function makeTwoLegTie(tag, [bestId, otherId], r1, r2) {
  return {
    id: `acreano_${tag}`,
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
  return { id: `m_acreano_${tag}`, round, homeTeamId: homeId, awayTeamId: awayId, played: false, score: null, events: [], date: null };
}
