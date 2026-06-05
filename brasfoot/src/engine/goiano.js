// Campeonato Goiano — 3 grupos de 4 cruzados (8 rodadas exatas) + mata-mata
// de 8 times por campanha geral.
//
// 1ª FASE: 12 times em 3 grupos de 4 (A,B,C). Turno único só CONTRA OS OUTROS
//          grupos → cada time joga 8 partidas (os 8 de fora), 48 jogos.
//          O grafo cruzado é o tripartite K(4,4,4), 8-regular e 1-fatorável,
//          então cabe em EXATAMENTE 8 rodadas (sem byes), via coloração de
//          arestas em 8 cores (cada cor = uma rodada/emparelhamento perfeito).
//          Os 8 melhores da classificação GERAL avançam.
// MATA-MATA: quartas, semis e final, TODAS em ida e volta (agregado → pênaltis).

import { sortStandings } from "./season.js";

export const GOIANO_PHASE1_ROUNDS = 8;
export const GOIANO_QUARTERS_LEG1_ROUND = 9;
export const GOIANO_QUARTERS_LEG2_ROUND = 10;
export const GOIANO_SEMI_LEG1_ROUND = 11;
export const GOIANO_SEMI_LEG2_ROUND = 12;
export const GOIANO_FINAL_LEG1_ROUND = 13;
export const GOIANO_FINAL_LEG2_ROUND = 14;
export const GOIANO_TOTAL_ROUNDS = 14;
export const GOIANO_CHAMPION_PRIZE = 3_500_000;

// Os 12 oficiais (Goiás/Atlético-GO/Vila Nova/Anápolis já em A/B/C/D + 8 figurantes).
export const GOIANO_TEAM_IDS = [
  "goi", "ago", "vil", "anap", "crc", "inh",
  "gtb", "jta", "apa", "abe", "cox", "apl",
];
const GOIANO_BIG = ["goi", "ago", "vil"]; // 1 por grupo

// ==================== 1ª fase (3 grupos cruzados, 8 rodadas) ====================

export function createGoianoPhase1({ season, rng, teamIds = GOIANO_TEAM_IDS } = {}) {
  if (teamIds.length !== 12) throw new Error("Goiano exige exatamente 12 times.");

  const { groupA, groupB, groupC } = splitGroups(teamIds, rng);
  const fixtures = scheduleCross(groupA, groupB, groupC, season);

  const allIds = [...groupA, ...groupB, ...groupC];
  return {
    id: "estadual_go",
    name: "Campeonato Goiano · 1ª Fase",
    type: "league",
    tier: 0,
    season,
    teams: allIds,
    groupA, groupB, groupC,
    rules: { rounds: 1, pointsWin: 3, pointsDraw: 1, format: "goiano_groups" },
    fixtures,
    standings: allIds.map(emptyStanding),
    topScorers: [],
    champion: null,
  };
}

// Classificação de um grupo (para exibição).
export function getGoianoGroupStandings(phase1, group /* "A"|"B"|"C" */) {
  const ids = new Set(group === "A" ? phase1.groupA : group === "B" ? phase1.groupB : phase1.groupC);
  return sortStandings({ ...phase1, standings: phase1.standings.filter(s => ids.has(s.teamId)) });
}

// Classificação GERAL (todos os 12).
export function getGoianoOverallStandings(phase1, teams) {
  return sortStandings(phase1, teams);
}

// Os 8 melhores da campanha geral (seeds 0..7).
export function getGoianoQualified(phase1, teams) {
  return getGoianoOverallStandings(phase1, teams).slice(0, 8).map(s => s.teamId);
}

// ==================== Mata-mata (quartas/semis/final, ida/volta) ====================

// qualified = [1º..8º] da campanha geral. Chaveamento por seed (1×8, 4×5,
// 2×7, 3×6) montado para que 1º e 2º só se cruzem na final.
export function createGoianoKnockout(qualified) {
  const seedOf = {};
  qualified.forEach((id, i) => { seedOf[id] = i; });
  const R1 = GOIANO_QUARTERS_LEG1_ROUND, R2 = GOIANO_QUARTERS_LEG2_ROUND;
  const quarters = [
    makeTwoLegTie("qf0", bySeed(qualified[0], qualified[7], seedOf), R1, R2), // 1×8
    makeTwoLegTie("qf1", bySeed(qualified[3], qualified[4], seedOf), R1, R2), // 4×5
    makeTwoLegTie("qf2", bySeed(qualified[1], qualified[6], seedOf), R1, R2), // 2×7
    makeTwoLegTie("qf3", bySeed(qualified[2], qualified[5], seedOf), R1, R2), // 3×6
  ];
  return { seedOf, phase: "quarters", quarters, semis: [], final: null, champion: null };
}

