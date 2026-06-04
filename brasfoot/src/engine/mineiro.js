// Campeonato Mineiro — 3 grupos de 4, fase de grupos cruzada.
//
// PRIMEIRA FASE: 12 times em 3 grupos de 4 (A, B, C). Turno único cruzado —
// cada time joga APENAS contra os 8 times dos OUTROS dois grupos (não há
// clássicos intra-grupo). São 48 jogos, 8 por time.
//
// CLASSIFICAÇÃO: avançam os 3 líderes de grupo + o melhor 2º colocado geral
// = 4 semifinalistas (vão direto à semi, sem quartas).
//
// Agendamento: cada PAR de grupos (AB, AC, BC) é um K(4,4) agendado pelo
// método circular (4 rodadas, matching perfeito). Os 3 pares ocupam blocos
// de rodadas distintos → cada time joga 1x por rodada nas rodadas do seu par,
// e folga (bye) nas demais. Determinístico e instantâneo.

import { sortStandings } from "./season.js";

// 1ª fase ocupa rodadas 1..12 (3 pares × 4 rodadas). Mata-mata vem depois.
export const MINEIRO_GROUP_ROUNDS = 12;

// Monta a 1ª fase. `groups` opcional: array de 3 arrays de 4 ids. Se ausente,
// usa `teamIds` (12) dividido em 3 grupos por sorteio equilibrado.
export function createMineiroPhase1({ season, rng, teamIds, groups } = {}) {
  let g = groups;
  if (!g) {
    if (!teamIds || teamIds.length !== 12) {
      throw new Error("Mineiro exige 12 times (ou 3 grupos de 4).");
    }
    g = splitGroups(teamIds, rng);
  }
  if (g.length !== 3 || g.some(grp => grp.length !== 4)) {
    throw new Error("Mineiro exige exatamente 3 grupos de 4 times.");
  }

  const [A, B, C] = g;
  const pairs = [[A, B], [A, C], [B, C]];

  // Cada par K(4,4) ocupa 4 rodadas consecutivas (bloco). round-robin circular
  // bipartido: na rodada d, X[i] × Y[(i+d)%4]. Mando alternado.
  const fixtures = [];
  let mid = 0;
  pairs.forEach(([X, Y], pairIdx) => {
    const baseRound = pairIdx * 4; // 0, 4, 8
    for (let d = 0; d < 4; d++) {
      for (let i = 0; i < 4; i++) {
        const x = X[i];
        const y = Y[(i + d) % 4];
        const home = ((i + d) % 2 === 0) ? x : y; // alterna mando
        const away = home === x ? y : x;
        fixtures.push(makeMatch(++mid, baseRound + d + 1, home, away, season));
      }
    }
  });

  const allIds = [...A, ...B, ...C];
  return {
    id: "estadual_mg",
    name: "Campeonato Mineiro · 1ª Fase",
    type: "league",
    tier: 0,
    season,
    teams: allIds,
    groupA: A, groupB: B, groupC: C,
    rules: { rounds: 1, pointsWin: 3, pointsDraw: 1, format: "mineiro_groups" },
    fixtures,
    standings: allIds.map(emptyStanding),
    topScorers: [],
    champion: null,
  };
}

// Classificação de um grupo (filtra os standings pelos ids do grupo).
export function getMineiroGroupStandings(phase1, group /* "A" | "B" | "C" */) {
  const ids = new Set(
    group === "A" ? phase1.groupA : group === "B" ? phase1.groupB : phase1.groupC
  );
  return sortStandings({ ...phase1, standings: phase1.standings.filter(s => ids.has(s.teamId)) });
}

// Os 4 semifinalistas: 3 líderes de grupo + melhor 2º colocado geral.
// Retorna array de 4 teamIds ORDENADO por campanha (melhor primeiro), pra o
// seeding do mata-mata. "Campanha" = pontos, depois SG, depois GP.
export function getMineiroQualified(phase1) {
  const sA = getMineiroGroupStandings(phase1, "A");
  const sB = getMineiroGroupStandings(phase1, "B");
  const sC = getMineiroGroupStandings(phase1, "C");

  const leaders = [sA[0], sB[0], sC[0]];
  // melhor 2º geral entre os 3 segundos colocados
  const seconds = [sA[1], sB[1], sC[1]];
  const bestSecond = [...seconds].sort(campaignCmp)[0];

  const four = [...leaders, bestSecond];
  // ordena os 4 por campanha (define seeds 1..4)
  four.sort(campaignCmp);
  return four.map(s => s.teamId);
}

// -------------------- helpers internos --------------------

// Comparador de "campanha": pontos desc, SG desc, GP desc.
function campaignCmp(a, b) {
  if (b.points !== a.points) return b.points - a.points;
  const sgA = a.goalsFor - a.goalsAgainst;
  const sgB = b.goalsFor - b.goalsAgainst;
  if (sgB !== sgA) return sgB - sgA;
  return b.goalsFor - a.goalsFor;
}

// Divide 12 ids em 3 grupos de 4 equilibrados. Os times de maior reputação
// (cabeças) são distribuídos 1 por grupo; o resto preenche por sorteio.
// Sem acesso à reputação aqui, distribui de forma alternada (determinística).
function splitGroups(teamIds, rng) {
  const shuffled = shuffle([...teamIds], rng);
  const groups = [[], [], []];
  shuffled.forEach((id, i) => groups[i % 3].push(id));
  return groups;
}

function emptyStanding(teamId) {
  return { teamId, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, points: 0 };
}

function makeMatch(idNum, round, homeId, awayId, season) {
  return {
    id: `m_estadual_mg_${season}_${String(idNum).padStart(4, "0")}`,
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
