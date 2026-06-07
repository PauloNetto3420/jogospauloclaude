// Testes do Campeonato Goiano — 3 grupos de 4 cruzados em 8 RODADAS EXATAS
// + mata-mata de 8 times (quartas/semis/final, tudo ida/volta).

import { test } from "node:test";
import assert from "node:assert/strict";

import { createRng } from "../src/utils/rng.js";
import { runRound } from "../src/engine/season.js";
import {
  createGoianoPhase1, getGoianoGroupStandings, getGoianoOverallStandings, getGoianoQualified,
  createGoianoKnockout, advanceGoianoKnockout, applyGoianoKnockoutResult,
  getGoianoKnockoutLegs,
  GOIANO_PHASE1_ROUNDS, GOIANO_QUARTERS_LEG1_ROUND, GOIANO_SEMI_LEG1_ROUND,
  GOIANO_FINAL_LEG1_ROUND,
} from "../src/engine/goiano.js";
import { makeState } from "./helpers.js";

const QUAL = ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8"];

function buildPhase1(seed = 7) {
  return createGoianoPhase1({ season: 2026, rng: createRng(seed) });
}
function groupOf(p) {
  const m = {};
  p.groupA.forEach(id => { m[id] = "A"; });
  p.groupB.forEach(id => { m[id] = "B"; });
  p.groupC.forEach(id => { m[id] = "C"; });
  return m;
}

// -------------------- 1ª fase --------------------

test("rejeita número de times diferente de 12", () => {
  assert.throws(() => createGoianoPhase1({ season: 2026, rng: createRng(1), teamIds: ["a", "b"] }));
});

test("3 grupos de 4; CRUZADO; cada time joga 8; 48 jogos; 8 RODADAS exatas", () => {
  const p = buildPhase1();
  assert.equal(p.groupA.length, 4);
  assert.equal(p.groupB.length, 4);
  assert.equal(p.groupC.length, 4);
  const g = groupOf(p);
  const count = {}, opp = {};
  for (const id of p.teams) { count[id] = 0; opp[id] = new Set(); }
  for (const m of p.fixtures) {
    assert.notEqual(g[m.homeTeamId], g[m.awayTeamId], "intra-grupo proibido");
    count[m.homeTeamId]++; count[m.awayTeamId]++;
    opp[m.homeTeamId].add(m.awayTeamId); opp[m.awayTeamId].add(m.homeTeamId);
  }
  for (const id of p.teams) {
    assert.equal(count[id], 8, `${id} joga 8`);
    assert.equal(opp[id].size, 8, `${id} enfrenta 8 distintos`);
  }
  assert.equal(p.fixtures.length, 48);
  assert.equal(Math.max(...p.fixtures.map(m => m.round)), GOIANO_PHASE1_ROUNDS, "EXATAMENTE 8 rodadas");
});

test("1 jogo por time por rodada (6 jogos/rodada)", () => {
  const p = buildPhase1();
  for (let r = 1; r <= GOIANO_PHASE1_ROUNDS; r++) {
    const inRound = p.fixtures.filter(m => m.round === r);
    const ids = inRound.flatMap(m => [m.homeTeamId, m.awayTeamId]);
    assert.equal(new Set(ids).size, 12, `rodada ${r}: todos jogam 1x`);
    assert.equal(inRound.length, 6, `rodada ${r}: 6 jogos`);
  }
});

test("getGoianoQualified: top 8 da classificação geral", () => {
  const p = buildPhase1(33);
  const seeds = p.teams.map(id => ({ id, name: id, shortName: id, city: "c", state: "GO", reputation: 50, colors: { primary: "#111", secondary: "#eee" } }));
  const { state, rng } = makeState({ seed: 5, teamSeeds: seeds });
  state.competitions.estadual_go = p;
  for (let r = 1; r <= GOIANO_PHASE1_ROUNDS; r++) runRound(state, "estadual_go", rng);
  const q = getGoianoQualified(p, state.teams);
  assert.equal(q.length, 8);
  assert.deepEqual(q, getGoianoOverallStandings(p, state.teams).slice(0, 8).map(s => s.teamId));
});

test("determinismo: mesma seed → mesma 1ª fase", () => {
  const dump = () => {
    const p = buildPhase1(2024);
    return [p.groupA, p.groupB, p.groupC].map(g => g.join(",")).join("|") + "::" +
      p.fixtures.map(m => `${m.round}:${m.homeTeamId}-${m.awayTeamId}`).join(";");
  };
  assert.equal(dump(), dump());
});

// -------------------- Mata-mata --------------------

test("quartas: chaveamento 1×8, 4×5, 2×7, 3×6 (ida/volta)", () => {
  const ko = createGoianoKnockout(QUAL);
  assert.equal(ko.phase, "quarters");
  assert.equal(ko.quarters.length, 4);
  for (const t of ko.quarters) assert.equal(t.legs.length, 2);
  const sets = ko.quarters.map(t => new Set([t.teamAId, t.teamBId]));
  assert.ok(sets.some(s => s.has("S1") && s.has("S8")), "1×8");
  assert.ok(sets.some(s => s.has("S4") && s.has("S5")), "4×5");
  assert.ok(sets.some(s => s.has("S2") && s.has("S7")), "2×7");
  assert.ok(sets.some(s => s.has("S3") && s.has("S6")), "3×6");
});

test("progressão quartas → semis → final → campeão (agregado)", () => {
  const ko = createGoianoKnockout(QUAL);
  const rng = createRng(1);
  const winTie = (t) => {
    t.legs[0].played = true; t.legs[0].score = { home: 0, away: 1 };
    t.legs[1].played = true; t.legs[1].score = { home: 2, away: 0 };
    applyGoianoKnockoutResult(ko, t.legs[1], rng);
  };
  ko.quarters.forEach(winTie);
  assert.ok(advanceGoianoKnockout(ko));
  assert.equal(ko.phase, "semis");
  assert.equal(ko.semis.length, 2);
  ko.semis.forEach(winTie);
  assert.ok(advanceGoianoKnockout(ko));
  assert.equal(ko.phase, "final");
  winTie(ko.final);
  assert.ok(advanceGoianoKnockout(ko));
  assert.equal(ko.phase, "done");
  assert.equal(ko.champion, ko.final.teamAId);
});

test("getGoianoKnockoutLegs: quartas R9/R10; semis só após quartas", () => {
  const ko = createGoianoKnockout(QUAL);
  assert.equal(getGoianoKnockoutLegs(ko, GOIANO_QUARTERS_LEG1_ROUND).length, 4);
  assert.equal(getGoianoKnockoutLegs(ko, GOIANO_SEMI_LEG1_ROUND).length, 0);
  assert.equal(getGoianoKnockoutLegs(ko, GOIANO_FINAL_LEG1_ROUND).length, 0);
});