export function advanceGoianoKnockout(ko) {
  if (ko.phase === "quarters") {
    if (!ko.quarters.every(t => t.winnerId)) return false;
    const w = ko.quarters.map(t => t.winnerId);
    // SF1: vencedor(1×8) × vencedor(4×5); SF2: vencedor(2×7) × vencedor(3×6).
    ko.semis = [
      makeTwoLegTie("sf0", bySeed(w[0], w[1], ko.seedOf), GOIANO_SEMI_LEG1_ROUND, GOIANO_SEMI_LEG2_ROUND),
      makeTwoLegTie("sf1", bySeed(w[2], w[3], ko.seedOf), GOIANO_SEMI_LEG1_ROUND, GOIANO_SEMI_LEG2_ROUND),
    ];
    ko.phase = "semis";
    return true;
  }
  if (ko.phase === "semis") {
    if (!ko.semis.every(t => t.winnerId)) return false;
    const [a, b] = ko.semis.map(t => t.winnerId);
    ko.final = makeTwoLegTie("final", bySeed(a, b, ko.seedOf), GOIANO_FINAL_LEG1_ROUND, GOIANO_FINAL_LEG2_ROUND);
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

export function applyGoianoKnockoutResult(ko, leg, rng) {
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
  else tie.winnerId = rng.chance(0.5) ? tie.teamAId : tie.teamBId; // pênaltis
  tie.aggregate = { teamA: aTotal, teamB: bTotal };
}

export function getGoianoKnockoutLegs(ko, round) {
  const out = [];
  if (round === GOIANO_QUARTERS_LEG1_ROUND || round === GOIANO_QUARTERS_LEG2_ROUND) {
    for (const t of ko.quarters) for (const l of t.legs) if (!l.played && l.round === round) out.push({ leg: l, tie: t, kind: "qf" });
  } else if (round === GOIANO_SEMI_LEG1_ROUND || round === GOIANO_SEMI_LEG2_ROUND) {
    for (const t of ko.semis) for (const l of t.legs) if (!l.played && l.round === round) out.push({ leg: l, tie: t, kind: "sf" });
  } else if (ko.final && (round === GOIANO_FINAL_LEG1_ROUND || round === GOIANO_FINAL_LEG2_ROUND)) {
    for (const l of ko.final.legs) if (!l.played && l.round === round) out.push({ leg: l, tie: ko.final, kind: "final" });
  }
  return out;
}

// ==================== helpers internos ====================

function splitGroups(teamIds, rng) {
  const bigs = shuffle(teamIds.filter(id => GOIANO_BIG.includes(id)), rng);
  const rest = shuffle(teamIds.filter(id => !GOIANO_BIG.includes(id)), rng);
  const groups = [[], [], []];
  bigs.forEach((id, i) => groups[i % 3].push(id));
  for (const id of rest) {
    // coloca no menor grupo
    const g = groups.reduce((m, _, i) => (groups[i].length < groups[m].length ? i : m), 0);
    groups[g].push(id);
  }
  return { groupA: groups[0], groupB: groups[1], groupC: groups[2] };
}

// Agendamento (template fixo). As 48 arestas cruzadas do K(4,4,4) admitem
// uma 1-fatoração em 8 rodadas perfeitas; em vez de recalcular (backtracking
// caro), usamos uma solução válida pré-computada sobre os SLOTS dos grupos
// (A0..A3, B0..B3, C0..C3) e mapeamos os times reais nesses slots. O(1).
// Cada par é [slotCasa, slotFora] da respectiva rodada (1..8).
const GOIANO_SCHEDULE = [
  [["A0","B0"],["A1","B1"],["A2","C0"],["A3","C2"],["B2","C1"],["B3","C3"]],
  [["A0","B1"],["A1","B0"],["A2","C1"],["A3","C3"],["B2","C2"],["B3","C0"]],
  [["A0","B2"],["A1","B3"],["A2","C2"],["A3","C0"],["B0","C3"],["B1","C1"]],
  [["A0","B3"],["A1","B2"],["A2","C3"],["A3","C1"],["B0","C0"],["B1","C2"]],
  [["A0","C0"],["A1","C1"],["A2","B0"],["A3","B2"],["B1","C3"],["B3","C2"]],
  [["A0","C1"],["A1","C0"],["A2","B1"],["A3","B3"],["B0","C2"],["B2","C3"]],
  [["A0","C2"],["A1","C3"],["A2","B2"],["A3","B0"],["B1","C0"],["B3","C1"]],
  [["A0","C3"],["A1","C2"],["A2","B3"],["A3","B1"],["B0","C1"],["B2","C0"]],
];

function scheduleCross(groupA, groupB, groupC, season) {
  const slot = {
    A0: groupA[0], A1: groupA[1], A2: groupA[2], A3: groupA[3],
    B0: groupB[0], B1: groupB[1], B2: groupB[2], B3: groupB[3],
    C0: groupC[0], C1: groupC[1], C2: groupC[2], C3: groupC[3],
  };
  const fixtures = [];
  let mid = 0;
  GOIANO_SCHEDULE.forEach((round, r) => {
    round.forEach(([hs, as], i) => {
      // alterna mando por índice pra equilibrar casa/fora
      const [home, away] = (i % 2 === 0) ? [slot[hs], slot[as]] : [slot[as], slot[hs]];
      fixtures.push(makeMatch(++mid, r + 1, home, away, season));
    });
  });
  return fixtures;
}

function bySeed(a, b, seedOf) {
  return seedOf[a] <= seedOf[b] ? [a, b] : [b, a];
}

function makeTwoLegTie(tag, [bestId, otherId], r1, r2) {
  return {
    id: `goiano_${tag}`,
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
  return { id: `m_goiano_${tag}`, round, homeTeamId: homeId, awayTeamId: awayId, played: false, score: null, events: [], date: null };
}

function emptyStanding(teamId) {
  return { teamId, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, points: 0 };
}

function makeMatch(idNum, round, homeId, awayId, season) {
  return {
    id: `m_estadual_go_${season}_${String(idNum).padStart(4, "0")}`,
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
