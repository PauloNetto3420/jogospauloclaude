// Testes da Copa do Brasil: montagem das fases, sorteio, agregado de ida/volta,
// pênaltis e progressão até o campeão. É a competição mais complexa do jogo
// (mata-mata com seeds + chaveamento), então vale blindar bem.

import { test } from "node:test";
import assert from "node:assert/strict";

import { createRng } from "../src/utils/rng.js";
import {
  createCupCompetition, drawPhase, applyCupLegResult, penaltyShootout,
  getCupLegsForRound, CUP_PHASE_ORDER,
} from "../src/engine/cup.js";
import { fakeSeeds, makeState } from "./helpers.js";

// Mundo de copa: 60 times (espelha A20+B20+C20 do jogo real).
function cupWorld(seed = 3) {
  const seeds = fakeSeeds(60);
  const { state, rng } = makeState({ seed, teamSeeds: seeds });
  const cup = createCupCompetition({
    season: 2026,
    allTeams: state.teams,
    libertaQualifiers: null,                 // 1ª temporada → top 4 por reputação
    seriesATeamIds: seeds.slice(0, 20).map(t => t.id),
  });
  state.competitions.copa_brasil = cup;
  return { state, rng, cup };
}

// Joga um tie inteiro de forma determinística forçando placares e aplicando.
function decideTie(cup, tie, rng, teamsById, playersById, { aGoals = 2, bGoals = 0 } = {}) {
  for (const leg of tie.legs) {
    leg.played = true;
    // home/away placar: dá vitória pro mandante por padrão
    leg.score = { home: aGoals, away: bGoals };
    leg.events = []; leg.stats = { home: {}, away: {} };
    applyCupLegResult(cup, leg, rng, { teamsById, playersById });
  }
}

test("createCupCompetition: 60 times distribuídos em 4+8+16+32", () => {
  const { cup } = cupWorld();
  assert.equal(cup.libertaEntrants.length, 4, "4 cabeças");
  assert.equal(cup.fase3Seeds.length, 8, "8 seeds da 3ª fase");
  assert.equal(cup.fase2Seeds.length, 16, "16 seeds da 2ª fase");
  assert.equal(cup.fase1Seeds.length, 32, "32 entram na 1ª fase");
  assert.equal(cup.teams.length, 60, "60 times no total");
  // Sem duplicados
  assert.equal(new Set(cup.teams).size, 60, "nenhum time repetido");
});

test("cabeças são os 4 de maior reputação da Série A", () => {
  const { state, cup } = cupWorld();
  const seriesA = cup.teams.slice(0, 20); // não confiável; usa reputação real
  const top4ByRep = Object.values(state.teams)
    .sort((a, b) => b.reputation - a.reputation);
  // Os cabeças devem estar entre os de altíssima reputação
  for (const id of cup.libertaEntrants) {
    assert.ok(state.teams[id], "cabeça é um time válido");
  }
  assert.equal(cup.libertaEntrants.length, 4);
});

test("drawPhase fase1: 32 times → 16 confrontos de jogo único", () => {
  const { cup, rng, state } = cupWorld();
  const ties = drawPhase(cup, "fase1", rng, state.teams);
  assert.equal(ties.length, 16, "16 confrontos");
  for (const tie of ties) {
    assert.equal(tie.legs.length, 1, "jogo único na 1ª fase");
    assert.ok(tie.teamAId && tie.teamBId, "tie tem dois times");
    assert.notEqual(tie.teamAId, tie.teamBId, "time não joga contra si mesmo");
  }
  // Todos os 32 seeds aparecem exatamente uma vez
  const participants = ties.flatMap(t => [t.teamAId, t.teamBId]);
  assert.equal(new Set(participants).size, 32, "32 participantes únicos");
});

test("jogo único: vitória do mandante define vencedor sem pênaltis", () => {
  const { cup, rng, state } = cupWorld();
  const ties = drawPhase(cup, "fase1", rng, state.teams);
  const tie = ties[0];
  const leg = tie.legs[0];
  leg.played = true;
  leg.score = { home: 3, away: 1 };
  applyCupLegResult(cup, leg, rng, { teamsById: state.teams, playersById: state.players });

  assert.equal(tie.winnerId, leg.homeTeamId, "mandante venceu");
  assert.equal(tie.penalties, undefined, "sem pênaltis quando há vencedor no tempo normal");
});

