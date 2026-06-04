// Testes do histórico de carreira do jogador:
//   - apps (presença) registrados a cada partida via applyMatchEffects
//   - rollUpPlayerSeason consolida player.career (idempotente, pula vazios)
//   - getCareerTotals soma corretamente

import { test } from "node:test";
import assert from "node:assert/strict";

import { applyMatchEffects } from "../src/engine/season.js";
import { rollUpPlayerSeason, getCareerTotals } from "../src/models/player.js";

// Estado mínimo com 2 jogadores e 2 times — só o que applyMatchEffects lê.
function miniState() {
  const mk = (id, teamId) => ({
    id, teamId, position: "ATA", overall: 80, age: 25,
    status: { form: 6.5, morale: 70, yellowCardsInCompetition: {}, suspendedMatches: 0, injury: null },
    stats: {},
  });
  return {
    season: 2026,
    teams: { H: { id: "H", squad: ["p1"] }, A: { id: "A", squad: ["p2"] } },
    players: { p1: mk("p1", "H"), p2: mk("p2", "A") },
  };
}

function resultWith({ home = 1, away = 0, events = [] }) {
  return {
    homeTeamId: "H", awayTeamId: "A",
    score: { home, away },
    events,
    lineups: { home: [{ id: "p1" }], away: [{ id: "p2" }] },
  };
}

test("apps: cada partida registra +1 jogo na temporada/competição", () => {
  const state = miniState();
  applyMatchEffects(state, resultWith({ home: 2, away: 1, events: [
    { type: "goal", playerId: "p1", minute: 10 },
    { type: "goal", playerId: "p1", minute: 50 },
    { type: "goal", playerId: "p2", minute: 70 },
  ] }), "brasileirao_a");

  assert.equal(state.players.p1.stats[2026].brasileirao_a.apps, 1, "p1 1 jogo");
  assert.equal(state.players.p1.stats[2026].brasileirao_a.goals, 2, "p1 2 gols");
  assert.equal(state.players.p2.stats[2026].brasileirao_a.apps, 1, "p2 1 jogo");
  assert.equal(state.players.p2.stats[2026].brasileirao_a.goals, 1, "p2 1 gol");

  // Segunda partida acumula
  applyMatchEffects(state, resultWith({ home: 0, away: 0 }), "brasileirao_a");
  assert.equal(state.players.p1.stats[2026].brasileirao_a.apps, 2, "p1 2 jogos");
});

test("apps: competições separadas somam em chaves distintas", () => {
  const state = miniState();
  applyMatchEffects(state, resultWith({}), "brasileirao_a");
  applyMatchEffects(state, resultWith({}), "copa_brasil");
  const s = state.players.p1.stats[2026];
  assert.equal(s.brasileirao_a.apps, 1);
  assert.equal(s.copa_brasil.apps, 1);
});

test("rollUpPlayerSeason: consolida soma de todas as competições", () => {
  const player = {
    id: "p1", teamId: "H", age: 25, overall: 80,
    stats: { 2026: {
      brasileirao_a: { apps: 30, goals: 12, assists: 4 },
      copa_brasil: { apps: 6, goals: 3, assists: 1 },
    } },
  };
  rollUpPlayerSeason(player, 2026);
  assert.equal(player.career.length, 1);
  const row = player.career[0];
  assert.equal(row.season, 2026);
  assert.equal(row.teamId, "H");
  assert.equal(row.age, 25);
  assert.equal(row.apps, 36);
  assert.equal(row.goals, 15);
  assert.equal(row.assists, 5);
});

test("rollUpPlayerSeason: idempotente por temporada", () => {
  const player = { id: "p1", teamId: "H", age: 25, overall: 80, stats: { 2026: { liga: { apps: 10, goals: 5 } } } };
  rollUpPlayerSeason(player, 2026);
  rollUpPlayerSeason(player, 2026);
  assert.equal(player.career.length, 1, "não duplica");
});

test("rollUpPlayerSeason: pula temporada sem participação", () => {
  const semJogo = { id: "p1", teamId: "H", age: 20, overall: 70, stats: { 2026: { liga: { apps: 0, goals: 0 } } } };
  rollUpPlayerSeason(semJogo, 2026);
  assert.equal((semJogo.career || []).length, 0, "0 jogos e 0 gols não vira linha");

  const semStats = { id: "p2", teamId: "H", age: 20, overall: 70, stats: {} };
  rollUpPlayerSeason(semStats, 2026);
  assert.equal((semStats.career || []).length, 0, "sem stats da temporada não vira linha");
});

test("getCareerTotals: soma múltiplas temporadas", () => {
  const player = { career: [
    { season: 2026, apps: 30, goals: 12, assists: 4 },
    { season: 2027, apps: 28, goals: 9, assists: 6 },
    { season: 2028, apps: 34, goals: 15, assists: 3 },
  ] };
  const t = getCareerTotals(player);
  assert.equal(t.seasons, 3);
  assert.equal(t.apps, 92);
  assert.equal(t.goals, 36);
  assert.equal(t.assists, 13);
});

test("getCareerTotals: jogador sem carreira → zeros", () => {
  assert.deepEqual(getCareerTotals({}), { seasons: 0, apps: 0, goals: 0, assists: 0 });
});
