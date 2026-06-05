// Campeonato Paraense (Parazão) — grupos cruzados + tabela geral + mata-mata
// híbrido (quartas/semis em jogo único, final ida/volta).
//
// 1ª FASE: 12 times em 2 grupos de 6 (Remo e Paysandu cabeças). Turno único
//          só contra o grupo OPOSTO → cada um joga 6 jogos, 36 jogos, 6 rodadas.
//          Forma-se uma TABELA GERAL unificada; os 8 melhores avançam.
// MATA-MATA: quartas e semis em JOGO ÚNICO (mando do melhor na campanha geral,
//          empate → pênaltis). FINAL em ida e volta, volta na casa do melhor.

import { sortStandings } from "./season.js";

export const PARAENSE_GROUP_ROUNDS = 6;
export const PARAENSE_QUARTERS_ROUND = 7;   // jogo único
export const PARAENSE_SEMI_ROUND = 8;       // jogo único
export const PARAENSE_FINAL_LEG1_ROUND = 9;
export const PARAENSE_FINAL_LEG2_ROUND = 10;
export const PARAENSE_TOTAL_ROUNDS = 10;
export const PARAENSE_CHAMPION_PRIZE = 3_500_000;

// Os 12 oficiais (Remo e Paysandu cabeças + 10 figurantes da Série D).
export const PARAENSE_TEAM_IDS = [
  "rem", "pai", "tun", "agu", "cst", "bgp",
  "srp", "cpp", "cmt", "sro", "sfp", "ind",
];
const PARAENSE_BIG = ["rem", "pai"]; // cabeças, 1 por grupo

// ==================== 1ª fase (grupos cruzados, tabela geral) ====================

export function createParaensePhase1({ season, rng, teamIds = PARAENSE_TEAM_IDS } = {}) {
  if (teamIds.length !== 12) throw new Error("Paraense exige exatamente 12 times.");

  const { groupA, groupB } = splitGroups(teamIds, rng);

  const fixtures = [];
  let mid = 0;
  for (let r = 0; r < PARAENSE_GROUP_ROUNDS; r++) {
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
    id: "estadual_pa",
    name: "Campeonato Paraense · 1ª Fase",
    type: "league",
    tier: 0,
    season,
    teams: allIds,
    groupA, groupB,
    rules: { rounds: 1, pointsWin: 3, pointsDraw: 1, format: "paraense_groups" },
    fixtures,
    standings: allIds.map(emptyStanding),
    topScorers: [],
    champion: null,
  };
}

export function getParaenseGroupStandings(phase1, group /* "A" | "B" */) {
  const ids = new Set(group === "A" ? phase1.groupA : phase1.groupB);
  return sortStandings({ ...phase1, standings: phase1.standings.filter(s => ids.has(s.teamId)) });
}

// Tabela GERAL unificada (todos os 12).
export function getParaenseOverallStandings(phase1, teams) {
  return sortStandings(phase1, teams);
}

// Os 8 melhores da tabela geral (seeds 0..7).
export function getParaenseQualified(phase1, teams) {
  return getParaenseOverallStandings(phase1, teams).slice(0, 8).map(s => s.teamId);
}

// ==================== Mata-mata (quartas/semis únicos, final ida/volta) ====================

// qualified = [1º..8º] da campanha geral. Chaveamento por seed (1×8, 4×5,
// 2×7, 3×6) para que 1º e 2º só se cruzem na final.
export function createParaenseKnockout(qualified) {
  const seedOf = {};
  qualified.forEach((id, i) => { seedOf[id] = i; });
  const quarters = [
    makeSingleTie("qf0", bySeed(qualified[0], qualified[7], seedOf), PARAENSE_QUARTERS_ROUND), // 1×8
    makeSingleTie("qf1", bySeed(qualified[3], qualified[4], seedOf), PARAENSE_QUARTERS_ROUND), // 4×5
    makeSingleTie("qf2", bySeed(qualified[1], qualified[6], seedOf), PARAENSE_QUARTERS_ROUND), // 2×7
    makeSingleTie("qf3", bySeed(qualified[2], qualified[5], seedOf), PARAENSE_QUARTERS_ROUND), // 3×6
  ];
  return { seedOf, phase: "quarters", quarters, semis: [], final: null, champion: null };
}

