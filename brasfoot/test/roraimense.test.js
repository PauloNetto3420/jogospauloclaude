// Testes do Campeonato Roraimense — liga turno único (9 times, com byes) +
// semis e final em jogo único (mando do melhor, pênaltis).

import { test } from "node:test";
import assert from "node:assert/strict";

import { createRng } from "../src/utils/rng.js";
import { runRound } from "../src/engine/season.js";
import {
  createRoraimensePhase1, getRoraimenseStandings, getRoraimenseQualified,
  createRoraimenseKnockout, advanceRoraimenseKnockout, applyRoraimenseKnockoutResult,
  getRoraimenseKnockoutLegs,
  RORAIMENSE_PHASE1_ROUNDS, RORAIMENSE_SEMI_ROUND, RORAIMENSE_FINAL_ROUND,
} from "../src/engine/roraimense.js";
import { makeState } from "./helpers.js";

const QUAL = ["S1", "S2", "S3", "S4"];

test("rejeita número de times diferente de 9", () => {
  assert.throws(() => createRoraimensePhase1({ season: 2026, teamIds: ["a", "b"] }));
});

test("turno único: 9 times, 9 rodadas (byes), 36 jogos, cada um joga 8", () => {
  const p = createRoraimensePhase1({ season: 2026 });
  assert.equal(p.teams.length, 9);
  assert.equal(p.fixtures.length, 36, "C(9,2) = 36");
  assert.equal(Math.max(...p.fixtures.map(m => m.round)), RORAIMENSE_PHASE1_ROUNDS);
  const count = {};
  for (const m of p.fixtures) { count[m.homeTeamId] = (count[m.homeTeamId] || 0) + 1; count[m.awayTeamId] = (count[m.awayTeamId] || 0) + 1; }
  for (const id of p.teams) assert.equal(count[id], 8, `${id} joga 8`);
});

test("1 jogo por time por rodada (byes permitidos)", () => {
  const p = createRoraimensePhase1({ season: 2026 });
  for (let r = 1; r <= RORAIMENSE_PHASE1_ROUNDS; r++) {
    const ids = p.fixtures.filter(m => m.round === r).flatMap(m => [m.homeTeamId, m.awayTeamId]);
    assert.equal(new Set(ids).size, ids.length, `rodada ${r} sem repetição`);
  }
});

test("getRoraimenseQualified: top 4 da tabela", () => {
  const p = createRoraimensePhase1({ season: 2026 });
  const seeds = p.teams.map(id => ({ id, name: id, shortName: id, city: "c", state: "RR", reputation: 50, colors: { primary: "#111", secondary: "#eee" } }));
  const { state, rng } = makeState({ seed: 5, teamSeeds: seeds });
  state.competitions.estadual_rr = p;
  for (let r = 1; r <= RORAIMENSE_PHASE1_ROUNDS; r++) runRound(state, "estadual_rr", rng);
  const q = getRoraimenseQualified(p, state.teams);
  assert.equal(q.length, 4);
  assert.deepEqual(q, getRoraimenseStandings(p, state.teams).slice(0, 4).map(s => s.teamId));
});

test("semis/final jogo único: progressão até campeão", () => {
  const ko = createRoraimenseKnockout(QUAL);
  assert.equal(ko.semis[0].leg.homeTeamId, "S1");
  assert.equal(ko.semis[0].leg.awayTeamId, "S4");
  const rng = createRng(1);
  ko.semis[0].leg.played = true; ko.semis[0].leg.score = { home: 2, away: 0 }; applyRoraimenseKnockoutResult(ko, ko.semis[0].leg, rng);
  ko.semis[1].leg.played = true; ko.semis[1].leg.score = { home: 1, away: 0 }; applyRoraimenseKnockoutResult(ko, ko.semis[1].leg, rng);
  assert.ok(advanceRoraimenseKnockout(ko));
  assert.equal(ko.phase, "final");
  assert.equal(ko.final.leg.homeTeamId, "S1"); // melhor campanha manda
  ko.final.leg.played = true; ko.final.leg.score = { home: 1, away: 0 }; applyRoraimenseKnockoutResult(ko, ko.final.leg, rng);
  assert.ok(advanceRoraimenseKnockout(ko));
  assert.equal(ko.phase, "done");
  assert.equal(ko.champion, "S1");
});

test("empate no jogo único vai a pênaltis", () => {
  const ko = createRoraimenseKnockout(QUAL);
  const rng = createRng(2);
  const s = ko.semis[0];
  s.leg.played = true; s.leg.score = { home: 1, away: 1 };
  applyRoraimenseKnockoutResult(ko, s.leg, rng);
  assert.ok([s.teamAId, s.teamBId].includes(s.winnerId), "pênaltis decidem");
});

test("getRoraimenseKnockoutLegs: semis R10, final só após semis", () => {
  const ko = createRoraimenseKnockout(QUAL);
  assert.equal(getRoraimenseKnockoutLegs(ko, RORAIMENSE_SEMI_ROUND).length, 2);
  assert.equal(getRoraimenseKnockoutLegs(ko, RORAIMENSE_FINAL_ROUND).length, 0);
});
