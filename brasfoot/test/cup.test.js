// Testes da Copa do Brasil: campo de 126 (20 Série A + 2 campeões + 104
// estaduais por RNF), 8 fases, sorteio, agregado de ida/volta, pênaltis e
// progressão até o campeão.

import { test } from "node:test";
import assert from "node:assert/strict";

import { createRng } from "../src/utils/rng.js";
import {
  createCupCompetition, buildCopaField, drawPhase, applyCupLegResult,
  penaltyShootout, getCupLegsForRound, CUP_PHASE_ORDER,
} from "../src/engine/cup.js";
import { seedInitialRanking } from "../src/engine/ranking.js";
import { fakeSeeds, makeState } from "./helpers.js";

// Mundo de copa: 160 clubes (20 na Série A, o resto sem divisão → estaduais).
function cupWorld(seed = 3) {
  const seeds = fakeSeeds(160);
  const { state, rng } = makeState({ seed, teamSeeds: seeds });
  state.competitions.brasileirao_a = { id: "brasileirao_a", teams: seeds.slice(0, 20).map(t => t.id) };
  state.estaduais = {};
  seedInitialRanking(state);
  const cup = createCupCompetition({ state, season: 2026 });
  state.competitions.copa_brasil = cup;
  return { state, rng, cup };
}

function decideTie(cup, tie, rng, teamsById, playersById, { aGoals = 2, bGoals = 0 } = {}) {
  for (const leg of tie.legs) {
    leg.played = true;
    leg.score = { home: aGoals, away: bGoals };
    leg.events = []; leg.stats = { home: {}, away: {} };
    applyCupLegResult(cup, leg, rng, { teamsById, playersById });
  }
}

test("buildCopaField: 126 vagas (20 Série A + 22 seeded + 104 estaduais)", () => {
  const { state } = cupWorld();
  const { serieA, seeded, estaduais } = buildCopaField(state, {});
  assert.equal(serieA.length, 20);
  assert.equal(seeded.length, 22);
  assert.equal(estaduais.length, 104);
  const all = new Set([...seeded, ...estaduais]);
  assert.equal(all.size, 126, "126 únicos");
  for (const id of serieA) assert.ok(seeded.includes(id), "Série A está nos seeded");
});

test("campeões C/D entram como seeded (Copa do Brasil)", () => {
  const { state } = cupWorld(7);
  // pega 2 clubes sem divisão para serem campeões C/D
  const outside = Object.keys(state.teams).filter(id => !state.competitions.brasileirao_a.teams.includes(id));
  const champC = outside[0], champD = outside[1];
  const { seeded, champions } = buildCopaField(state, { serieCChampion: champC, serieDChampion: champD });
  assert.ok(champions.includes(champC) && champions.includes(champD));
  assert.ok(seeded.includes(champC) && seeded.includes(champD));
  assert.equal(seeded.length, 22);
});

test("createCupCompetition: 126 times distribuídos em 22+64+40", () => {
  const { cup } = cupWorld();
  assert.equal(cup.f3Seeds.length, 22, "22 seeded na 3ª fase");
  assert.equal(cup.f2Seeds.length, 64, "64 entram na 2ª fase");
  assert.equal(cup.f1Seeds.length, 40, "40 começam na 1ª fase");
  assert.equal(cup.teams.length, 126);
  assert.equal(new Set(cup.teams).size, 126, "nenhum time repetido");
});

test("drawPhase f1: 40 times → 20 confrontos de jogo único", () => {
  const { cup, rng, state } = cupWorld();
  const ties = drawPhase(cup, "f1", rng, state.teams);
  assert.equal(ties.length, 20);
  for (const tie of ties) {
    assert.equal(tie.legs.length, 1, "jogo único na 1ª fase");
    assert.notEqual(tie.teamAId, tie.teamBId);
  }
  const participants = ties.flatMap(t => [t.teamAId, t.teamBId]);
  assert.equal(new Set(participants).size, 40, "40 participantes únicos");
});

