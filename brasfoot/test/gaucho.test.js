// Testes do Campeonato Gaúcho — grupos cruzados + mata-mata com final ida/volta.
// A 1ª fase é igual à do Carioca (K(6,6)); o diferencial é a FINAL ida e volta.

import { test } from "node:test";
import assert from "node:assert/strict";

import { createRng } from "../src/utils/rng.js";
import { runRound } from "../src/engine/season.js";
import {
  createGauchoPhase1, getGauchoGroupStandings, getGauchoQualified,
  createGauchoKnockout, advanceGauchoKnockout, applyGauchoKnockoutResult,
  getGauchoKnockoutLegs,
  GAUCHO_GROUP_ROUNDS, GAUCHO_TEAM_IDS,
  GAUCHO_QUARTERS_ROUND, GAUCHO_SEMI_LEG1_ROUND,
  GAUCHO_FINAL_LEG1_ROUND, GAUCHO_FINAL_LEG2_ROUND,
} from "../src/engine/gaucho.js";
import { makeState } from "./helpers.js";

const QUAL = { A: ["A1", "A2", "A3", "A4"], B: ["B1", "B2", "B3", "B4"] };

function buildPhase1(seed = 7) {
  return createGauchoPhase1({ season: 2026, rng: createRng(seed) });
}
function groupOf(p) {
  const m = {};
  p.groupA.forEach(id => { m[id] = "A"; });
  p.groupB.forEach(id => { m[id] = "B"; });
  return m;
}

// -------------------- 1ª fase --------------------

test("2 grupos de 6, 4 grandes 2-em-cada", () => {
  const p = buildPhase1();
  assert.equal(p.groupA.length, 6);
  assert.equal(p.groupB.length, 6);
  const bigs = ["gre", "int", "juv", "cax"];
  assert.equal(bigs.filter(id => p.groupA.includes(id)).length, 2);
  assert.equal(bigs.filter(id => p.groupB.includes(id)).length, 2);
});

test("cada time joga 6 (todos cruzados), 36 jogos", () => {
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
});

test("6 rodadas, 1 jogo por time por rodada", () => {
  const p = buildPhase1();
  for (let r = 1; r <= GAUCHO_GROUP_ROUNDS; r++) {
    const ids = p.fixtures.filter(m => m.round === r).flatMap(m => [m.homeTeamId, m.awayTeamId]);
    assert.equal(new Set(ids).size, ids.length, `rodada ${r} sem repetição`);
    assert.equal(ids.length, 12, `rodada ${r}: 6 jogos`);
  }
});

test("getGauchoQualified: top 4 de cada grupo", () => {
  const p = buildPhase1(123);
  const seeds = p.teams.map(id => ({ id, name: id, shortName: id, city: "c", state: "RS", reputation: 50, colors: { primary: "#111", secondary: "#eee" } }));
  const { state, rng } = makeState({ seed: 5, teamSeeds: seeds });
  state.competitions.estadual_rs = p;
  const total = Math.max(...p.fixtures.map(m => m.round));
  for (let r = 1; r <= total; r++) runRound(state, "estadual_rs", rng);
  const q = getGauchoQualified(p);
  assert.equal(q.A.length, 4);
  assert.equal(q.B.length, 4);
  assert.equal(new Set([...q.A, ...q.B]).size, 8);
});

// -------------------- Mata-mata --------------------

test("quartas: 1A×4A, 2A×3A, 1B×4B, 2B×3B (jogo único)", () => {
  const ko = createGauchoKnockout(QUAL);
  assert.equal(ko.phase, "quarters");
  const conf = ko.quarters.map(t => [t.teamAId, t.teamBId].join("×"));
  assert.deepEqual(conf, ["A1×A4", "A2×A3", "B1×B4", "B2×B3"]);
  for (const t of ko.quarters) assert.ok(t.leg, "quartas é jogo único");
});

