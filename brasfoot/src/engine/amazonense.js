// Campeonato Amazonense — o estadual mais elaborado: DOIS turnos completos,
// cada um com fase + mata-mata gerando um campeão de turno, e uma Grande Final.
//
// 8 times em 2 grupos de 4 (fixos nos dois turnos).
// 1º TURNO: cruzado (Grupo A × Grupo B), turno único → 4 rodadas. Top 4 da
//           tabela do turno → semis (1×4, 2×3, jogo único) → final do turno →
//           Campeão do 1º Turno.
// 2º TURNO: intra-grupo (cada grupo joga entre si) → 3 rodadas. Mesmo formato
//           de mata-mata → Campeão do 2º Turno.
// GRANDE FINAL: Campeão do 1º × Campeão do 2º (jogo único, pênaltis no empate).
//           Se o MESMO time vence os dois turnos, é campeão automático.

import { sortStandings } from "./season.js";

export const AMAZONENSE_T1_PHASE_ROUNDS = 4;   // 1..4 (cruzado)
export const AMAZONENSE_T1_SEMI_ROUND = 5;
export const AMAZONENSE_T1_FINAL_ROUND = 6;
export const AMAZONENSE_T2_PHASE_START = 7;    // 7..9 (intra-grupo)
export const AMAZONENSE_T2_PHASE_ROUNDS = 3;
export const AMAZONENSE_T2_SEMI_ROUND = 10;
export const AMAZONENSE_T2_FINAL_ROUND = 11;
export const AMAZONENSE_GRAND_FINAL_ROUND = 12;
export const AMAZONENSE_TOTAL_ROUNDS = 12;
export const AMAZONENSE_CHAMPION_PRIZE = 3_000_000;

export const AMAZONENSE_TEAM_IDS = [
  "amaz", "nac", "mns", "mna", "pso", "par", "sra", "itc",
];
const AMAZONENSE_BIG = ["amaz", "mns", "nac", "sra"]; // 2 por grupo

// ==================== 1º Turno (cruzado) ====================

export function createAmazonenseT1Phase({ season, rng, teamIds = AMAZONENSE_TEAM_IDS } = {}) {
  if (teamIds.length !== 8) throw new Error("Amazonense exige exatamente 8 times.");
  const { groupA, groupB } = splitGroups(teamIds, rng);

  // Bipartite circular K(4,4): rodada r → A[i] x B[(i+r)%4]. 4 rodadas, 16 jogos.
  const fixtures = [];
  let mid = 0;
  for (let r = 0; r < AMAZONENSE_T1_PHASE_ROUNDS; r++) {
    for (let i = 0; i < 4; i++) {
      const a = groupA[i], b = groupB[(i + r) % 4];
      const home = ((i + r) % 2 === 0) ? a : b;
      const away = home === a ? b : a;
      fixtures.push(makeMatch("estadual_am", ++mid, r + 1, home, away, season));
    }
  }

  const allIds = [...groupA, ...groupB];
  return {
    id: "estadual_am",
    name: "Campeonato Amazonense · 1º Turno",
    type: "league", tier: 0, season,
    teams: allIds, groupA, groupB,
    rules: { rounds: 1, pointsWin: 3, pointsDraw: 1, format: "amazonense_t1" },
    fixtures,
    standings: allIds.map(emptyStanding),
    topScorers: [], champion: null,
  };
}

// ==================== 2º Turno (intra-grupo) ====================

export function createAmazonenseT2Phase({ season, t1comp }) {
  const { groupA, groupB } = t1comp;
  const fixtures = [];
  let mid = 0;
  const rA = roundRobinRounds(groupA);
  const rB = roundRobinRounds(groupB);
  for (let r = 0; r < AMAZONENSE_T2_PHASE_ROUNDS; r++) {
    for (const [h, a] of [...(rA[r] || []), ...(rB[r] || [])]) {
      fixtures.push(makeMatch("estadual_am_t2", ++mid, AMAZONENSE_T2_PHASE_START + r, h, a, season));
    }
  }
  const allIds = [...groupA, ...groupB];
  return {
    id: "estadual_am_t2",
    name: "Campeonato Amazonense · 2º Turno",
    type: "league", tier: 0, season,
    teams: allIds, groupA, groupB,
    rules: { rounds: 1, pointsWin: 3, pointsDraw: 1, format: "amazonense_t2" },
    fixtures,
    standings: allIds.map(emptyStanding),
    topScorers: [], champion: null,
  };
}

