// Campeonato Paulista — formato "suíço" estilo Liga dos Campeões.
//
// 16 times em 4 potes de 4. PRIMEIRA FASE: tabela única de pontos corridos,
// cada time joga 8 partidas:
//   - 3 contra todos do próprio pote (round-robin dentro do pote)
//   - 5 contra times sorteados dos outros potes
// Os 8 primeiros da classificação geral avançam ao mata-mata (ver paulista-ko).
// Os 2 últimos seriam rebaixados (sem efeito por ora — não há Série A2 ainda).
//
// O grafo inter-pote é construído por um esquema de ANÉIS sobre as 16 posições
// dispostas intercaladas por pote: [a0,b0,c0,d0, a1,b1,c1,d1, ...]. Assim, duas
// posições no MESMO pote distam um múltiplo de 4. Conectando cada posição por
// distâncias 1, 3 (anéis, grau 2 cada) e 2 (matching, grau 1) — todas
// não-múltiplas de 4 — garantimos 5 arestas inter-pote por time, sem repetição
// e sem cair no próprio pote. Determinístico dado o rng (só embaralha os potes).

import { sortStandings } from "./season.js";

export const PAULISTA_GROUP_ROUNDS = 8; // 1ª fase ocupa rodadas 1..8 da pré-temporada

// Os 4 potes oficiais do Paulista (cabeças de chave por força). 16 times.
// Times paulistas que existem no jogo mas ficam de fora (Ferroviária, Inter de
// Limeira, Ituano) seriam a "Série A2" — não disputam a elite por ora.
export const PAULISTA_POTS = [
  ["cor", "pal", "spo", "sant"],  // Pote A — grandes
  ["ber", "nov", "rbb", "mir"],   // Pote B
  ["gua", "pon", "vel", "por"],   // Pote C
  ["pma", "cpv", "nrt", "bfc"],   // Pote D
];

// IDs dos 16 participantes do Paulista (achatado dos potes).
export const PAULISTA_TEAM_IDS = PAULISTA_POTS.flat();

// Monta a 1ª fase. `pots` é um array de 4 arrays com 4 teamIds cada (potes A-D).
// Retorna uma competição no mesmo shape de createCompetition (fixtures+standings),
// pra reaproveitar applyMatchResult / sortStandings.
export function createPaulistaPhase1({ season, pots, rng }) {
  if (!pots || pots.length !== 4 || pots.some(p => p.length !== 4)) {
    throw new Error("Paulista exige 4 potes de 4 times (16 no total).");
  }

  // Embaralha dentro de cada pote pra variar os confrontos inter-pote por temporada
  const shuffledPots = pots.map(p => shuffle([...p], rng));

  // Disposição intercalada: posição p = slot*4 + pote
  // slot 0..3, pote 0..3  → 16 posições. teamAt[pos] = id.
  const teamAt = [];
  for (let slot = 0; slot < 4; slot++) {
    for (let pote = 0; pote < 4; pote++) {
      teamAt[slot * 4 + pote] = shuffledPots[pote][slot];
    }
  }
  const poteOf = (pos) => pos % 4;

  const N = 16;
  const allIds = shuffledPots.flat();
  const idAt = (pos) => teamAt[pos];

  // O calendário é montado em DOIS blocos, cada um já organizado por rodada
  // (1 jogo por time por rodada por construção). Isso evita colorir o grafo
  // 8-regular inteiro (que tem becos de backtracking) — colorimos só o
  // subgrafo inter-pote (5-regular), que resolve instantaneamente.
  const roundsByTeam = {}; // controle de mando (quantas vezes cada time mandou)
  for (const id of allIds) roundsByTeam[id] = 0;

  const fixtures = [];
  let mid = 0;
  const pushMatch = (round, a, b) => {
    // Mando: dá casa pra quem mandou menos até agora (equilibra), desempate por mid
    const aHomeLess = roundsByTeam[a] <= roundsByTeam[b];
    const home = aHomeLess ? a : b;
    const away = home === a ? b : a;
    roundsByTeam[home]++;
    fixtures.push(makeMatch(++mid, round, home, away, season));
  };

  // BLOCO 1 — INTRA-POTE (rodadas 1, 2, 3): round-robin de 4 times.
  // As 3 rodadas do round-robin de 4: (0-1,2-3) (0-2,1-3) (0-3,1-2).
  const rr4 = [[[0, 1], [2, 3]], [[0, 2], [1, 3]], [[0, 3], [1, 2]]];
  rr4.forEach((roundPairs, ri) => {
    for (const pot of shuffledPots) {
      for (const [i, j] of roundPairs) pushMatch(ri + 1, pot[i], pot[j]);
    }
  });

  // BLOCO 2 — INTER-POTE (rodadas 4..8): coloração do subgrafo 5-regular.
  // Arestas inter via anéis d=1, d=3 (grau 2 cada) + matching d=2 (grau 1) = 5.
  const interEdges = [];
  const seenInter = new Set();
  const addInter = (pa, pb) => {
    const a = idAt(pa), b = idAt(pb);
    if (a === b) return;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (seenInter.has(key)) return;
    seenInter.add(key);
    interEdges.push([a, b]);
  };
  for (let pos = 0; pos < N; pos++) {
    addInter(pos, (pos + 1) % N);
    addInter(pos, (pos + 3) % N);
    if (Math.floor(pos / 2) % 2 === 0) addInter(pos, (pos + 2) % N);
  }
  // Colore o subgrafo inter em 5 rodadas (resolve em ~0ms — 5-regular)
  const interAssign = colorEdges(interEdges, 5);
  if (!interAssign) throw new Error("Falha ao agendar a fase inter-pote do Paulista.");
  for (let i = 0; i < interEdges.length; i++) {
    const [a, b] = interEdges[i];
    pushMatch(4 + interAssign[i], a, b); // rodadas 4..8
  }

  return {
    id: "estadual_sp",
    name: "Campeonato Paulista · 1ª Fase",
    type: "league",
    tier: 0,
    season,
    teams: [...allIds],
    pots: shuffledPots,
    rules: { rounds: 1, pointsWin: 3, pointsDraw: 1, format: "paulista_swiss" },
    fixtures,
    standings: allIds.map(emptyStanding),
    topScorers: [],
    champion: null,
  };
}

