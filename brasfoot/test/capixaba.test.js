// Testes do Campeonato Capixaba (ES) — liga turno único (10) + mata-mata top 8
// (quartas/semis/final ida/volta) + rebaixamento dos 2 últimos.

import { test } from "node:test";
import assert from "node:assert/strict";

import { createRng } from "../src/utils/rng.js";
import { runRound } from "../src/engine/season.js";
import {
  createCapixabaPhase1, getCapixabaStandings, getCapixabaQualified, getCapixabaRelegated,
  createCapixabaKnockout, advanceCapixabaKnockout, applyCapixabaKnockoutResult,
  getCapixabaKnockoutLegs,
  CAPIXABA_PHASE1_ROUNDS, CAPIXABA_QUARTERS_LEG1_ROUND,
  CAPIXABA_SEMI_LEG1_ROUND, CAPIXABA_FINAL_LEG1_ROUND,
} from "../src/engine/capixaba.js";
import { makeState } from "./helpers.js";

const QUAL = ["X1", "X2", "X3", "X4", "X5", "X6", "X7", "X8"];

test("rejeita número de times diferente de 10", () => {
  assert.throws(() => createCapixabaPhase1({ season: 2026, teamIds: ["a", "b"] }));
});

test("turno único: 10 times, 9 rodadas, 45 jogos, cada um joga 9", () => {
  const p = createCapixabaPhase1({ season: 2026 });
  assert.equal(p.teams.length, 10);
  assert.equal(p.fixtures.length, 45);
  assert.equal(Math.max(...p.fixtures.map(m => m.round)), CAPIXABA_PHASE1_ROUNDS);
  const count = {};
  for (const m of p.fixtures) { count[m.homeTeamId] = (count[m.homeTeamId] || 0) + 1; count[m.awayTeamId] = (count[m.awayTeamId] || 0) + 1; }
  for (const id of p.teams) assert.equal(count[id], 9);
});

test("getCapixabaQualified top 8 e getCapixabaRelegated 2 últimos (sem sobreposição)", () => {
  const p = createCapixabaPhase1({ season: 2026 });
  const seeds = p.teams.map(id => ({ id, name: id, shortName: id, city: "c", state: "ES", reputation: 50, colors: { primary: "#111", secondary: "#eee" } }));
  const { state, rng } = makeState({ seed: 5, teamSeeds: seeds });
  state.competitions.estadual_es = p;
  for (let r = 1; r <= CAPIXABA_PHASE1_ROUNDS; r++) runRound(state, "estadual_es", rng);
  const q = getCapixabaQualified(p, state.teams);
  const rel = getCapixabaRelegated(p, state.teams);
  assert.equal(q.length, 8);
  assert.equal(rel.length, 2);
  assert.equal(new Set([...q, ...rel]).size, 10, "sem sobreposição entre classificados e rebaixados");
  const order = getCapixabaStandings(p, state.teams).map(s => s.teamId);
  assert.deepEqual(q, order.slice(0, 8));
  assert.deepEqual(rel, order.slice(8));
});

test("quartas 1×8/2×7/3×6/4×5 → semis → final → campeão", () => {
  const ko = createCapixabaKnockout(QUAL);
  assert.equal(ko.phase, "quarters");
  assert.equal(ko.quarters.length, 4);
  const sets = ko.quarters.map(t => new Set([t.teamAId, t.teamBId]));
  assert.ok(sets.some(s => s.has("X1") && s.has("X8")), "1×8");
  assert.ok(sets.some(s => s.has("X2") && s.has("X7")), "2×7");
  assert.ok(sets.some(s => s.has("X3") && s.has("X6")), "3×6");
  assert.ok(sets.some(s => s.has("X4") && s.has("X5")), "4×5");

  const rng = createRng(1);
  const winTie = (t) => { t.legs[0].played = true; t.legs[0].score = { home: 0, away: 1 }; t.legs[1].played = true; t.legs[1].score = { home: 3, away: 0 }; applyCapixabaKnockoutResult(ko, t.legs[1], rng); };
  ko.quarters.forEach(winTie);
  assert.ok(advanceCapixabaKnockout(ko));
  assert.equal(ko.phase, "semis");
  assert.equal(ko.semis.length, 2);
  ko.semis.forEach(winTie);
  assert.ok(advanceCapixabaKnockout(ko));
  assert.equal(ko.phase, "final");
  winTie(ko.final);
  assert.ok(advanceCapixabaKnockout(ko));
  assert.equal(ko.phase, "done");
  assert.ok(ko.champion);
});

test("empate no agregado vai a pênaltis", () => {
  const ko = createCapixabaKnockout(QUAL);
  const t = ko.quarters[0];
  t.legs[0].played = true; t.legs[0].score = { home: 2, away: 2 };
  t.legs[1].played = true; t.legs[1].score = { home: 0, away: 0 };
  applyCapixabaKnockoutResult(ko, t.legs[1], createRng(3));
  assert.ok(t.winnerId === t.teamAId || t.winnerId === t.teamBId);
  assert.deepEqual(t.aggregate, { teamA: 2, teamB: 2 });
});

test("getCapixabaKnockoutLegs: quartas R10 (4 legs), semis só após", () => {
  const ko = createCapixabaKnockout(QUAL);
  assert.equal(getCapixabaKnockoutLegs(ko, CAPIXABA_QUARTERS_LEG1_ROUND).length, 4);
  assert.equal(getCapixabaKnockoutLegs(ko, CAPIXABA_SEMI_LEG1_ROUND).length, 0);
  assert.equal(getCapixabaKnockoutLegs(ko, CAPIXABA_FINAL_LEG1_ROUND).length, 0);
});
