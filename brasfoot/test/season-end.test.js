// Testes do encerramento de temporada: campeão, promoção/rebaixamento,
// envelhecimento, expiração de contratos e recomposição das divisões.
//
// O mundo de teste replica o real: A + B + C (20 times cada) + serieCMeta,
// porque endSeason rebaixa 4 da B para a C e promove 4 da C para a B — sem
// a Série C, a B encolheria. (Isso, aliás, é uma invariante importante: o
// pipeline A↔B↔C precisa estar completo para os tamanhos fecharem.)

import { test } from "node:test";
import assert from "node:assert/strict";

import { runRound, sortStandings } from "../src/engine/season.js";
import { isSeasonOver, endSeason } from "../src/engine/season-end.js";
import { createSerieCPhase1 } from "../src/engine/serie-c.js";
import { fakeSeeds, makeState, addLeague } from "./helpers.js";

// Monta A + B + C (20 cada) + serieCMeta, e joga A e B até o fim.
function fullSeasonState(seed = 7) {
  const aSeeds = fakeSeeds(20, { tierOffset: 0 });
  const bSeeds = fakeSeeds(20, { tierOffset: 20 });
  const cSeeds = fakeSeeds(20, { tierOffset: 40 });
  const { state, rng } = makeState({ seed, teamSeeds: [...aSeeds, ...bSeeds, ...cSeeds] });

  addLeague(state, { id: "brasileirao_a", tier: 1, teamIds: aSeeds.map(t => t.id),
    rules: { relegation: 4, relegatedTo: "brasileirao_b" } });
  addLeague(state, { id: "brasileirao_b", tier: 2, teamIds: bSeeds.map(t => t.id),
    rules: { promotion: 4, promotedTo: "brasileirao_a", relegation: 4, relegatedTo: "brasileirao_c" } });

  // Série C (1ª fase) — só precisamos da existência + serieCMeta.promoted
  // pra fechar a aritmética de subida/descida B↔C.
  const cIds = cSeeds.map(t => t.id);
  state.competitions.brasileirao_c_p1 = createSerieCPhase1({ season: state.season, teamIds: cIds });
  state.serieCMeta = {
    currentPhase: "done",
    champion: cIds[0],
    promoted: cIds.slice(0, 4),   // 4 sobem pra B
    relegated: [],
  };

  // Joga A e B até o fim (são as que a virada processa via tabela)
  for (const cid of ["brasileirao_a", "brasileirao_b"]) {
    const comp = state.competitions[cid];
    const totalRounds = Math.max(...comp.fixtures.map(m => m.round));
    for (let r = 1; r <= totalRounds; r++) runRound(state, cid, rng);
  }
  return { state, rng };
}

test("isSeasonOver: false no meio, true quando tudo jogado", () => {
  const { state, rng } = makeState({ teamSeeds: fakeSeeds(6) });
  const comp = addLeague(state, { teamIds: Object.keys(state.teams) });
  assert.equal(isSeasonOver(state), false, "ainda não acabou");
  const totalRounds = Math.max(...comp.fixtures.map(m => m.round));
  for (let r = 1; r <= totalRounds; r++) runRound(state, comp.id, rng);
  assert.equal(isSeasonOver(state), true, "todas as fixtures jogadas");
});

test("endSeason: campeão da A é o líder da tabela", () => {
  const { state, rng } = fullSeasonState();
  const sortedA = sortStandings(state.competitions.brasileirao_a, state.teams);
  const expectedChamp = sortedA[0].teamId;

  const report = endSeason(state, rng);
  assert.equal(report.champions.brasileirao_a, expectedChamp, "campeão = líder");
  assert.ok(
    state.teams[expectedChamp].trophies.some(t => t.competitionId === "brasileirao_a"),
    "campeão recebe troféu"
  );
});

