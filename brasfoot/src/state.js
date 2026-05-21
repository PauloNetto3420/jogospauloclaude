// Inicialização do GameState. Cria times, gera elencos e monta os campeonatos.

import { createRng } from "./utils/rng.js";
import { createTeam, recalcExpenses } from "./models/team.js";
import { generateSquad } from "./models/player.js";
import { createCompetition } from "./models/competition.js";
import { SERIE_A_SEED, SERIE_B_SEED } from "../data/teams.seed.js";

export function createNewGame({ managedTeamId, managerName, seed = 42, season = 2026 } = {}) {
  const rng = createRng(seed);

  const teams = {};
  const players = {};

  // 1. Cria todos os times e gera elencos
  for (const seedData of [...SERIE_A_SEED, ...SERIE_B_SEED]) {
    const team = createTeam(seedData);
    const squad = generateSquad(rng, team);
    for (const p of squad) {
      players[p.id] = p;
      team.squad.push(p.id);
    }
    recalcExpenses(team, players);
    teams[team.id] = team;
  }

  // 2. Monta os campeonatos
  const competitions = {};
  competitions["brasileirao_a"] = createCompetition({
    id: "brasileirao_a",
    name: "Brasileirão Série A",
    tier: 1,
    season,
    teamIds: SERIE_A_SEED.map(t => t.id),
    rules: { relegation: 4, relegatedTo: "brasileirao_b" },
  });
  competitions["brasileirao_b"] = createCompetition({
    id: "brasileirao_b",
    name: "Brasileirão Série B",
    tier: 2,
    season,
    teamIds: SERIE_B_SEED.map(t => t.id),
    rules: { promotion: 4, promotedTo: "brasileirao_a" },
  });

  return {
    saveId: `save_${Date.now()}`,
    managerName: managerName ?? "Técnico",
    managedTeamId: managedTeamId ?? "fla",
    currentDate: `${season}-04-01`,
    season,
    teams,
    players,
    competitions,
    freeAgents: [],
    transferMarket: { listed: [], offers: [] },
    inbox: [
      { id: "n_0", date: `${season}-04-01`, type: "news", subject: `Bem-vindo à temporada ${season}!`, read: false },
    ],
    settings: { difficulty: "normal", language: "pt-BR", seed },
  };
}
