// Campeonato Carioca — formato Taça Guanabara (12 times).
//
// FASE DE GRUPOS (cruzada): 12 times em 2 grupos de 6 (A e B), montados de
// forma equilibrada (2 grandes em cada). Cada time joga APENAS contra os 6
// do OUTRO grupo, em turno único → 6 rodadas, 36 jogos. A classificação é
// por grupo (cada time soma os pontos dos seus 6 jogos cruzados).
// Top 4 de cada grupo avançam ao mata-mata (ver carioca-ko).
//
// Modelagem: UMA competição (estadual_rj) com standings dos 12. Os jogos
// cruzados atualizam a tabela via applyMatchResult normalmente; a tabela de
// cada grupo é só um filtro dos standings pelos ids do grupo. As 6 rodadas
// saem do método circular bipartido (A fixo, B rotacionado).

import { sortStandings } from "./season.js";

export const CARIOCA_GROUP_ROUNDS = 6; // 1ª fase ocupa rodadas 1..6

// 12 times, divididos em 2 grupos equilibrados. Os 4 grandes (Fla, Flu, Bot,
// Vas) ficam 2 em cada grupo; os demais distribuídos de forma alternada.
// (Se algum grande não estiver presente, cai no preenchimento por ordem.)
export const CARIOCA_TEAM_IDS = [
  "fla", "flu", "bot", "vas", "vol", "ban",
  "boa", "mad", "mca", "nig", "samr", "porj",
];
const CARIOCA_BIG = ["fla", "flu", "bot", "vas"];

// Monta a 1ª fase. `teamIds` opcional (default = os 12 oficiais).
// Retorna competição no shape de createCompetition + groupA/groupB (ids).
export function createCariocaPhase1({ season, rng, teamIds = CARIOCA_TEAM_IDS } = {}) {
  if (teamIds.length !== 12) {
    throw new Error("Carioca exige exatamente 12 times.");
  }

  const { groupA, groupB } = splitGroups(teamIds, rng);

  // Agendamento bipartido (A fixo, B rotacionado) → 6 rodadas, 36 jogos.
  // Rodada r (0..5): A[i] joga B[(i + r) % 6]. Mando alternado.
  const fixtures = [];
  let mid = 0;
  for (let r = 0; r < CARIOCA_GROUP_ROUNDS; r++) {
    for (let i = 0; i < 6; i++) {
      const a = groupA[i];
      const b = groupB[(i + r) % 6];
      // mando: alterna por paridade pra equilibrar casa/fora
      const home = ((i + r) % 2 === 0) ? a : b;
      const away = home === a ? b : a;
      fixtures.push(makeMatch(++mid, r + 1, home, away, season));
    }
  }

  const allIds = [...groupA, ...groupB];
  return {
    id: "estadual_rj",
    name: "Campeonato Carioca · Taça Guanabara",
    type: "league",
    tier: 0,
    season,
    teams: allIds,
    groupA, groupB,
    rules: { rounds: 1, pointsWin: 3, pointsDraw: 1, format: "carioca_groups" },
    fixtures,
    standings: allIds.map(emptyStanding),
    topScorers: [],
    champion: null,
  };
}

// Classificação de um grupo: filtra os standings pelos ids do grupo e ordena.
export function getCariocaGroupStandings(phase1, group /* "A" | "B" */) {
  const ids = new Set(group === "A" ? phase1.groupA : phase1.groupB);
  const filtered = { ...phase1, standings: phase1.standings.filter(s => ids.has(s.teamId)) };
  return sortStandings(filtered);
}

// Top 4 de cada grupo (em ordem de classificação) → seeds do mata-mata.
export function getCariocaQualified(phase1) {
  return {
    A: getCariocaGroupStandings(phase1, "A").slice(0, 4).map(s => s.teamId),
    B: getCariocaGroupStandings(phase1, "B").slice(0, 4).map(s => s.teamId),
  };
}

// -------------------- Mata-mata --------------------
// Rodadas ocupadas: 1ª fase 1..6 · quartas 7 · semis ida 8, volta 9 · final 10
export const CARIOCA_QUARTERS_ROUND = 7;
export const CARIOCA_SEMI_LEG1_ROUND = 8;
export const CARIOCA_SEMI_LEG2_ROUND = 9;
export const CARIOCA_FINAL_ROUND = 10;
export const CARIOCA_TOTAL_ROUNDS = 10;
export const CARIOCA_CHAMPION_PRIZE = 4_000_000;

