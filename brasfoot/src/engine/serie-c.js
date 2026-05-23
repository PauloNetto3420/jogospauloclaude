// Série C — formato CBF atual:
//   1ª Fase: pontos corridos, turno único (19 rodadas), 20 times.
//            Top 8 avança; 2 últimos rebaixados (à Série D, ainda inexistente).
//   2ª Fase: 2 quadrangulares (Grupo A = 1º,3º,4º,7º · Grupo B = 2º,5º,6º,8º)
//            ida e volta (6 rodadas). Top 2 de cada grupo sobem para Série B.
//   Final:   Líder do Grupo A × Líder do Grupo B, ida e volta. Melhor agregado leva.
//
// As 3 fases vivem como competições separadas em state.competitions:
//   brasileirao_c_p1   (sempre existe)
//   brasileirao_c_ga   (criado quando p1 termina)
//   brasileirao_c_gb   (criado quando p1 termina)
//   brasileirao_c_final (criado quando os grupos terminam)
//
// O estado da Série C como um todo fica em state.serieCMeta.

import { createCompetition } from "../models/competition.js";

export const SERIE_C_STAGE_IDS = [
  "brasileirao_c_p1",
  "brasileirao_c_ga",
  "brasileirao_c_gb",
  "brasileirao_c_final",
];

export function isSerieCStage(compId) {
  return SERIE_C_STAGE_IDS.includes(compId);
}

// Cria a 1ª Fase no início da temporada.
export function createSerieCPhase1({ season, teamIds }) {
  return createCompetition({
    id: "brasileirao_c_p1",
    name: "Série C · 1ª Fase",
    tier: 3,
    season,
    teamIds,
    legs: 1,                     // turno único
    roundOffset: 0,              // começa na rodada 1
    rules: { relegation: 2, format: "league_single" },
  });
}

// Cria os 2 grupos do quadrangular após o fim da 1ª Fase.
// Retorna { groupA, groupB, top8, relegated, rankedAll }.
export function createSerieCGroups({ season, phase1 }) {
  const sorted = sortStandings(phase1.standings);
  const top8 = sorted.slice(0, 8).map(s => s.teamId);
  const relegated = sorted.slice(-2).map(s => s.teamId);

  // Grupo A: 1º, 3º, 4º, 7º
  const groupATeams = [top8[0], top8[2], top8[3], top8[6]];
  // Grupo B: 2º, 5º, 6º, 8º
  const groupBTeams = [top8[1], top8[4], top8[5], top8[7]];

  const groupA = createCompetition({
    id: "brasileirao_c_ga",
    name: "Série C · Grupo A",
    tier: 3,
    season,
    teamIds: groupATeams,
    legs: 2,
    roundOffset: 19,             // fases começam após a rodada 19
    rules: { promotion: 2, promotedTo: "brasileirao_b", format: "group" },
  });
  const groupB = createCompetition({
    id: "brasileirao_c_gb",
    name: "Série C · Grupo B",
    tier: 3,
    season,
    teamIds: groupBTeams,
    legs: 2,
    roundOffset: 19,
    rules: { promotion: 2, promotedTo: "brasileirao_b", format: "group" },
  });

  return { groupA, groupB, top8, relegated, rankedAll: sorted };
}

// Cria a final após o fim dos grupos. Líder do Grupo A joga a volta em casa.
export function createSerieCFinal({ season, groupA, groupB }) {
  const gaLeader = sortStandings(groupA.standings)[0].teamId;
  const gbLeader = sortStandings(groupB.standings)[0].teamId;

  // Final = mini-competição 2 times × 2 legs (1 ida + 1 volta = 2 rodadas)
  // roundOffset 25 → final rolará nas rodadas 26 e 27 da temporada
  const finalComp = createCompetition({
    id: "brasileirao_c_final",
    name: "Série C · Final",
    tier: 3,
    season,
    teamIds: [gaLeader, gbLeader],
    legs: 2,
    roundOffset: 25,
    rules: { format: "knockout" },
  });

  // Ajuste: garante que o LÍDER DO GRUPO A jogue a 2ª partida em casa
  // (regra do "melhor campanha joga a volta em casa")
  const r26 = finalComp.fixtures.find(f => f.round === 26);
  const r27 = finalComp.fixtures.find(f => f.round === 27);
  if (r26 && r26.homeTeamId !== gbLeader) {
    [r26.homeTeamId, r26.awayTeamId] = [r26.awayTeamId, r26.homeTeamId];
  }
  if (r27 && r27.homeTeamId !== gaLeader) {
    [r27.homeTeamId, r27.awayTeamId] = [r27.awayTeamId, r27.homeTeamId];
  }

  finalComp.teamAId = gaLeader; // melhor campanha
  finalComp.teamBId = gbLeader;

  return finalComp;
}

// Decide campeão da Série C com base no agregado das duas partidas da final.
// Retorna o ID do campeão (ou null se ainda faltarem legs).
export function decideSerieCChampion(finalComp, rng) {
  const legs = finalComp.fixtures;
  if (legs.length !== 2 || !legs.every(l => l.played)) return null;

  const teamA = finalComp.teamAId; // joga R27 em casa
  const teamB = finalComp.teamBId; // joga R26 em casa

  const r26 = legs.find(l => l.round === 26);
  const r27 = legs.find(l => l.round === 27);

  // A: visitante em R26 + mandante em R27
  const aTotal = r26.score.away + r27.score.home;
  // B: mandante em R26 + visitante em R27
  const bTotal = r26.score.home + r27.score.away;

  let winnerId;
  if (aTotal > bTotal) winnerId = teamA;
  else if (bTotal > aTotal) winnerId = teamB;
  else winnerId = rng.chance(0.5) ? teamA : teamB; // "pênaltis"

  finalComp.aggregate = { teamA: aTotal, teamB: bTotal };
  finalComp.champion = winnerId;
  return winnerId;
}

// Top 4 promovidos (campeão + vice de cada grupo).
export function getSerieCPromoted({ groupA, groupB }) {
  const top2A = sortStandings(groupA.standings).slice(0, 2).map(s => s.teamId);
  const top2B = sortStandings(groupB.standings).slice(0, 2).map(s => s.teamId);
  return [...top2A, ...top2B];
}

function sortStandings(standings) {
  return [...standings].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    const sgA = a.goalsFor - a.goalsAgainst;
    const sgB = b.goalsFor - b.goalsAgainst;
    if (sgB !== sgA) return sgB - sgA;
    return b.goalsFor - a.goalsFor;
  });
}
