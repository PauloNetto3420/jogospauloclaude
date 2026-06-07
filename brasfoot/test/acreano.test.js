// Testes do Campeonato Acreano — liga turno único (8) + semis ida/volta com
// VANTAGEM do empate (melhor campanha) + final em jogo único.

import { test } from "node:test";
import assert from "node:assert/strict";

import { createRng } from "../src/utils/rng.js";
import { runRound } from "../src/engine/season.js";
import {
  createAcreanoPhase1, getAcreanoStandings, getAcreanoQualified,
  createAcreanoKnockout, advanceAcreanoKnockout, applyAcreanoKnockoutResult,
  getAcreanoKnockoutLegs,
  ACREANO_PHASE1_ROUNDS, ACREANO_SEMI_LEG1_ROUND, ACREANO_FINAL_ROUND,
} from "../src/engine/acreano.js";
import { makeState } from "./helpers.js";

const QUAL = ["S1", "S2", "S3", "S4"];

test("rejeita número de times diferente de 8", () => {
  assert.throws(() => createAcreanoPhase1({ season: 2026, teamIds: ["a", "b"] }));
});

test("turno único: 8 times, 7 rodadas, 28 jogos, cada um joga 7", () => {
  const p = createAcreanoPhase1({ season: 2026 });
  assert.equal(p.teams.length, 8);
  assert.equal(p.fixtures.length, 28);
  assert.equal(Math.max(...p.fixtures.map(m => m.round)), ACREANO_PHASE1_ROUNDS);
  const count = {};
  for (const m of p.fixtures) { count[m.homeTeamId] = (count[m.homeTeamId] || 0) + 1; count[m.awayTeamId] = (count[m.awayTeamId] || 0) + 1; }
  for (const id of p.teams) assert.equal(count[id], 7);
});

test("getAcreanoQualified: top 4 da tabela", () => {
  const p = createAcreanoPhase1({ season: 2026 });
  const seeds = p.teams.map(id => ({ id, name: id, shortName: id, city: "c", state: "AC", reputation: 50, colors: { primary: "#111", secondary: "#eee" } }));
  const { state, rng } = makeState({ seed: 5, teamSeeds: seeds });
  state.competitions.estadual_ac = p;
  for (let r = 1; r <= ACREANO_PHASE1_ROUNDS; r++) runRound(state, "estadual_ac", rng);
  const q = getAcreanoQualified(p, state.teams);
  assert.equal(q.length, 4);
  assert.deepEqual(q, getAcreanoStandings(p, state.teams).slice(0, 4).map(s => s.teamId));
});

test("semis: cruzamento olímpico 1×4 e 2×3 (ida/volta); final é jogo único", () => {
  const ko = createAcreanoKnockout(QUAL);
  assert.equal(ko.phase, "semis");
  for (const s of ko.semis) assert.equal(s.legs.length, 2);
  const sets = ko.semis.map(t => new Set([t.teamAId, t.teamBId]));
  assert.ok(sets.some(s => s.has("S1") && s.has("S4")), "1×4");
  assert.ok(sets.some(s => s.has("S2") && s.has("S3")), "2×3");
});

test("semis: agregado EMPATADO → melhor campanha avança (sem pênaltis)", () => {
  const ko = createAcreanoKnockout(QUAL);
  const rng = createRng(1);
  // sf0 = S1×S4 (S1 melhor). Empate no agregado (1-1, 0-0) → S1 (teamA) avança.
  const s = ko.semis.find(t => t.teamAId === "S1");
  s.legs[0].played = true; s.legs[0].score = { home: 1, away: 1 };
  s.legs[1].played = true; s.legs[1].score = { home: 0, away: 0 };
  applyAcreanoKnockoutResult(ko, s.legs[1], rng);
  assert.equal(s.winnerId, "S1", "melhor campanha avança no empate");
});

test("progressão semis → final (jogo único) → campeão; empate na final → pênaltis", () => {
  const ko = createAcreanoKnockout(QUAL);
  const rng = createRng(2);
  // teamA vence as duas semis
  for (const s of ko.semis) {
    s.legs[0].played = true; s.legs[0].score = { home: 0, away: 1 };
    s.legs[1].played = true; s.legs[1].score = { home: 2, away: 0 };
    applyAcreanoKnockoutResult(ko, s.legs[1], rng);
  }
  assert.ok(advanceAcreanoKnockout(ko));
  assert.equal(ko.phase, "final");
  assert.ok(ko.final.leg, "final jogo único");
  // final empatada → pênaltis (alguém vence)
  ko.final.leg.played = true; ko.final.leg.score = { home: 1, away: 1 };
  applyAcreanoKnockoutResult(ko, ko.final.leg, rng);
  assert.ok(advanceAcreanoKnockout(ko));
  assert.equal(ko.phase, "done");
  assert.ok([ko.final.teamAId, ko.final.teamBId].includes(ko.champion));
});

test("getAcreanoKnockoutLegs: semis R8, final só após semis", () => {
  const ko = createAcreanoKnockout(QUAL);
  assert.equal(getAcreanoKnockoutLegs(ko, ACREANO_SEMI_LEG1_ROUND).length, 2);
  assert.equal(getAcreanoKnockoutLegs(ko, ACREANO_FINAL_ROUND).length, 0);
});
