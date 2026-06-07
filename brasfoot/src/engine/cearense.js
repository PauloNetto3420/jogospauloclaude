// Campeonato Cearense — o estadual mais elaborado: DUAS fases de grupos
// sequenciais antes do mata-mata.
//
// 1ª FASE: 10 times em 2 grupos de 5 (A e B). Turno único INTRA-grupo
//          (cada um joga só contra os 4 do seu grupo) → 5 rodadas, 20 jogos.
//          Top 3 de cada grupo avançam (6); 2 últimos vão ao quadrangular do
//          rebaixamento (consolação — não modelado, sem efeito nacional ainda).
// 2ª FASE: os 6 viram 2 grupos de 3 (C = top3 do A, D = top3 do B). Jogo único
//          CRUZADO (C×D, 3×3 = 9 jogos, 3 rodadas). Top 2 de cada grupo às
//          semis; últimos disputariam a Taça de 5º lugar (consolação).
// SEMI/FINAL: ida e volta (agregado, melhor campanha manda na volta, pênaltis
//          no empate).
//
// Calendário: 1ª fase 1..5 · 2ª fase 6..8 · semis 9/10 · final 11/12.

import { sortStandings } from "./season.js";

export const CEARENSE_PHASE1_ROUNDS = 5;
export const CEARENSE_PHASE2_ROUND_START = 6;
export const CEARENSE_PHASE2_ROUNDS = 3;       // rodadas 6,7,8
export const CEARENSE_SEMI_LEG1_ROUND = 9;
export const CEARENSE_SEMI_LEG2_ROUND = 10;
export const CEARENSE_FINAL_LEG1_ROUND = 11;
export const CEARENSE_FINAL_LEG2_ROUND = 12;
export const CEARENSE_TOTAL_ROUNDS = 12;
export const CEARENSE_CHAMPION_PRIZE = 3_500_000;

// Os 10 oficiais (Fortaleza/Ceará/Floresta já em A/B/D + 7 figurantes).
export const CEARENSE_TEAM_IDS = [
  "for", "cea", "flo", "fec", "mrc",
  "hor", "qui", "igu", "tir", "mgp",
];
const CEARENSE_BIG = ["for", "cea"];

// ==================== 1ª FASE (2 grupos de 5, intra-grupo) ====================

export function createCearensePhase1({ season, rng, teamIds = CEARENSE_TEAM_IDS } = {}) {
  if (teamIds.length !== 10) throw new Error("Cearense exige exatamente 10 times.");

  const { groupA, groupB } = splitGroups(teamIds, rng);

  // Round-robin intra-grupo (circle method, 5 rodadas) para cada grupo, em
  // paralelo: a rodada r junta os jogos do grupo A e do grupo B.
  const fixtures = [];
  let mid = 0;
  const roundsA = roundRobinRounds(groupA);
  const roundsB = roundRobinRounds(groupB);
  for (let r = 0; r < CEARENSE_PHASE1_ROUNDS; r++) {
    for (const [h, a] of [...(roundsA[r] || []), ...(roundsB[r] || [])]) {
      fixtures.push(makeMatch("estadual_ce", ++mid, r + 1, h, a, season));
    }
  }

  const allIds = [...groupA, ...groupB];
  return {
    id: "estadual_ce",
    name: "Campeonato Cearense · 1ª Fase",
    type: "league",
    tier: 0,
    season,
    teams: allIds,
    groupA, groupB,
    rules: { rounds: 1, pointsWin: 3, pointsDraw: 1, format: "cearense_g1" },
    fixtures,
    standings: allIds.map(emptyStanding),
    topScorers: [],
    champion: null,
  };
}

export function getCearenseGroupStandings(phase1, group /* "A" | "B" */) {
  const ids = new Set(group === "A" ? phase1.groupA : phase1.groupB);
  return sortStandings({ ...phase1, standings: phase1.standings.filter(s => ids.has(s.teamId)) });
}

// Top 3 de cada grupo (classificados) + 2 últimos (rebaixamento).
export function getCearenseQualified(phase1) {
  const a = getCearenseGroupStandings(phase1, "A").map(s => s.teamId);
  const b = getCearenseGroupStandings(phase1, "B").map(s => s.teamId);
  return {
    A: a.slice(0, 3), B: b.slice(0, 3),
    relegated: [...a.slice(3), ...b.slice(3)],
  };
}

// ==================== 2ª FASE (2 grupos de 3, cruzado) ====================

// qualified = { A: [a1,a2,a3], B: [b1,b2,b3] }. Grupo C = classificados do A,
// Grupo D = classificados do B. Eles ainda não se enfrentaram (1ª fase foi
// intra-grupo), então o cruzamento C×D é inédito.
export function createCearensePhase2({ season, qualified }) {
  const groupC = [...qualified.A];
  const groupD = [...qualified.B];

  // Bipartite round-robin K(3,3): rodada r → C[i] x D[(i+r)%3].
  const fixtures = [];
  let mid = 0;
  for (let r = 0; r < CEARENSE_PHASE2_ROUNDS; r++) {
    for (let i = 0; i < 3; i++) {
      const c = groupC[i], d = groupD[(i + r) % 3];
      const home = ((i + r) % 2 === 0) ? c : d;
      const away = home === c ? d : c;
      fixtures.push(makeMatch("estadual_ce_p2", ++mid, CEARENSE_PHASE2_ROUND_START + r, home, away, season));
    }
  }

  const allIds = [...groupC, ...groupD];
  return {
    id: "estadual_ce_p2",
    name: "Campeonato Cearense · 2ª Fase",
    type: "league",
    tier: 0,
    season,
    teams: allIds,
    groupC, groupD,
    rules: { rounds: 1, pointsWin: 3, pointsDraw: 1, format: "cearense_g2" },
    fixtures,
    standings: allIds.map(emptyStanding),
    topScorers: [],
    champion: null,
  };
}

