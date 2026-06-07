// Testes do Campeonato Rondoniense — pontos corridos turno e returno (7 times)
// + semis (1×4, 2×3) e final, ida/volta.

import { test } from "node:test";
import assert from "node:assert/strict";

import { createRng } from "../src/utils/rng.js";
import { runRound } from "../src/engine/season.js";
import {
  createRondoniensePhase1, getRondonienseStandings, getRondonienseQualified,
  createRondonienseKnockout, advanceRondonienseKnockout, applyRondonienseKnockoutResult,
  getRondonienseKnockoutLegs,
  RONDONIENSE_PHASE1_ROUNDS, RONDONIENSE_SEMI_LEG1_ROUND, RONDONIENSE_FINAL_LEG1_ROUND,
} from "../src/engine/rondoniense.js";
import { makeState } from "./helpers.js";

const QUAL = ["S1", "S2", "S3", "S4"];

test("rejeita número de times diferente de 7", () => {
  assert.throws(() => createRondoniensePhase1({ season: 2026, teamIds: ["a", "b"] }));
});

test("turno e returno: 7 times, 14 rodadas, 42 jogos, cada um joga 12", () => {
  const p = createRondoniensePhase1({ season: 2026 });
  assert.equal(p.teams.length, 7);
  assert.equal(p.fixtures.length, 42, "C(7,2)*2 = 42");
  assert.equal(Math.max(...p.fixtures.map(m => m.round)), RONDONIENSE_PHASE1_ROUNDS);
  const count = {};
  for (const m of p.fixtures) { count[m.homeTeamId] = (count[m.homeTeamId] || 0) + 1; count[m.awayTeamId] = (count[m.awayTeamId] || 0) + 1; }
  for (const id of p.teams) assert.equal(count[id], 12, `${id} joga 12 (6 adversários × 2)`);
});

test("manda e visita: cada confronto acontece 2x (1 em cada casa)", () => {
  const p = createRondoniensePhase1({ season: 2026 });
  const homeAway = {};
  for (const m of p.fixtures) {
    const k = [m.homeTeamId, m.awayTeamId].sort().join("|");
    homeAway[k] = (homeAway[k] || 0) + 1;
  }
  for (const k of Object.keys(homeAway)) assert.equal(homeAway[k], 2, `${k}: ida e volta`);
});

test("getRondonienseQualified: top 4 da tabela", () => {
  const p = createRondoniensePhase1({ season: 2026 });
  const seeds = p.teams.map(id => ({ id, name: id, shortName: id, city: "c", state: "RO", reputation: 50, colors: { primary: "#111", secondary: "#eee" } }));
  const { state, rng } = makeState({ seed: 5, teamSeeds: seeds });
  state.competitions.estadual_ro = p;
  for (let r = 1; r <= RONDONIENSE_PHASE1_ROUNDS; r++) runRound(state, "estadual_ro", rng);
  const q = getRondonienseQualified(p, state.teams);
  assert.equal(q.length, 4);
  assert.deepEqual(q, getRondonienseStandings(p, state.teams).slice(0, 4).map(s => s.teamId));
});

test("semis 1×4/2×3 → final → campeão (agregado)", () => {
  const ko = createRondonienseKnockout(QUAL);
  const rng = createRng(1);
  const winTie = (t) => { t.legs[0].played = true; t.legs[0].score = { home: 0, away: 1 }; t.legs[1].played = true; t.legs[1].score = { home: 2, away: 0 }; applyRondonienseKnockoutResult(ko, t.legs[1], rng); };
  ko.semis.forEach(winTie);
  assert.ok(advanceRondonienseKnockout(ko));
  assert.equal(ko.phase, "final");
  winTie(ko.final);
  assert.ok(advanceRondonienseKnockout(ko));
  assert.equal(ko.phase, "done");
  assert.equal(ko.champion, ko.final.teamAId);
});

test("getRondonienseKnockoutLegs: semis R15, final só após semis", () => {
  const ko = createRondonienseKnockout(QUAL);
  assert.equal(getRondonienseKnockoutLegs(ko, RONDONIENSE_SEMI_LEG1_ROUND).length, 2);
  assert.equal(getRondonienseKnockoutLegs(ko, RONDONIENSE_FINAL_LEG1_ROUND).length, 0);
});
