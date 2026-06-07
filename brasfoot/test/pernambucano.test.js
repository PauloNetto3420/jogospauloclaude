// Testes do Campeonato Pernambucano — liga turno único (8 times) + playoff
// 3º-6º por 2 vagas + semis e final ida/volta.

import { test } from "node:test";
import assert from "node:assert/strict";

import { createRng } from "../src/utils/rng.js";
import { runRound } from "../src/engine/season.js";
import {
  createPernambucanoPhase1, getPernambucanoStandings, getPernambucanoQualified,
  createPernambucanoKnockout, advancePernambucanoKnockout, applyPernambucanoKnockoutResult,
  getPernambucanoKnockoutLegs,
  PERNAMBUCANO_PHASE1_ROUNDS, PERNAMBUCANO_PLAYOFF_LEG1_ROUND,
  PERNAMBUCANO_SEMI_LEG1_ROUND, PERNAMBUCANO_FINAL_LEG1_ROUND,
} from "../src/engine/pernambucano.js";
import { makeState } from "./helpers.js";

const QUAL = ["S1", "S2", "S3", "S4", "S5", "S6"]; // 6 classificados, seeds 0..5

// -------------------- 1ª fase --------------------

test("rejeita número de times diferente de 8", () => {
  assert.throws(() => createPernambucanoPhase1({ season: 2026, teamIds: ["a", "b"] }));
});

test("turno único: 8 times, 7 rodadas, 28 jogos, cada um joga 7", () => {
  const p = createPernambucanoPhase1({ season: 2026 });
  assert.equal(p.teams.length, 8);
  assert.equal(p.fixtures.length, 28, "C(8,2) = 28");
  assert.equal(Math.max(...p.fixtures.map(m => m.round)), PERNAMBUCANO_PHASE1_ROUNDS);
  const count = {};
  for (const m of p.fixtures) {
    count[m.homeTeamId] = (count[m.homeTeamId] || 0) + 1;
    count[m.awayTeamId] = (count[m.awayTeamId] || 0) + 1;
  }
  for (const id of p.teams) assert.equal(count[id], 7, `${id} joga 7`);
});

test("getPernambucanoQualified: top 6", () => {
  const p = createPernambucanoPhase1({ season: 2026 });
  const seeds = p.teams.map(id => ({ id, name: id, shortName: id, city: "c", state: "PE", reputation: 50, colors: { primary: "#111", secondary: "#eee" } }));
  const { state, rng } = makeState({ seed: 5, teamSeeds: seeds });
  state.competitions.estadual_pe = p;
  for (let r = 1; r <= PERNAMBUCANO_PHASE1_ROUNDS; r++) runRound(state, "estadual_pe", rng);
  const q = getPernambucanoQualified(p, state.teams);
  assert.equal(q.length, 6);
  assert.equal(q[0], getPernambucanoStandings(p, state.teams)[0].teamId);
});

// -------------------- Mata-mata (playoff → semis → final) --------------------

test("playoff: 1º/2º diretos; 3º×6º e 4º×5º (ida/volta)", () => {
  const ko = createPernambucanoKnockout(QUAL);
  assert.equal(ko.phase, "playoffs");
  assert.deepEqual(ko.direct, ["S1", "S2"]);
  assert.equal(ko.playoffs.length, 2);
  for (const t of ko.playoffs) assert.equal(t.legs.length, 2);
  const conf = ko.playoffs.map(t => new Set([t.teamAId, t.teamBId]));
  assert.ok(conf.some(s => s.has("S3") && s.has("S6")), "3º×6º");
  assert.ok(conf.some(s => s.has("S4") && s.has("S5")), "4º×5º");
});

test("semis incluem os 2 diretos + 2 vencedores do playoff; chave 1×4/2×3", () => {
  const ko = createPernambucanoKnockout(QUAL);
  const rng = createRng(1);
  // S3 e S4 (melhores seeds nos playoffs) avançam
  for (const t of ko.playoffs) {
    // teamA (melhor seed) vence
    t.legs[0].played = true; t.legs[0].score = { home: 0, away: 1 };
    t.legs[1].played = true; t.legs[1].score = { home: 2, away: 0 };
    applyPernambucanoKnockoutResult(ko, t.legs[1], rng);
  }
  assert.ok(advancePernambucanoKnockout(ko));
  assert.equal(ko.phase, "semis");
  assert.equal(ko.semis.length, 2);
  // semifinalistas = {S1,S2,S3,S4}; chave por seed: S1×S4, S2×S3
  const semiSets = ko.semis.map(t => new Set([t.teamAId, t.teamBId]));
  assert.ok(semiSets.some(s => s.has("S1") && s.has("S4")), "S1×S4");
  assert.ok(semiSets.some(s => s.has("S2") && s.has("S3")), "S2×S3");
});

test("progressão completa até campeão (agregado)", () => {
  const ko = createPernambucanoKnockout(QUAL);
  const rng = createRng(2);
  const winTie = (t) => { t.legs[0].played = true; t.legs[0].score = { home: 0, away: 2 }; t.legs[1].played = true; t.legs[1].score = { home: 1, away: 0 }; applyPernambucanoKnockoutResult(ko, t.legs[1], rng); };
  ko.playoffs.forEach(winTie);
  advancePernambucanoKnockout(ko);
  ko.semis.forEach(winTie);
  advancePernambucanoKnockout(ko);
  assert.equal(ko.phase, "final");
  winTie(ko.final);
  assert.ok(advancePernambucanoKnockout(ko));
  assert.equal(ko.phase, "done");
  assert.equal(ko.champion, ko.final.teamAId, "teamA (melhor) campeão pelo agregado");
});

test("empate no agregado vai a pênaltis", () => {
  const ko = createPernambucanoKnockout(QUAL);
  const rng = createRng(3);
  const t = ko.playoffs[0];
  t.legs[0].played = true; t.legs[0].score = { home: 1, away: 1 };
  t.legs[1].played = true; t.legs[1].score = { home: 1, away: 1 };
  applyPernambucanoKnockoutResult(ko, t.legs[1], rng);
  assert.ok([t.teamAId, t.teamBId].includes(t.winnerId), "pênaltis decidem");
});

test("getPernambucanoKnockoutLegs: playoff R8, semis só após playoff", () => {
  const ko = createPernambucanoKnockout(QUAL);
  assert.equal(getPernambucanoKnockoutLegs(ko, PERNAMBUCANO_PLAYOFF_LEG1_ROUND).length, 2, "2 idas de playoff na R8");
  assert.equal(getPernambucanoKnockoutLegs(ko, PERNAMBUCANO_SEMI_LEG1_ROUND).length, 0, "semis ainda não existem");
  assert.equal(getPernambucanoKnockoutLegs(ko, PERNAMBUCANO_FINAL_LEG1_ROUND).length, 0);
});
