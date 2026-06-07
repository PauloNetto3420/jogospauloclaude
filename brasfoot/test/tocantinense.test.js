// Testes do Campeonato Tocantinense — liga turno único (8) + semis (1×4, 2×3)
// e final, ida/volta. Mesmo arquétipo do Amapaense.

import { test } from "node:test";
import assert from "node:assert/strict";

import { createRng } from "../src/utils/rng.js";
import { runRound } from "../src/engine/season.js";
import {
  createTocantinensePhase1, getTocantinenseStandings, getTocantinenseQualified,
  createTocantinenseKnockout, advanceTocantinenseKnockout, applyTocantinenseKnockoutResult,
  getTocantinenseKnockoutLegs,
  TOCANTINENSE_PHASE1_ROUNDS, TOCANTINENSE_SEMI_LEG1_ROUND, TOCANTINENSE_FINAL_LEG1_ROUND,
} from "../src/engine/tocantinense.js";
import { makeState } from "./helpers.js";

const QUAL = ["S1", "S2", "S3", "S4"];

test("rejeita número de times diferente de 8", () => {
  assert.throws(() => createTocantinensePhase1({ season: 2026, teamIds: ["a", "b"] }));
});

test("turno único: 8 times, 7 rodadas, 28 jogos, cada um joga 7", () => {
  const p = createTocantinensePhase1({ season: 2026 });
  assert.equal(p.teams.length, 8);
  assert.equal(p.fixtures.length, 28);
  assert.equal(Math.max(...p.fixtures.map(m => m.round)), TOCANTINENSE_PHASE1_ROUNDS);
  const count = {};
  for (const m of p.fixtures) { count[m.homeTeamId] = (count[m.homeTeamId] || 0) + 1; count[m.awayTeamId] = (count[m.awayTeamId] || 0) + 1; }
  for (const id of p.teams) assert.equal(count[id], 7);
});

test("getTocantinenseQualified: top 4 da tabela", () => {
  const p = createTocantinensePhase1({ season: 2026 });
  const seeds = p.teams.map(id => ({ id, name: id, shortName: id, city: "c", state: "TO", reputation: 50, colors: { primary: "#111", secondary: "#eee" } }));
  const { state, rng } = makeState({ seed: 5, teamSeeds: seeds });
  state.competitions.estadual_to = p;
  for (let r = 1; r <= TOCANTINENSE_PHASE1_ROUNDS; r++) runRound(state, "estadual_to", rng);
  const q = getTocantinenseQualified(p, state.teams);
  assert.equal(q.length, 4);
  assert.deepEqual(q, getTocantinenseStandings(p, state.teams).slice(0, 4).map(s => s.teamId));
});

test("semis 1×4/2×3 → final → campeão (agregado)", () => {
  const ko = createTocantinenseKnockout(QUAL);
  const sets = ko.semis.map(t => new Set([t.teamAId, t.teamBId]));
  assert.ok(sets.some(s => s.has("S1") && s.has("S4")), "1×4");
  assert.ok(sets.some(s => s.has("S2") && s.has("S3")), "2×3");
  const rng = createRng(1);
  const winTie = (t) => { t.legs[0].played = true; t.legs[0].score = { home: 0, away: 1 }; t.legs[1].played = true; t.legs[1].score = { home: 2, away: 0 }; applyTocantinenseKnockoutResult(ko, t.legs[1], rng); };
  ko.semis.forEach(winTie);
  assert.ok(advanceTocantinenseKnockout(ko));
  assert.equal(ko.phase, "final");
  winTie(ko.final);
  assert.ok(advanceTocantinenseKnockout(ko));
  assert.equal(ko.phase, "done");
  assert.equal(ko.champion, ko.final.teamAId);
});

test("empate no agregado vai a pênaltis", () => {
  const ko = createTocantinenseKnockout(QUAL);
  const rng = createRng(2);
  const t = ko.semis[0];
  t.legs[0].played = true; t.legs[0].score = { home: 1, away: 0 };
  t.legs[1].played = true; t.legs[1].score = { home: 1, away: 0 };
  applyTocantinenseKnockoutResult(ko, t.legs[1], rng);
  assert.ok([t.teamAId, t.teamBId].includes(t.winnerId), "pênaltis decidem");
});

test("getTocantinenseKnockoutLegs: semis R8, final só após semis", () => {
  const ko = createTocantinenseKnockout(QUAL);
  assert.equal(getTocantinenseKnockoutLegs(ko, TOCANTINENSE_SEMI_LEG1_ROUND).length, 2);
  assert.equal(getTocantinenseKnockoutLegs(ko, TOCANTINENSE_FINAL_LEG1_ROUND).length, 0);
});
