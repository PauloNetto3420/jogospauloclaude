// Campeonato Paranaense — 2 grupos de 6 cruzados (igual à 1ª fase do Gaúcho),
// mata-mata com TODAS as fases em ida e volta: quartas, semis e final.
//
// Diferença pro Gaúcho: aqui as QUARTAS também são ida/volta (no Gaúcho são
// jogo único). Por isso o calendário tem 2 rodadas a mais.
//
// FASE DE GRUPOS: 12 times em 2 grupos de 6. Cada time joga só contra os 6 do
// OUTRO grupo (turno único) → 6 rodadas, 36 jogos. Top 4 de cada grupo avançam.
// MATA-MATA: quartas intra-grupo (1×4, 2×3), semis cruzando os grupos, final.
// Todos por agregado; melhor campanha manda na volta; empate → pênaltis.

import { sortStandings } from "./season.js";

export const PARANAENSE_GROUP_ROUNDS = 6;

// Os 12 oficiais (5 reais em A/B/C + 7 da Série D). Os 4 "grandes"
// (Athletico, Coritiba, Londrina, Operário) distribuídos 2-em-cada-grupo.
export const PARANAENSE_TEAM_IDS = [
  "ath", "cou", "lon", "ope", "mga", "sjp",
  "cav", "foz", "cia", "azu", "adr", "glm",
];
const PARANAENSE_BIG = ["ath", "cou", "lon", "ope"];

// Rodadas do mata-mata (tudo ida/volta):
//   quartas 7/8 · semis 9/10 · final 11/12
export const PARANAENSE_QUARTERS_LEG1_ROUND = 7;
export const PARANAENSE_QUARTERS_LEG2_ROUND = 8;
export const PARANAENSE_SEMI_LEG1_ROUND = 9;
export const PARANAENSE_SEMI_LEG2_ROUND = 10;
export const PARANAENSE_FINAL_LEG1_ROUND = 11;
export const PARANAENSE_FINAL_LEG2_ROUND = 12;
export const PARANAENSE_TOTAL_ROUNDS = 12;
export const PARANAENSE_CHAMPION_PRIZE = 4_000_000;

// -------------------- 1ª fase (grupos cruzados) --------------------

export function createParanaensePhase1({ season, rng, teamIds = PARANAENSE_TEAM_IDS } = {}) {
  if (teamIds.length !== 12) throw new Error("Paranaense exige exatamente 12 times.");

  const { groupA, groupB } = splitGroups(teamIds, rng);

  // Agendamento bipartido circular (A fixo, B rotacionado): 6 rodadas, 36 jogos.
  const fixtures = [];
  let mid = 0;
  for (let r = 0; r < PARANAENSE_GROUP_ROUNDS; r++) {
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
    id: "estadual_pr",
    name: "Campeonato Paranaense · 1ª Fase",
    type: "league",
    tier: 0,
    season,
    teams: allIds,
    groupA, groupB,
    rules: { rounds: 1, pointsWin: 3, pointsDraw: 1, format: "paranaense_groups" },
    fixtures,
    standings: allIds.map(emptyStanding),
    topScorers: [],
    champion: null,
  };
}

export function getParanaenseGroupStandings(phase1, group /* "A" | "B" */) {
  const ids = new Set(group === "A" ? phase1.groupA : phase1.groupB);
  return sortStandings({ ...phase1, standings: phase1.standings.filter(s => ids.has(s.teamId)) });
}

export function getParanaenseQualified(phase1) {
  return {
    A: getParanaenseGroupStandings(phase1, "A").slice(0, 4).map(s => s.teamId),
    B: getParanaenseGroupStandings(phase1, "B").slice(0, 4).map(s => s.teamId),
  };
}

// -------------------- Mata-mata (tudo ida/volta) --------------------

