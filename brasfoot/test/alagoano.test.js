// Testes do Campeonato Alagoano — liga turno único (8 times) + top 4 ao
// mata-mata (semi olímpica 1×4/2×3) + semis e final ida/volta.

import { test } from "node:test";
import assert from "node:assert/strict";

import { createRng } from "../src/utils/rng.js";
import { runRound } from "../src/engine/season.js";
import {
  createAlagoanoPhase1, getAlagoanoStandings, getAlagoanoQualified,
  createAlagoanoKnockout, advanceAlagoanoKnockout, applyAlagoanoKnockoutResult,
  getAlagoanoKnockoutLegs,
  ALAGOANO_PHASE1_ROUNDS, ALAGOANO_SEMI_LEG1_ROUND, ALAGOANO_FINAL_LEG1_ROUND,
} from "../src/engine/alagoano.js";
import { makeState } from "./helpers.js";

const QUAL = ["S1", "S2", "S3", "S4"];

test("rejeita número de times diferente de 8", () => {
  assert.throws(() => createAlagoanoPhase1({ season: 2026, teamIds: ["a", "b"] }));
});

test("turno único: 8 times, 7 rodadas, 28 jogos, cada um joga 7", () => {
  const p = createAlagoanoPhase1({ season: 2026 });
  assert.equal(p.teams.length, 8);
  assert.equal(p.fixtures.length, 28);
  assert.equal(Math.max(...p.fixtures.map(m => m.round)), ALAGOANO_PHASE1_ROUNDS);
  const count = {};
  for (const m of p.fixtures) {
    count[m.homeTeamId] = (count[m.homeTeamId] || 0) + 1;
    count[m.awayTeamId] = (count[m.awayTeamId] || 0) + 1;
  }
  for (const id of p.teams) assert.equal(count[id], 7);
});

test("getAlagoanoQualified: top 4 + 8º rebaixado", () => {
  const p = createAlagoanoPhase1({ season: 2026 });
  const seeds = p.teams.map(id => ({ id, name: id, shortName: id, city: "c", state: "AL", reputation: 50, colors: { primary: "#111", secondary: "#eee" } }));
  const { state, rng } = makeState({ seed: 5, teamSeeds: seeds });
  state.competitions.estadual_al = p;
  for (let r = 1; r <= ALAGOANO_PHASE1_ROUNDS; r++) runRound(state, "estadual_al", rng);
  const q = getAlagoanoQualified(p, state.teams);
  const sorted = getAlagoanoStandings(p, state.teams);
  assert.equal(q.semifinalists.length, 4);
  assert.deepEqual(q.semifinalists, sorted.slice(0, 4).map(s => s.teamId));
  assert.equal(q.relegated, sorted[7].teamId, "8º rebaixado");
});

test("semis: cruzamento olímpico 1×4 e 2×3 (ida/volta)", () => {
  const ko = createAlagoanoKnockout(QUAL);
  assert.equal(ko.phase, "semis");
  assert.equal(ko.semis.length, 2);
  for (const s of ko.semis) assert.equal(s.legs.length, 2);
  const sets = ko.semis.map(t => new Set([t.teamAId, t.teamBId]));
  assert.ok(sets.some(s => s.has("S1") && s.has("S4")), "1×4");
  assert.ok(sets.some(s => s.has("S2") && s.has("S3")), "2×3");
});

test("progressão semis → final → campeão (agregado)", () => {
  const ko = createAlagoanoKnockout(QUAL);
  const rng = createRng(1);
  const winTie = (t) => { t.legs[0].played = true; t.legs[0].score = { home: 0, away: 1 }; t.legs[1].played = true; t.legs[1].score = { home: 2, away: 0 }; applyAlagoanoKnockoutResult(ko, t.legs[1], rng); };
  ko.semis.forEach(winTie);
  assert.ok(advanceAlagoanoKnockout(ko));
  assert.equal(ko.phase, "final");
  assert.ok(ko.final.legs);
  winTie(ko.final);
  assert.ok(advanceAlagoanoKnockout(ko));
  assert.equal(ko.phase, "done");
  assert.equal(ko.champion, ko.final.teamAId);
});

test("empate no agregado vai a pênaltis", () => {
  const ko = createAlagoanoKnockout(QUAL);
  const rng = createRng(2);
  const t = ko.semis[0];
  t.legs[0].played = true; t.legs[0].score = { home: 1, away: 0 };
  t.legs[1].played = true; t.legs[1].score = { home: 1, away: 0 }; // agregado 1-1
  applyAlagoanoKnockoutResult(ko, t.legs[1], rng);
  assert.ok([t.teamAId, t.teamBId].includes(t.winnerId), "pênaltis decidem");
});

test("getAlagoanoKnockoutLegs: semis R8, final só após semis", () => {
  const ko = createAlagoanoKnockout(QUAL);
  assert.equal(getAlagoanoKnockoutLegs(ko, ALAGOANO_SEMI_LEG1_ROUND).length, 2);
  assert.equal(getAlagoanoKnockoutLegs(ko, ALAGOANO_FINAL_LEG1_ROUND).length, 0);
});
