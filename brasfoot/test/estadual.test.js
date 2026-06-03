// Testes dos Estaduais (pré-temporada): criação por UF, formato de grupos,
// e a progressão grupos → semis → final → campeão.

import { test } from "node:test";
import assert from "node:assert/strict";

import { createTeam } from "../src/models/team.js";
import { generateSquad } from "../src/models/player.js";
import { createRng } from "../src/utils/rng.js";
import { runRound, applyMatchResult } from "../src/engine/season.js";
import {
  createEstaduais, getEstadualMatchesForRound, estadualTotalRounds,
  advanceEstadualPhase, applyEstadualKnockoutResult, isEstadualDone,
  ESTADUAL_STATES,
} from "../src/engine/estadual.js";

// Monta um estado com N times por UF dos 4 estados oficiais (SP/RJ/MG/RS).
function stateWithEstaduais({ seed = 7, perUf = 6 } = {}) {
  const rng = createRng(seed);
  const state = {
    season: 2026, currentDate: "2026-02-01", managedTeamId: null,
    teams: {}, players: {}, competitions: {}, log: [],
  };
  let n = 0;
  for (const uf of ESTADUAL_STATES) {
    for (let i = 0; i < perUf; i++) {
      const seedTeam = {
        id: `${uf}${i}`, name: `${uf} Team ${i}`, shortName: `${uf}${i}`,
        city: "Cidade", state: uf,
        reputation: 50 + ((n * 5) % 40),
        colors: { primary: "#111111", secondary: "#eeeeee" },
      };
      const team = createTeam(seedTeam);
      for (const p of generateSquad(rng, team)) {
        state.players[p.id] = p;
        team.squad.push(p.id);
      }
      state.teams[team.id] = team;
      n++;
    }
  }
  state.estaduais = createEstaduais(state, state.season, rng);
  return { state, rng };
}

// Joga todas as rodadas de grupo + mata-mata de UM estadual até sair campeão.
function playEstadualToEnd(state, estadual, rng) {
  const total = estadualTotalRounds(estadual);
  for (let round = 1; round <= total; round++) {
    const matches = getEstadualMatchesForRound(state, estadual, round);
    for (const mm of matches) {
      const m = mm.match;
      if (m.played) continue;
      m.played = true;
      m.score = { home: rng.int(0, 3), away: rng.int(0, 2) };
      m.events = [];
      if (mm.kind === "group") {
        applyMatchResult(state, m, { ...m, homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId, score: m.score, events: [], stats: { home: {}, away: {} }, lineups: { home: [], away: [] } }, state.competitions[mm.compId]);
      } else {
        applyEstadualKnockoutResult(estadual, m, rng);
      }
    }
    advanceEstadualPhase(state, estadual, state.season, rng);
  }
}

test("createEstaduais: cria 1 estadual por UF oficial (com times suficientes)", () => {
  const { state } = stateWithEstaduais({ perUf: 6 });
  for (const uf of ESTADUAL_STATES) {
    assert.ok(state.estaduais[uf], `estadual de ${uf} existe`);
    assert.equal(state.estaduais[uf].uf, uf);
    assert.equal(state.estaduais[uf].phase, "groups", "começa na fase de grupos");
  }
});

test("UF com menos de 4 times não gera estadual", () => {
  // Estado mínimo com apenas 3 times em SP — abaixo do mínimo de 4.
  const rng = createRng(1);
  const mini = { season: 2026, teams: {}, players: {}, competitions: {} };
  for (let i = 0; i < 3; i++) {
    const t = createTeam({ id: `SP${i}`, name: `x`, shortName: `x`, city: "c", state: "SP", reputation: 60, colors: { primary: "#000", secondary: "#fff" } });
    mini.teams[t.id] = t;
  }
  const es = createEstaduais(mini, 2026, rng);
  assert.equal(es.SP, undefined, "SP com 3 times não vira estadual");
});

test("≤8 times: grupo único; >8 times: dois grupos", () => {
  const small = stateWithEstaduais({ perUf: 6 });   // 6 → grupo único
  assert.equal(small.state.estaduais.SP.twoGroups, false, "6 times = grupo único");

  const big = stateWithEstaduais({ perUf: 10 });     // 10 → dois grupos
  assert.equal(big.state.estaduais.SP.twoGroups, true, "10 times = dois grupos");
  assert.equal(big.state.estaduais.SP.groupIds.length, 2, "dois ids de grupo");
});

test("getEstadualMatchesForRound: rodada 1 traz jogos de grupo", () => {
  const { state } = stateWithEstaduais({ perUf: 6 });
  const est = state.estaduais.SP;
  const r1 = getEstadualMatchesForRound(state, est, 1);
  assert.ok(r1.length > 0, "tem jogos na rodada 1");
  for (const mm of r1) assert.equal(mm.kind, "group", "rodada 1 = grupo");
});

test("progressão completa: grupos → semis → final → campeão", () => {
  const { state, rng } = stateWithEstaduais({ perUf: 6 });
  const est = state.estaduais.SP;

  assert.equal(est.phase, "groups");
  playEstadualToEnd(state, est, rng);

  assert.equal(est.phase, "done", "terminou na fase done");
  assert.ok(isEstadualDone(est), "isEstadualDone = true");
  assert.ok(est.champion, "tem campeão");
  assert.ok(state.teams[est.champion], "campeão é um time válido");
  assert.equal(est.teams.includes(est.champion), true, "campeão participou do estadual");
});

test("semis sempre montam 2 confrontos", () => {
  const { state, rng } = stateWithEstaduais({ perUf: 6 });
  const est = state.estaduais.SP;
  // Joga só até o fim dos grupos
  const groupRounds = est.schedule.groupRounds;
  for (let round = 1; round <= groupRounds; round++) {
    for (const mm of getEstadualMatchesForRound(state, est, round)) {
      const m = mm.match;
      m.played = true; m.score = { home: rng.int(0, 3), away: rng.int(0, 2) }; m.events = [];
      applyMatchResult(state, m, { homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId, score: m.score, events: [], stats: { home: {}, away: {} }, lineups: { home: [], away: [] } }, state.competitions[mm.compId]);
    }
    advanceEstadualPhase(state, est, state.season, rng);
  }
  assert.equal(est.phase, "semis", "entrou na fase de semis");
  assert.equal(est.knockout.semis.length, 2, "2 semifinais");
});

test("determinismo: mesma seed → mesmo campeão estadual", () => {
  const run = () => {
    const { state, rng } = stateWithEstaduais({ seed: 2024, perUf: 6 });
    const est = state.estaduais.SP;
    playEstadualToEnd(state, est, rng);
    return est.champion;
  };
  assert.equal(run(), run(), "mesmo campeão com a mesma seed");
});