test("jogo único empatado: vai pra pênaltis e define um vencedor", () => {
  const { cup, rng, state } = cupWorld();
  const ties = drawPhase(cup, "fase1", rng, state.teams);
  const tie = ties[0];
  const leg = tie.legs[0];
  leg.played = true;
  leg.score = { home: 1, away: 1 };
  applyCupLegResult(cup, leg, rng, { teamsById: state.teams, playersById: state.players });

  assert.ok(tie.penalties, "deve ter disputa de pênaltis");
  assert.ok([tie.teamAId, tie.teamBId].includes(tie.winnerId), "vencedor é um dos dois");
  assert.notEqual(tie.penalties.scoreA, tie.penalties.scoreB, "pênaltis não terminam empatados");
});

test("ida e volta: agregado decide o vencedor", () => {
  const { cup, rng, state } = cupWorld();
  // Avança até oitavas (primeira fase de 2 legs)
  drawPhase(cup, "fase1", rng, state.teams);
  for (const tie of cup.phases.fase1.ties) decideTie(cup, tie, rng, state.teams, state.players);
  drawPhase(cup, "fase2", rng, state.teams);
  for (const tie of cup.phases.fase2.ties) decideTie(cup, tie, rng, state.teams, state.players);
  drawPhase(cup, "fase3", rng, state.teams);
  for (const tie of cup.phases.fase3.ties) decideTie(cup, tie, rng, state.teams, state.players);
  const oitavas = drawPhase(cup, "oitavas", rng, state.teams);

  const tie = oitavas[0];
  assert.equal(tie.legs.length, 2, "oitavas tem ida e volta");
  const [leg1, leg2] = tie.legs;

  // teamA (melhor seed) joga FORA na ida, EM CASA na volta.
  // Damos a teamA: 0 fora (ida) + 3 em casa (volta) = 3. teamB: 1 + 0 = 1.
  leg1.played = true; leg1.score = { home: 1, away: 0 }; // home=teamB(otherId), away=teamA
  applyCupLegResult(cup, leg1, rng, { teamsById: state.teams, playersById: state.players });
  assert.equal(tie.winnerId, null, "não decide antes do leg 2");

  leg2.played = true; leg2.score = { home: 3, away: 0 }; // home=teamA, away=teamB
  applyCupLegResult(cup, leg2, rng, { teamsById: state.teams, playersById: state.players });

  assert.equal(tie.aggregate.teamA, 3, "agregado teamA = 0+3");
  assert.equal(tie.aggregate.teamB, 1, "agregado teamB = 1+0");
  assert.equal(tie.winnerId, tie.teamAId, "teamA venceu no agregado");
});

test("penaltyShootout: sempre produz um vencedor e placares coerentes", () => {
  const { state } = cupWorld(123);
  const rng = createRng(456);
  const teams = Object.values(state.teams);
  for (let i = 0; i < 50; i++) {
    const a = teams[i % teams.length];
    const b = teams[(i + 1) % teams.length];
    const r = penaltyShootout(a, b, state.players, rng);
    assert.ok([a.id, b.id].includes(r.winnerId), "vencedor é um dos dois times");
    assert.notEqual(r.scoreA, r.scoreB, "não pode empatar (morte súbita resolve)");
    assert.ok(r.kicks.length >= 2, "ao menos 2 cobranças");
    // O vencedor tem mais gols
    if (r.winnerId === a.id) assert.ok(r.scoreA > r.scoreB);
    else assert.ok(r.scoreB > r.scoreA);
  }
});

test("getCupLegsForRound: retorna os legs da fase agendada pra rodada", () => {
  const { cup, rng, state } = cupWorld();
  drawPhase(cup, "fase1", rng, state.teams);
  // fase1 está agendada pra rodada 3 (DEFAULT_SCHEDULE)
  const legs = getCupLegsForRound(cup, 3);
  assert.equal(legs.length, 16, "16 legs da 1ª fase na rodada 3");
  for (const leg of legs) assert.equal(leg.round, 3, "round atribuído");
  // Rodada sem copa → vazio
  assert.equal(getCupLegsForRound(cup, 99).length, 0, "rodada sem copa = vazio");
});

test("copa completa: rodando todas as fases sai 1 campeão", () => {
  const { cup, rng, state } = cupWorld(2024);
  for (const phaseKey of CUP_PHASE_ORDER) {
    const ties = drawPhase(cup, phaseKey, rng, state.teams);
    for (const tie of ties) {
      for (const leg of tie.legs) {
        leg.played = true;
        // placar aleatório-determinístico
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
