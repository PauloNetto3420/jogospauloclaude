// Encerramento e virada de temporada.
//
// Fluxo:
//   1. Determina campeões e premia (taça + bônus)
//   2. Rebaixa os 4 últimos da A; promove os 4 primeiros da B
//   3. Envelhece todos os jogadores em 1 ano; aposenta velhos
//   4. Expira contratos vencidos (vira agente livre)
//   5. Cria novas competições (com nova divisão dos times) para a próxima temporada
//   6. Reseta escalações dos times (jogadores podem ter saído / aposentado)

import { sortStandings } from "./season.js";
import { createCompetition } from "../models/competition.js";
import { evolvePlayer } from "../models/player.js";
import { recalcExpenses } from "../models/team.js";

const PRIZE_MONEY = {
  brasileirao_a: { champion: 50_000_000, runnerUp: 20_000_000, top4: 10_000_000 },
  brasileirao_b: { champion: 8_000_000,  runnerUp: 4_000_000,  top4: 2_000_000  },
};

export function isSeasonOver(state) {
  return Object.values(state.competitions)
    .every(c => c.fixtures.every(m => m.played));
}

export function endSeason(state, rng) {
  const report = { season: state.season, champions: {}, promoted: [], relegated: [], retired: [], freeAgents: [], libertaQualifiers: [] };

  // 1. Campeões + premiação
  for (const [compId, comp] of Object.entries(state.competitions)) {
    const sorted = sortStandings(comp, state.teams);
    const champId = sorted[0].teamId;
    comp.champion = champId;
    report.champions[compId] = champId;

    const champTeam = state.teams[champId];
    champTeam.trophies.push({ competitionId: compId, season: state.season });

    // Premiação financeira para top 4
    const prize = PRIZE_MONEY[compId];
    if (prize) {
      state.teams[sorted[0].teamId].finances.balance += prize.champion;
      state.teams[sorted[1].teamId].finances.balance += prize.runnerUp;
      state.teams[sorted[2].teamId].finances.balance += prize.top4;
      state.teams[sorted[3].teamId].finances.balance += prize.top4;
    }
  }

  // 2. Promoção e Rebaixamento
  const compA = state.competitions.brasileirao_a;
  const compB = state.competitions.brasileirao_b;
  if (compA && compB) {
    const sortedA = sortStandings(compA, state.teams);
    const sortedB = sortStandings(compB, state.teams);
    report.relegated = sortedA.slice(-4).map(s => s.teamId);
    report.promoted = sortedB.slice(0, 4).map(s => s.teamId);
    // Top 4 da Série A vão para Libertadores da próxima temporada (= cabeças Copa)
    report.libertaQualifiers = sortedA.slice(0, 4).map(s => s.teamId);
  }

  // 3. Envelhecimento + aposentadoria
  const retiredIds = [];
  for (const player of Object.values(state.players)) {
    const retired = evolvePlayer(player, rng);
    if (retired) {
      retiredIds.push(player.id);
      if (player.teamId) {
        const team = state.teams[player.teamId];
        team.squad = team.squad.filter(pid => pid !== player.id);
        team.lineup = (team.lineup || []).filter(pid => pid !== player.id);
        recalcExpenses(team, state.players);
      } else {
        state.freeAgents = state.freeAgents.filter(pid => pid !== player.id);
      }
      delete state.players[player.id];
    }
  }
  report.retired = retiredIds;

  // 4. Contratos vencidos -> agentes livres
  const nextYear = state.season + 1;
  for (const player of Object.values(state.players)) {
    if (!player.teamId || !player.contract?.until) continue;
    const endYear = parseInt(player.contract.until.slice(0, 4), 10);
    if (endYear < nextYear) {
      const team = state.teams[player.teamId];
      team.squad = team.squad.filter(pid => pid !== player.id);
      team.lineup = (team.lineup || []).filter(pid => pid !== player.id);
      recalcExpenses(team, state.players);
      player.teamId = null;
      state.freeAgents.push(player.id);
      report.freeAgents.push(player.id);
    }
  }

  // 5. Nova temporada — recompõe Série A e B com promovidos/rebaixados
  const newSeason = nextYear;
  state.season = newSeason;
  state.currentDate = `${newSeason}-04-01`;

  if (compA && compB) {
    const stayA = compA.teams.filter(t => !report.relegated.includes(t));
    const stayB = compB.teams.filter(t => !report.promoted.includes(t));
    const newA = [...stayA, ...report.promoted];
    const newB = [...stayB, ...report.relegated];

    state.competitions.brasileirao_a = createCompetition({
      id: "brasileirao_a", name: "Brasileirão Série A", tier: 1,
      season: newSeason, teamIds: newA,
      rules: { relegation: 4, relegatedTo: "brasileirao_b" },
    });
    state.competitions.brasileirao_b = createCompetition({
      id: "brasileirao_b", name: "Brasileirão Série B", tier: 2,
      season: newSeason, teamIds: newB,
      rules: { promotion: 4, promotedTo: "brasileirao_a" },
    });
  }

  // 6. Reseta escalações de todos os times (foram modificadas por baixas)
  for (const team of Object.values(state.teams)) {
    team.lineup = []; // será re-montada na próxima escalação
    recalcExpenses(team, state.players);
  }

  return report;
}
