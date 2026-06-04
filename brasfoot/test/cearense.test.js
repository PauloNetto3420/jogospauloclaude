// Testes do Campeonato Cearense — duas fases de grupos (5+5 intra → 3+3
// cruzado) + semis e final ida/volta.

import { test } from "node:test";
import assert from "node:assert/strict";

import { createRng } from "../src/utils/rng.js";
import { runRound } from "../src/engine/season.js";
import {
  createCearensePhase1, getCearenseGroupStandings, getCearenseQualified,
  createCearensePhase2, getCearensePhase2Standings, getCearenseSemifinalists,
  createCearenseKnockout, advanceCearenseKnockout, applyCearenseKnockoutResult,
  getCearenseKnockoutLegs,
  CEARENSE_PHASE1_ROUNDS, CEARENSE_PHASE2_ROUND_START,
  CEARENSE_SEMI_LEG1_ROUND, CEARENSE_FINAL_LEG1_ROUND,
} from "../src/engine/cearense.js";
import { makeState } from "./helpers.js";

function buildPhase1(seed = 7) {
  return createCearensePhase1({ season: 2026, rng: createRng(seed) });
}
function groupOf(p) {
  const m = {};
  p.groupA.forEach(id => { m[id] = "A"; });
  p.groupB.forEach(id => { m[id] = "B"; });
  return m;
}

// -------------------- 1ª fase --------------------

test("rejeita número de times diferente de 10", () => {
  assert.throws(() => createCearensePhase1({ season: 2026, rng: createRng(1), teamIds: ["a", "b"] }));
});

test("2 grupos de 5; INTRA-grupo; cada time joga 4; 20 jogos; 5 rodadas", () => {
  const p = buildPhase1();
  assert.equal(p.groupA.length, 5);
  assert.equal(p.groupB.length, 5);
  const g = groupOf(p);
  const count = {};
  for (const m of p.fixtures) {
    assert.equal(g[m.homeTeamId], g[m.awayTeamId], "jogo deve ser INTRA-grupo");
    count[m.homeTeamId] = (count[m.homeTeamId] || 0) + 1;
    count[m.awayTeamId] = (count[m.awayTeamId] || 0) + 1;
  }
  for (const id of p.teams) assert.equal(count[id], 4, `${id} joga 4 (intra-grupo)`);
  assert.equal(p.fixtures.length, 20, "10 por grupo × 2");
  assert.equal(Math.max(...p.fixtures.map(m => m.round)), CEARENSE_PHASE1_ROUNDS);
});

test("1 jogo por time por rodada (byes permitidos)", () => {
  const p = buildPhase1();
  for (let r = 1; r <= CEARENSE_PHASE1_ROUNDS; r++) {
    const ids = p.fixtures.filter(m => m.round === r).flatMap(m => [m.homeTeamId, m.awayTeamId]);
    assert.equal(new Set(ids).size, ids.length, `rodada ${r} sem repetição`);
  }
});

test("getCearenseQualified: top 3 de cada grupo + 4 rebaixados", () => {
  const p = buildPhase1(42);
  const seeds = p.teams.map(id => ({ id, name: id, shortName: id, city: "c", state: "CE", reputation: 50, colors: { primary: "#111", secondary: "#eee" } }));
  const { state, rng } = makeState({ seed: 5, teamSeeds: seeds });
  state.competitions.estadual_ce = p;
  for (let r = 1; r <= CEARENSE_PHASE1_ROUNDS; r++) runRound(state, "estadual_ce", rng);
  const q = getCearenseQualified(p);
  assert.equal(q.A.length, 3);
  assert.equal(q.B.length, 3);
  assert.equal(q.relegated.length, 4);
  assert.equal(new Set([...q.A, ...q.B, ...q.relegated]).size, 10, "particiona os 10");
});

// -------------------- 2ª fase --------------------

