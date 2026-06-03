// Testes do simulador de partida: invariantes do resultado, término,
// substituições e determinismo. É a peça que mais roda no jogo (cada rodada
// dispara dezenas de simulações em paralelo), então blindar aqui vale ouro.

import { test } from "node:test";
import assert from "node:assert/strict";

import { createRng } from "../src/utils/rng.js";
import { simulateMatch, createMatchSimulator } from "../src/engine/match.js";
import { fakeSeeds, makeState } from "./helpers.js";

// Pega dois times prontos (com elenco) de um estado.
function twoTeams(seed = 5) {
  const { state, rng } = makeState({ seed, teamSeeds: fakeSeeds(2) });
  const [a, b] = Object.values(state.teams);
  return { state, rng, home: a, away: b };
}

test("simulateMatch: placar não-negativo e resultado bem-formado", () => {
  const { state, rng, home, away } = twoTeams();
  const r = simulateMatch({ homeTeam: home, awayTeam: away, playersById: state.players, rng });

  assert.equal(r.homeTeamId, home.id);
  assert.equal(r.awayTeamId, away.id);
  assert.ok(Number.isInteger(r.score.home) && r.score.home >= 0, "gols casa >= 0 inteiro");
  assert.ok(Number.isInteger(r.score.away) && r.score.away >= 0, "gols fora >= 0 inteiro");
  assert.ok(Array.isArray(r.events), "events é array");
  assert.ok(r.stats && r.stats.home && r.stats.away, "stats tem home/away");
});

test("simulateMatch: nº de gols nos eventos bate com o placar", () => {
  const { state, rng, home, away } = twoTeams(11);
  const r = simulateMatch({ homeTeam: home, awayTeam: away, playersById: state.players, rng });

  const goalEvents = r.events.filter(e => e.type === "goal");
  assert.equal(goalEvents.length, r.score.home + r.score.away, "total de gols = soma do placar");
});

test("simulateMatch: todo evento referencia um jogador existente e minuto válido", () => {
  const { state, rng, home, away } = twoTeams(21);
  const r = simulateMatch({ homeTeam: home, awayTeam: away, playersById: state.players, rng });

  for (const e of r.events) {
    if (e.playerId) {
      assert.ok(state.players[e.playerId], `evento referencia jogador inexistente: ${e.playerId}`);
    }
    assert.ok(e.minute >= 0 && e.minute <= 90, `minuto fora de 0..90: ${e.minute}`);
  }
});

test("createMatchSimulator: termina e não passa de 90'", () => {
  const { state, rng, home, away } = twoTeams(33);
  const sim = createMatchSimulator({ homeTeam: home, awayTeam: away, playersById: state.players, rng });

  let safety = 0;
  while (!sim.isFinished() && safety < 1000) { sim.tick(); safety++; }
  assert.ok(sim.isFinished(), "deve terminar");
  assert.ok(sim.minute <= 90, `minuto final <= 90, veio ${sim.minute}`);
  assert.ok(safety < 1000, "não deve entrar em loop infinito");
});

test("substituição: consome 1 troca e 1 janela", () => {
  const { state, rng, home, away } = twoTeams(44);
  const sim = createMatchSimulator({ homeTeam: home, awayTeam: away, playersById: state.players, rng });
  // Avança um pouco pra ter jogo em andamento
  for (let i = 0; i < 10; i++) sim.tick();

  const before = sim.canSubstitute("home");
  assert.ok(before.bench.length > 0, "tem reserva no banco");
  const out = before.onField[0];
  const inP = before.bench[0];

  const res = sim.substitute("home", out.id, inP.id);
  assert.ok(res.ok, `substituição deveria funcionar: ${res.message || ""}`);
  sim.closeWindow("home", true);

  const after = sim.canSubstitute("home");
  assert.equal(after.subsLeft, before.subsLeft - 1, "uma troca a menos");
  assert.equal(after.windowsLeft, before.windowsLeft - 1, "uma janela a menos");
  // O que entrou está em campo; o que saiu não está
  assert.ok(after.onField.some(p => p.id === inP.id), "reserva entrou em campo");
  assert.ok(!after.onField.some(p => p.id === out.id), "titular saiu de campo");
});

test("substituição: máximo de 5 trocas", () => {
  const { state, rng, home, away } = twoTeams(55);
  const sim = createMatchSimulator({ homeTeam: home, awayTeam: away, playersById: state.players, rng });
  for (let i = 0; i < 5; i++) sim.tick();

  let done = 0;
  for (let i = 0; i < 8; i++) {
    const info = sim.canSubstitute("home");
    if (info.subsLeft <= 0 || info.bench.length === 0) break;
    const res = sim.substitute("home", info.onField[0].id, info.bench[0].id);
    if (res.ok) { done++; sim.closeWindow("home", true); }
    else break;
  }
  assert.ok(done <= 5, `não deve passar de 5 trocas, fez ${done}`);
  assert.equal(sim.canSubstitute("home").subsLeft, 5 - done, "subsLeft coerente");
});

test("determinismo: mesma seed → mesmo placar e mesmos eventos", () => {
  const play = () => {
    const { state, rng, home, away } = twoTeams(2024);
    return simulateMatch({ homeTeam: home, awayTeam: away, playersById: state.players, rng });
  };
  const r1 = play();
  const r2 = play();
  assert.deepEqual(r1.score, r2.score, "mesmo placar");
  assert.equal(r1.events.length, r2.events.length, "mesmo nº de eventos");
});

test("robustez: 200 partidas seguidas sem crash e sempre terminam", () => {
  const { state } = makeState({ seed: 1, teamSeeds: fakeSeeds(8) });
  const teams = Object.values(state.teams);
  const rng = createRng(777);
  let played = 0;
  for (let i = 0; i < 200; i++) {
    const h = teams[i % teams.length];
    const a = teams[(i + 1) % teams.length];
    const r = simulateMatch({ homeTeam: h, awayTeam: a, playersById: state.players, rng });
    assert.ok(r.score.home >= 0 && r.score.away >= 0);
    played++;
  }
  assert.equal(played, 200);
});
