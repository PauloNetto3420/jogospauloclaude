// Testes do Campeonato Paraibano — liga turno único (10) + semis (1×4, 2×3)
// e final, ida/volta.

import { test } from "node:test";
import assert from "node:assert/strict";

import { createRng } from "../src/utils/rng.js";
import { runRound } from "../src/engine/season.js";
import {
  createParaibanoPhase1, getParaibanoStandings, getParaibanoQualified,
  createParaibanoKnockout, advanceParaibanoKnockout, applyParaibanoKnockoutResult,
  getParaibanoKnockoutLegs,
  PARAIBANO_PHASE1_ROUNDS, PARAIBANO_SEMI_LEG1_ROUND, PARAIBANO_FINAL_LEG1_ROUND,
} from "../src/engine/paraibano.js";
import { makeState } from "./helpers.js";

const QUAL = ["S1", "S2", "S3", "S4"];

test("rejeita número de times diferente de 10", () => {
  assert.throws(() => createParaibanoPhase1({ season: 2026, teamIds: ["a", "b"] }));
});

test("turno único: 10 times, 9 rodadas, 45 jogos, cada um joga 9", () => {
  const p = createParaibanoPhase1({ season: 2026 });
  assert.equal(p.teams.length, 10);
  assert.equal(p.fixtures.length, 45);
  assert.equal(Math.max(...p.fixtures.map(m => m.round)), PARAIBANO_PHASE1_ROUNDS);
  const count = {};
  for (const m of p.fixtures) { count[m.homeTeamId] = (count[m.homeTeamId] || 0) + 1; count[m.awayTeamId] = (count[m.awayTeamId] || 0) + 1; }
  for (const id of p.teams) assert.equal(count[id], 9);
});

test("getParaibanoQualified: top 4 da tabela", () => {
  const p = createParaibanoPhase1({ season: 2026 });
  const seeds = p.teams.map(id => ({ id, name: id, shortName: id, city: "c", state: "PB", reputation: 50, colors: { primary: "#111", secondary: "#eee" } }));
  const { state, rng } = makeState({ seed: 5, teamSeeds: seeds });
  state.competitions.estadual_pb = p;
  for (let r = 1; r <= PARAIBANO_PHASE1_ROUNDS; r++) runRound(state, "estadual_pb", rng);
  const q = getParaibanoQualified(p, state.teams);
  assert.equal(q.length, 4);
  assert.deepEqual(q, getParaibanoStandings(p, state.teams).slice(0, 4).map(s => s.teamId));
});

test("semis 1×4/2×3 → final → campeão (agregado)", () => {
  const ko = createParaibanoKnockout(QUAL);
  const sets = ko.semis.map(t => new Set([t.teamAId, t.teamBId]));
  assert.ok(sets.some(s => s.has("S1") && s.has("S4")), "1×4");
  assert.ok(sets.some(s => s.has("S2") && s.has("S3")), "2×3");
  const rng = createRng(1);
  const winTie = (t) => { t.legs[0].played = true; t.legs[0].score = { home: 0, away: 1 }; t.legs[1].played = true; t.legs[1].score = { home: 2, away: 0 }; applyParaibanoKnockoutResult(ko, t.legs[1], rng); };
  ko.semis.forEach(winTie);
  assert.ok(advanceParaibanoKnockout(ko));
  assert.equal(ko.phase, "final");
  winTie(ko.final);
  assert.ok(advanceParaibanoKnockout(ko));
  assert.equal(ko.phase, "done");
  assert.equal(ko.champion, ko.final.teamAId);
});

test("empate no agregado vai a pênaltis", () => {
  const ko = createParaibanoKnockout(QUAL);
  const rng = createRng(2);
  const t = ko.semis[0];
  t.legs[0].played = true; t.legs[0].score = { home: 1, away: 0 };
  t.legs[1].played = true; t.legs[1].score = { home: 1, away: 0 };
  applyParaibanoKnockoutResult(ko, t.legs[1], rng);
  assert.ok([t.teamAId, t.teamBId].includes(t.winnerId), "pênaltis decidem");
});

test("getParaibanoKnockoutLegs: semis R10, final só após semis", () => {
  const ko = createParaibanoKnockout(QUAL);
  assert.equal(getParaibanoKnockoutLegs(ko, PARAIBANO_SEMI_LEG1_ROUND).length, 2);
  assert.equal(getParaibanoKnockoutLegs(ko, PARAIBANO_FINAL_LEG1_ROUND).length, 0);
});
