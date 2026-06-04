// Testes do Campeonato Paranaense — 2 grupos de 6 cruzados + mata-mata com
// TODAS as fases em ida e volta (quartas, semis e final).

import { test } from "node:test";
import assert from "node:assert/strict";

import { createRng } from "../src/utils/rng.js";
import { runRound } from "../src/engine/season.js";
import {
  createParanaensePhase1, getParanaenseGroupStandings, getParanaenseQualified,
  createParanaenseKnockout, advanceParanaenseKnockout, applyParanaenseKnockoutResult,
  getParanaenseKnockoutLegs,
  PARANAENSE_GROUP_ROUNDS,
  PARANAENSE_QUARTERS_LEG1_ROUND, PARANAENSE_QUARTERS_LEG2_ROUND,
  PARANAENSE_SEMI_LEG1_ROUND, PARANAENSE_FINAL_LEG1_ROUND, PARANAENSE_FINAL_LEG2_ROUND,
} from "../src/engine/paranaense.js";
import { makeState } from "./helpers.js";

const QUAL = { A: ["A1", "A2", "A3", "A4"], B: ["B1", "B2", "B3", "B4"] };

function buildPhase1(seed = 7) {
  return createParanaensePhase1({ season: 2026, rng: createRng(seed) });
}
function groupOf(p) {
  const m = {};
  p.groupA.forEach(id => { m[id] = "A"; });
  p.groupB.forEach(id => { m[id] = "B"; });
  return m;
}

// -------------------- 1ª fase --------------------

test("2 grupos de 6, 4 grandes 2-em-cada", () => {
  const p = buildPhase1();
  assert.equal(p.groupA.length, 6);
  assert.equal(p.groupB.length, 6);
  const bigs = ["ath", "cou", "lon", "ope"];
  assert.equal(bigs.filter(id => p.groupA.includes(id)).length, 2);
  assert.equal(bigs.filter(id => p.groupB.includes(id)).length, 2);
});

test("cada time joga 6 (todos cruzados), 36 jogos", () => {
  const p = buildPhase1();
  const g = groupOf(p);
  const count = {};
  for (const m of p.fixtures) {
    assert.notEqual(g[m.homeTeamId], g[m.awayTeamId], "jogo intra-grupo!");
    count[m.homeTeamId] = (count[m.homeTeamId] || 0) + 1;
    count[m.awayTeamId] = (count[m.awayTeamId] || 0) + 1;
  }
  for (const id of p.teams) assert.equal(count[id], 6, `${id}: 6 jogos`);
  assert.equal(p.fixtures.length, 36);
});

test("6 rodadas, 1 jogo por time por rodada", () => {
  const p = buildPhase1();
  for (let r = 1; r <= PARANAENSE_GROUP_ROUNDS; r++) {
    const ids = p.fixtures.filter(m => m.round === r).flatMap(m => [m.homeTeamId, m.awayTeamId]);
    assert.equal(new Set(ids).size, ids.length, `rodada ${r} sem repetição`);
    assert.equal(ids.length, 12, `rodada ${r}: 6 jogos`);
  }
});

test("rejeita número de times diferente de 12", () => {
  assert.throws(() => createParanaensePhase1({ season: 2026, rng: createRng(1), teamIds: ["a", "b"] }));
});

test("getParanaenseQualified: top 4 de cada grupo", () => {
  const p = buildPhase1(123);
  const seeds = p.teams.map(id => ({ id, name: id, shortName: id, city: "c", state: "PR", reputation: 50, colors: { primary: "#111", secondary: "#eee" } }));
  const { state, rng } = makeState({ seed: 5, teamSeeds: seeds });
  state.competitions.estadual_pr = p;
  const total = Math.max(...p.fixtures.map(m => m.round));
  for (let r = 1; r <= total; r++) runRound(state, "estadual_pr", rng);
  const q = getParanaenseQualified(p);
  assert.equal(q.A.length, 4);
  assert.equal(q.B.length, 4);
  assert.equal(new Set([...q.A, ...q.B]).size, 8);
});

// -------------------- Mata-mata (tudo ida/volta) --------------------