// Cria o mata-mata. `qualified` = { A: [1º,2º,3º,4º], B: [...] }.
// Quartas (jogo único, mando do melhor): 1A×4A, 2A×3A, 1B×4B, 2B×3B.
// `seed` por time = posição global pra decidir mando nas fases seguintes
// (melhor colocação de grupo, A antes de B em empate de posição).
export function createCariocaKnockout(qualified) {
  const seedOf = {};
  // seed: 0..3 = 1º-4º do A, 4..7 = 1º-4º do B (A leva vantagem de mando)
  qualified.A.forEach((id, i) => { seedOf[id] = i; });
  qualified.B.forEach((id, i) => { seedOf[id] = 4 + i; });

  const quarters = [
    makeSingleTie("qfA1", qualified.A[0], qualified.A[3], CARIOCA_QUARTERS_ROUND), // 1A×4A
    makeSingleTie("qfA2", qualified.A[1], qualified.A[2], CARIOCA_QUARTERS_ROUND), // 2A×3A
    makeSingleTie("qfB1", qualified.B[0], qualified.B[3], CARIOCA_QUARTERS_ROUND), // 1B×4B
    makeSingleTie("qfB2", qualified.B[1], qualified.B[2], CARIOCA_QUARTERS_ROUND), // 2B×3B
  ];

  return {
    seedOf,
    phase: "quarters",        // quarters | semis | final | done
    quarters,
    semis: [],
    final: null,
    champion: null,
  };
}

