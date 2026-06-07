// Testes do Campeonato Maranhense — liga turno único (8) + semis (1×4, 2×3)
// e final, ida/volta. Mesmo arquétipo do Tocantinense.

import { test } from "node:test";
import assert from "node:assert/strict";

import { createRng } from "../src/utils/rng.js";
import { runRound } from "../src/engine/season.js";
import {
  createMaranhensePhase1, getMaranhenseStandings, getMaranhenseQualified,
  createMaranhenseKnockout, advanceMaranhenseKnockout, applyMaranhenseKnockoutResult,
  getMaranhenseKnockoutLegs,
  MARANHENSE_PHASE1_ROUNDS, MARANHENSE_SEMI_LEG1_ROUND, MARANHENSE_FINAL_LEG1_ROUND,
} from "../src/engine/maranhense.js";
import { makeState } from "./helpers.js";

const QUAL = ["S1", "S2", "S3", "S4"];

test("rejeita número de times diferente de 8", () => {
  assert.throws(() => createMaranhensePhase1({ season: 2026, teamIds: ["a", "b"] }));
});

test("turno único: 8 times, 7 rodadas, 28 jogos, cada um joga 7", () => {
  const p = createMaranhensePhase1({ season: 2026 });
  assert.equal(p.teams.length, 8);
  assert.equal(p.fixtures.length, 28);
  assert.equal(Math.max(...p.fixtures.map(m => m.round)), MARANHENSE_PHASE1_ROUNDS);
  const count = {};
  for (const m of p.fixtures) { count[m.homeTeamId] = (count[m.homeTeamId] || 0) + 1; count[m.awayTeamId] = (count[m.awayTeamId] || 0) + 1; }
  for (const id of p.teams) assert.equal(count[id], 7);
});

test("getMaranhenseQualified: top 4 da tabela", () => {
  const p = createMaranhensePhase1({ season: 2026 });
  const seeds = p.teams.map(id => ({ id, name: id, shortName: id, city: "c", state: "MA", reputation: 50, colors: { primary: "#111", secondary: "#eee" } }));
  const { state, rng } = makeState({ seed: 5, teamSeeds: seeds });
  state.competitions.estadual_ma = p;
  for (let r = 1; r <= MARANHENSE_PHASE1_ROUNDS; r++) runRound(state, "estadual_ma", rng);
  const q = getMaranhenseQualified(p, state.teams);
  assert.equal(q.length, 4);
  assert.deepEqual(q, getMaranhenseStandings(p, state.teams).slice(0, 4).map(s => s.teamId));
});

test("semis 1×4/2×3 → final → campeão (agregado, mando da volta ao melhor)", () => {
  const ko = createMaranhenseKnockout(QUAL);
  const sets = ko.semis.map(t => new Set([t.teamAId, t.teamBId]));
  assert.ok(sets.some(s => s.has("S1") && s.has("S4")), "1×4");
  assert.ok(sets.some(s => s.has("S2") && s.has("S3")), "2×3");
  // melhor seed joga a volta em casa
  const sf0 = ko.semis.find(t => t.teamAId === "S1");
  assert.equal(sf0.legs[1].homeTeamId, "S1");
  const rng = createRng(1);
  const winTie = (t) => { t.legs[0].played = true; t.legs[0].score = { home: 0, away: 1 }; t.legs[1].played = true; t.legs[1].score = { home: 2, away: 0 }; applyMaranhenseKnockoutResult(ko, t.legs[1], rng); };
  ko.semis.forEach(winTie);
  assert.ok(advanceMaranhenseKnockout(ko));
  assert.equal(ko.phase, "final");
  winTie(ko.final);
  assert.ok(advanceMaranhenseKnockout(ko));
  assert.equal(ko.phase, "done");
  assert.equal(ko.champion, ko.final.teamAId);
});

test("empate no agregado vai a pênaltis", () => {
  const ko = createMaranhenseKnockout(QUAL);
  const rng = createRng(2);
  const t = ko.semis[0];
  t.legs[0].played = true; t.legs[0].score = { home: 1, away: 0 };
  t.legs[1].played = true; t.legs[1].score = { home: 1, away: 0 };
  applyMaranhenseKnockoutResult(ko, t.legs[1], rng);
  assert.ok([t.teamAId, t.teamBId].includes(t.winnerId), "pênaltis decidem");
});

test("getMaranhenseKnockoutLegs: semis R8, final só após semis", () => {
  const ko = createMaranhenseKnockout(QUAL);
  assert.equal(getMaranhenseKnockoutLegs(ko, MARANHENSE_SEMI_LEG1_ROUND).length, 2);
  assert.equal(getMaranhenseKnockoutLegs(ko, MARANHENSE_FINAL_LEG1_ROUND).length, 0);
});