// qualified = { A: [1º,2º,3º,4º], B: [...] }.
export function createParanaenseKnockout(qualified) {
  const seedOf = {};
  qualified.A.forEach((id, i) => { seedOf[id] = i; });
  qualified.B.forEach((id, i) => { seedOf[id] = 4 + i; });

  const R1 = PARANAENSE_QUARTERS_LEG1_ROUND, R2 = PARANAENSE_QUARTERS_LEG2_ROUND;
  const quarters = [
    makeTwoLegTie("qfA1", bySeed(qualified.A[0], qualified.A[3], seedOf), R1, R2), // 1A×4A
    makeTwoLegTie("qfA2", bySeed(qualified.A[1], qualified.A[2], seedOf), R1, R2), // 2A×3A
    makeTwoLegTie("qfB1", bySeed(qualified.B[0], qualified.B[3], seedOf), R1, R2), // 1B×4B
    makeTwoLegTie("qfB2", bySeed(qualified.B[1], qualified.B[2], seedOf), R1, R2), // 2B×3B
  ];

  return { seedOf, phase: "quarters", quarters, semis: [], final: null, champion: null };
}

export function advanceParanaenseKnockout(ko) {
  if (ko.phase === "quarters") {
    if (!ko.quarters.every(t => t.winnerId)) return false;
    const w = ko.quarters.map(t => t.winnerId);
    // Semis cruzam os grupos: qfA1×qfB2, qfB1×qfA2.
    ko.semis = [
      makeTwoLegTie("sf0", bySeed(w[0], w[3], ko.seedOf), PARANAENSE_SEMI_LEG1_ROUND, PARANAENSE_SEMI_LEG2_ROUND),
      makeTwoLegTie("sf1", bySeed(w[2], w[1], ko.seedOf), PARANAENSE_SEMI_LEG1_ROUND, PARANAENSE_SEMI_LEG2_ROUND),
    ];
    ko.phase = "semis";
    return true;
  }
  if (ko.phase === "semis") {
    if (!ko.semis.every(t => t.winnerId)) return false;
    const [a, b] = ko.semis.map(t => t.winnerId);
    ko.final = makeTwoLegTie("final", bySeed(a, b, ko.seedOf), PARANAENSE_FINAL_LEG1_ROUND, PARANAENSE_FINAL_LEG2_ROUND);
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

export function applyParanaenseKnockoutResult(ko, leg, rng) {
  // Toda fase é ida e volta: localiza o tie em quartas, semis ou final.
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

export function getParanaenseKnockoutLegs(ko, round) {
  const out = [];
  if (round === PARANAENSE_QUARTERS_LEG1_ROUND || round === PARANAENSE_QUARTERS_LEG2_ROUND) {
    for (const t of ko.quarters) for (const l of t.legs) if (!l.played && l.round === round) out.push({ leg: l, tie: t, kind: "qf" });
  } else if (round === PARANAENSE_SEMI_LEG1_ROUND || round === PARANAENSE_SEMI_LEG2_ROUND) {
    for (const t of ko.semis) for (const l of t.legs) if (!l.played && l.round === round) out.push({ leg: l, tie: t, kind: "sf" });
  } else if (ko.final && (round === PARANAENSE_FINAL_LEG1_ROUND || round === PARANAENSE_FINAL_LEG2_ROUND)) {
    for (const l of ko.final.legs) if (!l.played && l.round === round) out.push({ leg: l, tie: ko.final, kind: "final" });
  }
  return out;
}

// -------------------- helpers internos --------------------

function splitGroups(teamIds, rng) {
  const bigs = shuffle(teamIds.filter(id => PARANAENSE_BIG.includes(id)), rng);
  const rest = shuffle(teamIds.filter(id => !PARANAENSE_BIG.includes(id)), rng);
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

// [bestId, otherId] ordenado por seed. teamA (melhor) joga a VOLTA em casa.
function makeTwoLegTie(tag, [bestId, otherId], r1, r2) {
  return {
    id: `paranaense_${tag}`,
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
  return { id: `m_paranaense_${tag}`, round, homeTeamId: homeId, awayTeamId: awayId, played: false, score: null, events: [], date: null };
}

function emptyStanding(teamId) {
  return { teamId, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, points: 0 };
}

function makeMatch(idNum, round, homeId, awayId, season) {
  return {
    id: `m_estadual_pr_${season}_${String(idNum).padStart(4, "0")}`,
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
