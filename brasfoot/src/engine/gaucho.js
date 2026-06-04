// Campeonato Gaúcho — 2 grupos de 6 cruzados (igual à 1ª fase do Carioca),
// mata-mata com quartas (jogo único) → semis (ida/volta) → FINAL (ida/volta).
//
// Diferença pro Carioca: aqui a FINAL é ida e volta (no Carioca é jogo único).
//
// FASE DE GRUPOS: 12 times em 2 grupos de 6. Cada time joga só contra os 6 do
// OUTRO grupo (turno único) → 6 rodadas, 36 jogos. Top 4 de cada grupo avançam.
// MATA-MATA: quartas intra-grupo (1×4, 2×3, jogo único, mando do melhor);
// semis e final ida e volta (agregado, melhor campanha manda na volta).

import { sortStandings } from "./season.js";

export const GAUCHO_GROUP_ROUNDS = 6;

// Os 12 oficiais (5 reais + 7 da Série D). Os 4 "grandes" (Gre, Int, Juv, Cax)
// distribuídos 2-em-cada-grupo.
export const GAUCHO_TEAM_IDS = [
  "gre", "int", "juv", "cax", "ypi", "sjo",
  "slz", "gby", "ave", "nha", "mon", "ism",
];
const GAUCHO_BIG = ["gre", "int", "juv", "cax"];

// Rodadas do mata-mata: quartas 7 · semis ida 8/volta 9 · final ida 10/volta 11
export const GAUCHO_QUARTERS_ROUND = 7;
export const GAUCHO_SEMI_LEG1_ROUND = 8;
export const GAUCHO_SEMI_LEG2_ROUND = 9;
export const GAUCHO_FINAL_LEG1_ROUND = 10;
export const GAUCHO_FINAL_LEG2_ROUND = 11;
export const GAUCHO_TOTAL_ROUNDS = 11;
export const GAUCHO_CHAMPION_PRIZE = 4_000_000;

// -------------------- 1ª fase (grupos cruzados) --------------------

export function createGauchoPhase1({ season, rng, teamIds = GAUCHO_TEAM_IDS } = {}) {
  if (teamIds.length !== 12) throw new Error("Gaúcho exige exatamente 12 times.");

  const { groupA, groupB } = splitGroups(teamIds, rng);

  // Agendamento bipartido circular (A fixo, B rotacionado): 6 rodadas, 36 jogos.
  const fixtures = [];
  let mid = 0;
  for (let r = 0; r < GAUCHO_GROUP_ROUNDS; r++) {
    for (let i = 0; i < 6; i++) {
      const a = groupA[i];
      const b = groupB[(i + r) % 6];
      const home = ((i + r) % 2 === 0) ? a : b;
      const away = home === a ? b : a;
      fixtures.push(makeMatch(++mid, r + 1, home, away, season));
    }
  }

  const allIds = [...groupA, ...groupB];
  return {
    id: "estadual_rs",
    name: "Campeonato Gaúcho · 1ª Fase",
    type: "league",
    tier: 0,
    season,
    teams: allIds,
    groupA, groupB,
    rules: { rounds: 1, pointsWin: 3, pointsDraw: 1, format: "gaucho_groups" },
    fixtures,
    standings: allIds.map(emptyStanding),
    topScorers: [],
    champion: null,
  };
}

export function getGauchoGroupStandings(phase1, group /* "A" | "B" */) {
  const ids = new Set(group === "A" ? phase1.groupA : phase1.groupB);
  return sortStandings({ ...phase1, standings: phase1.standings.filter(s => ids.has(s.teamId)) });
}

export function getGauchoQualified(phase1) {
  return {
    A: getGauchoGroupStandings(phase1, "A").slice(0, 4).map(s => s.teamId),
    B: getGauchoGroupStandings(phase1, "B").slice(0, 4).map(s => s.teamId),
  };
}

// -------------------- Mata-mata --------------------

// qualified = { A: [1º,2º,3º,4º], B: [...] }.
export function createGauchoKnockout(qualified) {
  const seedOf = {};
  qualified.A.forEach((id, i) => { seedOf[id] = i; });
  qualified.B.forEach((id, i) => { seedOf[id] = 4 + i; });

  const quarters = [
    makeSingleTie("qfA1", qualified.A[0], qualified.A[3], GAUCHO_QUARTERS_ROUND), // 1A×4A
    makeSingleTie("qfA2", qualified.A[1], qualified.A[2], GAUCHO_QUARTERS_ROUND), // 2A×3A
    makeSingleTie("qfB1", qualified.B[0], qualified.B[3], GAUCHO_QUARTERS_ROUND), // 1B×4B
    makeSingleTie("qfB2", qualified.B[1], qualified.B[2], GAUCHO_QUARTERS_ROUND), // 2B×3B
  ];

  return { seedOf, phase: "quarters", quarters, semis: [], final: null, champion: null };
}

