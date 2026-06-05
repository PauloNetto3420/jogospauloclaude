// Testes do Campeonato Amapaense — liga turno único (8) + semis (1×4, 2×3) e
// final, ida/volta. Mesmo arquétipo do Alagoano (sem rebaixamento).

import { test } from "node:test";
import assert from "node:assert/strict";

import { createRng } from "../src/utils/rng.js";
import { runRound } from "../src/engine/season.js";
import {
  createAmapaensePhase1, getAmapaenseStandings, getAmapaenseQualified,
  createAmapaenseKnockout, advanceAmapaenseKnockout, applyAmapaenseKnockoutResult,
  getAmapaenseKnockoutLegs,
  AMAPAENSE_PHASE1_ROUNDS, AMAPAENSE_SEMI_LEG1_ROUND, AMAPAENSE_FINAL_LEG1_ROUND,
} from "../src/engine/amapaense.js";
import { makeState } from "./helpers.js";

const QUAL = ["S1", "S2", "S3", "S4"];

test("rejeita número de times diferente de 8", () => {
  assert.throws(() => createAmapaensePhase1({ season: 2026, teamIds: ["a", "b"] }));
});

test("turno único: 8 times, 7 rodadas, 28 jogos, cada um joga 7", () => {
  const p = createAmapaensePhase1({ season: 2026 });
  assert.equal(p.teams.length, 8);
  assert.equal(p.fixtures.length, 28);
  assert.equal(Math.max(...p.fixtures.map(m => m.round)), AMAPAENSE_PHASE1_ROUNDS);
  const count = {};
  for (const m of p.fixtures) { count[m.homeTeamId] = (count[m.homeTeamId] || 0) + 1; count[m.awayTeamId] = (count[m.awayTeamId] || 0) + 1; }
  for (const id of p.teams) assert.equal(count[id], 7);
});

test("getAmapaenseQualified: top 4 da tabela", () => {
  const p = createAmapaensePhase1({ season: 2026 });
  const seeds = p.teams.map(id => ({ id, name: id, shortName: id, city: "c", state: "AP", reputation: 50, colors: { primary: "#111", secondary: "#eee" } }));
  const { state, rng } = makeState({ seed: 5, teamSeeds: seeds });
  state.competitions.estadual_ap = p;
  for (let r = 1; r <= AMAPAENSE_PHASE1_ROUNDS; r++) runRound(state, "estadual_ap", rng);
  const q = getAmapaenseQualified(p, state.teams);
  assert.equal(q.length, 4);
  assert.deepEqual(q, getAmapaenseStandings(p, state.teams).slice(0, 4).map(s => s.teamId));
});

test("semis 1×4 e 2×3 (ida/volta); progressão até campeão", () => {
  const ko = createAmapaenseKnockout(QUAL);
  assert.equal(ko.phase, "semis");
  const sets = ko.semis.map(t => new Set([t.teamAId, t.teamBId]));
  assert.ok(sets.some(s => s.has("S1") && s.has("S4")), "1×4");
  assert.ok(sets.some(s => s.has("S2") && s.has("S3")), "2×3");

  const rng = createRng(1);
  const winTie = (t) => { t.legs[0].played = true; t.legs[0].score = { home: 0, away: 1 }; t.legs[1].played = true; t.legs[1].score = { home: 2, away: 0 }; applyAmapaenseKnockoutResult(ko, t.legs[1], rng); };
  ko.semis.forEach(winTie);
  assert.ok(advanceAmapaenseKnockout(ko));
  assert.equal(ko.phase, "final");
  winTie(ko.final);
  assert.ok(advanceAmapaenseKnockout(ko));
  assert.equal(ko.phase, "done");
  assert.equal(ko.champion, ko.final.teamAId);
});

test("empate no agregado vai a pênaltis", () => {
  const ko = createAmapaenseKnockout(QUAL);
  const rng = createRng(2);
  const t = ko.semis[0];
  t.legs[0].played = true; t.legs[0].score = { home: 1, away: 0 };
  t.legs[1].played = true; t.legs[1].score = { home: 1, away: 0 };
  applyAmapaenseKnockoutResult(ko, t.legs[1], rng);
  assert.ok([t.teamAId, t.teamBId].includes(t.winnerId), "pênaltis decidem");
});

test("getAmapaenseKnockoutLegs: semis R8, final só após semis", () => {
  const ko = createAmapaenseKnockout(QUAL);
  assert.equal(getAmapaenseKnockoutLegs(ko, AMAPAENSE_SEMI_LEG1_ROUND).length, 2);
  assert.equal(getAmapaenseKnockoutLegs(ko, AMAPAENSE_FINAL_LEG1_ROUND).length, 0);
});