// Avança o mata-mata quando a fase corrente termina. Retorna true se mudou.
export function advanceCariocaKnockout(ko) {
  if (ko.phase === "quarters") {
    if (!ko.quarters.every(t => t.winnerId)) return false;
    const w = ko.quarters.map(t => t.winnerId);
    // Semis (ida e volta): cruza vencedores. qfA1×qfB2 e qfB1×qfA2.
    ko.semis = [
      makeTwoLegTie("sf0", bySeed(w[0], w[3], ko.seedOf), CARIOCA_SEMI_LEG1_ROUND, CARIOCA_SEMI_LEG2_ROUND),
      makeTwoLegTie("sf1", bySeed(w[2], w[1], ko.seedOf), CARIOCA_SEMI_LEG1_ROUND, CARIOCA_SEMI_LEG2_ROUND),
    ];
    ko.phase = "semis";
    return true;
  }
  if (ko.phase === "semis") {
    if (!ko.semis.every(t => t.winnerId)) return false;
    const [a, b] = ko.semis.map(t => t.winnerId);
    // Final (jogo único): mando do melhor seed (preferencialmente Maracanã).
    const [homeId, awayId] = bySeed(a, b, ko.seedOf);
    ko.final = makeSingleTie("final", homeId, awayId, CARIOCA_FINAL_ROUND);
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

// Aplica resultado de um leg. Jogo único (quartas/final) → empate vai a
// pênaltis. Semis (2 legs) → decide pelo agregado.
export function applyCariocaKnockoutResult(ko, leg, rng) {
  // jogo único: quartas ou final
  let tie = ko.quarters.find(t => t.leg?.id === leg.id);
  if (!tie && ko.final?.leg?.id === leg.id) tie = ko.final;
  if (tie) {
    const { home, away } = leg.score;
    if (home > away) tie.winnerId = leg.homeTeamId;
    else if (away > home) tie.winnerId = leg.awayTeamId;
    else tie.winnerId = rng.chance(0.5) ? leg.homeTeamId : leg.awayTeamId; // pênaltis
    return;
  }
  // semis (ida e volta)
  const semi = ko.semis.find(t => t.legs?.some(l => l.id === leg.id));
  if (semi) {
    const [l1, l2] = semi.legs;
    if (!l1.played || !l2.played) return;
    // teamA = melhor seed (manda na volta = leg2)
    const aTotal = l1.score.away + l2.score.home;
    const bTotal = l1.score.home + l2.score.away;
    if (aTotal > bTotal) semi.winnerId = semi.teamAId;
    else if (bTotal > aTotal) semi.winnerId = semi.teamBId;
    else semi.winnerId = rng.chance(0.5) ? semi.teamAId : semi.teamBId; // pênaltis
    semi.aggregate = { teamA: aTotal, teamB: bTotal };
  }
}

// Legs do mata-mata agendados pra uma rodada (pra pré-temporada).
export function getCariocaKnockoutLegs(ko, round) {
  const out = [];
  if (round === CARIOCA_QUARTERS_ROUND) {
    for (const t of ko.quarters) if (t.leg && !t.leg.played) out.push({ leg: t.leg, tie: t, kind: "qf" });
  } else if (round === CARIOCA_SEMI_LEG1_ROUND || round === CARIOCA_SEMI_LEG2_ROUND) {
    for (const t of ko.semis) for (const l of t.legs) if (!l.played && l.round === round) out.push({ leg: l, tie: t, kind: "sf" });
  } else if (ko.final && round === CARIOCA_FINAL_ROUND) {
    if (!ko.final.leg.played) out.push({ leg: ko.final.leg, tie: ko.final, kind: "final" });
  }
  return out;
}

// -------------------- helpers do mata-mata --------------------

// Ordena [a,b] pelo seed (menor = melhor). Retorna [melhor, pior].
function bySeed(a, b, seedOf) {
  return seedOf[a] <= seedOf[b] ? [a, b] : [b, a];
}

// Tie de jogo único; mando do melhor (homeId já é o mandante).
function makeSingleTie(tag, homeId, awayId, round) {
  return {
    id: `cario_${tag}`,
    teamAId: homeId, teamBId: awayId,
    leg: makeKoLeg(`${tag}`, homeId, awayId, round),
    winnerId: null,
  };
}

// Tie de ida e volta. `[bestId, otherId]` já ordenado por seed.
// teamA (melhor) joga a VOLTA em casa.
function makeTwoLegTie(tag, [bestId, otherId], r1, r2) {
  return {
    id: `cario_${tag}`,
    teamAId: bestId, teamBId: otherId,
    legs: [
      makeKoLeg(`${tag}1`, otherId, bestId, r1), // ida na casa do "outro"
      makeKoLeg(`${tag}2`, bestId, otherId, r2), // volta na casa do melhor
    ],
    aggregate: null,
    winnerId: null,
  };
}

function makeKoLeg(tag, homeId, awayId, round) {
  return {
    id: `m_cario_${tag}`,
    round,
    homeTeamId: homeId,
    awayTeamId: awayId,
    played: false,
    score: null,
    events: [],
    date: null,
  };
}

// -------------------- helpers internos --------------------

// Divide 12 ids em 2 grupos equilibrados: 2 grandes em cada, resto alternado.
function splitGroups(teamIds, rng) {
  const bigs = shuffle(teamIds.filter(id => CARIOCA_BIG.includes(id)), rng);
  const rest = shuffle(teamIds.filter(id => !CARIOCA_BIG.includes(id)), rng);

  const groupA = [], groupB = [];
  // Distribui os grandes: alterna A,B,A,B (2 em cada se houver 4)
  bigs.forEach((id, i) => (i % 2 === 0 ? groupA : groupB).push(id));
  // Distribui o resto alternando, mantendo os grupos com 6 cada
  for (const id of rest) {
    if (groupA.length <= groupB.length && groupA.length < 6) groupA.push(id);
    else groupB.push(id);
  }
  // Garantia de tamanho (caso a contagem de grandes seja ímpar)
  while (groupA.length < 6 && groupB.length > 6) groupA.push(groupB.pop());
  while (groupB.length < 6 && groupA.length > 6) groupB.push(groupA.pop());
  return { groupA, groupB };
}

function emptyStanding(teamId) {
  return { teamId, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, points: 0 };
}

function makeMatch(idNum, round, homeId, awayId, season) {
  return {
    id: `m_estadual_rj_${season}_${String(idNum).padStart(4, "0")}`,
    round,
    date: null,
    homeTeamId: homeId,
    awayTeamId: awayId,
    played: false,
    score: null,
    events: [],
    attendance: null,
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
