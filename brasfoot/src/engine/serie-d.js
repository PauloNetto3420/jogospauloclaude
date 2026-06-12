// Campeonato Brasileiro Série D — quarta divisão nacional.
//
// FASE 1 (esta entrega): a Série D roda em 2º plano (o usuário não a joga ao
// vivo ainda — vive A/B/C). Toda a estrutura fica em state.serieD, simulada
// internamente rodada a rodada, alimentando acesso/rebaixamento com a Série C.
//
// FORMATO (96 clubes):
//   1ª fase: 24 grupos de 4, turno e returno → 6 rodadas, 6 jogos/clube.
//            Os 2 melhores de cada grupo se classificam (48), MAS só 32 vão ao
//            mata-mata: os 24 líderes de grupo + os 8 melhores vice-líderes.
//   Mata-mata (tudo ida/volta, agregado → pênaltis):
//            32 → 16-avos → oitavas → QUARTAS.
//            Os 4 vencedores das quartas (= semifinalistas) GANHAM ACESSO à
//            Série C. Semifinais e final decidem o campeão nacional da Série D.
//
// Distribuição regional dos grupos reduz custos de viagem (como na CBF).
//
// Desempate (grupos): pontos → vitórias → saldo → gols pró → nome.
// (Confronto direto e cartões do regulamento real são simplificados aqui.)

import { updateStandings } from "./season.js";
import { createCompetition } from "../models/competition.js";

export const SERIE_D_TEAMS = 96;
export const SERIE_D_GROUPS = 24;
export const SERIE_D_GROUP_ROUNDS = 6;       // turno e returno num grupo de 4
export const SERIE_D_ACCESS = 4;             // sobem para a Série C
export const SERIE_D_CHAMPION_PRIZE = 2_000_000;

// Calendário interno (1 rodada da Série D por rodada nacional):
//   grupos 1..6 · 16-avos 7/8 · oitavas 9/10 · quartas 11/12 · semis 13/14 · final 15/16
export const SD_R32_LEG1 = 7,  SD_R32_LEG2 = 8;
export const SD_R16_LEG1 = 9,  SD_R16_LEG2 = 10;
export const SD_QF_LEG1  = 11, SD_QF_LEG2  = 12;
export const SD_SF_LEG1  = 13, SD_SF_LEG2  = 14;
export const SD_FINAL_LEG1 = 15, SD_FINAL_LEG2 = 16;
export const SERIE_D_TOTAL_ROUNDS = 16;

// UF → região (para agrupar reduzindo viagens).
export const REGION_BY_UF = {
  AC: "N", AM: "N", AP: "N", PA: "N", RO: "N", RR: "N", TO: "N",
  AL: "NE", BA: "NE", CE: "NE", MA: "NE", PB: "NE", PE: "NE", PI: "NE", RN: "NE", SE: "NE",
  DF: "CO", GO: "CO", MT: "CO", MS: "CO",
  ES: "SE", MG: "SE", RJ: "SE", SP: "SE",
  PR: "S", RS: "S", SC: "S",
};
const REGION_ORDER = ["N", "NE", "CO", "SE", "S"];

// ==================== Seleção do campo de 96 clubes ====================

// Fase 1: pega os 96 melhores clubes fora de A/B/C pelo Ranking Nacional.
// `rankedOutside` = lista [{teamId}] já ordenada (getRankedClubsOutsideTopDivisions).
export function pickSerieDField(rankedOutside, count = SERIE_D_TEAMS) {
  return rankedOutside.slice(0, count).map(r => r.teamId);
}

// Campo da próxima temporada: mantém o campo atual, troca os 4 que subiram à
// Série C pelos 4 rebaixados da Série C. (Sem rebaixamento nacional na D —
// quem não sobe permanece; o sistema de vagas completo vem na Fase 2.)
export function nextSerieDField(prevTeamIds, promotedToC, relegatedFromC) {
  const out = new Set(promotedToC);
  const stay = prevTeamIds.filter(id => !out.has(id));
  return [...stay, ...relegatedFromC];
}

// ==================== Montagem dos grupos (regional) ====================

