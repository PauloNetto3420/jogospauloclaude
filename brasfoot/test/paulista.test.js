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
  createPaulistaKnockout, advancePaulistaKnockout, applyPaulistaKnockoutResult,
  getPaulistaKnockoutLegs,
  PAULISTA_QUARTERS_ROUND, PAULISTA_SEMIS_ROUND,
  PAULISTA_FINAL_LEG1_ROUND, PAULISTA_FINAL_LEG2_ROUND,
} from "../src/engine/paulista.js";
import { fakeSeeds, makeState } from "./helpers.js";

// Helper: joga um leg de jogo único com placar fixo e aplica.
function playSingle(ko, entry, rng, homeGoals, awayGoals) {
  entry.leg.played = true;
  entry.leg.score = { home: homeGoals, away: awayGoals };
  applyPaulistaKnockoutResult(ko, entry.leg, rng);
}

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

// -------------------- Mata-mata --------------------

const Q = ["A", "B", "C", "D", "E", "F", "G", "H"]; // 8 classificados, A=1º ... H=8º

test("quartas: chaveamento 1×8, 2×7, 3×6, 4×5 com mando do melhor", () => {
  const ko = createPaulistaKnockout(Q);
  assert.equal(ko.phase, "quarters");
  assert.equal(ko.quarters.length, 4);
  // confrontos (independente da ordem dos ties)
  const pairs = ko.quarters.map(t => [t.teamAId, t.teamBId].sort().join("-")).sort();
  assert.deepEqual(pairs, [["A","H"].join("-"), ["B","G"].join("-"), ["C","F"].join("-"), ["D","E"].join("-")].sort());
  // mando: melhor colocado em casa (teamAId é o mandante em jogo único)
  for (const t of ko.quarters) {
    const homeSeed = Q.indexOf(t.teamAId), awaySeed = Q.indexOf(t.teamBId);
    assert.ok(homeSeed < awaySeed, `${t.teamAId} (seed ${homeSeed}) deve mandar contra ${t.teamBId} (${awaySeed})`);
  }
});

test("progressão quartas → semis → final → campeão", () => {
  const ko = createPaulistaKnockout(Q);
  const rng = createRng(1);

  // Quartas: mandantes (melhores) vencem
  for (const t of ko.quarters) playSingle(ko, { leg: t.leg }, rng, 2, 0);
  assert.ok(advancePaulistaKnockout(ko, 2026), "deve avançar pras semis");
  assert.equal(ko.phase, "semis");
  assert.equal(ko.semis.length, 2);
  // vencedores das quartas são A,B,C,D (os 4 melhores)
  const qfWinners = ko.quarters.map(t => t.winnerId).sort();
  assert.deepEqual(qfWinners, ["A","B","C","D"]);

  // Semis: mandantes vencem
  for (const t of ko.semis) playSingle(ko, { leg: t.leg }, rng, 1, 0);
  assert.ok(advancePaulistaKnockout(ko, 2026), "deve avançar pra final");
  assert.equal(ko.phase, "final");
  assert.ok(ko.final, "final criada");
  assert.equal(ko.final.legs.length, 2, "final é ida e volta");

  // Final: decide por agregado. teamA (melhor campanha) joga volta (leg2) em casa.
  const [l1, l2] = ko.final.legs;
  l1.played = true; l1.score = { home: 0, away: 1 }; // ida: teamA (visitante) faz 1
  l2.played = true; l2.score = { home: 2, away: 0 }; // volta: teamA (mandante) faz 2
  applyPaulistaKnockoutResult(ko, l2, rng);
  assert.ok(advancePaulistaKnockout(ko, 2026), "deve concluir");
  assert.equal(ko.phase, "done");
  assert.equal(ko.champion, ko.final.teamAId, "teamA campeão (agregado 3×0)");
  assert.equal(ko.final.aggregate.teamA, 3);
  assert.equal(ko.final.aggregate.teamB, 0);
});

test("quartas empatadas vão a pênaltis e definem vencedor", () => {
  const ko = createPaulistaKnockout(Q);
  const rng = createRng(3);
  const t = ko.quarters[0];
  playSingle(ko, { leg: t.leg }, rng, 1, 1); // empate
  assert.ok([t.teamAId, t.teamBId].includes(t.winnerId), "empate decide um vencedor (pênaltis)");
});

test("final não decide com apenas uma perna jogada", () => {
  const ko = createPaulistaKnockout(Q);
  const rng = createRng(4);
  for (const t of ko.quarters) playSingle(ko, { leg: t.leg }, rng, 2, 0);
  advancePaulistaKnockout(ko, 2026);
  for (const t of ko.semis) playSingle(ko, { leg: t.leg }, rng, 1, 0);
  advancePaulistaKnockout(ko, 2026);
  const [l1] = ko.final.legs;
  l1.played = true; l1.score = { home: 1, away: 0 };
  applyPaulistaKnockoutResult(ko, l1, rng);
  assert.equal(ko.final.winnerId, null, "não decide só com a ida");
  assert.equal(advancePaulistaKnockout(ko, 2026), false, "não avança sem a volta");
});

test("getPaulistaKnockoutLegs retorna os legs da rodada certa", () => {
  const ko = createPaulistaKnockout(Q);
  const qf = getPaulistaKnockoutLegs(ko, PAULISTA_QUARTERS_ROUND);
  assert.equal(qf.length, 4, "4 jogos nas quartas");
  assert.equal(getPaulistaKnockoutLegs(ko, PAULISTA_SEMIS_ROUND).length, 0, "semis ainda não existem");
  // rodada sem mata-mata
  assert.equal(getPaulistaKnockoutLegs(ko, 99).length, 0);
});