test("jogo único: vitória do mandante define vencedor sem pênaltis", () => {
  const { cup, rng, state } = cupWorld();
  const ties = drawPhase(cup, "f1", rng, state.teams);
  const leg = ties[0].legs[0];
  leg.played = true; leg.score = { home: 3, away: 1 };
  applyCupLegResult(cup, leg, rng, { teamsById: state.teams, playersById: state.players });
  assert.equal(ties[0].winnerId, leg.homeTeamId);
  assert.equal(ties[0].penalties, undefined);
});

test("jogo único empatado: vai pra pênaltis e define um vencedor", () => {
  const { cup, rng, state } = cupWorld();
  const ties = drawPhase(cup, "f1", rng, state.teams);
  const tie = ties[0];
  tie.legs[0].played = true; tie.legs[0].score = { home: 1, away: 1 };
  applyCupLegResult(cup, tie.legs[0], rng, { teamsById: state.teams, playersById: state.players });
  assert.ok(tie.penalties);
  assert.ok([tie.teamAId, tie.teamBId].includes(tie.winnerId));
  assert.notEqual(tie.penalties.scoreA, tie.penalties.scoreB);
});

test("ida e volta: agregado decide o vencedor (oitavas)", () => {
  const { cup, rng, state } = cupWorld();
  for (const ph of ["f1", "f2", "f3", "f4"]) {
    drawPhase(cup, ph, rng, state.teams);
    for (const tie of cup.phases[ph].ties) decideTie(cup, tie, rng, state.teams, state.players);
  }
  const oitavas = drawPhase(cup, "oitavas", rng, state.teams);
  const tie = oitavas[0];
  assert.equal(tie.legs.length, 2, "oitavas tem ida e volta");
  const [leg1, leg2] = tie.legs;
  leg1.played = true; leg1.score = { home: 1, away: 0 }; // home=teamB, away=teamA
  applyCupLegResult(cup, leg1, rng, { teamsById: state.teams, playersById: state.players });
  assert.equal(tie.winnerId, null, "não decide antes do leg 2");
  leg2.played = true; leg2.score = { home: 3, away: 0 }; // home=teamA
  applyCupLegResult(cup, leg2, rng, { teamsById: state.teams, playersById: state.players });
  assert.equal(tie.aggregate.teamA, 3);
  assert.equal(tie.aggregate.teamB, 1);
  assert.equal(tie.winnerId, tie.teamAId);
});

test("penaltyShootout: sempre produz um vencedor e placares coerentes", () => {
  const { state } = cupWorld(123);
  const rng = createRng(456);
  const teams = Object.values(state.teams);
  for (let i = 0; i < 50; i++) {
    const a = teams[i % teams.length];
    const b = teams[(i + 1) % teams.length];
    const r = penaltyShootout(a, b, state.players, rng);
    assert.ok([a.id, b.id].includes(r.winnerId));
    assert.notEqual(r.scoreA, r.scoreB);
    assert.ok(r.kicks.length >= 2);
  }
});

test("getCupLegsForRound: legs da 1ª fase na rodada 2", () => {
  const { cup, rng, state } = cupWorld();
  drawPhase(cup, "f1", rng, state.teams);
  const legs = getCupLegsForRound(cup, 2);
  assert.equal(legs.length, 20, "20 legs da 1ª fase na rodada 2");
  for (const leg of legs) assert.equal(leg.round, 2);
  assert.equal(getCupLegsForRound(cup, 99).length, 0);
});

test("copa completa: rodando todas as 8 fases sai 1 campeão", () => {
  const { cup, rng, state } = cupWorld(2024);
  for (const phaseKey of CUP_PHASE_ORDER) {
    const ties = drawPhase(cup, phaseKey, rng, state.teams);
    for (const tie of ties) {
      for (const leg of tie.legs) {
        leg.played = true;
        leg.score = { home: rng.int(0, 3), away: rng.int(0, 3) };
        leg.events = [];
        applyCupLegResult(cup, leg, rng, { teamsById: state.teams, playersById: state.players });
      }
    }
    assert.ok(cup.phases[phaseKey].complete, `${phaseKey} deve completar`);
  }
  const finalTie = cup.phases.final.ties[0];
  assert.ok(finalTie.winnerId, "final tem vencedor");
  assert.ok(state.teams[finalTie.winnerId], "campeão é um time válido");
});
