// Testes de Histórico & Recordes.
// Cobrem o snapshot por temporada (recordSeasonHistory), idempotência e os
// seletores puros que a UI consome.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  recordSeasonHistory, getHistory, summarizeClubTitles, totalClubTitles,
  getGoldenBootRoll, getMostDecoratedTeams, competitionLabel,
} from "../src/engine/history.js";

// Monta um estado mínimo só com o que recordSeasonHistory lê:
// competitions (standings + topScorers), estaduais e teams.
function fakeState() {
  return {
    teams: {
      A: { id: "A", name: "Alfa" }, B: { id: "B", name: "Beta" },
      C: { id: "C", name: "Gama" }, D: { id: "D", name: "Delta" },
    },
    competitions: {
      brasileirao_a: {
        standings: [
          { teamId: "A", points: 70, goalsFor: 60, goalsAgainst: 20 },
          { teamId: "B", points: 60, goalsFor: 50, goalsAgainst: 30 },
          { teamId: "C", points: 40, goalsFor: 30, goalsAgainst: 40 },
        ],
        topScorers: [
          { playerId: "p1", playerName: "Artilheiro", teamId: "A", goals: 22 },
          { playerId: "p2", playerName: "Vice", teamId: "B", goals: 18 },
        ],
      },
      brasileirao_b: {
        standings: [
          { teamId: "C", points: 65, goalsFor: 40, goalsAgainst: 25 },
          { teamId: "D", points: 55, goalsFor: 35, goalsAgainst: 28 },
        ],
        topScorers: [{ playerId: "p3", playerName: "Goleador B", teamId: "C", goals: 15 }],
      },
    },
    estaduais: {
      SP: { uf: "SP", champion: "A" },
      RJ: { uf: "RJ", champion: "B" },
    },
  };
}

function fakeReport(season = 2026) {
  return {
    season,
    champions: { brasileirao_a: "A", brasileirao_b: "C", brasileirao_c: "D", copa_brasil: "B" },
    promoted: ["C", "D"], relegated: ["C"], relegatedToC: ["D"], promotedFromC: [],
  };
}

test("recordSeasonHistory: cria entrada com campeões, standings, golden boots", () => {
  const state = fakeState();
  recordSeasonHistory(state, fakeReport(2026));

  const h = getHistory(state);
  assert.equal(h.length, 1);
  const e = h[0];
  assert.equal(e.season, 2026);
  assert.equal(e.champions.brasileirao_a, "A");
  assert.equal(e.champions.brasileirao_b, "C");
  assert.equal(e.champions.brasileirao_c, "D");
  assert.equal(e.champions.copa_brasil, "B");
  assert.deepEqual(e.champions.estaduais, { SP: "A", RJ: "B" });

  // standings finais na ordem (por pontos)
  assert.deepEqual(e.standings.brasileirao_a, ["A", "B", "C"]);
  assert.deepEqual(e.standings.brasileirao_b, ["C", "D"]);

  // golden boots = 1º de topScorers
  assert.equal(e.goldenBoots.brasileirao_a.playerId, "p1");
  assert.equal(e.goldenBoots.brasileirao_a.goals, 22);
  assert.equal(e.goldenBoots.brasileirao_b.playerName, "Goleador B");
});

test("recordSeasonHistory: idempotente por temporada", () => {
  const state = fakeState();
  recordSeasonHistory(state, fakeReport(2026));
  recordSeasonHistory(state, fakeReport(2026)); // duplicado
  assert.equal(getHistory(state).length, 1, "não duplica a mesma temporada");

  recordSeasonHistory(state, fakeReport(2027));
  assert.equal(getHistory(state).length, 2, "temporada nova adiciona");
});

test("recordSeasonHistory: lida com ausência de séries C/copa/estaduais", () => {
  const state = fakeState();
  state.estaduais = null;
  const report = { season: 2030, champions: { brasileirao_a: "A" } };
  recordSeasonHistory(state, report);
  const e = getHistory(state)[0];
  assert.equal(e.champions.brasileirao_c, null);
  assert.equal(e.champions.copa_brasil, null);
  assert.deepEqual(e.champions.estaduais, {});
  assert.deepEqual(e.movements.promoted, []);
});

test("goldenBoot ignorado quando ninguém marcou", () => {
  const state = fakeState();
  state.competitions.brasileirao_a.topScorers = [];
  state.competitions.brasileirao_b.topScorers = [{ playerId: "x", playerName: "X", teamId: "C", goals: 0 }];
  recordSeasonHistory(state, fakeReport());
  const e = getHistory(state)[0];
  assert.equal(e.goldenBoots.brasileirao_a, null, "sem artilheiro → null");
  assert.equal(e.goldenBoots.brasileirao_b, null, "0 gols não conta");
});

test("summarizeClubTitles: agrupa troféus por competição, ordena por contagem", () => {
  const team = {
    trophies: [
      { competitionId: "brasileirao_a", season: 2026 },
      { competitionId: "brasileirao_a", season: 2028 },
      { competitionId: "copa_brasil", season: 2027 },
      { competitionId: "estadual_sp", season: 2026 },
    ],
  };
  const summary = summarizeClubTitles(team);
  assert.equal(summary[0].competitionId, "brasileirao_a");
  assert.equal(summary[0].count, 2);
  assert.deepEqual(summary[0].seasons, [2028, 2026], "temporadas desc");
  assert.equal(summary[0].label, "Brasileirão Série A");
  assert.equal(totalClubTitles(team), 4);
  // estadual rotulado corretamente
  const est = summary.find(s => s.competitionId === "estadual_sp");
  assert.equal(est.label, "Paulistão");
});

test("summarizeClubTitles: clube sem títulos", () => {
  assert.deepEqual(summarizeClubTitles({ trophies: [] }), []);
  assert.deepEqual(summarizeClubTitles({}), []);
  assert.equal(totalClubTitles({}), 0);
});

test("getGoldenBootRoll: lista achatada mais recente primeiro", () => {
  const state = fakeState();
  recordSeasonHistory(state, fakeReport(2026));
  recordSeasonHistory(state, fakeReport(2027));
  const roll = getGoldenBootRoll(state);
  // 2 temporadas × 2 ligas com artilheiro = 4 entradas
  assert.equal(roll.length, 4);
  assert.equal(roll[0].season, 2027, "mais recente primeiro");
  assert.ok(roll.every(r => r.label && r.playerName));
});

test("getMostDecoratedTeams: tabula campeões do histórico", () => {
  const state = fakeState();
  recordSeasonHistory(state, fakeReport(2026));
  // A: champ A + estadual SP = 2; B: copa + estadual RJ = 2; C: série A2/B champ = 1; D: série C = 1
  const ranked = getMostDecoratedTeams(state);
  const map = Object.fromEntries(ranked.map(r => [r.teamId, r.titles]));
  assert.equal(map["A"], 2);
  assert.equal(map["B"], 2);
  assert.equal(map["C"], 1);
  assert.equal(map["D"], 1);
});

test("competitionLabel: nacionais, copa e estaduais", () => {
  assert.equal(competitionLabel("brasileirao_a"), "Brasileirão Série A");
  assert.equal(competitionLabel("copa_brasil"), "Copa do Brasil");
  assert.equal(competitionLabel("estadual_mg"), "Campeonato Mineiro");
  assert.equal(competitionLabel("estadual_xx"), "Estadual XX");
});
