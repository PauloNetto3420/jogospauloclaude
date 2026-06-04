// Testes do Campeonato Mineiro — 1ª fase com 3 grupos cruzados.
// Invariantes: 8 jogos/time (contra os 8 de fora), nunca intra-grupo,
// 48 jogos, 1 jogo/time/rodada.

import { test } from "node:test";
import assert from "node:assert/strict";

import { createRng } from "../src/utils/rng.js";
import { runRound } from "../src/engine/season.js";
import {
  createMineiroPhase1, getMineiroGroupStandings, getMineiroQualified,
  MINEIRO_GROUP_ROUNDS,
} from "../src/engine/mineiro.js";
import { makeState } from "./helpers.js";

const IDS = Array.from({ length: 12 }, (_, i) => "T" + i);

function buildPhase1(seed = 7) {
  const rng = createRng(seed);
  return createMineiroPhase1({ season: 2026, rng, teamIds: IDS });
}

function groupOf(p) {
  const m = {};
  p.groupA.forEach(id => { m[id] = "A"; });
  p.groupB.forEach(id => { m[id] = "B"; });
  p.groupC.forEach(id => { m[id] = "C"; });
  return m;
}

test("rejeita número de times diferente de 12", () => {
  const rng = createRng(1);
  assert.throws(() => createMineiroPhase1({ season: 2026, rng, teamIds: ["a", "b"] }));
});

test("3 grupos de 4, disjuntos, cobrindo os 12", () => {
  const p = buildPhase1();
  assert.equal(p.groupA.length, 4);
  assert.equal(p.groupB.length, 4);
  assert.equal(p.groupC.length, 4);
  const all = [...p.groupA, ...p.groupB, ...p.groupC];
  assert.equal(new Set(all).size, 12, "12 únicos");
  for (const id of IDS) assert.ok(all.includes(id), `${id} em algum grupo`);
});

test("cada time joga exatamente 8 partidas", () => {
  const p = buildPhase1();
  const count = {};
  for (const m of p.fixtures) {
    count[m.homeTeamId] = (count[m.homeTeamId] || 0) + 1;
    count[m.awayTeamId] = (count[m.awayTeamId] || 0) + 1;
  }
  for (const id of p.teams) assert.equal(count[id], 8, `${id} deve jogar 8 (veio ${count[id]})`);
  assert.equal(p.fixtures.length, 48, "48 jogos");
});

test("CRUZADO: nenhum jogo é intra-grupo", () => {
  const p = buildPhase1();
  const g = groupOf(p);
  for (const m of p.fixtures) {
    assert.notEqual(g[m.homeTeamId], g[m.awayTeamId], `intra-grupo: ${m.homeTeamId} x ${m.awayTeamId}`);
  }
});

test("cada time enfrenta os 8 de fora exatamente 1x", () => {
  const p = buildPhase1();
  const g = groupOf(p);
  const opp = {};
  for (const id of p.teams) opp[id] = new Set();
  for (const m of p.fixtures) {
    opp[m.homeTeamId].add(m.awayTeamId);
    opp[m.awayTeamId].add(m.homeTeamId);
  }
  for (const id of p.teams) {
    assert.equal(opp[id].size, 8, `${id} enfrenta 8 adversários`);
    const myGroup = g[id];
    const outside = p.teams.filter(o => g[o] !== myGroup);
    for (const o of outside) assert.ok(opp[id].has(o), `${id} deveria enfrentar ${o}`);
  }
});

test("nenhum confronto repetido (48 únicos)", () => {
  const p = buildPhase1();
  const seen = new Set();
  for (const m of p.fixtures) {
    const k = [m.homeTeamId, m.awayTeamId].sort().join("|");
    assert.ok(!seen.has(k), `repetido: ${k}`);
    seen.add(k);
  }
  assert.equal(seen.size, 48);
});

test("1 jogo por time por rodada (byes permitidos)", () => {
  const p = buildPhase1();
  const maxRound = Math.max(...p.fixtures.map(m => m.round));
  assert.ok(maxRound <= MINEIRO_GROUP_ROUNDS, `rodadas <= ${MINEIRO_GROUP_ROUNDS}`);
  for (let r = 1; r <= maxRound; r++) {
    const inRound = p.fixtures.filter(m => m.round === r);
    const ids = inRound.flatMap(m => [m.homeTeamId, m.awayTeamId]);
    assert.equal(new Set(ids).size, ids.length, `rodada ${r}: time repetido`);
  }
});

test("getMineiroQualified: 4 classificados (3 líderes + melhor 2º)", () => {
  const p = buildPhase1(123);
  const seeds = p.teams.map(id => ({ id, name: id, shortName: id, city: "c", state: "MG", reputation: 50, colors: { primary: "#111", secondary: "#eee" } }));
  const { state, rng } = makeState({ seed: 5, teamSeeds: seeds });
  state.competitions.estadual_mg = p;
  const total = Math.max(...p.fixtures.map(m => m.round));
  for (let r = 1; r <= total; r++) runRound(state, "estadual_mg", rng);

  const q = getMineiroQualified(p);
  assert.equal(q.length, 4, "4 classificados");
  assert.equal(new Set(q).size, 4, "sem duplicados");

  // os 3 líderes de grupo devem estar entre os classificados
  const leaders = [
    getMineiroGroupStandings(p, "A")[0].teamId,
    getMineiroGroupStandings(p, "B")[0].teamId,
    getMineiroGroupStandings(p, "C")[0].teamId,
  ];
  for (const l of leaders) assert.ok(q.includes(l), `líder ${l} classificado`);
});

test("determinismo: mesma seed → mesmos grupos e fixtures", () => {
  const dump = () => {
    const p = buildPhase1(2024);
    return [p.groupA, p.groupB, p.groupC].map(g => g.join(",")).join("|") + "::" +
      p.fixtures.map(m => `${m.round}:${m.homeTeamId}-${m.awayTeamId}`).join(";");
  };
  assert.equal(dump(), dump());
});