// Classificação geral de um turno e os 4 classificados ao mata-mata.
export function getAmazonenseStandings(comp, teams) {
  return sortStandings(comp, teams);
}
export function getAmazonenseQualified(comp, teams) {
  return getAmazonenseStandings(comp, teams).slice(0, 4).map(s => s.teamId);
}

// ==================== Mata-mata de turno (KO de 4, jogo único) ====================

// qualified = [1º,2º,3º,4º] do turno. Semis 1×4 e 2×3; final do turno.
export function createTurnoKnockout(qualified, semiRound, finalRound, tag) {
  const seedOf = {};
  qualified.forEach((id, i) => { seedOf[id] = i; });
  return {
    tag, seedOf, semiRound, finalRound, phase: "semis",
    semis: [
      makeSingleTie(`${tag}sf0`, bySeed(qualified[0], qualified[3], seedOf), semiRound),
      makeSingleTie(`${tag}sf1`, bySeed(qualified[1], qualified[2], seedOf), semiRound),
    ],
    final: null, champion: null,
  };
}

export function advanceTurnoKnockout(ko) {
  if (ko.phase === "semis") {
    if (!ko.semis.every(t => t.winnerId)) return false;
    const [a, b] = ko.semis.map(t => t.winnerId);
    ko.final = makeSingleTie(`${ko.tag}final`, bySeed(a, b, ko.seedOf), ko.finalRound);
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

function resolveSingle(tie, leg, rng) {
  const { home, away } = leg.score;
  if (home > away) tie.winnerId = leg.homeTeamId;
  else if (away > home) tie.winnerId = leg.awayTeamId;
  else tie.winnerId = rng.chance(0.5) ? leg.homeTeamId : leg.awayTeamId; // pênaltis
}

// Aplica um resultado a QUALQUER tie do estadual (t1ko, t2ko ou grande final).
export function applyAmazonenseKnockoutResult(estadual, leg, rng) {
  for (const ko of [estadual.t1ko, estadual.t2ko]) {
    if (!ko) continue;
    const tie = ko.semis.find(t => t.leg?.id === leg.id)
             || (ko.final?.leg?.id === leg.id ? ko.final : null);
    if (tie) { resolveSingle(tie, leg, rng); return; }
  }
  if (estadual.grandFinal?.leg?.id === leg.id) resolveSingle(estadual.grandFinal, leg, rng);
}

// Legs de um KO de turno numa rodada.
export function getTurnoKnockoutLegs(ko, round) {
  const out = [];
  if (!ko) return out;
  if (round === ko.semiRound) {
    for (const t of ko.semis) if (t.leg && !t.leg.played) out.push({ leg: t.leg, tie: t, kind: "sf" });
  } else if (ko.final && round === ko.finalRound) {
    if (!ko.final.leg.played) out.push({ leg: ko.final.leg, tie: ko.final, kind: "final" });
  }
  return out;
}

// Cria a grande final (jogo único). teamA = campeão do 1º turno (mando).
export function makeGrandFinal(t1Champion, t2Champion) {
  return makeSingleTie("gf", [t1Champion, t2Champion], AMAZONENSE_GRAND_FINAL_ROUND);
}

// ==================== helpers internos ====================

function splitGroups(teamIds, rng) {
  const bigs = shuffle(teamIds.filter(id => AMAZONENSE_BIG.includes(id)), rng);
  const rest = shuffle(teamIds.filter(id => !AMAZONENSE_BIG.includes(id)), rng);
  const groupA = [], groupB = [];
  bigs.forEach((id, i) => (i % 2 === 0 ? groupA : groupB).push(id));
  for (const id of rest) {
    if (groupA.length <= groupB.length && groupA.length < 4) groupA.push(id);
    else groupB.push(id);
  }
  while (groupA.length < 4 && groupB.length > 4) groupA.push(groupB.pop());
  while (groupB.length < 4 && groupA.length > 4) groupB.push(groupA.pop());
  return { groupA, groupB };
}

// Round-robin (circle method) de uma lista par; rodadas de pares [home, away].
function roundRobinRounds(teamList) {
  const teams = [...teamList];
  if (teams.length % 2 === 1) teams.push(null);
  const n = teams.length, half = n / 2, rounds = [];
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

function makeSingleTie(tag, [bestId, otherId], round) {
  return {
    id: `amazonense_${tag}`,
    teamAId: bestId, teamBId: otherId,
    leg: makeKoLeg(tag, bestId, otherId, round),
    winnerId: null,
  };
}

function makeKoLeg(tag, homeId, awayId, round) {
  return { id: `m_amazonense_${tag}`, round, homeTeamId: homeId, awayTeamId: awayId, played: false, score: null, events: [], date: null };
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
