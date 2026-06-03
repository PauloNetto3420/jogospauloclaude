// Testes da máquina de liga: round-robin, simulação, tabela e invariantes.

import { test } from "node:test";
import assert from "node:assert/strict";

import { createCompetition } from "../src/models/competition.js";
import {
  getCurrentRound, getMatchesOfRound, runRound, sortStandings,
} from "../src/engine/season.js";
import { fakeSeeds, makeState, addLeague } from "./helpers.js";

test("round-robin: 20 times geram 38 rodadas (turno e returno)", () => {
  const comp = createCompetition({
    id: "x", name: "X", tier: 1, season: 2026,
    teamIds: fakeSeeds(20).map(t => t.id), rules: {},
  });
  const rounds = new Set(comp.fixtures.map(m => m.round));
  assert.equal(rounds.size, 38, "deve ter 38 rodadas");
  // 20 times → 10 jogos por rodada → 380 jogos no total
  assert.equal(comp.fixtures.length, 380, "deve ter 380 jogos");
});

test("round-robin: cada time joga todo mundo 2x (1 em casa, 1 fora)", () => {
  const seeds = fakeSeeds(8);
  const ids = seeds.map(t => t.id);
  const comp = createCompetition({
    id: "x", name: "X", tier: 1, season: 2026, teamIds: ids, rules: {},
  });
  // Conta confrontos por par ordenado (home, away)
  const pairs = new Map();
  for (const m of comp.fixtures) {
    const key = `${m.homeTeamId}>${m.awayTeamId}`;
    pairs.set(key, (pairs.get(key) || 0) + 1);
  }
  for (const a of ids) {
    for (const b of ids) {
      if (a === b) continue;
      assert.equal(pairs.get(`${a}>${b}`), 1, `${a} deve receber ${b} exatamente 1x`);
    }
  }
});

test("getCurrentRound avança e vira null ao fim", () => {
  const { state, rng } = makeState({ teamSeeds: fakeSeeds(6) });
  const comp = addLeague(state, { teamIds: Object.keys(state.teams) });

  assert.equal(getCurrentRound(comp), 1, "começa na rodada 1");
  const totalRounds = Math.max(...comp.fixtures.map(m => m.round));

  for (let r = 1; r <= totalRounds; r++) {
    assert.equal(getCurrentRound(comp), r, `rodada atual deve ser ${r}`);
    runRound(state, comp.id, rng);
  }
  assert.equal(getCurrentRound(comp), null, "após a última rodada vira null");
});

test("tabela: jogos = vitórias + empates + derrotas, e total de pontos fecha", () => {
  const { state, rng } = makeState({ teamSeeds: fakeSeeds(10) });
  const comp = addLeague(state, { teamIds: Object.keys(state.teams) });

  let totalRounds = Math.max(...comp.fixtures.map(m => m.round));
  for (let r = 1; r <= totalRounds; r++) runRound(state, comp.id, rng);

  let totalGames = 0, totalPoints = 0, totalWins = 0, totalDraws = 0;
  for (const s of comp.standings) {
    assert.equal(s.played, s.wins + s.draws + s.losses, `${s.teamId}: J = V+E+D`);
    totalGames += s.played;
    totalPoints += s.points;
    totalWins += s.wins;
    totalDraws += s.draws;
  }
  // Cada jogo conta 2x na soma de "played" (um por time)
  assert.equal(totalGames, comp.fixtures.length * 2);
  // Pontos totais = 3 por jogo decidido + 2 por empate (1 pra cada lado)
  // wins é contado uma vez por jogo decidido; draws é contado 2x (um por time)
  const decidedGames = totalWins;            // 1 vencedor por jogo decidido
  const drawnGames = totalDraws / 2;         // cada empate aparece em 2 times
  assert.equal(decidedGames + drawnGames, comp.fixtures.length, "jogos decididos + empatados = total");
  assert.equal(totalPoints, decidedGames * 3 + drawnGames * 2, "soma de pontos coerente");
});

test("gols pró de um lado = gols contra do outro (soma global)", () => {
  const { state, rng } = makeState({ teamSeeds: fakeSeeds(8) });
  const comp = addLeague(state, { teamIds: Object.keys(state.teams) });
  let totalRounds = Math.max(...comp.fixtures.map(m => m.round));
  for (let r = 1; r <= totalRounds; r++) runRound(state, comp.id, rng);

  const gf = comp.standings.reduce((s, x) => s + x.goalsFor, 0);
  const ga = comp.standings.reduce((s, x) => s + x.goalsAgainst, 0);
  assert.equal(gf, ga, "soma de gols-pró = soma de gols-contra");
});

test("sortStandings ordena por pontos → SG → GP e não muta o original", () => {
  const { state } = makeState({ teamSeeds: fakeSeeds(5) });
  const comp = addLeague(state, { teamIds: Object.keys(state.teams) });
  // Injeta pontuações manuais
  const st = comp.standings;
  st[0].points = 10; st[0].goalsFor = 5; st[0].goalsAgainst = 5;  // SG 0
  st[1].points = 10; st[1].goalsFor = 9; st[1].goalsAgainst = 2;  // SG 7
  st[2].points = 15;
  st[3].points = 3;
  st[4].points = 7;

  const before = comp.standings.map(s => s.teamId).join(",");
  const sorted = sortStandings(comp, state.teams);
  const after = comp.standings.map(s => s.teamId).join(",");

  assert.equal(before, after, "sortStandings não deve mutar o array original");
  assert.equal(sorted[0].points, 15, "líder tem 15 pts");
  // Entre os dois de 10 pts, o de melhor SG vem primeiro
  const tenPointers = sorted.filter(s => s.points === 10);
  assert.equal(tenPointers[0].goalsFor - tenPointers[0].goalsAgainst, 7, "desempate por SG");
});

test("determinismo: mesma seed → mesma tabela final", () => {
  const run = () => {
    const { state, rng } = makeState({ seed: 1234, teamSeeds: fakeSeeds(8) });
    const comp = addLeague(state, { teamIds: Object.keys(state.teams) });
    let totalRounds = Math.max(...comp.fixtures.map(m => m.round));
    for (let r = 1; r <= totalRounds; r++) runRound(state, comp.id, rng);
    return sortStandings(comp, state.teams).map(s => `${s.teamId}:${s.points}:${s.goalsFor}-${s.goalsAgainst}`).join("|");
  };
  assert.equal(run(), run(), "duas execuções com a mesma seed devem bater");
});