function shuffle(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Distribui os 96 em 24 grupos de 4 priorizando proximidade regional: ordena
// por região (clubes embaralhados dentro da região) e fatia de 4 em 4.
export function buildRegionalGroups(teamIds, teams, rng) {
  const byRegion = {};
  for (const id of teamIds) {
    const uf = teams[id]?.state;
    const reg = REGION_BY_UF[uf] || "SE";
    (byRegion[reg] = byRegion[reg] || []).push(id);
  }
  const ordered = [];
  for (const reg of REGION_ORDER) {
    if (byRegion[reg]) ordered.push(...shuffle(byRegion[reg], rng));
  }
  // Qualquer região fora do mapa (não deveria) vai pro fim
  for (const reg of Object.keys(byRegion)) {
    if (!REGION_ORDER.includes(reg)) ordered.push(...shuffle(byRegion[reg], rng));
  }

  const groups = [];
  for (let g = 0; g < SERIE_D_GROUPS; g++) {
    groups.push(ordered.slice(g * 4, g * 4 + 4));
  }
  return groups;
}

// ==================== Criação da Série D ====================

export function createSerieD({ season, teamIds, teams, rng, relegatedFromC = [] }) {
  if (teamIds.length !== SERIE_D_TEAMS) {
    throw new Error(`Série D exige exatamente ${SERIE_D_TEAMS} clubes (recebi ${teamIds.length}).`);
  }
  const groupTeams = buildRegionalGroups(teamIds, teams, rng);
  const groups = groupTeams.map((ids, i) => {
    const comp = createCompetition({
      id: `sd_g${i + 1}`,
      name: `Série D · Grupo ${i + 1}`,
      tier: 4,
      season,
      teamIds: ids,
      legs: 2,                 // turno e returno → 6 rodadas
      rules: { format: "serie_d_group" },
    });
    return comp;
  });

  return {
    season,
    phase: "groups",           // groups | r32 | r16 | quarters | semis | final | done
    round: 1,                  // rodada interna (1..16)
    groups,
    ko: { seedOf: {}, r32: [], r16: [], quarters: [], semis: [], final: null },
    promoted: [],              // 4 (vencedores das quartas)
    champion: null,
    relegatedFromC: [...relegatedFromC],
  };
}

// ==================== Classificação dos grupos ====================

export function sortSerieDGroup(group, teams) {
  return [...group.standings].sort((a, b) => cmpRows(a, b, teams));
}

function cmpRows(a, b, teams) {
  if (b.points !== a.points) return b.points - a.points;
  if (b.wins !== a.wins) return b.wins - a.wins;
  const sgA = a.goalsFor - a.goalsAgainst, sgB = b.goalsFor - b.goalsAgainst;
  if (sgB !== sgA) return sgB - sgA;
  if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
  if (teams) return (teams[a.teamId]?.name || a.teamId).localeCompare(teams[b.teamId]?.name || b.teamId);
  return a.teamId.localeCompare(b.teamId);
}

// 24 líderes + 8 melhores vice-líderes = 32, semeados (seed 0 = melhor).
export function getSerieDQualified(serieD, teams) {
  const winners = [], runnersUp = [];
  for (const g of serieD.groups) {
    const sorted = sortSerieDGroup(g, teams);
    if (sorted[0]) winners.push(sorted[0]);
    if (sorted[1]) runnersUp.push(sorted[1]);
  }
  // Ordena líderes entre si e vices entre si por desempenho absoluto.
  winners.sort((a, b) => cmpRows(a, b, teams));
  runnersUp.sort((a, b) => cmpRows(a, b, teams));
  const best8RunnersUp = runnersUp.slice(0, 8);
  // Seeds: todos os 24 líderes (melhores) antes dos 8 vices.
  return [...winners, ...best8RunnersUp].map(r => r.teamId);
}

// ==================== Mata-mata ====================

// Ordem de chaveamento por seed (1..n) garantindo que 1 e 2 só se cruzem na
// final. Retorna array de seeds (1-based) na ordem das posições do bracket.
function seedBracketOrder(n) {
  let arr = [1, 2];
  while (arr.length < n) {
    const len = arr.length * 2;
    const next = [];
    for (const s of arr) { next.push(s); next.push(len + 1 - s); }
    arr = next;
  }
  return arr;
}

// qualified = 32 teamIds (seed 0..31). Monta os 16-avos (16 confrontos).
export function createSerieDKnockout(serieD, qualified) {
  const seedOf = {};
  qualified.forEach((id, i) => { seedOf[id] = i; });
  serieD.ko.seedOf = seedOf;

  const order = seedBracketOrder(qualified.length); // seeds 1-based
  const ties = [];
  for (let i = 0; i < order.length; i += 2) {
    const a = qualified[order[i] - 1];
    const b = qualified[order[i + 1] - 1];
    ties.push(makeTie(`r32_${i / 2}`, a, b, seedOf, SD_R32_LEG1, SD_R32_LEG2));
  }
  serieD.ko.r32 = ties;
}

// Constrói a próxima rodada de mata-mata a partir dos vencedores da anterior.
function buildNextKnockout(serieD, fromTies, tag, r1, r2) {
  const seedOf = serieD.ko.seedOf;
  const winners = fromTies.map(t => t.winnerId);
  const ties = [];
  for (let i = 0; i < winners.length; i += 2) {
    ties.push(makeTie(`${tag}_${i / 2}`, winners[i], winners[i + 1], seedOf, r1, r2));
  }
  return ties;
}

function makeTie(tag, a, b, seedOf, r1, r2) {
  // Melhor seed (menor índice) joga a VOLTA em casa.
  const [best, other] = seedOf[a] <= seedOf[b] ? [a, b] : [b, a];
  return {
    id: `sd_${tag}`,
    teamAId: best, teamBId: other,
    legs: [
      makeLeg(`${tag}1`, other, best, r1),
      makeLeg(`${tag}2`, best, other, r2),
    ],
    aggregate: null,
    winnerId: null,
  };
}

function makeLeg(tag, homeId, awayId, round) {
  return { id: `m_serie_d_${tag}`, round, homeTeamId: homeId, awayTeamId: awayId, played: false, score: null, events: [], date: null };
}

export function applySerieDKnockoutResult(tie, rng) {
  const [l1, l2] = tie.legs;
  if (!l1.played || !l2.played) return;
  const aTotal = l1.score.away + l2.score.home;  // teamA (melhor) manda na volta
  const bTotal = l1.score.home + l2.score.away;
  if (aTotal > bTotal) tie.winnerId = tie.teamAId;
  else if (bTotal > aTotal) tie.winnerId = tie.teamBId;
  else tie.winnerId = rng.chance(0.5) ? tie.teamAId : tie.teamBId; // pênaltis
  tie.aggregate = { teamA: aTotal, teamB: bTotal };
}

// ==================== Helpers de rodada ====================

// Lista todas as partidas (não jogadas) da Série D na rodada interna `round`.
// Retorna [{ match, kind, compId? , tie? }].
export function getSerieDMatchesForRound(serieD, round) {
  const out = [];
  if (round <= SERIE_D_GROUP_ROUNDS) {
    for (const g of serieD.groups) {
      for (const m of g.fixtures) {
        if (m.round === round && !m.played) out.push({ match: m, kind: "group", compId: g.id });
      }
    }
    return out;
  }
  const koByRound = {
    [SD_R32_LEG1]: "r32", [SD_R32_LEG2]: "r32",
    [SD_R16_LEG1]: "r16", [SD_R16_LEG2]: "r16",
    [SD_QF_LEG1]: "quarters", [SD_QF_LEG2]: "quarters",
    [SD_SF_LEG1]: "semis", [SD_SF_LEG2]: "semis",
    [SD_FINAL_LEG1]: "final", [SD_FINAL_LEG2]: "final",
  };
  const bucket = koByRound[round];
  if (!bucket) return out;
  const ties = bucket === "final" ? (serieD.ko.final ? [serieD.ko.final] : []) : serieD.ko[bucket];
  for (const tie of ties) {
    for (const leg of tie.legs) {
      if (leg.round === round && !leg.played) out.push({ match: leg, kind: bucket, tie });
    }
  }
  return out;
}

// Aplica um resultado já simulado a uma partida da Série D e atualiza
// classificação/agregados. `entry` vem de getSerieDMatchesForRound.
export function applySerieDMatchResult(serieD, entry, result, rng) {
  const m = entry.match;
  m.played = true;
  m.score = { ...result.score };
  m.events = result.events || [];
  if (entry.kind === "group") {
    const g = serieD.groups.find(x => x.id === entry.compId);
    if (g) updateStandings(g, { homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId, score: m.score });
  } else if (entry.tie) {
    applySerieDKnockoutResult(entry.tie, rng);
  }
}

// Avança a fase da Série D quando a rodada interna corrente termina. Deve ser
// chamado após simular todas as partidas da rodada `serieD.round`.
export function advanceSerieDPhase(serieD, teams, rng) {
  const r = serieD.round;

  if (r === SERIE_D_GROUP_ROUNDS && serieD.phase === "groups") {
    const qualified = getSerieDQualified(serieD, teams);
    createSerieDKnockout(serieD, qualified);
    serieD.phase = "r32";
  } else if (r === SD_R32_LEG2 && serieD.phase === "r32") {
    serieD.ko.r16 = buildNextKnockout(serieD, serieD.ko.r32, "r16", SD_R16_LEG1, SD_R16_LEG2);
    serieD.phase = "r16";
  } else if (r === SD_R16_LEG2 && serieD.phase === "r16") {
    serieD.ko.quarters = buildNextKnockout(serieD, serieD.ko.r16, "qf", SD_QF_LEG1, SD_QF_LEG2);
    serieD.phase = "quarters";
  } else if (r === SD_QF_LEG2 && serieD.phase === "quarters") {
    // Vencedores das quartas = ACESSO à Série C (4 clubes).
    serieD.promoted = serieD.ko.quarters.map(t => t.winnerId);
    serieD.ko.semis = buildNextKnockout(serieD, serieD.ko.quarters, "sf", SD_SF_LEG1, SD_SF_LEG2);
    serieD.phase = "semis";
  } else if (r === SD_SF_LEG2 && serieD.phase === "semis") {
    const [a, b] = serieD.ko.semis.map(t => t.winnerId);
    serieD.ko.final = makeTie("final", a, b, serieD.ko.seedOf, SD_FINAL_LEG1, SD_FINAL_LEG2);
    serieD.phase = "final";
  } else if (r === SD_FINAL_LEG2 && serieD.phase === "final") {
    serieD.champion = serieD.ko.final?.winnerId || null;
    serieD.phase = "done";
  }

  if (serieD.phase !== "done") serieD.round = r + 1;
}

export function isSerieDDone(serieD) {
  return !serieD || serieD.phase === "done";
}

// Lista de acesso (4) — disponível após as quartas.
export function getSerieDPromoted(serieD) {
  return serieD.promoted || [];
}
