// Testes do Campeonato Baiano — pontos corridos turno único (tabela única)
// + semifinais e final em JOGO ÚNICO (mando do melhor, empate → pênaltis).

import { test } from "node:test";
import assert from "node:assert/strict";

import { createRng } from "../src/utils/rng.js";
import { runRound } from "../src/engine/season.js";
import {
  createBaianoPhase1, getBaianoStandings, getBaianoQualified,
  createBaianoKnockout, advanceBaianoKnockout, applyBaianoKnockoutResult,
  getBaianoKnockoutLegs,
  BAIANO_PHASE1_ROUNDS, BAIANO_SEMI_ROUND, BAIANO_FINAL_ROUND,
} from "../src/engine/baiano.js";
import { makeState } from "./helpers.js";

const QUAL = ["S1", "S2", "S3", "S4"]; // 4 classificados, S1 = melhor campanha

function buildPhase1(season = 2026) {
  return createBaianoPhase1({ season });
}

// -------------------- 1ª fase --------------------

test("rejeita número de times diferente de 10", () => {
  assert.throws(() => createBaianoPhase1({ season: 2026, teamIds: ["a", "b"] }));
});

test("turno único: 10 times, 9 rodadas, 45 jogos, cada um joga 9", () => {
  const p = buildPhase1();
  assert.equal(p.teams.length, 10);
  assert.equal(p.fixtures.length, 45, "C(10,2) = 45 jogos");
  const maxRound = Math.max(...p.fixtures.map(m => m.round));
  assert.equal(maxRound, BAIANO_PHASE1_ROUNDS, "9 rodadas");

  const count = {};
  for (const m of p.fixtures) {
    count[m.homeTeamId] = (count[m.homeTeamId] || 0) + 1;
    count[m.awayTeamId] = (count[m.awayTeamId] || 0) + 1;
  }
  for (const id of p.teams) assert.equal(count[id], 9, `${id} joga 9`);
});

test("nenhum confronto repetido (45 únicos)", () => {
  const p = buildPhase1();
  const seen = new Set();
  for (const m of p.fixtures) {
    const k = [m.homeTeamId, m.awayTeamId].sort().join("|");
    assert.ok(!seen.has(k), `repetido: ${k}`);
    seen.add(k);
  }
  assert.equal(seen.size, 45);
});

test("1 jogo por time por rodada", () => {
  const p = buildPhase1();
  for (let r = 1; r <= BAIANO_PHASE1_ROUNDS; r++) {
    const ids = p.fixtures.filter(m => m.round === r).flatMap(m => [m.homeTeamId, m.awayTeamId]);
    assert.equal(new Set(ids).size, ids.length, `rodada ${r} sem repetição`);
    assert.equal(ids.length, 10, `rodada ${r}: 5 jogos`);
  }
});

test("getBaianoQualified: top 4 da tabela única", () => {
  const p = buildPhase1();
  const seeds = p.teams.map(id => ({ id, name: id, shortName: id, city: "c", state: "BA", reputation: 50, colors: { primary: "#111", secondary: "#eee" } }));
  const { state, rng } = makeState({ seed: 5, teamSeeds: seeds });
  state.competitions.estadual_ba = p;
  for (let r = 1; r <= BAIANO_PHASE1_ROUNDS; r++) runRound(state, "estadual_ba", rng);

  const q = getBaianoQualified(p, state.teams);
  assert.equal(q.length, 4);
  assert.equal(new Set(q).size, 4);
  // o líder geral deve ser o 1º classificado
  assert.equal(q[0], getBaianoStandings(p, state.teams)[0].teamId);
});

// -------------------- Mata-mata (jogo único) --------------------

test("semis: 1×4 e 2×3, jogo único, mando do melhor", () => {
  const ko = createBaianoKnockout(QUAL);
  assert.equal(ko.phase, "semis");
  assert.equal(ko.semis.length, 2);
  assert.ok(ko.semis.every(t => t.leg && !t.legs), "semi é jogo único");
  // mando: S1 recebe S4, S2 recebe S3
  assert.equal(ko.semis[0].leg.homeTeamId, "S1");
  assert.equal(ko.semis[0].leg.awayTeamId, "S4");
  assert.equal(ko.semis[1].leg.homeTeamId, "S2");
  assert.equal(ko.semis[1].leg.awayTeamId, "S3");
});

test("progressão semis → final (jogo único, manda o melhor) → campeão", () => {
  const ko = createBaianoKnockout(QUAL);
  const rng = createRng(1);
  // S1 e S2 (mandantes) vencem as semis
  ko.semis[0].leg.played = true; ko.semis[0].leg.score = { home: 2, away: 0 };
  applyBaianoKnockoutResult(ko, ko.semis[0].leg, rng);
  ko.semis[1].leg.played = true; ko.semis[1].leg.score = { home: 1, away: 0 };
  applyBaianoKnockoutResult(ko, ko.semis[1].leg, rng);
  assert.ok(advanceBaianoKnockout(ko));
  assert.equal(ko.phase, "final");
  // final: S1 (melhor campanha) manda
  assert.equal(ko.final.leg.homeTeamId, "S1");
  assert.equal(ko.final.leg.awayTeamId, "S2");

  ko.final.leg.played = true; ko.final.leg.score = { home: 1, away: 0 };
  applyBaianoKnockoutResult(ko, ko.final.leg, rng);
  assert.ok(advanceBaianoKnockout(ko));
  assert.equal(ko.phase, "done");
  assert.equal(ko.champion, "S1");
});

test("empate no jogo único vai a pênaltis", () => {
  const ko = createBaianoKnockout(QUAL);
  const rng = createRng(2);
  const semi = ko.semis[0];
  semi.leg.played = true; semi.leg.score = { home: 1, away: 1 };
  applyBaianoKnockoutResult(ko, semi.leg, rng);
  assert.ok([semi.teamAId, semi.teamBId].includes(semi.winnerId), "pênaltis decidem");
});

test("getBaianoKnockoutLegs: semis na R10, final na R11", () => {
  const ko = createBaianoKnockout(QUAL);
  assert.equal(getBaianoKnockoutLegs(ko, BAIANO_SEMI_ROUND).length, 2, "2 semis na R10");
  assert.equal(getBaianoKnockoutLegs(ko, BAIANO_FINAL_ROUND).length, 0, "final ainda não existe");
  assert.equal(getBaianoKnockoutLegs(ko, 99).length, 0);
});
