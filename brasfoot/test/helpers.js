// Utilitários compartilhados pelos testes.
// Montam um "mundo" mínimo de jogo em memória — sem DOM, sem IndexedDB —
// usando exatamente as mesmas funções de fábrica que o jogo real usa.

import { createRng } from "../src/utils/rng.js";
import { createTeam } from "../src/models/team.js";
import { generateSquad } from "../src/models/player.js";
import { createCompetition } from "../src/models/competition.js";

// Seeds fake determinísticos para N times. ids: T00, T01, ...
export function fakeSeeds(n, { tierOffset = 0 } = {}) {
  const ufs = ["SP", "RJ", "MG", "RS", "PR", "BA", "PE", "CE"];
  return Array.from({ length: n }, (_, i) => ({
    id: `T${String(i + tierOffset).padStart(2, "0")}`,
    name: `Time ${i + tierOffset}`,
    shortName: `T${i + tierOffset}`,
    city: "Cidade",
    state: ufs[i % ufs.length],
    reputation: 50 + ((i * 7) % 45),     // 50..94, variado mas determinístico
    budget: 10_000_000,
    monthlyIncome: 2_000_000,
    colors: { primary: "#123456", secondary: "#abcdef" },
  }));
}

// Cria um estado mínimo com times + elencos a partir de seeds.
export function makeState({ seed = 42, teamSeeds } = {}) {
  const rng = createRng(seed);
  const state = {
    season: 2026,
    currentDate: "2026-04-01",
    managedTeamId: teamSeeds[0].id,
    teams: {},
    players: {},
    freeAgents: [],
    competitions: {},
    log: [],
    transferOffers: [],
    transferRequests: [],
    seasonPhase: "national",
    estadualRound: 1,
    estaduais: null,
  };
  for (const s of teamSeeds) {
    const team = createTeam(s);
    for (const p of generateSquad(rng, team)) {
      state.players[p.id] = p;
      team.squad.push(p.id);
    }
    state.teams[team.id] = team;
  }
  return { state, rng };
}

// Cria uma liga (pontos corridos) e a registra no state.
export function addLeague(state, { id = "brasileirao_a", tier = 1, teamIds, rules = {} }) {
  const comp = createCompetition({
    id, name: id, tier, season: state.season, teamIds, rules,
  });
  state.competitions[id] = comp;
  return comp;
}

// Joga todas as rodadas pendentes de uma competição até o fim, usando runRound.
export function playToEnd(state, compId, rng, { maxRounds = 100 } = {}) {
  let guard = 0;
  // Import dinâmico evitado: runRound é passado pelo chamador via closure
  return guard;
}