// Os 8 que avançam ao mata-mata (em ordem de classificação).
export function getPaulistaQualified(phase1) {
  return sortStandings(phase1).slice(0, 8).map(s => s.teamId);
}

// Os 2 rebaixados (últimos da geral). Sem efeito por ora.
export function getPaulistaRelegated(phase1) {
  return sortStandings(phase1).slice(-2).map(s => s.teamId);
}

// -------------------- Mata-mata --------------------
// Rodadas da pré-temporada ocupadas por cada fase:
//   1ª fase: 1..8 · quartas: 9 · semis: 10 · final ida: 11 · final volta: 12
export const PAULISTA_QUARTERS_ROUND = 9;
export const PAULISTA_SEMIS_ROUND = 10;
export const PAULISTA_FINAL_LEG1_ROUND = 11;
export const PAULISTA_FINAL_LEG2_ROUND = 12;
export const PAULISTA_TOTAL_ROUNDS = 12;
export const PAULISTA_CHAMPION_PRIZE = 5_000_000;

// Estado do mata-mata, guardado em estadual.knockout (paralelo ao formato de grupos).
// seed = ordem de classificação na 1ª fase (índice 0 = 1º colocado).
// Quartas: 1×8, 2×7, 3×6, 4×5 (jogo único, mando do melhor).
export function createPaulistaKnockout(qualified) {
  // qualified: array de 8 teamIds já em ordem de classificação (0 = melhor)
  const seedOf = {};
  qualified.forEach((id, i) => { seedOf[id] = i; });

  const pairs = [[0, 7], [1, 6], [2, 5], [3, 4]];
  const quarters = pairs.map(([hi, lo], idx) => makeSingleTie(
    `qf${idx}`, qualified[hi], qualified[lo], PAULISTA_QUARTERS_ROUND
  ));

  return {
    seedOf,
    phase: "quarters",            // quarters | semis | final | done
    quarters,
    semis: [],
    final: null,
    champion: null,
  };
}

