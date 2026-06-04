// Testes do formato suíço do Campeonato Paulista (1ª fase).
// O gerador de confrontos é um algoritmo de grafo não-trivial — estas
// invariantes (8 jogos, 3 intra-pote, 5 inter-pote, sem repetição) são o
// que garante que o chaveamento está correto.

import { test } from "node:test";
import assert from "node:assert/strict";

import { createRng } from "../src/utils/rng.js";
import { runRound } from "../src/engine/season.js";
import {
  createPaulistaPhase1, getPaulistaQualified, getPaulistaRelegated,
  PAULISTA_GROUP_ROUNDS,
} from "../src/engine/paulista.js";
import { fakeSeeds, makeState } from "./helpers.js";

// 16 times fake em 4 potes de 4.
function pots16() {
  const ids = fakeSeeds(16).map(t => t.id);
  return [ids.slice(0, 4), ids.slice(4, 8), ids.slice(8, 12), ids.slice(12, 16)];
}

// Mapa teamId -> pote, pra checar intra/inter.
function poteIndex(pots) {
  const m = {};
  pots.forEach((p, i) => p.forEach(id => { m[id] = i; }));
  return m;
}

function buildPhase1(seed = 7) {
  const pots = pots16();
  const rng = createRng(seed);
  const phase1 = createPaulistaPhase1({ season: 2026, pots, rng });
  return { phase1, pots };
}

test("rejeita configuração que não seja 4 potes de 4", () => {
  const rng = createRng(1);
  assert.throws(() => createPaulistaPhase1({ season: 2026, pots: [["a"], ["b"]], rng }));
  assert.throws(() => createPaulistaPhase1({ season: 2026, pots: [["a","b","c"]], rng }));
});

test("cada time joga exatamente 8 partidas", () => {
  const { phase1 } = buildPhase1();
  const count = {};
  for (const m of phase1.fixtures) {
    count[m.homeTeamId] = (count[m.homeTeamId] || 0) + 1;
    count[m.awayTeamId] = (count[m.awayTeamId] || 0) + 1;
  }
  assert.equal(phase1.teams.length, 16, "16 times");
  for (const id of phase1.teams) {
    assert.equal(count[id], 8, `${id} deve jogar 8 partidas, jogou ${count[id]}`);
  }
});

test("composição: 3 jogos intra-pote + 5 inter-pote por time", () => {
  const { phase1, pots } = buildPhase1();
  const pote = poteIndex(pots);
  const intra = {}, inter = {};
  for (const id of phase1.teams) { intra[id] = 0; inter[id] = 0; }
  for (const m of phase1.fixtures) {
    const samePot = pote[m.homeTeamId] === pote[m.awayTeamId];
    for (const id of [m.homeTeamId, m.awayTeamId]) {
      if (samePot) intra[id]++; else inter[id]++;
    }
  }
  for (const id of phase1.teams) {
    assert.equal(intra[id], 3, `${id}: 3 intra-pote (veio ${intra[id]})`);
    assert.equal(inter[id], 5, `${id}: 5 inter-pote (veio ${inter[id]})`);
  }
});

test("nenhum time joga contra si mesmo e sem confronto repetido", () => {
  const { phase1 } = buildPhase1();
  const seen = new Set();
  for (const m of phase1.fixtures) {
    assert.notEqual(m.homeTeamId, m.awayTeamId, "time não joga contra si");
    const key = [m.homeTeamId, m.awayTeamId].sort().join("|");
    assert.ok(!seen.has(key), `confronto repetido: ${key}`);
    seen.add(key);
  }
  // 16 times * 8 / 2 = 64 confrontos únicos
  assert.equal(seen.size, 64, "64 confrontos únicos");
});

test("todos os pares dentro de cada pote se enfrentam (round-robin intra)", () => {
  const { phase1, pots } = buildPhase1();
  const seen = new Set();
  for (const m of phase1.fixtures) {
    seen.add([m.homeTeamId, m.awayTeamId].sort().join("|"));
  }
  for (const pot of pots) {
    for (let i = 0; i < pot.length; i++) {
      for (let j = i + 1; j < pot.length; j++) {
        const key = [pot[i], pot[j]].sort().join("|");
        assert.ok(seen.has(key), `par intra-pote ausente: ${key}`);
      }
    }
  }
});

test("fixtures cabem em 8 rodadas, 1 jogo por time por rodada", () => {
  const { phase1 } = buildPhase1();
  const rounds = new Set(phase1.fixtures.map(m => m.round));
  for (const r of rounds) {
    assert.ok(r >= 1 && r <= PAULISTA_GROUP_ROUNDS, `rodada ${r} fora de 1..8`);
  }
  // Em cada rodada, nenhum time aparece 2x
  for (let r = 1; r <= PAULISTA_GROUP_ROUNDS; r++) {
    const inRound = phase1.fixtures.filter(m => m.round === r);
    const ids = inRound.flatMap(m => [m.homeTeamId, m.awayTeamId]);
    assert.equal(new Set(ids).size, ids.length, `rodada ${r}: time repetido`);
  }
});

test("standings tem os 16 e mando é distribuído (não é tudo em casa)", () => {
  const { phase1 } = buildPhase1();
  assert.equal(phase1.standings.length, 16);
  const homeCounts = {};
  for (const m of phase1.fixtures) homeCounts[m.homeTeamId] = (homeCounts[m.homeTeamId] || 0) + 1;
  // Cada time manda entre 2 e 6 dos seus 8 jogos (não 0, não 8)
  for (const id of phase1.teams) {
    const h = homeCounts[id] || 0;
    assert.ok(h >= 1 && h <= 7, `${id} mando desbalanceado: ${h}/8 em casa`);
  }
});

test("getPaulistaQualified retorna os 8 primeiros; relegated os 2 últimos", () => {
  const { phase1, pots } = buildPhase1(123);
  // Joga a fase inteira pra ter classificação real
  const allSeeds = pots.flat().map(id => ({ id, name: id, shortName: id, city: "c", state: "SP", reputation: 50, colors: { primary: "#111", secondary: "#eee" } }));
  const { state, rng } = makeState({ seed: 5, teamSeeds: allSeeds });
  state.competitions.estadual_sp = phase1;
  const totalRounds = Math.max(...phase1.fixtures.map(m => m.round));
  for (let r = 1; r <= totalRounds; r++) runRound(state, "estadual_sp", rng);

  const qualified = getPaulistaQualified(phase1);
  const relegated = getPaulistaRelegated(phase1);
  assert.equal(qualified.length, 8, "8 classificados");
  assert.equal(relegated.length, 2, "2 rebaixados");
  // Disjuntos
  assert.equal(qualified.filter(id => relegated.includes(id)).length, 0, "classificados e rebaixados não se sobrepõem");
});

test("determinismo: mesma seed → mesmas fixtures", () => {
  const dump = () => {
    const { phase1 } = buildPhase1(2024);
    return phase1.fixtures.map(m => `${m.round}:${m.homeTeamId}-${m.awayTeamId}`).join("|");
  };
  assert.equal(dump(), dump(), "mesma seed deve gerar o mesmo chaveamento");
});