export function getCearensePhase2Standings(phase2, group /* "C" | "D" */) {
  const ids = new Set(group === "C" ? phase2.groupC : phase2.groupD);
  return sortStandings({ ...phase2, standings: phase2.standings.filter(s => ids.has(s.teamId)) });
}

// 2 melhores de cada grupo da 2ª fase.
export function getCearenseSemifinalists(phase2) {
  return {
    C: getCearensePhase2Standings(phase2, "C").slice(0, 2).map(s => s.teamId),
    D: getCearensePhase2Standings(phase2, "D").slice(0, 2).map(s => s.teamId),
  };
}

// ==================== Mata-mata (semis + final, ida/volta) ====================

// semifinalists = { C: [c1,c2], D: [d1,d2] }. Semis cruzam: C1×D2 e D1×C2.
export function createCearenseKnockout(semifinalists) {
  const seedOf = {};
  [semifinalists.C[0], semifinalists.D[0], semifinalists.C[1], semifinalists.D[1]]
    .forEach((id, i) => { seedOf[id] = i; });

  const semis = [
    makeTwoLegTie("sf0", bySeed(semifinalists.C[0], semifinalists.D[1], seedOf), CEARENSE_SEMI_LEG1_ROUND, CEARENSE_SEMI_LEG2_ROUND),
    makeTwoLegTie("sf1", bySeed(semifinalists.D[0], semifinalists.C[1], seedOf), CEARENSE_SEMI_LEG1_ROUND, CEARENSE_SEMI_LEG2_ROUND),
  ];
  return { seedOf, phase: "semis", semis, final: null, champion: null };
}

export function advanceCearenseKnockout(ko) {
  if (ko.phase === "semis") {
    if (!ko.semis.every(t => t.winnerId)) return false;
    const [a, b] = ko.semis.map(t => t.winnerId);
    ko.final = makeTwoLegTie("final", bySeed(a, b, ko.seedOf), CEARENSE_FINAL_LEG1_ROUND, CEARENSE_FINAL_LEG2_ROUND);
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

export function applyCearenseKnockoutResult(ko, leg, rng) {
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

export function getCearenseKnockoutLegs(ko, round) {
  const out = [];
  if (round === CEARENSE_SEMI_LEG1_ROUND || round === CEARENSE_SEMI_LEG2_ROUND) {
    for (const t of ko.semis) for (const l of t.legs) if (!l.played && l.round === round) out.push({ leg: l, tie: t, kind: "sf" });
  } else if (ko.final && (round === CEARENSE_FINAL_LEG1_ROUND || round === CEARENSE_FINAL_LEG2_ROUND)) {
    for (const l of ko.final.legs) if (!l.played && l.round === round) out.push({ leg: l, tie: ko.final, kind: "final" });
  }
  return out;
}

// ==================== helpers internos ====================

function splitGroups(teamIds, rng) {
  const bigs = shuffle(teamIds.filter(id => CEARENSE_BIG.includes(id)), rng);
  const rest = shuffle(teamIds.filter(id => !CEARENSE_BIG.includes(id)), rng);
  const groupA = [], groupB = [];
  bigs.forEach((id, i) => (i % 2 === 0 ? groupA : groupB).push(id));
  for (const id of rest) {
    if (groupA.length <= groupB.length && groupA.length < 5) groupA.push(id);
    else groupB.push(id);
  }
  while (groupA.length < 5 && groupB.length > 5) groupA.push(groupB.pop());
  while (groupB.length < 5 && groupA.length > 5) groupB.push(groupA.pop());
  return { groupA, groupB };
}

// Round-robin (circle method) de uma lista; devolve array de rodadas, cada
// rodada = lista de pares [home, away]. Trata n ímpar com "bye" (null).
function roundRobinRounds(teamList) {
  const teams = [...teamList];
  if (teams.length % 2 === 1) teams.push(null);
  const n = teams.length;
  const half = n / 2;
  const rounds = [];
  let arr = [...teams];
  for (let r = 0; r < n - 1; r++) {
    const pairs = [];
    for (let i = 0; i < half; i++) {
      let home = arr[i], away = arr[n - 1 - i];
      if (i === 0 && r % 2 === 1) [home, away] = [away, home];
      if (home && away) pairs.push([home, away]);
    }
    rounds.push(pairs);
    arr = [arr[0], arr[n - 1], ...arr.slice(1, n - 1)];
  }
  return rounds;
}

function bySeed(a, b, seedOf) {
  return seedOf[a] <= seedOf[b] ? [a, b] : [b, a];
}

// [bestId, otherId] ordenado por seed. teamA (melhor) joga a VOLTA em casa.
function makeTwoLegTie(tag, [bestId, otherId], r1, r2) {
  return {
    id: `cearense_${tag}`,
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
  return { id: `m_cearense_${tag}`, round, homeTeamId: homeId, awayTeamId: awayId, played: false, score: null, events: [], date: null };
}

function emptyStanding(teamId) {
  return { teamId, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, points: 0 };
}

function makeMatch(compId, idNum, round, homeId, awayId, season) {
  return {
    id: `m_${compId}_${season}_${String(idNum).padStart(4, "0")}`,
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
