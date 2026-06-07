// Testes do Campeonato Potiguar — liga turno único (8) + repescagem (3º-6º)
// + semis e final, ida/volta. Mesmo arquétipo do Pernambucano.

import { test } from "node:test";
import assert from "node:assert/strict";

import { createRng } from "../src/utils/rng.js";
import { runRound } from "../src/engine/season.js";
import {
  createPotiguarPhase1, getPotiguarStandings, getPotiguarQualified,
  createPotiguarKnockout, advancePotiguarKnockout, applyPotiguarKnockoutResult,
  getPotiguarKnockoutLegs,
  POTIGUAR_PHASE1_ROUNDS, POTIGUAR_PLAYOFF_LEG1_ROUND,
  POTIGUAR_SEMI_LEG1_ROUND, POTIGUAR_FINAL_LEG1_ROUND,
} from "../src/engine/potiguar.js";
import { makeState } from "./helpers.js";

const QUAL = ["S1", "S2", "S3", "S4", "S5", "S6"];

test("rejeita número de times diferente de 8", () => {
  assert.throws(() => createPotiguarPhase1({ season: 2026, teamIds: ["a", "b"] }));
});

test("turno único: 8 times, 7 rodadas, 28 jogos, cada um joga 7", () => {
  const p = createPotiguarPhase1({ season: 2026 });
  assert.equal(p.teams.length, 8);
  assert.equal(p.fixtures.length, 28);
  assert.equal(Math.max(...p.fixtures.map(m => m.round)), POTIGUAR_PHASE1_ROUNDS);
  const count = {};
  for (const m of p.fixtures) { count[m.homeTeamId] = (count[m.homeTeamId] || 0) + 1; count[m.awayTeamId] = (count[m.awayTeamId] || 0) + 1; }
  for (const id of p.teams) assert.equal(count[id], 7);
});

test("getPotiguarQualified: top 6 (1º-2º diretos, 3º-6º repescagem)", () => {
  const p = createPotiguarPhase1({ season: 2026 });
  const seeds = p.teams.map(id => ({ id, name: id, shortName: id, city: "c", state: "RN", reputation: 50, colors: { primary: "#111", secondary: "#eee" } }));
  const { state, rng } = makeState({ seed: 5, teamSeeds: seeds });
  state.competitions.estadual_rn = p;
  for (let r = 1; r <= POTIGUAR_PHASE1_ROUNDS; r++) runRound(state, "estadual_rn", rng);
  const q = getPotiguarQualified(p, state.teams);
  assert.equal(q.length, 6);
  assert.deepEqual(q, getPotiguarStandings(p, state.teams).slice(0, 6).map(s => s.teamId));
});

test("repescagem 3º×6º e 4º×5º; 1º/2º diretos; progressão até campeão", () => {
  const ko = createPotiguarKnockout(QUAL);
  assert.equal(ko.phase, "playoffs");
  assert.deepEqual(ko.direct, ["S1", "S2"]);
  const sets = ko.playoffs.map(t => new Set([t.teamAId, t.teamBId]));
  assert.ok(sets.some(s => s.has("S3") && s.has("S6")), "3×6");
  assert.ok(sets.some(s => s.has("S4") && s.has("S5")), "4×5");

  const rng = createRng(1);
  const winTie = (t) => { t.legs[0].played = true; t.legs[0].score = { home: 0, away: 1 }; t.legs[1].played = true; t.legs[1].score = { home: 3, away: 0 }; applyPotiguarKnockoutResult(ko, t.legs[1], rng); };
  ko.playoffs.forEach(winTie);
  assert.ok(advancePotiguarKnockout(ko));
  assert.equal(ko.phase, "semis");
  assert.equal(ko.semis.length, 2);
  ko.semis.forEach(winTie);
  assert.ok(advancePotiguarKnockout(ko));
  assert.equal(ko.phase, "final");
  winTie(ko.final);
  assert.ok(advancePotiguarKnockout(ko));
  assert.equal(ko.phase, "done");
  assert.ok(ko.champion);
});

test("getPotiguarKnockoutLegs: repescagem R8, semis só após", () => {
  const ko = createPotiguarKnockout(QUAL);
  assert.equal(getPotiguarKnockoutLegs(ko, POTIGUAR_PLAYOFF_LEG1_ROUND).length, 2);
  assert.equal(getPotiguarKnockoutLegs(ko, POTIGUAR_SEMI_LEG1_ROUND).length, 0);
  assert.equal(getPotiguarKnockoutLegs(ko, POTIGUAR_FINAL_LEG1_ROUND).length, 0);
});