export function advanceGauchoKnockout(ko) {
  if (ko.phase === "quarters") {
    if (!ko.quarters.every(t => t.winnerId)) return false;
    const w = ko.quarters.map(t => t.winnerId);
    // Semis (ida/volta): cruza vencedores. qfA1×qfB2, qfB1×qfA2.
    ko.semis = [
      makeTwoLegTie("sf0", bySeed(w[0], w[3], ko.seedOf), GAUCHO_SEMI_LEG1_ROUND, GAUCHO_SEMI_LEG2_ROUND),
      makeTwoLegTie("sf1", bySeed(w[2], w[1], ko.seedOf), GAUCHO_SEMI_LEG1_ROUND, GAUCHO_SEMI_LEG2_ROUND),
    ];
    ko.phase = "semis";
    return true;
  }
  if (ko.phase === "semis") {
    if (!ko.semis.every(t => t.winnerId)) return false;
    const [a, b] = ko.semis.map(t => t.winnerId);
    // FINAL ida e volta (diferença pro Carioca).
    ko.final = makeTwoLegTie("final", bySeed(a, b, ko.seedOf), GAUCHO_FINAL_LEG1_ROUND, GAUCHO_FINAL_LEG2_ROUND);
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

export function applyGauchoKnockoutResult(ko, leg, rng) {
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
  if (tie) {
    const [l1, l2] = tie.legs;
    if (!l1.played || !l2.played) return;
    const aTotal = l1.score.away + l2.score.home; // teamA manda na volta
    const bTotal = l1.score.home + l2.score.away;
    if (aTotal > bTotal) tie.winnerId = tie.teamAId;
    else if (bTotal > aTotal) tie.winnerId = tie.teamBId;
    else tie.winnerId = rng.chance(0.5) ? tie.teamAId : tie.teamBId; // prorrogação/pênaltis
    tie.aggregate = { teamA: aTotal, teamB: bTotal };
  }
}

export function getGauchoKnockoutLegs(ko, round) {
  const out = [];
  if (round === GAUCHO_QUARTERS_ROUND) {
    for (const t of ko.quarters) if (t.leg && !t.leg.played) out.push({ leg: t.leg, tie: t, kind: "qf" });
  } else if (round === GAUCHO_SEMI_LEG1_ROUND || round === GAUCHO_SEMI_LEG2_ROUND) {
    for (const t of ko.semis) for (const l of t.legs) if (!l.played && l.round === round) out.push({ leg: l, tie: t, kind: "sf" });
  } else if (ko.final && (round === GAUCHO_FINAL_LEG1_ROUND || round === GAUCHO_FINAL_LEG2_ROUND)) {
    for (const l of ko.final.legs) if (!l.played && l.round === round) out.push({ leg: l, tie: ko.final, kind: "final" });
  }
  return out;
}

// -------------------- helpers internos --------------------

function splitGroups(teamIds, rng) {
  const bigs = shuffle(teamIds.filter(id => GAUCHO_BIG.includes(id)), rng);
  const rest = shuffle(teamIds.filter(id => !GAUCHO_BIG.includes(id)), rng);
  const groupA = [], groupB = [];
  bigs.forEach((id, i) => (i % 2 === 0 ? groupA : groupB).push(id));
  for (const id of rest) {
    if (groupA.length <= groupB.length && groupA.length < 6) groupA.push(id);
    else groupB.push(id);
  }
  while (groupA.length < 6 && groupB.length > 6) groupA.push(groupB.pop());
  while (groupB.length < 6 && groupA.length > 6) groupB.push(groupA.pop());
  return { groupA, groupB };
}

function bySeed(a, b, seedOf) {
  return seedOf[a] <= seedOf[b] ? [a, b] : [b, a];
}

function makeSingleTie(tag, homeId, awayId, round) {
  return { id: `gaucho_${tag}`, teamAId: homeId, teamBId: awayId, leg: makeKoLeg(tag, homeId, awayId, round), winnerId: null };
}

// [bestId, otherId] ordenado por seed. teamA (melhor) joga a VOLTA em casa.
function makeTwoLegTie(tag, [bestId, otherId], r1, r2) {
  return {
    id: `gaucho_${tag}`,
    teamAId: bestId, teamBId: otherId,
    legs: [
      makeKoLeg(`${tag}1`, otherId, bestId, r1), // ida na casa do outro
      makeKoLeg(`${tag}2`, bestId, otherId, r2), // volta na casa do melhor
    ],
    aggregate: null,
    winnerId: null,
  };
}

function makeKoLeg(tag, homeId, awayId, round) {
  return { id: `m_gaucho_${tag}`, round, homeTeamId: homeId, awayTeamId: awayId, played: false, score: null, events: [], date: null };
}

function emptyStanding(teamId) {
  return { teamId, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, points: 0 };
}

function makeMatch(idNum, round, homeId, awayId, season) {
  return {
    id: `m_estadual_rs_${season}_${String(idNum).padStart(4, "0")}`,
    round, date: null, homeTeamId: homeId, awayTeamId: awayId,
    played: false, score: null, events: [], attendance: null,
  };
}

function shuffle(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
