// Testes do Campeonato Catarinense — 2 grupos de 6 cruzados + mata-mata com
// TODAS as fases ida/volta (quartas intra-grupo, semis cruzadas, final).

import { test } from "node:test";
import assert from "node:assert/strict";

import { createRng } from "../src/utils/rng.js";
import { runRound } from "../src/engine/season.js";
import {
  createCatarinensePhase1, getCatarinenseQualified,
  createCatarinenseKnockout, advanceCatarinenseKnockout, applyCatarinenseKnockoutResult,
  getCatarinenseKnockoutLegs,
  CATARINENSE_GROUP_ROUNDS,
  CATARINENSE_QUARTERS_LEG1_ROUND, CATARINENSE_QUARTERS_LEG2_ROUND,
  CATARINENSE_SEMI_LEG1_ROUND, CATARINENSE_FINAL_LEG1_ROUND,
} from "../src/engine/catarinense.js";
import { makeState } from "./helpers.js";

const QUAL = { A: ["A1", "A2", "A3", "A4"], B: ["B1", "B2", "B3", "B4"] };

function buildPhase1(seed = 7) {
  return createCatarinensePhase1({ season: 2026, rng: createRng(seed) });
}
function groupOf(p) {
  const m = {};
  p.groupA.forEach(id => { m[id] = "A"; });
  p.groupB.forEach(id => { m[id] = "B"; });
  return m;
}

test("2 grupos de 6, 4 grandes 2-em-cada", () => {
  const p = buildPhase1();
  assert.equal(p.groupA.length, 6);
  assert.equal(p.groupB.length, 6);
  const bigs = ["ava", "cha", "fig", "cri"];
  assert.equal(bigs.filter(id => p.groupA.includes(id)).length, 2);
  assert.equal(bigs.filter(id => p.groupB.includes(id)).length, 2);
});

test("cada time joga 6 (todos cruzados), 36 jogos, 6 rodadas", () => {
  const p = buildPhase1();
  const g = groupOf(p);
  const count = {};
  for (const m of p.fixtures) {
    assert.notEqual(g[m.homeTeamId], g[m.awayTeamId], "jogo intra-grupo!");
    count[m.homeTeamId] = (count[m.homeTeamId] || 0) + 1;
    count[m.awayTeamId] = (count[m.awayTeamId] || 0) + 1;
  }
  for (const id of p.teams) assert.equal(count[id], 6, `${id}: 6 jogos`);
  assert.equal(p.fixtures.length, 36);
  assert.equal(Math.max(...p.fixtures.map(m => m.round)), CATARINENSE_GROUP_ROUNDS);
});

test("getCatarinenseQualified: top 4 de cada grupo", () => {
  const p = buildPhase1(123);
  const seeds = p.teams.map(id => ({ id, name: id, shortName: id, city: "c", state: "SC", reputation: 50, colors: { primary: "#111", secondary: "#eee" } }));
  const { state, rng } = makeState({ seed: 5, teamSeeds: seeds });
  state.competitions.estadual_sc = p;
  for (let r = 1; r <= CATARINENSE_GROUP_ROUNDS; r++) runRound(state, "estadual_sc", rng);
  const q = getCatarinenseQualified(p);
  assert.equal(q.A.length, 4);
  assert.equal(q.B.length, 4);
  assert.equal(new Set([...q.A, ...q.B]).size, 8);
});

test("quartas INTRA-grupo: 1A×4A, 2A×3A, 1B×4B, 2B×3B (ida/volta)", () => {
  const ko = createCatarinenseKnockout(QUAL);
  assert.equal(ko.phase, "quarters");
  for (const t of ko.quarters) assert.equal(t.legs.length, 2, "quartas ida/volta");
  const conf = ko.quarters.map(t => [t.teamAId, t.teamBId].join("×"));
  assert.deepEqual(conf, ["A1×A4", "A2×A3", "B1×B4", "B2×B3"]);
});

test("progressão quartas → semis → final → campeão (agregado)", () => {
  const ko = createCatarinenseKnockout(QUAL);
  const rng = createRng(2);
  const winTie = (t) => {
    t.legs[0].played = true; t.legs[0].score = { home: 0, away: 1 };
    t.legs[1].played = true; t.legs[1].score = { home: 2, away: 0 };
    applyCatarinenseKnockoutResult(ko, t.legs[1], rng);
  };
  ko.quarters.forEach(winTie);
  assert.ok(advanceCatarinenseKnockout(ko));
  assert.equal(ko.phase, "semis");
  ko.semis.forEach(winTie);
  assert.ok(advanceCatarinenseKnockout(ko));
  assert.equal(ko.phase, "final");
  winTie(ko.final);
  assert.ok(advanceCatarinenseKnockout(ko));
  assert.equal(ko.phase, "done");
  assert.equal(ko.champion, ko.final.teamAId);
});

test("empate no agregado vai a pênaltis", () => {
  const ko = createCatarinenseKnockout(QUAL);
  const rng = createRng(3);
  const t = ko.quarters[0];
  t.legs[0].played = true; t.legs[0].score = { home: 1, away: 1 };
  t.legs[1].played = true; t.legs[1].score = { home: 1, away: 1 };
  applyCatarinenseKnockoutResult(ko, t.legs[1], rng);
  assert.ok([t.teamAId, t.teamBId].includes(t.winnerId), "pênaltis decidem");
});

test("getCatarinenseKnockoutLegs: quartas R7/R8, semis só após quartas", () => {
  const ko = createCatarinenseKnockout(QUAL);
  assert.equal(getCatarinenseKnockoutLegs(ko, CATARINENSE_QUARTERS_LEG1_ROUND).length, 4);
  assert.equal(getCatarinenseKnockoutLegs(ko, CATARINENSE_QUARTERS_LEG2_ROUND).length, 4);
  assert.equal(getCatarinenseKnockoutLegs(ko, CATARINENSE_SEMI_LEG1_ROUND).length, 0);
  assert.equal(getCatarinenseKnockoutLegs(ko, CATARINENSE_FINAL_LEG1_ROUND).length, 0);
});

test("determinismo: mesma seed → mesma 1ª fase", () => {
  const dump = () => {
    const p = buildPhase1(2024);
    return p.groupA.join(",") + "|" + p.groupB.join(",") + "|" +
      p.fixtures.map(m => `${m.round}:${m.homeTeamId}-${m.awayTeamId}`).join(";");
  };
  assert.equal(dump(), dump());
});
