// Ranking Nacional de Clubes (RNC).
//
// Espelha o RNC da CBF: cada temporada distribui pontos conforme o desempenho
// nas competições (divisão e posição na liga, campanha na Copa do Brasil e
// títulos/finais de estaduais). O ranking é a soma dos pontos das últimas
// `RANKING_WINDOW` temporadas, com peso decrescente para temporadas antigas.
//
// É a fundação do sistema rotativo da Série D: as vagas que sobram (fora de
// A/B/C e dos critérios estaduais) serão preenchidas pelos clubes mais bem
// ranqueados — ver getRankedClubsOutsideTopDivisions.
//
// Desenho extensível: a pontuação de estaduais varre state.estaduais, então
// novos estaduais passam a contar automaticamente conforme forem criados.

import { sortStandings } from "./season.js";
import { CUP_PHASE_ORDER } from "./cup.js";

export const RANKING_WINDOW = 5;
// Peso por idade da temporada (0 = mais recente).
const AGE_WEIGHTS = [1.0, 0.85, 0.7, 0.55, 0.4];

const TOP_DIVISIONS = ["brasileirao_a", "brasileirao_b", "brasileirao_c_p1"];

// Base e passo de pontos por posição em cada divisão.
const LEAGUE_SCALE = {
  brasileirao_a:    { base: 100, step: 5 },
  brasileirao_b:    { base: 60,  step: 3 },
  brasileirao_c_p1: { base: 35,  step: 2 },
};

// Pontos por fase alcançada na Copa do Brasil (a mais profunda conta).
const CUP_PHASE_POINTS = {
  f1: 2, f2: 4, f3: 6, f4: 8, oitavas: 12, quartas: 20, semi: 32, final: 45,
};
const CUP_CHAMPION_BONUS = 25;

const ESTADUAL_CHAMPION_POINTS = 25;
const ESTADUAL_RUNNERUP_POINTS = 12;

// -------------------- Coleta de pontos da temporada --------------------

function addPoints(acc, teamId, pts) {
  if (!teamId || !pts) return;
  acc[teamId] = (acc[teamId] || 0) + pts;
}

// Pontos das ligas (A/B/C) pela posição final.
function collectLeaguePoints(state, acc) {
  for (const compId of TOP_DIVISIONS) {
    const comp = state.competitions[compId];
    const scale = LEAGUE_SCALE[compId];
    if (!comp?.standings?.length || !scale) continue;
    const sorted = sortStandings(comp, state.teams);
    const total = sorted.length;
    sorted.forEach((row, i) => {
      addPoints(acc, row.teamId, scale.base + Math.max(0, total - (i + 1)) * scale.step);
    });
  }
}

// Fase mais profunda alcançada por cada time na Copa.
function cupDeepestPhase(cup) {
  const deepest = {};
  CUP_PHASE_ORDER.forEach((key, idx) => {
    const phase = cup.phases?.[key];
    if (!phase?.ties) return;
    for (const tie of phase.ties) {
      for (const id of [tie.teamAId, tie.teamBId]) {
        if (id && (deepest[id] == null || idx > deepest[id])) deepest[id] = idx;
      }
    }
  });
  return deepest;
}

function collectCupPoints(state, acc) {
  const cup = state.competitions.copa_brasil;
  if (!cup) return;
  const deepest = cupDeepestPhase(cup);
  for (const [teamId, idx] of Object.entries(deepest)) {
    addPoints(acc, teamId, CUP_PHASE_POINTS[CUP_PHASE_ORDER[idx]] || 0);
  }
  if (cup.champion) addPoints(acc, cup.champion, CUP_CHAMPION_BONUS);
}

// Pontos de estaduais: campeão e vice (finalista). Varre todos os estaduais
// existentes — assim, novos estaduais entram no cálculo automaticamente.
function collectEstadualPoints(state, acc) {
  for (const e of Object.values(state.estaduais || {})) {
    if (!e?.champion) continue;
    addPoints(acc, e.champion, ESTADUAL_CHAMPION_POINTS);
    // Vice: o outro finalista da decisão (estrutura varia por formato).
    const final = e.knockout?.final;
    if (final && (final.teamAId || final.teamBId)) {
      const runnerUp = final.winnerId === final.teamAId ? final.teamBId : final.teamAId;
      addPoints(acc, runnerUp, ESTADUAL_RUNNERUP_POINTS);
    }
  }
}