export function advanceParaenseKnockout(ko) {
  if (ko.phase === "quarters") {
    if (!ko.quarters.every(t => t.winnerId)) return false;
    const w = ko.quarters.map(t => t.winnerId);
    ko.semis = [
      makeSingleTie("sf0", bySeed(w[0], w[1], ko.seedOf), PARAENSE_SEMI_ROUND),
      makeSingleTie("sf1", bySeed(w[2], w[3], ko.seedOf), PARAENSE_SEMI_ROUND),
    ];
    ko.phase = "semis";
    return true;
  }
  if (ko.phase === "semis") {
    if (!ko.semis.every(t => t.winnerId)) return false;
    const [a, b] = ko.semis.map(t => t.winnerId);
    ko.final = makeTwoLegTie("final", bySeed(a, b, ko.seedOf), PARAENSE_FINAL_LEG1_ROUND, PARAENSE_FINAL_LEG2_ROUND);
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

export function applyParaenseKnockoutResult(ko, leg, rng) {
  // Jogo único: quartas e semis.
  const single = ko.quarters.find(t => t.leg?.id === leg.id)
              || ko.semis.find(t => t.leg?.id === leg.id);
  if (single) {
    const { home, away } = leg.score;
    if (home > away) single.winnerId = leg.homeTeamId;
    else if (away > home) single.winnerId = leg.awayTeamId;
    else single.winnerId = rng.chance(0.5) ? leg.homeTeamId : leg.awayTeamId; // pênaltis
    return;
  }
  // Ida e volta: final.
  if (ko.final?.legs?.some(l => l.id === leg.id)) {
    const tie = ko.final;
    const [l1, l2] = tie.legs;
    if (!l1.played || !l2.played) return;
    const aTotal = l1.score.away + l2.score.home; // teamA (melhor) manda na volta
    const bTotal = l1.score.home + l2.score.away;
    if (aTotal > bTotal) tie.winnerId = tie.teamAId;
    else if (bTotal > aTotal) tie.winnerId = tie.teamBId;
    else tie.winnerId = rng.chance(0.5) ? tie.teamAId : tie.teamBId; // pênaltis
    tie.aggregate = { teamA: aTotal, teamB: bTotal };
  }
}

export function getParaenseKnockoutLegs(ko, round) {
  const out = [];
  if (round === PARAENSE_QUARTERS_ROUND) {
    for (const t of ko.quarters) if (t.leg && !t.leg.played) out.push({ leg: t.leg, tie: t, kind: "qf" });
  } else if (round === PARAENSE_SEMI_ROUND) {
    for (const t of ko.semis) if (t.leg && !t.leg.played) out.push({ leg: t.leg, tie: t, kind: "sf" });
  } else if (ko.final && (round === PARAENSE_FINAL_LEG1_ROUND || round === PARAENSE_FINAL_LEG2_ROUND)) {
    for (const l of ko.final.legs) if (!l.played && l.round === round) out.push({ leg: l, tie: ko.final, kind: "final" });
  }
  return out;
}

// ==================== helpers internos ====================

function splitGroups(teamIds, rng) {
  const bigs = shuffle(teamIds.filter(id => PARAENSE_BIG.includes(id)), rng);
  const rest = shuffle(teamIds.filter(id => !PARAENSE_BIG.includes(id)), rng);
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

// Jogo único: melhor seed (teamA) manda em casa.
function makeSingleTie(tag, [bestId, otherId], round) {
  return {
    id: `paraense_${tag}`,
    teamAId: bestId, teamBId: otherId,
    leg: makeKoLeg(tag, bestId, otherId, round),
    winnerId: null,
  };
}

// Ida e volta: melhor seed (teamA) joga a VOLTA em casa.
function makeTwoLegTie(tag, [bestId, otherId], r1, r2) {
  return {
    id: `paraense_${tag}`,
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
  return { id: `m_paraense_${tag}`, round, homeTeamId: homeId, awayTeamId: awayId, played: false, score: null, events: [], date: null };
}

function emptyStanding(teamId) {
  return { teamId, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, points: 0 };
}

function makeMatch(idNum, round, homeId, awayId, season) {
  return {
    id: `m_estadual_pa_${season}_${String(idNum).padStart(4, "0")}`,
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