test("semis E final são ida e volta", () => {
  const ko = createGauchoKnockout(QUAL);
  const rng = createRng(1);
  for (const t of ko.quarters) { t.leg.played = true; t.leg.score = { home: 2, away: 0 }; applyGauchoKnockoutResult(ko, t.leg, rng); }
  assert.ok(advanceGauchoKnockout(ko));
  assert.equal(ko.phase, "semis");
  for (const s of ko.semis) assert.equal(s.legs.length, 2, "semi ida/volta");

  for (const s of ko.semis) {
    s.legs[0].played = true; s.legs[0].score = { home: 0, away: 1 };
    s.legs[1].played = true; s.legs[1].score = { home: 2, away: 0 };
    applyGauchoKnockoutResult(ko, s.legs[1], rng);
  }
  assert.ok(advanceGauchoKnockout(ko));
  assert.equal(ko.phase, "final");
  assert.ok(ko.final.legs, "final é ida e volta");
  assert.equal(ko.final.legs.length, 2);
});

test("progressão completa até campeão (final por agregado)", () => {
  const ko = createGauchoKnockout(QUAL);
  const rng = createRng(2);
  for (const t of ko.quarters) { t.leg.played = true; t.leg.score = { home: 3, away: 0 }; applyGauchoKnockoutResult(ko, t.leg, rng); }
  advanceGauchoKnockout(ko);
  for (const s of ko.semis) {
    s.legs[0].played = true; s.legs[0].score = { home: 1, away: 1 };
    s.legs[1].played = true; s.legs[1].score = { home: 2, away: 0 };
    applyGauchoKnockoutResult(ko, s.legs[1], rng);
  }
  advanceGauchoKnockout(ko);
  // final: teamA (manda na volta) vence agregado
  const [l1, l2] = ko.final.legs;
  l1.played = true; l1.score = { home: 0, away: 2 }; // teamA visitante faz 2
  l2.played = true; l2.score = { home: 1, away: 0 }; // teamA mandante faz 1
  applyGauchoKnockoutResult(ko, l2, rng);
  assert.ok(advanceGauchoKnockout(ko));
  assert.equal(ko.phase, "done");
  assert.equal(ko.champion, ko.final.teamAId, "teamA campeão (agregado 3×0)");
  assert.equal(ko.final.aggregate.teamA, 3);
});

test("final empatada no agregado vai a pênaltis", () => {
  const ko = createGauchoKnockout(QUAL);
  const rng = createRng(3);
  for (const t of ko.quarters) { t.leg.played = true; t.leg.score = { home: 2, away: 0 }; applyGauchoKnockoutResult(ko, t.leg, rng); }
  advanceGauchoKnockout(ko);
  for (const s of ko.semis) {
    s.legs[0].played = true; s.legs[0].score = { home: 1, away: 0 };
    s.legs[1].played = true; s.legs[1].score = { home: 1, away: 0 };
    applyGauchoKnockoutResult(ko, s.legs[1], rng);
  }
  advanceGauchoKnockout(ko);
  const [l1, l2] = ko.final.legs;
  l1.played = true; l1.score = { home: 1, away: 1 };
  l2.played = true; l2.score = { home: 1, away: 1 }; // agregado 2-2
  applyGauchoKnockoutResult(ko, l2, rng);
  assert.ok([ko.final.teamAId, ko.final.teamBId].includes(ko.final.winnerId), "pênaltis decidem");
});

test("getGauchoKnockoutLegs: quartas R7, final R10/R11", () => {
  const ko = createGauchoKnockout(QUAL);
  assert.equal(getGauchoKnockoutLegs(ko, GAUCHO_QUARTERS_ROUND).length, 4);
  assert.equal(getGauchoKnockoutLegs(ko, GAUCHO_SEMI_LEG1_ROUND).length, 0, "semis ainda não existem");
  assert.equal(getGauchoKnockoutLegs(ko, 99).length, 0);
});

test("determinismo: mesma seed → mesma 1ª fase", () => {
  const dump = () => {
    const p = buildPhase1(2024);
    return p.groupA.join(",") + "|" + p.groupB.join(",") + "|" +
      p.fixtures.map(m => `${m.round}:${m.homeTeamId}-${m.awayTeamId}`).join(";");
  };
  assert.equal(dump(), dump());
});