test("quartas: 1A×4A, 2A×3A, 1B×4B, 2B×3B (ida e volta)", () => {
  const ko = createParanaenseKnockout(QUAL);
  assert.equal(ko.phase, "quarters");
  assert.equal(ko.quarters.length, 4);
  for (const t of ko.quarters) {
    assert.equal(t.legs.length, 2, "quartas é ida e volta");
    assert.equal(t.leg, undefined, "não é jogo único");
  }
  // confrontos por seed (melhor manda na volta)
  const conf = ko.quarters.map(t => [t.teamAId, t.teamBId].join("×"));
  assert.deepEqual(conf, ["A1×A4", "A2×A3", "B1×B4", "B2×B3"]);
});

test("progressão completa: quartas → semis → final → campeão (ida/volta)", () => {
  const ko = createParanaenseKnockout(QUAL);
  const rng = createRng(2);
  // quartas: teamA (melhor) vence o agregado
  for (const t of ko.quarters) {
    t.legs[0].played = true; t.legs[0].score = { home: 0, away: 1 }; // teamA visitante faz 1
    t.legs[1].played = true; t.legs[1].score = { home: 2, away: 0 }; // teamA mandante faz 2
    applyParanaenseKnockoutResult(ko, t.legs[1], rng);
  }
  assert.ok(advanceParanaenseKnockout(ko), "avança às semis");
  assert.equal(ko.phase, "semis");
  for (const s of ko.semis) assert.equal(s.legs.length, 2, "semi ida/volta");

  for (const s of ko.semis) {
    s.legs[0].played = true; s.legs[0].score = { home: 1, away: 1 };
    s.legs[1].played = true; s.legs[1].score = { home: 2, away: 0 };
    applyParanaenseKnockoutResult(ko, s.legs[1], rng);
  }
  assert.ok(advanceParanaenseKnockout(ko));
  assert.equal(ko.phase, "final");
  assert.ok(ko.final.legs, "final é ida e volta");
  assert.equal(ko.final.legs.length, 2);

  const [l1, l2] = ko.final.legs;
  l1.played = true; l1.score = { home: 0, away: 2 }; // teamA visitante faz 2
  l2.played = true; l2.score = { home: 1, away: 0 }; // teamA mandante faz 1
  applyParanaenseKnockoutResult(ko, l2, rng);
  assert.ok(advanceParanaenseKnockout(ko));
  assert.equal(ko.phase, "done");
  assert.equal(ko.champion, ko.final.teamAId, "teamA campeão (agregado 3×0)");
  assert.equal(ko.final.aggregate.teamA, 3);
});

test("empate no agregado vai a pênaltis", () => {
  const ko = createParanaenseKnockout(QUAL);
  const rng = createRng(3);
  const t = ko.quarters[0];
  t.legs[0].played = true; t.legs[0].score = { home: 1, away: 1 };
  t.legs[1].played = true; t.legs[1].score = { home: 1, away: 1 }; // agregado 2-2
  applyParanaenseKnockoutResult(ko, t.legs[1], rng);
  assert.ok([t.teamAId, t.teamBId].includes(t.winnerId), "pênaltis decidem");
});

test("getParanaenseKnockoutLegs: quartas R7/R8, final R11/R12", () => {
  const ko = createParanaenseKnockout(QUAL);
  assert.equal(getParanaenseKnockoutLegs(ko, PARANAENSE_QUARTERS_LEG1_ROUND).length, 4, "4 idas de quartas na R7");
  assert.equal(getParanaenseKnockoutLegs(ko, PARANAENSE_QUARTERS_LEG2_ROUND).length, 4, "4 voltas de quartas na R8");
  assert.equal(getParanaenseKnockoutLegs(ko, PARANAENSE_SEMI_LEG1_ROUND).length, 0, "semis ainda não existem");
  assert.equal(getParanaenseKnockoutLegs(ko, 99).length, 0);
});

test("determinismo: mesma seed → mesma 1ª fase", () => {
  const dump = () => {
    const p = buildPhase1(2024);
    return p.groupA.join(",") + "|" + p.groupB.join(",") + "|" +
      p.fixtures.map(m => `${m.round}:${m.homeTeamId}-${m.awayTeamId}`).join(";");
  };
  assert.equal(dump(), dump());
});