// Calcula o mapa de pontos { teamId: pts } da temporada que terminou.
export function computeSeasonPoints(state) {
  const acc = {};
  collectLeaguePoints(state, acc);
  collectCupPoints(state, acc);
  collectEstadualPoints(state, acc);
  return acc;
}

// Registra os pontos da temporada em state.rncLog (idempotente por temporada).
export function awardSeasonRankingPoints(state, report) {
  if (!state.rncLog) state.rncLog = [];
  const season = report.season;
  if (state.rncLog.some(r => r.season === season)) return state.rncLog;
  state.rncLog.push({ season, points: computeSeasonPoints(state) });
  // Mantém apenas a janela relevante (+1 de folga) para não crescer sem limite.
  state.rncLog.sort((a, b) => a.season - b.season);
  if (state.rncLog.length > RANKING_WINDOW + 2) {
    state.rncLog = state.rncLog.slice(-(RANKING_WINDOW + 2));
  }
  return state.rncLog;
}

// Semente inicial: dá ao ranking um ponto de partida baseado na reputação,
// para já ser significativo na 1ª temporada. Tag de temporada anterior.
export function seedInitialRanking(state) {
  if (!state.rncLog) state.rncLog = [];
  if (state.rncLog.length) return state.rncLog;
  const points = {};
  for (const t of Object.values(state.teams)) {
    points[t.id] = t.reputation ?? 40;
  }
  state.rncLog.push({ season: (state.season ?? 2026) - 1, points, seed: true });
  return state.rncLog;
}

// -------------------- Cálculo do ranking --------------------

// Agrega os pontos da janela móvel com peso decrescente. Retorna lista
// ordenada [{ teamId, points }] desc.
export function computeRanking(state, { window = RANKING_WINDOW } = {}) {
  const log = (state.rncLog || []).slice().sort((a, b) => b.season - a.season); // recente primeiro
  const totals = {};
  log.slice(0, window).forEach((entry, age) => {
    const w = AGE_WEIGHTS[age] ?? (1 / (age + 1));
    for (const [teamId, pts] of Object.entries(entry.points || {})) {
      totals[teamId] = (totals[teamId] || 0) + pts * w;
    }
  });
  return Object.entries(totals)
    .map(([teamId, points]) => ({ teamId, points: Math.round(points) }))
    .sort((a, b) => b.points - a.points || a.teamId.localeCompare(b.teamId));
}

// Posição de um clube no ranking (1-based), ou null.
export function getRankingPosition(state, teamId) {
  const idx = computeRanking(state).findIndex(r => r.teamId === teamId);
  return idx >= 0 ? idx + 1 : null;
}

// Ranking Nacional das Federações (RNF): ordena as UFs pela soma do RNC dos
// seus clubes. Usado para distribuir vagas (Série D e Copa do Brasil).
export function computeRNF(state) {
  const pts = {};
  for (const r of computeRanking(state)) pts[r.teamId] = r.points;
  const ufPts = {};
  for (const t of Object.values(state.teams)) {
    if (!t.state) continue;
    ufPts[t.state] = (ufPts[t.state] || 0) + (pts[t.id] || 0);
  }
  return Object.keys(ufPts)
    .sort((a, b) => ufPts[b] - ufPts[a] || a.localeCompare(b))
    .map((uf, i) => ({ uf, rank: i + 1, points: Math.round(ufPts[uf]) }));
}

// Clubes fora das divisões A/B/C, ordenados pelo RNC. É a base do
// preenchimento de vagas da futura Série D.
export function getRankedClubsOutsideTopDivisions(state) {
  const inTop = new Set();
  for (const compId of TOP_DIVISIONS) {
    for (const id of state.competitions[compId]?.teams || []) inTop.add(id);
  }
  return computeRanking(state).filter(r => !inTop.has(r.teamId));
}

// Divisão atual de um clube (rótulo curto) para exibição.
export function currentDivisionLabel(state, teamId) {
  if (state.competitions.brasileirao_a?.teams?.includes(teamId)) return "Série A";
  if (state.competitions.brasileirao_b?.teams?.includes(teamId)) return "Série B";
  if (state.competitions.brasileirao_c_p1?.teams?.includes(teamId)) return "Série C";
  return "—";
}
