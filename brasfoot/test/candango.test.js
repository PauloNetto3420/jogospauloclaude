// Testes do Campeonato Candango (DF) — liga turno único (10) + semis e final
// ida/volta (top 4). Mesmo arquétipo do Paraibano.

import { test } from "node:test";
import assert from "node:assert/strict";

import { createRng } from "../src/utils/rng.js";
import { runRound } from "../src/engine/season.js";
import {
  createCandangoPhase1, getCandangoStandings, getCandangoQualified,
  createCandangoKnockout, advanceCandangoKnockout, applyCandangoKnockoutResult,
  getCandangoKnockoutLegs,
  CANDANGO_PHASE1_ROUNDS, CANDANGO_SEMI_LEG1_ROUND, CANDANGO_FINAL_LEG1_ROUND,
} from "../src/engine/candango.js";
import { makeState } from "./helpers.js";

const QUAL = ["C1", "C2", "C3", "C4"];

test("rejeita número de times diferente de 10", () => {
  assert.throws(() => createCandangoPhase1({ season: 2026, teamIds: ["a", "b"] }));
});

test("turno único: 10 times, 9 rodadas, 45 jogos, cada um joga 9", () => {
  const p = createCandangoPhase1({ season: 2026 });
  assert.equal(p.teams.length, 10);
  assert.equal(p.fixtures.length, 45);
  assert.equal(Math.max(...p.fixtures.map(m => m.round)), CANDANGO_PHASE1_ROUNDS);
  const count = {};
  for (const m of p.fixtures) { count[m.homeTeamId] = (count[m.homeTeamId] || 0) + 1; count[m.awayTeamId] = (count[m.awayTeamId] || 0) + 1; }
  for (const id of p.teams) assert.equal(count[id], 9);
});

test("getCandangoQualified: top 4 da tabela", () => {
  const p = createCandangoPhase1({ season: 2026 });
  const seeds = p.teams.map(id => ({ id, name: id, shortName: id, city: "c", state: "DF", reputation: 50, colors: { primary: "#111", secondary: "#eee" } }));
  const { state, rng } = makeState({ seed: 5, teamSeeds: seeds });
  state.competitions.estadual_df = p;
  for (let r = 1; r <= CANDANGO_PHASE1_ROUNDS; r++) runRound(state, "estadual_df", rng);
  const q = getCandangoQualified(p, state.teams);
  assert.equal(q.length, 4);
  assert.deepEqual(q, getCandangoStandings(p, state.teams).slice(0, 4).map(s => s.teamId));
});

test("semis 1×4/2×3 → final → campeão (agregado)", () => {
  const ko = createCandangoKnockout(QUAL);
  assert.equal(ko.phase, "semis");
  const sets = ko.semis.map(t => new Set([t.teamAId, t.teamBId]));
  assert.ok(sets.some(s => s.has("C1") && s.has("C4")), "1×4");
  assert.ok(sets.some(s => s.has("C2") && s.has("C3")), "2×3");

  const rng = createRng(1);
  const winTie = (t) => { t.legs[0].played = true; t.legs[0].score = { home: 0, away: 1 }; t.legs[1].played = true; t.legs[1].score = { home: 3, away: 0 }; applyCandangoKnockoutResult(ko, t.legs[1], rng); };
  ko.semis.forEach(winTie);
  assert.ok(advanceCandangoKnockout(ko));
  assert.equal(ko.phase, "final");
  winTie(ko.final);
  assert.ok(advanceCandangoKnockout(ko));
  assert.equal(ko.phase, "done");
  assert.ok(ko.champion);
});

test("empate no agregado vai a pênaltis", () => {
  const ko = createCandangoKnockout(QUAL);
  const t = ko.semis[0];
  t.legs[0].played = true; t.legs[0].score = { home: 1, away: 1 };
  t.legs[1].played = true; t.legs[1].score = { home: 1, away: 1 };
  applyCandangoKnockoutResult(ko, t.legs[1], createRng(3));
  assert.ok(t.winnerId === t.teamAId || t.winnerId === t.teamBId);
  assert.deepEqual(t.aggregate, { teamA: 2, teamB: 2 });
});

test("getCandangoKnockoutLegs: semis R10, final só após semis", () => {
  const ko = createCandangoKnockout(QUAL);
  assert.equal(getCandangoKnockoutLegs(ko, CANDANGO_SEMI_LEG1_ROUND).length, 2);
  assert.equal(getCandangoKnockoutLegs(ko, CANDANGO_FINAL_LEG1_ROUND).length, 0);
});
