// Campeonato Baiano — o primeiro estadual SEM grupos.
//
// 1ª FASE: pontos corridos em turno único. 10 times, todos contra todos →
//          9 rodadas, 45 jogos. Tabela única; os 4 primeiros avançam.
// MATA-MATA: semifinais e final em JOGO ÚNICO. O mando é sempre da equipe de
//            melhor campanha geral (seed). Empate no tempo normal → pênaltis.

import { sortStandings } from "./season.js";
import { createCompetition } from "../models/competition.js";

export const BAIANO_PHASE1_ROUNDS = 9;   // turno único de 10 times
export const BAIANO_SEMI_ROUND = 10;     // semis (jogo único)
export const BAIANO_FINAL_ROUND = 11;    // final (jogo único)
export const BAIANO_TOTAL_ROUNDS = 11;
export const BAIANO_CHAMPION_PRIZE = 3_500_000;

// Os 10 oficiais (Bahia e Vitória já estão em A/B; os outros 8 na Série D).
export const BAIANO_TEAM_IDS = [
  "bah", "vit", "ala", "bfe", "bci",
  "gal", "jac", "jeq", "jza", "psc",
];

// -------------------- 1ª fase (pontos corridos, turno único) --------------------

export function createBaianoPhase1({ season, teamIds = BAIANO_TEAM_IDS } = {}) {
  if (teamIds.length !== 10) throw new Error("Baiano exige exatamente 10 times.");
  const comp = createCompetition({
    id: "estadual_ba",
    name: "Campeonato Baiano · 1ª Fase",
    tier: 0,
    season,
    teamIds,
    legs: 1,                 // turno único → 9 rodadas
    rules: { pointsWin: 3, pointsDraw: 1, format: "baiano_league" },
  });
  comp.champion = null;
  return comp;
}

// Tabela classificatória (geral). teams é opcional (desempate por nome).
export function getBaianoStandings(phase1, teams) {
  return sortStandings(phase1, teams);
}

// Os 4 primeiros da tabela geral (seeds 0..3).
export function getBaianoQualified(phase1, teams) {
  return getBaianoStandings(phase1, teams).slice(0, 4).map(s => s.teamId);
}

// -------------------- Mata-mata (semis + final, jogo único) --------------------

// qualified = [1º, 2º, 3º, 4º] da campanha geral.
export function createBaianoKnockout(qualified) {
  const seedOf = {};
  qualified.forEach((id, i) => { seedOf[id] = i; });
  // Mando do melhor: 1º recebe o 4º, 2º recebe o 3º.
  const semis = [
    makeSingleTie("sf0", qualified[0], qualified[3], BAIANO_SEMI_ROUND), // 1×4
    makeSingleTie("sf1", qualified[1], qualified[2], BAIANO_SEMI_ROUND), // 2×3
  ];
  return { seedOf, phase: "semis", semis, final: null, champion: null };
}

export function advanceBaianoKnockout(ko) {
  if (ko.phase === "semis") {
    if (!ko.semis.every(t => t.winnerId)) return false;
    const [w0, w1] = ko.semis.map(t => t.winnerId);
    // Final em jogo único; manda quem tem melhor campanha (menor seed).
    const [home, away] = ko.seedOf[w0] <= ko.seedOf[w1] ? [w0, w1] : [w1, w0];
    ko.final = makeSingleTie("final", home, away, BAIANO_FINAL_ROUND);
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

export function applyBaianoKnockoutResult(ko, leg, rng) {
  const tie = ko.semis.find(t => t.leg?.id === leg.id)
           || (ko.final?.leg?.id === leg.id ? ko.final : null);
  if (!tie) return;
  const { home, away } = leg.score;
  if (home > away) tie.winnerId = leg.homeTeamId;
  else if (away > home) tie.winnerId = leg.awayTeamId;
  else tie.winnerId = rng.chance(0.5) ? leg.homeTeamId : leg.awayTeamId; // pênaltis
}

export function getBaianoKnockoutLegs(ko, round) {
  const out = [];
  if (round === BAIANO_SEMI_ROUND) {
    for (const t of ko.semis) if (t.leg && !t.leg.played) out.push({ leg: t.leg, tie: t, kind: "sf" });
  } else if (ko.final && round === BAIANO_FINAL_ROUND) {
    if (!ko.final.leg.played) out.push({ leg: ko.final.leg, tie: ko.final, kind: "final" });
  }
  return out;
}

// -------------------- helpers internos --------------------

function makeSingleTie(tag, homeId, awayId, round) {
  return {
    id: `baiano_${tag}`,
    teamAId: homeId,   // melhor campanha (manda)
    teamBId: awayId,
    leg: makeKoLeg(tag, homeId, awayId, round),
    winnerId: null,
  };
}

function makeKoLeg(tag, homeId, awayId, round) {
  return { id: `m_baiano_${tag}`, round, homeTeamId: homeId, awayTeamId: awayId, played: false, score: null, events: [], date: null };
}