test("2ª fase: C = top3 do A, D = top3 do B; cruzado; 9 jogos; cada um joga 3", () => {
  const qualified = { A: ["A1", "A2", "A3"], B: ["B1", "B2", "B3"] };
  const p2 = createCearensePhase2({ season: 2026, qualified });
  assert.deepEqual(p2.groupC, ["A1", "A2", "A3"]);
  assert.deepEqual(p2.groupD, ["B1", "B2", "B3"]);
  assert.equal(p2.fixtures.length, 9, "3×3 cruzado");
  const cset = new Set(p2.groupC);
  for (const m of p2.fixtures) {
    // todo jogo é C×D (um de cada lado)
    const homeInC = cset.has(m.homeTeamId);
    assert.notEqual(homeInC, cset.has(m.awayTeamId), "deve ser cruzado C×D");
  }
  const count = {};
  for (const m of p2.fixtures) {
    count[m.homeTeamId] = (count[m.homeTeamId] || 0) + 1;
    count[m.awayTeamId] = (count[m.awayTeamId] || 0) + 1;
  }
  for (const id of p2.teams) assert.equal(count[id], 3, `${id} joga 3`);
  // rodadas 6,7,8
  assert.equal(Math.min(...p2.fixtures.map(m => m.round)), CEARENSE_PHASE2_ROUND_START);
  assert.equal(Math.max(...p2.fixtures.map(m => m.round)), CEARENSE_PHASE2_ROUND_START + 2);
});

test("getCearenseSemifinalists: 2 de cada grupo da 2ª fase", () => {
  const qualified = { A: ["A1", "A2", "A3"], B: ["B1", "B2", "B3"] };
  const p2 = createCearensePhase2({ season: 2026, qualified });
  const seeds = p2.teams.map(id => ({ id, name: id, shortName: id, city: "c", state: "CE", reputation: 50, colors: { primary: "#111", secondary: "#eee" } }));
  const { state, rng } = makeState({ seed: 9, teamSeeds: seeds });
  state.competitions.estadual_ce_p2 = p2;
  for (let r = CEARENSE_PHASE2_ROUND_START; r <= CEARENSE_PHASE2_ROUND_START + 2; r++) runRound(state, "estadual_ce_p2", rng);
  const sf = getCearenseSemifinalists(p2);
  assert.equal(sf.C.length, 2);
  assert.equal(sf.D.length, 2);
});

// -------------------- Mata-mata --------------------

test("semis cruzam C1×D2 e D1×C2 (ida/volta); progressão até campeão", () => {
  const ko = createCearenseKnockout({ C: ["C1", "C2"], D: ["D1", "D2"] });
  assert.equal(ko.phase, "semis");
  for (const s of ko.semis) assert.equal(s.legs.length, 2, "semi ida/volta");
  const conf = ko.semis.map(t => new Set([t.teamAId, t.teamBId]));
  assert.ok(conf.some(s => s.has("C1") && s.has("D2")), "C1×D2");
  assert.ok(conf.some(s => s.has("D1") && s.has("C2")), "D1×C2");

  const rng = createRng(1);
  for (const s of ko.semis) {
    s.legs[0].played = true; s.legs[0].score = { home: 0, away: 1 };
    s.legs[1].played = true; s.legs[1].score = { home: 2, away: 0 };
    applyCearenseKnockoutResult(ko, s.legs[1], rng);
  }
  assert.ok(advanceCearenseKnockout(ko));
  assert.equal(ko.phase, "final");
  assert.ok(ko.final.legs);

  const [l1, l2] = ko.final.legs;
  l1.played = true; l1.score = { home: 0, away: 2 };
  l2.played = true; l2.score = { home: 1, away: 0 };
  applyCearenseKnockoutResult(ko, l2, rng);
  assert.ok(advanceCearenseKnockout(ko));
  assert.equal(ko.phase, "done");
  assert.equal(ko.champion, ko.final.teamAId);
});

test("getCearenseKnockoutLegs: semis R9/R10, final só após semis", () => {
  const ko = createCearenseKnockout({ C: ["C1", "C2"], D: ["D1", "D2"] });
  assert.equal(getCearenseKnockoutLegs(ko, CEARENSE_SEMI_LEG1_ROUND).length, 2);
  assert.equal(getCearenseKnockoutLegs(ko, CEARENSE_FINAL_LEG1_ROUND).length, 0, "final ainda não existe");
});

test("determinismo: mesma seed → mesma 1ª fase", () => {
  const dump = () => {
    const p = buildPhase1(2024);
    return p.groupA.join(",") + "|" + p.groupB.join(",") + "|" +
      p.fixtures.map(m => `${m.round}:${m.homeTeamId}-${m.awayTeamId}`).join(";");
  };
  assert.equal(dump(), dump());
});
