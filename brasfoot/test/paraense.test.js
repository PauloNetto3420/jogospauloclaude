// Testes do Campeonato Paraense — 2 grupos de 6 cruzados + tabela geral top 8
// + mata-mata híbrido (quartas/semis jogo único, final ida/volta).

import { test } from "node:test";
import assert from "node:assert/strict";

import { createRng } from "../src/utils/rng.js";
import { runRound } from "../src/engine/season.js";
import {
  createParaensePhase1, getParaenseOverallStandings, getParaenseQualified,
  createParaenseKnockout, advanceParaenseKnockout, applyParaenseKnockoutResult,
  getParaenseKnockoutLegs,
  PARAENSE_GROUP_ROUNDS, PARAENSE_QUARTERS_ROUND, PARAENSE_SEMI_ROUND,
  PARAENSE_FINAL_LEG1_ROUND,
} from "../src/engine/paraense.js";
import { makeState } from "./helpers.js";

const QUAL = ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8"];

function buildPhase1(seed = 7) {
  return createParaensePhase1({ season: 2026, rng: createRng(seed) });
}
function groupOf(p) {
  const m = {};
  p.groupA.forEach(id => { m[id] = "A"; });
  p.groupB.forEach(id => { m[id] = "B"; });
  return m;
}

test("2 grupos de 6 cruzados; cada um joga 6; 36 jogos; 6 rodadas; Remo/Paysandu cabeças", () => {
  const p = buildPhase1();
  assert.equal(p.groupA.length, 6);
  assert.equal(p.groupB.length, 6);
  // cabeças em grupos opostos
  const remGroup = p.groupA.includes("rem") ? "A" : "B";
  const paiGroup = p.groupA.includes("pai") ? "A" : "B";
  assert.notEqual(remGroup, paiGroup, "Remo e Paysandu em grupos opostos");
  const g = groupOf(p);
  const count = {};
  for (const m of p.fixtures) {
    assert.notEqual(g[m.homeTeamId], g[m.awayTeamId], "cruzado");
    count[m.homeTeamId] = (count[m.homeTeamId] || 0) + 1;
    count[m.awayTeamId] = (count[m.awayTeamId] || 0) + 1;
  }
  for (const id of p.teams) assert.equal(count[id], 6);
  assert.equal(p.fixtures.length, 36);
  assert.equal(Math.max(...p.fixtures.map(m => m.round)), PARAENSE_GROUP_ROUNDS);
});

test("getParaenseQualified: top 8 da tabela GERAL", () => {
  const p = buildPhase1(33);
  const seeds = p.teams.map(id => ({ id, name: id, shortName: id, city: "c", state: "PA", reputation: 50, colors: { primary: "#111", secondary: "#eee" } }));
  const { state, rng } = makeState({ seed: 5, teamSeeds: seeds });
  state.competitions.estadual_pa = p;
  for (let r = 1; r <= PARAENSE_GROUP_ROUNDS; r++) runRound(state, "estadual_pa", rng);
  const q = getParaenseQualified(p, state.teams);
  assert.equal(q.length, 8);
  assert.deepEqual(q, getParaenseOverallStandings(p, state.teams).slice(0, 8).map(s => s.teamId));
});

test("quartas e semis em JOGO ÚNICO; final ida/volta", () => {
  const ko = createParaenseKnockout(QUAL);
  assert.equal(ko.phase, "quarters");
  assert.equal(ko.quarters.length, 4);
  for (const t of ko.quarters) { assert.ok(t.leg, "quartas jogo único"); assert.equal(t.legs, undefined); }
  // chaveamento 1×8, 4×5, 2×7, 3×6 (mando do melhor = teamA)
  assert.deepEqual(ko.quarters.map(t => [t.teamAId, t.teamBId].join("×")), ["S1×S8", "S4×S5", "S2×S7", "S3×S6"]);
});

test("progressão quartas → semis (único) → final (ida/volta) → campeão", () => {
  const ko = createParaenseKnockout(QUAL);
  const rng = createRng(1);
  // mandantes (teamA) vencem as quartas
  for (const t of ko.quarters) { t.leg.played = true; t.leg.score = { home: 1, away: 0 }; applyParaenseKnockoutResult(ko, t.leg, rng); }
  assert.ok(advanceParaenseKnockout(ko));
  assert.equal(ko.phase, "semis");
  for (const t of ko.semis) { assert.ok(t.leg, "semi jogo único"); t.leg.played = true; t.leg.score = { home: 2, away: 0 }; applyParaenseKnockoutResult(ko, t.leg, rng); }
  assert.ok(advanceParaenseKnockout(ko));
  assert.equal(ko.phase, "final");
  assert.ok(ko.final.legs, "final ida/volta");
  const [l1, l2] = ko.final.legs;
  l1.played = true; l1.score = { home: 0, away: 2 }; // teamA visitante faz 2
  l2.played = true; l2.score = { home: 1, away: 0 }; // teamA mandante faz 1
  applyParaenseKnockoutResult(ko, l2, rng);
  assert.ok(advanceParaenseKnockout(ko));
  assert.equal(ko.phase, "done");
  assert.equal(ko.champion, ko.final.teamAId, "teamA campeão (agregado 3×0)");
});

test("jogo único empatado vai a pênaltis", () => {
  const ko = createParaenseKnockout(QUAL);
  const rng = createRng(2);
  const qf = ko.quarters[0];
  qf.leg.played = true; qf.leg.score = { home: 1, away: 1 };
  applyParaenseKnockoutResult(ko, qf.leg, rng);
  assert.ok([qf.teamAId, qf.teamBId].includes(qf.winnerId), "pênaltis decidem");
});

test("getParaenseKnockoutLegs: quartas R7, semis R8, final R9/R10", () => {
  const ko = createParaenseKnockout(QUAL);
  assert.equal(getParaenseKnockoutLegs(ko, PARAENSE_QUARTERS_ROUND).length, 4);
  assert.equal(getParaenseKnockoutLegs(ko, PARAENSE_SEMI_ROUND).length, 0, "semis ainda não existem");
  assert.equal(getParaenseKnockoutLegs(ko, PARAENSE_FINAL_LEG1_ROUND).length, 0);
});

test("determinismo: mesma seed → mesma 1ª fase", () => {
  const dump = () => {
    const p = buildPhase1(2024);
    return p.groupA.join(",") + "|" + p.groupB.join(",") + "|" +
      p.fixtures.map(m => `${m.round}:${m.homeTeamId}-${m.awayTeamId}`).join(";");
  };
  assert.equal(dump(), dump());
});