test("endSeason: 4 rebaixados da A e 4 promovidos da B trocam de divisão", () => {
  const { state, rng } = fullSeasonState();
  const sortedA = sortStandings(state.competitions.brasileirao_a, state.teams);
  const sortedB = sortStandings(state.competitions.brasileirao_b, state.teams);
  const relegated = sortedA.slice(-4).map(s => s.teamId);
  const promoted = sortedB.slice(0, 4).map(s => s.teamId);

  const report = endSeason(state, rng);

  assert.deepEqual(report.relegated.sort(), relegated.sort(), "rebaixados = 4 últimos da A");
  assert.deepEqual(report.promoted.sort(), promoted.sort(), "promovidos = 4 primeiros da B");

  const newA = state.competitions.brasileirao_a.teams;
  const newB = state.competitions.brasileirao_b.teams;
  for (const id of promoted) assert.ok(newA.includes(id), `${id} subiu pra A`);
  for (const id of relegated) assert.ok(newB.includes(id), `${id} caiu pra B`);
  for (const id of promoted) assert.ok(!newB.includes(id), `${id} saiu da B`);
  for (const id of relegated) assert.ok(!newA.includes(id), `${id} saiu da A`);
});

test("endSeason: A, B e C mantêm 20 times após a virada", () => {
  const { state, rng } = fullSeasonState();
  endSeason(state, rng);
  assert.equal(state.competitions.brasileirao_a.teams.length, 20, "A continua com 20");
  assert.equal(state.competitions.brasileirao_b.teams.length, 20, "B continua com 20");
  assert.equal(state.competitions.brasileirao_c_p1.teams.length, 20, "C continua com 20");
});

test("endSeason: nenhum time fica em duas divisões ao mesmo tempo", () => {
  const { state, rng } = fullSeasonState();
  endSeason(state, rng);
  const a = state.competitions.brasileirao_a.teams;
  const b = state.competitions.brasileirao_b.teams;
  const c = state.competitions.brasileirao_c_p1.teams;
  const all = [...a, ...b, ...c];
  assert.equal(new Set(all).size, all.length, "sem times duplicados entre divisões");
});

test("endSeason: temporada incrementa e nova data é 1º de abril", () => {
  const { state, rng } = fullSeasonState();
  const prevSeason = state.season;
  endSeason(state, rng);
  assert.equal(state.season, prevSeason + 1, "season +1");
  assert.equal(state.currentDate, `${prevSeason + 1}-04-01`, "data reseta pra abril");
});

test("endSeason: jogadores envelhecem 1 ano (entre os que sobraram)", () => {
  const { state, rng } = fullSeasonState();
  const sample = Object.values(state.players).slice(0, 30).map(p => ({ id: p.id, age: p.age }));
  endSeason(state, rng);
  for (const { id, age } of sample) {
    const p = state.players[id];
    if (!p) continue; // aposentou — ok
    assert.equal(p.age, age + 1, `${id} deve ter envelhecido 1 ano`);
  }
});

test("endSeason: novas fixtures estão zeradas (nenhum jogo jogado)", () => {
  const { state, rng } = fullSeasonState();
  endSeason(state, rng);
  for (const cid of ["brasileirao_a", "brasileirao_b"]) {
    const comp = state.competitions[cid];
    assert.ok(comp.fixtures.every(m => !m.played), `${cid}: fixtures novas zeradas`);
    assert.ok(comp.standings.every(s => s.played === 0), `${cid}: standings zerados`);
  }
});

test("endSeason: 5 temporadas seguidas sem explodir (A/B/C sempre com 20)", () => {
  let { state, rng } = fullSeasonState(99);
  for (let s = 0; s < 5; s++) {
    endSeason(state, rng);
    assert.equal(state.competitions.brasileirao_a.teams.length, 20, `temporada ${s}: A com 20`);
    assert.equal(state.competitions.brasileirao_b.teams.length, 20, `temporada ${s}: B com 20`);
    assert.equal(state.competitions.brasileirao_c_p1.teams.length, 20, `temporada ${s}: C com 20`);

    // serieCMeta.promoted é resetado por endSeason → reabastece pra próxima virada
    // (simula o que advanceSerieCIfNeeded faria ao longo da temporada da C).
    const cIds = state.competitions.brasileirao_c_p1.teams;
    state.serieCMeta.promoted = cIds.slice(0, 4);

    for (const cid of ["brasileirao_a", "brasileirao_b"]) {
      const comp = state.competitions[cid];
      const totalRounds = Math.max(...comp.fixtures.map(m => m.round));
      for (let r = 1; r <= totalRounds; r++) runRound(state, cid, rng);
    }
  }
});
