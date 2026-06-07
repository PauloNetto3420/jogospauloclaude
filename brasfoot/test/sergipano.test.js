// Testes do Campeonato Sergipano — liga turno único (10) + repescagem (2º-7º)
// + semis e final, ida/volta. Mesmo arquétipo do Potiguar, mas só 1 vaga direta.

import { test } from "node:test";
import assert from "node:assert/strict";

import { createRng } from "../src/utils/rng.js";
import { runRound } from "../src/engine/season.js";
import {
  createSergipanoPhase1, getSergipanoStandings, getSergipanoQualified,
  createSergipanoKnockout, advanceSergipanoKnockout, applySergipanoKnockoutResult,
  getSergipanoKnockoutLegs,
  SERGIPANO_PHASE1_ROUNDS, SERGIPANO_PLAYOFF_LEG1_ROUND,
  SERGIPANO_SEMI_LEG1_ROUND, SERGIPANO_FINAL_LEG1_ROUND,
} from "../src/engine/sergipano.js";
import { makeState } from "./helpers.js";

const QUAL = ["S1", "S2", "S3", "S4", "S5", "S6", "S7"];

test("rejeita número de times diferente de 10", () => {
  assert.throws(() => createSergipanoPhase1({ season: 2026, teamIds: ["a", "b"] }));
});

test("turno único: 10 times, 9 rodadas, 45 jogos, cada um joga 9", () => {
  const p = createSergipanoPhase1({ season: 2026 });
  assert.equal(p.teams.length, 10);
  assert.equal(p.fixtures.length, 45);
  assert.equal(Math.max(...p.fixtures.map(m => m.round)), SERGIPANO_PHASE1_ROUNDS);
  const count = {};
  for (const m of p.fixtures) { count[m.homeTeamId] = (count[m.homeTeamId] || 0) + 1; count[m.awayTeamId] = (count[m.awayTeamId] || 0) + 1; }
  for (const id of p.teams) assert.equal(count[id], 9);
});

test("getSergipanoQualified: top 7 (1º direto, 2º-7º repescagem)", () => {
  const p = createSergipanoPhase1({ season: 2026 });
  const seeds = p.teams.map(id => ({ id, name: id, shortName: id, city: "c", state: "SE", reputation: 50, colors: { primary: "#111", secondary: "#eee" } }));
  const { state, rng } = makeState({ seed: 5, teamSeeds: seeds });
  state.competitions.estadual_se = p;
  for (let r = 1; r <= SERGIPANO_PHASE1_ROUNDS; r++) runRound(state, "estadual_se", rng);
  const q = getSergipanoQualified(p, state.teams);
  assert.equal(q.length, 7);
  assert.deepEqual(q, getSergipanoStandings(p, state.teams).slice(0, 7).map(s => s.teamId));
});

test("repescagem 2º×7º, 3º×6º e 4º×5º; 1º direto; progressão até campeão", () => {
  const ko = createSergipanoKnockout(QUAL);
  assert.equal(ko.phase, "playoffs");
  assert.deepEqual(ko.direct, ["S1"]);
  assert.equal(ko.playoffs.length, 3);
  const sets = ko.playoffs.map(t => new Set([t.teamAId, t.teamBId]));
  assert.ok(sets.some(s => s.has("S2") && s.has("S7")), "2×7");
  assert.ok(sets.some(s => s.has("S3") && s.has("S6")), "3×6");
  assert.ok(sets.some(s => s.has("S4") && s.has("S5")), "4×5");

  const rng = createRng(1);
  const winTie = (t) => { t.legs[0].played = true; t.legs[0].score = { home: 0, away: 1 }; t.legs[1].played = true; t.legs[1].score = { home: 3, away: 0 }; applySergipanoKnockoutResult(ko, t.legs[1], rng); };
  ko.playoffs.forEach(winTie);
  assert.ok(advanceSergipanoKnockout(ko));
  assert.equal(ko.phase, "semis");
  assert.equal(ko.semis.length, 2);
  ko.semis.forEach(winTie);
  assert.ok(advanceSergipanoKnockout(ko));
  assert.equal(ko.phase, "final");
  winTie(ko.final);
  assert.ok(advanceSergipanoKnockout(ko));
  assert.equal(ko.phase, "done");
  assert.ok(ko.champion);
});

test("agregado empatado vai a pênaltis (decidido pelo rng)", () => {
  const ko = createSergipanoKnockout(QUAL);
  const t = ko.playoffs[0];
  t.legs[0].played = true; t.legs[0].score = { home: 1, away: 1 };
  t.legs[1].played = true; t.legs[1].score = { home: 1, away: 1 };
  applySergipanoKnockoutResult(ko, t.legs[1], createRng(3));
  assert.ok(t.winnerId === t.teamAId || t.winnerId === t.teamBId);
  assert.deepEqual(t.aggregate, { teamA: 2, teamB: 2 });
});

test("getSergipanoKnockoutLegs: repescagem R10, semis só após", () => {
  const ko = createSergipanoKnockout(QUAL);
  assert.equal(getSergipanoKnockoutLegs(ko, SERGIPANO_PLAYOFF_LEG1_ROUND).length, 3);
  assert.equal(getSergipanoKnockoutLegs(ko, SERGIPANO_SEMI_LEG1_ROUND).length, 0);
  assert.equal(getSergipanoKnockoutLegs(ko, SERGIPANO_FINAL_LEG1_ROUND).length, 0);
});
