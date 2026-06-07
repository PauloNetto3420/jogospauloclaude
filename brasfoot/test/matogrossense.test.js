// Testes do Campeonato Mato-grossense — liga turno único (10) + quartas jogo
// único (3º-6º) + semis e final ida/volta. Mata-mata híbrido.

import { test } from "node:test";
import assert from "node:assert/strict";

import { createRng } from "../src/utils/rng.js";
import { runRound } from "../src/engine/season.js";
import {
  createMatogrossensePhase1, getMatogrossenseStandings, getMatogrossenseQualified,
  createMatogrossenseKnockout, advanceMatogrossenseKnockout, applyMatogrossenseKnockoutResult,
  getMatogrossenseKnockoutLegs,
  MATOGROSSENSE_PHASE1_ROUNDS, MATOGROSSENSE_QUARTERS_ROUND,
  MATOGROSSENSE_SEMI_LEG1_ROUND, MATOGROSSENSE_FINAL_LEG1_ROUND,
} from "../src/engine/matogrossense.js";
import { makeState } from "./helpers.js";

const QUAL = ["M1", "M2", "M3", "M4", "M5", "M6"];

test("rejeita número de times diferente de 10", () => {
  assert.throws(() => createMatogrossensePhase1({ season: 2026, teamIds: ["a", "b"] }));
});

test("turno único: 10 times, 9 rodadas, 45 jogos, cada um joga 9", () => {
  const p = createMatogrossensePhase1({ season: 2026 });
  assert.equal(p.teams.length, 10);
  assert.equal(p.fixtures.length, 45);
  assert.equal(Math.max(...p.fixtures.map(m => m.round)), MATOGROSSENSE_PHASE1_ROUNDS);
  const count = {};
  for (const m of p.fixtures) { count[m.homeTeamId] = (count[m.homeTeamId] || 0) + 1; count[m.awayTeamId] = (count[m.awayTeamId] || 0) + 1; }
  for (const id of p.teams) assert.equal(count[id], 9);
});

test("getMatogrossenseQualified: top 6 (1º-2º diretos, 3º-6º quartas)", () => {
  const p = createMatogrossensePhase1({ season: 2026 });
  const seeds = p.teams.map(id => ({ id, name: id, shortName: id, city: "c", state: "MT", reputation: 50, colors: { primary: "#111", secondary: "#eee" } }));
  const { state, rng } = makeState({ seed: 5, teamSeeds: seeds });
  state.competitions.estadual_mt = p;
  for (let r = 1; r <= MATOGROSSENSE_PHASE1_ROUNDS; r++) runRound(state, "estadual_mt", rng);
  const q = getMatogrossenseQualified(p, state.teams);
  assert.equal(q.length, 6);
  assert.deepEqual(q, getMatogrossenseStandings(p, state.teams).slice(0, 6).map(s => s.teamId));
});

test("quartas jogo único 3º×6º e 4º×5º com mando do melhor; 1º/2º diretos", () => {
  const ko = createMatogrossenseKnockout(QUAL);
  assert.equal(ko.phase, "quarters");
  assert.deepEqual(ko.direct, ["M1", "M2"]);
  assert.equal(ko.quarters.length, 2);
  // jogo único: cada tie tem leg (não legs)
  assert.ok(ko.quarters.every(t => t.leg && !t.legs));
  // mando do melhor campanha: 3º (M3) manda sobre 6º (M6); 4º (M4) sobre 5º (M5)
  assert.equal(ko.quarters[0].leg.homeTeamId, "M3");
  assert.equal(ko.quarters[1].leg.homeTeamId, "M4");
});

test("progressão: quartas → semis (ida/volta) → final → campeão", () => {
  const ko = createMatogrossenseKnockout(QUAL);
  const rng = createRng(1);
  // quartas jogo único: mandante vence
  for (const t of ko.quarters) { t.leg.played = true; t.leg.score = { home: 2, away: 0 }; applyMatogrossenseKnockoutResult(ko, t.leg, rng); }
  assert.ok(advanceMatogrossenseKnockout(ko));
  assert.equal(ko.phase, "semis");
  assert.equal(ko.semis.length, 2);
  const winTwoLeg = (t) => { t.legs[0].played = true; t.legs[0].score = { home: 0, away: 1 }; t.legs[1].played = true; t.legs[1].score = { home: 3, away: 0 }; applyMatogrossenseKnockoutResult(ko, t.legs[1], rng); };
  ko.semis.forEach(winTwoLeg);
  assert.ok(advanceMatogrossenseKnockout(ko));
  assert.equal(ko.phase, "final");
  winTwoLeg(ko.final);
  assert.ok(advanceMatogrossenseKnockout(ko));
  assert.equal(ko.phase, "done");
  assert.ok(ko.champion);
});

test("agregado empatado na semi vai a pênaltis (decidido pelo rng)", () => {
  const ko = createMatogrossenseKnockout(QUAL);
  for (const t of ko.quarters) { t.leg.played = true; t.leg.score = { home: 1, away: 0 }; applyMatogrossenseKnockoutResult(ko, t.leg, createRng(2)); }
  advanceMatogrossenseKnockout(ko);
  const t = ko.semis[0];
  t.legs[0].played = true; t.legs[0].score = { home: 1, away: 1 };
  t.legs[1].played = true; t.legs[1].score = { home: 0, away: 0 };
  applyMatogrossenseKnockoutResult(ko, t.legs[1], createRng(7));
  assert.ok(t.winnerId === t.teamAId || t.winnerId === t.teamBId);
  assert.deepEqual(t.aggregate, { teamA: 1, teamB: 1 });
});

test("getMatogrossenseKnockoutLegs: quartas R10, semis só após", () => {
  const ko = createMatogrossenseKnockout(QUAL);
  assert.equal(getMatogrossenseKnockoutLegs(ko, MATOGROSSENSE_QUARTERS_ROUND).length, 2);
  assert.equal(getMatogrossenseKnockoutLegs(ko, MATOGROSSENSE_SEMI_LEG1_ROUND).length, 0);
  assert.equal(getMatogrossenseKnockoutLegs(ko, MATOGROSSENSE_FINAL_LEG1_ROUND).length, 0);
});
