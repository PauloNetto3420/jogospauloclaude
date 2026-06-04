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
