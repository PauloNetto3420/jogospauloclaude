// Testes do Campeonato Sul-mato-grossense — liga turno único (10) + quartas
// (3º-6º) + semis e final, tudo ida/volta. Arquétipo Potiguar com 10 times.

import { test } from "node:test";
import assert from "node:assert/strict";

import { createRng } from "../src/utils/rng.js";
import { runRound } from "../src/engine/season.js";
import {
  createSulmatogrossensePhase1, getSulmatogrossenseStandings, getSulmatogrossenseQualified,
  createSulmatogrossenseKnockout, advanceSulmatogrossenseKnockout, applySulmatogrossenseKnockoutResult,
  getSulmatogrossenseKnockoutLegs,
  SULMS_PHASE1_ROUNDS, SULMS_QUARTERS_LEG1_ROUND,
  SULMS_SEMI_LEG1_ROUND, SULMS_FINAL_LEG1_ROUND,
} from "../src/engine/sulmatogrossense.js";
import { makeState } from "./helpers.js";

const QUAL = ["M1", "M2", "M3", "M4", "M5", "M6"];

test("rejeita número de times diferente de 10", () => {
  assert.throws(() => createSulmatogrossensePhase1({ season: 2026, teamIds: ["a", "b"] }));
});

test("turno único: 10 times, 9 rodadas, 45 jogos, cada um joga 9", () => {
  const p = createSulmatogrossensePhase1({ season: 2026 });
  assert.equal(p.teams.length, 10);
  assert.equal(p.fixtures.length, 45);
  assert.equal(Math.max(...p.fixtures.map(m => m.round)), SULMS_PHASE1_ROUNDS);
  const count = {};
  for (const m of p.fixtures) { count[m.homeTeamId] = (count[m.homeTeamId] || 0) + 1; count[m.awayTeamId] = (count[m.awayTeamId] || 0) + 1; }
  for (const id of p.teams) assert.equal(count[id], 9);
});

test("getSulmatogrossenseQualified: top 6 (1º-2º diretos, 3º-6º quartas)", () => {
  const p = createSulmatogrossensePhase1({ season: 2026 });
  const seeds = p.teams.map(id => ({ id, name: id, shortName: id, city: "c", state: "MS", reputation: 50, colors: { primary: "#111", secondary: "#eee" } }));
  const { state, rng } = makeState({ seed: 5, teamSeeds: seeds });
  state.competitions.estadual_ms = p;
  for (let r = 1; r <= SULMS_PHASE1_ROUNDS; r++) runRound(state, "estadual_ms", rng);
  const q = getSulmatogrossenseQualified(p, state.teams);
  assert.equal(q.length, 6);
  assert.deepEqual(q, getSulmatogrossenseStandings(p, state.teams).slice(0, 6).map(s => s.teamId));
});

test("quartas 3º×6º e 4º×5º ida/volta; 1º/2º diretos; progressão até campeão", () => {
  const ko = createSulmatogrossenseKnockout(QUAL);
  assert.equal(ko.phase, "quarters");
  assert.deepEqual(ko.direct, ["M1", "M2"]);
  const sets = ko.quarters.map(t => new Set([t.teamAId, t.teamBId]));
  assert.ok(sets.some(s => s.has("M3") && s.has("M6")), "3×6");
  assert.ok(sets.some(s => s.has("M4") && s.has("M5")), "4×5");

  const rng = createRng(1);
  const winTie = (t) => { t.legs[0].played = true; t.legs[0].score = { home: 0, away: 1 }; t.legs[1].played = true; t.legs[1].score = { home: 3, away: 0 }; applySulmatogrossenseKnockoutResult(ko, t.legs[1], rng); };
  ko.quarters.forEach(winTie);
  assert.ok(advanceSulmatogrossenseKnockout(ko));
  assert.equal(ko.phase, "semis");
  assert.equal(ko.semis.length, 2);
  ko.semis.forEach(winTie);
  assert.ok(advanceSulmatogrossenseKnockout(ko));
  assert.equal(ko.phase, "final");
  winTie(ko.final);
  assert.ok(advanceSulmatogrossenseKnockout(ko));
  assert.equal(ko.phase, "done");
  assert.ok(ko.champion);
});

test("agregado empatado vai a pênaltis (decidido pelo rng)", () => {
  const ko = createSulmatogrossenseKnockout(QUAL);
  const t = ko.quarters[0];
  t.legs[0].played = true; t.legs[0].score = { home: 1, away: 1 };
  t.legs[1].played = true; t.legs[1].score = { home: 1, away: 1 };
  applySulmatogrossenseKnockoutResult(ko, t.legs[1], createRng(3));
  assert.ok(t.winnerId === t.teamAId || t.winnerId === t.teamBId);
  assert.deepEqual(t.aggregate, { teamA: 2, teamB: 2 });
});

test("getSulmatogrossenseKnockoutLegs: quartas R10, semis só após", () => {
  const ko = createSulmatogrossenseKnockout(QUAL);
  assert.equal(getSulmatogrossenseKnockoutLegs(ko, SULMS_QUARTERS_LEG1_ROUND).length, 2);
  assert.equal(getSulmatogrossenseKnockoutLegs(ko, SULMS_SEMI_LEG1_ROUND).length, 0);
  assert.equal(getSulmatogrossenseKnockoutLegs(ko, SULMS_FINAL_LEG1_ROUND).length, 0);
});
