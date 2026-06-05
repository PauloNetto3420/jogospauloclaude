// Testes do Campeonato Amazonense — dois turnos (cruzado + intra-grupo), cada
// um com KO de 4 (1×4, 2×3, jogo único) + Grande Final entre os campeões.

import { test } from "node:test";
import assert from "node:assert/strict";

import { createRng } from "../src/utils/rng.js";
import {
  createAmazonenseT1Phase, createAmazonenseT2Phase, getAmazonenseQualified,
  createTurnoKnockout, advanceTurnoKnockout, getTurnoKnockoutLegs, makeGrandFinal,
  AMAZONENSE_T1_PHASE_ROUNDS, AMAZONENSE_T2_PHASE_START, AMAZONENSE_T2_PHASE_ROUNDS,
  AMAZONENSE_T1_SEMI_ROUND, AMAZONENSE_T1_FINAL_ROUND,
} from "../src/engine/amazonense.js";

function buildT1(seed = 7) {
  return createAmazonenseT1Phase({ season: 2026, rng: createRng(seed) });
}
function groupOf(p) {
  const m = {}; p.groupA.forEach(id => { m[id] = "A"; }); p.groupB.forEach(id => { m[id] = "B"; }); return m;
}

test("rejeita número de times diferente de 8", () => {
  assert.throws(() => createAmazonenseT1Phase({ season: 2026, rng: createRng(1), teamIds: ["a"] }));
});

test("1º turno CRUZADO: 2 grupos de 4, cada um joga 4, 16 jogos, 4 rodadas", () => {
  const p = buildT1();
  assert.equal(p.groupA.length, 4);
  assert.equal(p.groupB.length, 4);
  const g = groupOf(p);
  const count = {};
  for (const m of p.fixtures) {
    assert.notEqual(g[m.homeTeamId], g[m.awayTeamId], "1º turno é cruzado");
    count[m.homeTeamId] = (count[m.homeTeamId] || 0) + 1;
    count[m.awayTeamId] = (count[m.awayTeamId] || 0) + 1;
  }
  for (const id of p.teams) assert.equal(count[id], 4);
  assert.equal(p.fixtures.length, 16);
  assert.equal(Math.max(...p.fixtures.map(m => m.round)), AMAZONENSE_T1_PHASE_ROUNDS);
});

test("2º turno INTRA-grupo: cada um joga 3, 12 jogos, rodadas 7-9", () => {
  const t1 = buildT1();
  const t2 = createAmazonenseT2Phase({ season: 2026, t1comp: t1 });
  const g = groupOf(t1);
  const count = {};
  for (const m of t2.fixtures) {
    assert.equal(g[m.homeTeamId], g[m.awayTeamId], "2º turno é INTRA-grupo");
    count[m.homeTeamId] = (count[m.homeTeamId] || 0) + 1;
    count[m.awayTeamId] = (count[m.awayTeamId] || 0) + 1;
  }
  for (const id of t2.teams) assert.equal(count[id], 3, `${id} joga 3 (intra-grupo de 4)`);
  assert.equal(t2.fixtures.length, 12);
  assert.equal(Math.min(...t2.fixtures.map(m => m.round)), AMAZONENSE_T2_PHASE_START);
  assert.equal(Math.max(...t2.fixtures.map(m => m.round)), AMAZONENSE_T2_PHASE_START + AMAZONENSE_T2_PHASE_ROUNDS - 1);
});

test("KO de turno: semis 1×4/2×3 (jogo único) → final → campeão do turno", () => {
  const ko = createTurnoKnockout(["S1", "S2", "S3", "S4"], 5, 6, "t1");
  assert.equal(ko.phase, "semis");
  assert.deepEqual(ko.semis.map(t => [t.teamAId, t.teamBId].join("×")), ["S1×S4", "S2×S3"]);
  for (const s of ko.semis) assert.ok(s.leg && !s.legs, "jogo único");
  // S1 e S2 (mandantes) vencem
  ko.semis[0].leg.played = true; ko.semis[0].leg.score = { home: 2, away: 0 }; ko.semis[0].winnerId = "S1";
  ko.semis[1].leg.played = true; ko.semis[1].leg.score = { home: 1, away: 0 }; ko.semis[1].winnerId = "S2";
  assert.ok(advanceTurnoKnockout(ko));
  assert.equal(ko.phase, "final");
  assert.equal(ko.final.teamAId, "S1"); // melhor campanha manda
  ko.final.leg.played = true; ko.final.winnerId = "S1";
  assert.ok(advanceTurnoKnockout(ko));
  assert.equal(ko.phase, "done");
  assert.equal(ko.champion, "S1");
});

test("getTurnoKnockoutLegs: semis no semiRound, final só após semis", () => {
  const ko = createTurnoKnockout(["S1", "S2", "S3", "S4"], 5, 6, "t1");
  assert.equal(getTurnoKnockoutLegs(ko, 5).length, 2);
  assert.equal(getTurnoKnockoutLegs(ko, 6).length, 0);
  assert.equal(getTurnoKnockoutLegs(null, 5).length, 0);
});

test("Grande Final: jogo único, campeão do 1º turno manda", () => {
  const gf = makeGrandFinal("CAMP1", "CAMP2");
  assert.equal(gf.teamAId, "CAMP1");
  assert.equal(gf.teamBId, "CAMP2");
  assert.ok(gf.leg);
  assert.equal(gf.leg.homeTeamId, "CAMP1");
});

test("determinismo: mesma seed → mesmos grupos e fixtures do 1º turno", () => {
  const dump = () => {
    const p = buildT1(2024);
    return p.groupA.join(",") + "|" + p.groupB.join(",") + "|" +
      p.fixtures.map(m => `${m.round}:${m.homeTeamId}-${m.awayTeamId}`).join(";");
  };
  assert.equal(dump(), dump());
});