// Avança o mata-mata quando a fase corrente termina. Retorna true se mudou de fase.
export function advancePaulistaKnockout(ko, season) {
  if (ko.phase === "quarters") {
    if (!ko.quarters.every(t => t.winnerId)) return false;
    // Semis: melhores campanhas se cruzam (winner qf0 × winner qf3, qf1 × qf2)
    const w = ko.quarters.map(t => t.winnerId);
    ko.semis = [
      buildSeededTie("sf0", w[0], w[3], ko.seedOf, PAULISTA_SEMIS_ROUND),
      buildSeededTie("sf1", w[1], w[2], ko.seedOf, PAULISTA_SEMIS_ROUND),
    ];
    ko.phase = "semis";
    return true;
  }
  if (ko.phase === "semis") {
    if (!ko.semis.every(t => t.winnerId)) return false;
    // Final ida e volta: melhor campanha decide em casa (joga a volta em casa)
    const [a, b] = ko.semis.map(t => t.winnerId);
    const bestFirst = ko.seedOf[a] <= ko.seedOf[b] ? a : b;
    const other = bestFirst === a ? b : a;
    ko.final = makeTwoLegTie("final", bestFirst, other);
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

// Aplica o resultado de um leg do mata-mata. Detecta o tie pelo id do leg.
// Jogo único → empate vai a pênaltis. Final (2 legs) → decide pelo agregado.
export function applyPaulistaKnockoutResult(ko, leg, rng) {
  // procura nas quartas e semis (jogo único)
  let tie = ko.quarters.find(t => t.leg?.id === leg.id)
         || ko.semis.find(t => t.leg?.id === leg.id);
  if (tie) {
    const { home, away } = leg.score;
    if (home > away) tie.winnerId = leg.homeTeamId;
    else if (away > home) tie.winnerId = leg.awayTeamId;
    else tie.winnerId = rng.chance(0.5) ? leg.homeTeamId : leg.awayTeamId; // pênaltis
    return;
  }
  // final (ida e volta)
  if (ko.final && ko.final.legs.some(l => l.id === leg.id)) {
    const [l1, l2] = ko.final.legs;
    if (!l1.played || !l2.played) return; // só decide com as duas pernas jogadas
    // teamA é o de melhor campanha (manda na volta = leg2)
    const aTotal = l1.score.away + l2.score.home;
    const bTotal = l1.score.home + l2.score.away;
    if (aTotal > bTotal) ko.final.winnerId = ko.final.teamAId;
    else if (bTotal > aTotal) ko.final.winnerId = ko.final.teamBId;
    else ko.final.winnerId = rng.chance(0.5) ? ko.final.teamAId : ko.final.teamBId; // pênaltis
    ko.final.aggregate = { teamA: aTotal, teamB: bTotal };
  }
}

// Retorna os legs do mata-mata agendados pra uma rodada (pra pré-temporada).
export function getPaulistaKnockoutLegs(ko, round) {
  const out = [];
  if (round === PAULISTA_QUARTERS_ROUND) {
    for (const t of ko.quarters) if (t.leg && !t.leg.played) out.push({ leg: t.leg, tie: t, kind: "qf" });
  } else if (round === PAULISTA_SEMIS_ROUND) {
    for (const t of ko.semis) if (t.leg && !t.leg.played) out.push({ leg: t.leg, tie: t, kind: "sf" });
  } else if (ko.final && (round === PAULISTA_FINAL_LEG1_ROUND || round === PAULISTA_FINAL_LEG2_ROUND)) {
    for (const l of ko.final.legs) if (!l.played && l.round === round) out.push({ leg: l, tie: ko.final, kind: "final" });
  }
  return out;
}

// -------------------- helpers do mata-mata --------------------

// Tie de jogo único; mando já vem definido (melhor campanha em casa)
function makeSingleTie(tag, homeId, awayId, round) {
  return {
    id: `pauko_${tag}`,
    teamAId: homeId, teamBId: awayId,
    leg: makeKoLeg(`${tag}`, homeId, awayId, round),
    winnerId: null,
  };
}

// Tie de jogo único definindo mando pelo seed (menor índice = melhor campanha)
function buildSeededTie(tag, a, b, seedOf, round) {
  const homeId = seedOf[a] <= seedOf[b] ? a : b;
  const awayId = homeId === a ? b : a;
  return makeSingleTie(tag, homeId, awayId, round);
}

// Tie de ida e volta. teamA = melhor campanha, joga a VOLTA em casa.
function makeTwoLegTie(tag, teamAId, teamBId) {
  return {
    id: `pauko_${tag}`,
    teamAId, teamBId,
    legs: [
      makeKoLeg(`${tag}1`, teamBId, teamAId, PAULISTA_FINAL_LEG1_ROUND), // ida na casa do B
      makeKoLeg(`${tag}2`, teamAId, teamBId, PAULISTA_FINAL_LEG2_ROUND), // volta na casa do A
    ],
    aggregate: null,
    winnerId: null,
  };
}

function makeKoLeg(tag, homeId, awayId, round) {
  return {
    id: `m_pauko_${tag}`,
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

function emptyStanding(teamId) {
  return { teamId, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, points: 0 };
}

function makeMatch(idNum, round, homeId, awayId, season) {
  return {
    id: `m_estadual_sp_${season}_${String(idNum).padStart(4, "0")}`,
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

// Coloração de arestas: atribui a cada confronto uma "rodada" (0..rounds-1) de
// modo que nenhum time jogue 2x na mesma rodada. O grafo é 8-regular e admite
// coloração em 8 cores — mas o backtracking só é rápido se as arestas mais
// RESTRITAS vierem primeiro. Ordenamos por grau combinado dos vértices (arestas
// entre times muito ocupados primeiro), o que resolve em poucos passos.
// Retorna assignment[i] = rodada (na ordem ORIGINAL de `edges`), ou null.
function colorEdges(edges, rounds) {
  const n = edges.length;

  // Grau de cada time (todos têm 8, mas mantemos genérico)
  const degree = {};
  for (const [a, b] of edges) {
    degree[a] = (degree[a] || 0) + 1;
    degree[b] = (degree[b] || 0) + 1;
  }
  // Ordena os índices das arestas por "restrição" desc (grau a+b). Estável.
  const order = edges.map((_, i) => i)
    .sort((i, j) => {
      const [ai, bi] = edges[i], [aj, bj] = edges[j];
      return (degree[aj] + degree[bj]) - (degree[ai] + degree[bi]);
    });

  const assignment = new Array(n).fill(-1);
  const busy = Array.from({ length: rounds }, () => new Set());

  function place(k) {
    if (k === n) return true;
    const i = order[k];
    const [a, b] = edges[i];
    for (let r = 0; r < rounds; r++) {
      if (busy[r].has(a) || busy[r].has(b)) continue;
      busy[r].add(a); busy[r].add(b);
      assignment[i] = r;
      if (place(k + 1)) return true;
      busy[r].delete(a); busy[r].delete(b);
      assignment[i] = -1;
    }
    return false;
  }

  return place(0) ? assignment : null;
}
