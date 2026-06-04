// Testes do Campeonato Carioca (Taça Guanabara) — fase de grupos cruzada.
// A peculiaridade: cada time joga APENAS contra o outro grupo. Estas
// invariantes (6 jogos/time, todos cruzados, 36 jogos, 6 rodadas) garantem
// que o grafo bipartido está correto.

import { test } from "node:test";
import assert from "node:assert/strict";

import { createRng } from "../src/utils/rng.js";
import { runRound } from "../src/engine/season.js";
import {
  createCariocaPhase1, getCariocaGroupStandings, getCariocaQualified,
  CARIOCA_GROUP_ROUNDS, CARIOCA_TEAM_IDS,
} from "../src/engine/carioca.js";
import { makeState } from "./helpers.js";

function buildPhase1(seed = 7) {
  const rng = createRng(seed);
  return createCariocaPhase1({ season: 2026, rng });
}

// teamId -> "A" | "B"
function groupOf(phase1) {
  const m = {};
  phase1.groupA.forEach(id => { m[id] = "A"; });
  phase1.groupB.forEach(id => { m[id] = "B"; });
  return m;
}

test("rejeita número de times diferente de 12", () => {
  const rng = createRng(1);
  assert.throws(() => createCariocaPhase1({ season: 2026, rng, teamIds: ["a", "b"] }));
});

test("2 grupos de 6, disjuntos, cobrindo os 12", () => {
  const p = buildPhase1();
  assert.equal(p.groupA.length, 6, "Grupo A com 6");
  assert.equal(p.groupB.length, 6, "Grupo B com 6");
  const all = [...p.groupA, ...p.groupB];
  assert.equal(new Set(all).size, 12, "12 times únicos");
  for (const id of CARIOCA_TEAM_IDS) assert.ok(all.includes(id), `${id} está em algum grupo`);
});

test("os 4 grandes ficam 2 em cada grupo", () => {
  const p = buildPhase1();
  const bigs = ["fla", "flu", "bot", "vas"];
  const inA = bigs.filter(id => p.groupA.includes(id)).length;
  const inB = bigs.filter(id => p.groupB.includes(id)).length;
  assert.equal(inA, 2, "2 grandes no Grupo A");
  assert.equal(inB, 2, "2 grandes no Grupo B");
});

test("cada time joga exatamente 6 partidas", () => {
  const p = buildPhase1();
  const count = {};
  for (const m of p.fixtures) {
    count[m.homeTeamId] = (count[m.homeTeamId] || 0) + 1;
    count[m.awayTeamId] = (count[m.awayTeamId] || 0) + 1;
  }
  for (const id of p.teams) assert.equal(count[id], 6, `${id} deve jogar 6 (veio ${count[id]})`);
  assert.equal(p.fixtures.length, 36, "36 jogos (6 grupos × 6 rodadas)");
});

test("CRUZADO: todo jogo é entre grupos diferentes (nunca intra-grupo)", () => {
  const p = buildPhase1();
  const g = groupOf(p);
  for (const m of p.fixtures) {
    assert.notEqual(g[m.homeTeamId], g[m.awayTeamId], `jogo intra-grupo: ${m.homeTeamId} x ${m.awayTeamId}`);
  }
});

test("cada time enfrenta TODOS os 6 do outro grupo exatamente 1x", () => {
  const p = buildPhase1();
  const g = groupOf(p);
  // adversários de cada time
  const opp = {};
  for (const id of p.teams) opp[id] = new Set();
  for (const m of p.fixtures) {
    opp[m.homeTeamId].add(m.awayTeamId);
    opp[m.awayTeamId].add(m.homeTeamId);
  }
  for (const id of p.teams) {
    const others = g[id] === "A" ? p.groupB : p.groupA;
    assert.equal(opp[id].size, 6, `${id} enfrenta 6 adversários`);
    for (const o of others) assert.ok(opp[id].has(o), `${id} deveria enfrentar ${o}`);
  }
});

test("6 rodadas, 1 jogo por time por rodada", () => {
  const p = buildPhase1();
  const rounds = new Set(p.fixtures.map(m => m.round));
  assert.equal(rounds.size, CARIOCA_GROUP_ROUNDS, "6 rodadas");
  for (let r = 1; r <= CARIOCA_GROUP_ROUNDS; r++) {
    const inRound = p.fixtures.filter(m => m.round === r);
    const ids = inRound.flatMap(m => [m.homeTeamId, m.awayTeamId]);
    assert.equal(new Set(ids).size, ids.length, `rodada ${r}: time repetido`);
    assert.equal(inRound.length, 6, `rodada ${r}: 6 jogos`);
  }
});

test("getCariocaQualified: top 4 de cada grupo, disjuntos", () => {
  const p = buildPhase1(123);
  // joga a fase inteira
  const seeds = p.teams.map(id => ({ id, name: id, shortName: id, city: "c", state: "RJ", reputation: 50, colors: { primary: "#111", secondary: "#eee" } }));
  const { state, rng } = makeState({ seed: 5, teamSeeds: seeds });
  state.competitions.estadual_rj = p;
  const total = Math.max(...p.fixtures.map(m => m.round));
  for (let r = 1; r <= total; r++) runRound(state, "estadual_rj", rng);

  const q = getCariocaQualified(p);
  assert.equal(q.A.length, 4, "4 do Grupo A");
  assert.equal(q.B.length, 4, "4 do Grupo B");
  assert.equal(new Set([...q.A, ...q.B]).size, 8, "8 classificados únicos");
  // todos do A vêm do groupA, idem B
  for (const id of q.A) assert.ok(p.groupA.includes(id), `${id} é do Grupo A`);
  for (const id of q.B) assert.ok(p.groupB.includes(id), `${id} é do Grupo B`);
});

test("determinismo: mesma seed → mesmos grupos e fixtures", () => {
  const dump = () => {
    const p = buildPhase1(2024);
    return p.groupA.join(",") + "|" + p.groupB.join(",") + "|" +
      p.fixtures.map(m => `${m.round}:${m.homeTeamId}-${m.awayTeamId}`).join(";");
  };
  assert.equal(dump(), dump(), "mesma seed deve gerar o mesmo chaveamento");
});
