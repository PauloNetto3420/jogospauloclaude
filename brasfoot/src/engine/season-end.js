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
import { createSerieCPhase1 } from "./serie-c.js";
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

  // 2. Promoção e Rebaixamento (A↔B e B↔C)
  const compA = state.competitions.brasileirao_a;
  const compB = state.competitions.brasileirao_b;
  const compCp1 = state.competitions.brasileirao_c_p1;
  let relegatedToC = [];
  let promotedFromC = [];
  if (compA && compB) {
    const sortedA = sortStandings(compA, state.teams);
    const sortedB = sortStandings(compB, state.teams);
    report.relegated = sortedA.slice(-4).map(s => s.teamId);    // A → B
    report.promoted = sortedB.slice(0, 4).map(s => s.teamId);   // B → A
    report.libertaQualifiers = sortedA.slice(0, 4).map(s => s.teamId);
    relegatedToC = sortedB.slice(-4).map(s => s.teamId);        // B → C
    promotedFromC = state.serieCMeta?.promoted || [];            // C → B
    report.relegatedToC = relegatedToC;
    report.promotedFromC = promotedFromC;
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
    // Nova A: tira rebaixados, entra promovidos da B
    const stayA = compA.teams.filter(t => !report.relegated.includes(t));
    const newA = [...stayA, ...report.promoted];

    // Nova B: tira promovidos (foram pra A) e rebaixados (foram pra C),
    //         entra rebaixados da A e promovidos da C
    const stayB = compB.teams.filter(t =>
      !report.promoted.includes(t) && !relegatedToC.includes(t)
    );
    const newB = [...stayB, ...report.relegated, ...promotedFromC];

    state.competitions.brasileirao_a = createCompetition({
      id: "brasileirao_a", name: "Brasileirão Série A", tier: 1,
      season: newSeason, teamIds: newA,
      rules: { relegation: 4, relegatedTo: "brasileirao_b" },
    });
    state.competitions.brasileirao_b = createCompetition({
      id: "brasileirao_b", name: "Brasileirão Série B", tier: 2,
      season: newSeason, teamIds: newB,
      rules: { promotion: 4, promotedTo: "brasileirao_a", relegation: 4, relegatedTo: "brasileirao_c" },
    });

    // Nova Série C: tira promovidos (foram pra B), entra rebaixados da B.
    // (Os 2 últimos da Fase 1 da C "iriam" para a Série D, mas sem D ainda → ficam em C.)
    if (compCp1) {
      const stayC = compCp1.teams.filter(t => !promotedFromC.includes(t));
      const newC = [...stayC, ...relegatedToC];
      state.competitions.brasileirao_c_p1 = createSerieCPhase1({
        season: newSeason,
        teamIds: newC,
      });
      // Limpa subcompetições da temporada anterior
      delete state.competitions.brasileirao_c_ga;
      delete state.competitions.brasileirao_c_gb;
      delete state.competitions.brasileirao_c_final;
      // Reseta meta
      state.serieCMeta = {
        currentPhase: "phase1",
        champion: null,
        promoted: [],
        relegated: [],
      };
    }
  }

  // 6. Reseta escalações de todos os times (foram modificadas por baixas)
  for (const team of Object.values(state.teams)) {
    team.lineup = []; // será re-montada na próxima escalação
    recalcExpenses(team, state.players);
  }

  return report;
}
