// Testes da Carreira do Treinador: reputação, demissão, mercado de trabalho.

import { test } from "node:test";
import assert from "node:assert/strict";

import { createRng } from "../src/utils/rng.js";
import {
  initManager, updateManagerAfterSeason, decideDismissal,
  generateJobOffers, generatePoachOffers, acceptJob, titlesWonThisSeason,
} from "../src/engine/manager.js";

// Estado com clubes em A/B/C de reputações variadas.
function makeState() {
  const mk = (id, rep, trophies = []) => ({ id, name: id, reputation: rep, trophies });
  const teams = {
    BIG1: mk("BIG1", 92), BIG2: mk("BIG2", 88),
    MIDA: mk("MIDA", 70), MYCLUB: mk("MYCLUB", 60, []),
    BLOW: mk("BLOW", 48), SMALLB: mk("SMALLB", 52), SMALLC: mk("SMALLC", 42),
  };
  return {
    season: 2026,
    managedTeamId: "MYCLUB",
    teams,
    competitions: {
      brasileirao_a: { teams: ["BIG1", "BIG2", "MIDA", "MYCLUB"] },
      brasileirao_b: { teams: ["BLOW", "SMALLB"] },
      brasileirao_c_p1: { teams: ["SMALLC"] },
    },
  };
}

test("initManager: reputação base derivada da estatura do clube", () => {
  const state = makeState();
  initManager(state, "MYCLUB");
  // 40 + (60-40)*0.4 = 48
  assert.equal(state.manager.reputation, 48);
  assert.equal(state.manager.jobs.length, 1);
  assert.equal(state.manager.jobs[0].teamId, "MYCLUB");
});

test("updateManagerAfterSeason: título + meta superada sobem reputação", () => {
  const state = makeState();
  initManager(state, "MYCLUB"); // 48
  state.teams.MYCLUB.trophies = [
    { competitionId: "brasileirao_a", season: 2026 },
    { competitionId: "estadual_sp", season: 2026 },
  ];
  const r = updateManagerAfterSeason(state, { exceeded: true, met: true }, 2026);
  // +9 (A) +2 (estadual) +5 (superou) = +16 → 64
  assert.equal(state.manager.reputation, 64);
  assert.equal(r.titlesThisSeason.length, 2);
  assert.equal(state.manager.titles.length, 2);
  assert.equal(state.manager.seasonsManaged, 1);
});

test("updateManagerAfterSeason: fracasso retumbante derruba reputação", () => {
  const state = makeState();
  initManager(state, "MYCLUB"); // 48
  const r = updateManagerAfterSeason(state, { failedBadly: true, met: false }, 2026);
  assert.equal(r.repDelta, -8);
  assert.equal(state.manager.reputation, 40);
});

test("titlesWonThisSeason: filtra pela temporada", () => {
  const state = makeState();
  state.teams.MYCLUB.trophies = [
    { competitionId: "copa_brasil", season: 2025 },
    { competitionId: "copa_brasil", season: 2026 },
  ];
  assert.equal(titlesWonThisSeason(state, 2026).length, 1);
});

test("decideDismissal: só demite em fracasso retumbante", () => {
  assert.equal(decideDismissal({ failedBadly: true, finalPos: 19, total: 20 }).fired, true);
  assert.equal(decideDismissal({ met: false, failedBadly: false }).fired, false);
  assert.equal(decideDismissal({ met: true }).fired, false);
});

test("generateJobOffers: filtra por reputação e garante ao menos 1", () => {
  const state = makeState();
  const rng = createRng(1);

  // Treinador renomado (rep 90): clubes grandes se interessam
  state.manager = { reputation: 90 };
  const big = generateJobOffers(state, rng, { excludeTeamId: "MYCLUB", max: 3 });
  assert.ok(big.length >= 1);
  assert.ok(big.some(o => o.teamId === "BIG1"), "clube grande oferta a treinador renomado");

  // Treinador modesto (rep 45): clubes grandes NÃO se interessam
  state.manager = { reputation: 45 };
  const small = generateJobOffers(state, rng, { excludeTeamId: "MYCLUB", max: 3 });
  assert.ok(!small.some(o => o.teamId === "BIG1"), "clube grande não oferta a treinador modesto");
  assert.ok(small.length >= 1, "sempre há pelo menos uma proposta");
});

test("generateJobOffers: nunca inclui o clube excluído", () => {
  const state = makeState();
  state.manager = { reputation: 99 };
  const offers = generateJobOffers(state, createRng(2), { excludeTeamId: "MYCLUB", max: 9 });
  assert.ok(!offers.some(o => o.teamId === "MYCLUB"));
});

test("generatePoachOffers: só clubes maiores que o atual", () => {
  const state = makeState();
  state.manager = { reputation: 95 };
  const offers = generatePoachOffers(state, createRng(3), { currentTeamId: "MYCLUB" }); // MYCLUB rep 60
  assert.ok(offers.every(o => o.reputation > 66), "todos mais fortes que o clube atual");
  assert.ok(offers.every(o => o.voluntary === true));
});

test("acceptJob: troca o clube gerenciado e registra o vínculo", () => {
  const state = makeState();
  initManager(state, "MYCLUB");
  acceptJob(state, "MIDA", 2026);
  assert.equal(state.managedTeamId, "MIDA");
  assert.equal(state.manager.jobs.length, 2);
  assert.equal(state.manager.jobs[0].toSeason, 2026, "vínculo anterior encerrado");
  assert.equal(state.manager.jobs[1].teamId, "MIDA");
});
