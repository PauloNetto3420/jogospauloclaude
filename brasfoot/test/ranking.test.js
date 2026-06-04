// Testes do Ranking Nacional de Clubes (RNC): pontuação por temporada,
// janela móvel com decaimento e seletores.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  computeSeasonPoints, awardSeasonRankingPoints, seedInitialRanking,
  computeRanking, getRankedClubsOutsideTopDivisions, getRankingPosition,
  currentDivisionLabel, RANKING_WINDOW,
} from "../src/engine/ranking.js";

// Estado mínimo com ligas, copa e estaduais.
function makeState() {
  const standings = (ids) => ids.map((id, i) => ({
    teamId: id, points: (ids.length - i) * 3, goalsFor: 30 - i, goalsAgainst: 10 + i,
  }));
  return {
    season: 2026,
    teams: Object.fromEntries(
      ["A1","A2","B1","B2","C1","C2","X1","X2"].map(id => [id, { id, name: id, reputation: 50 }])
    ),
    competitions: {
      brasileirao_a: { teams: ["A1","A2"], standings: standings(["A1","A2"]) },
      brasileirao_b: { teams: ["B1","B2"], standings: standings(["B1","B2"]) },
      brasileirao_c_p1: { teams: ["C1","C2"], standings: standings(["C1","C2"]) },
      copa_brasil: {
        champion: "A1",
        phases: {
          fase1: { ties: [{ teamAId: "X1", teamBId: "X2" }] },
          final: { ties: [{ teamAId: "A1", teamBId: "B1" }] },
        },
      },
    },
    estaduais: {
      SP: { uf: "SP", champion: "X1", knockout: { final: { teamAId: "X1", teamBId: "X2", winnerId: "X1" } } },
    },
  };
}

test("computeSeasonPoints: liga dá mais à Série A, menos à C", () => {
  const pts = computeSeasonPoints(makeState());
  // A1 (campeão A, base 100 + step) > B1 (base 60) > C1 (base 35)
  assert.ok(pts.A1 > pts.B1, "A vale mais que B");
  assert.ok(pts.B1 > pts.C1, "B vale mais que C");
});

test("computeSeasonPoints: soma copa e estadual ao clube", () => {
  const pts = computeSeasonPoints(makeState());
  // A1: liga A (campeão) + copa (final + champion bonus). Deve ser bem alto.
  // X1: campeão estadual (25) + vice da própria final? não — é campeão. + fase1 copa (2)
  assert.ok(pts.X1 >= 25, "X1 tem pontos de campeão estadual");
  // X2: vice estadual (12) + fase1 copa (2)
  assert.ok(pts.X2 >= 12, "X2 tem pontos de vice estadual");
});

test("awardSeasonRankingPoints: registra e é idempotente por temporada", () => {
  const state = makeState();
  awardSeasonRankingPoints(state, { season: 2026 });
  awardSeasonRankingPoints(state, { season: 2026 });
  assert.equal(state.rncLog.length, 1, "não duplica temporada");
  awardSeasonRankingPoints(state, { season: 2027 });
  assert.equal(state.rncLog.length, 2);
});

test("awardSeasonRankingPoints: respeita o tamanho da janela (+folga)", () => {
  const state = makeState();
  for (let s = 2020; s <= 2030; s++) awardSeasonRankingPoints(state, { season: s });
  assert.ok(state.rncLog.length <= RANKING_WINDOW + 2, "não cresce indefinidamente");
  // mantém as mais recentes
  assert.equal(state.rncLog[state.rncLog.length - 1].season, 2030);
});

test("seedInitialRanking: baseia ranking inicial na reputação", () => {
  const state = makeState();
  state.teams.A1.reputation = 95;
  state.teams.C2.reputation = 40;
  seedInitialRanking(state);
  const ranking = computeRanking(state);
  assert.equal(ranking[0].teamId, "A1", "maior reputação lidera o ranking semente");
  // idempotente
  seedInitialRanking(state);
  assert.equal(state.rncLog.length, 1);
});

test("computeRanking: temporada recente pesa mais que antiga", () => {
  const state = { teams: {}, competitions: {}, rncLog: [
    { season: 2025, points: { T1: 100, T2: 0 } },   // antiga: favorece T1
    { season: 2026, points: { T1: 0, T2: 100 } },   // recente: favorece T2
  ] };
  const ranking = computeRanking(state);
  // 2026 (peso 1.0) vs 2025 (peso 0.85) → T2 na frente
  assert.equal(ranking[0].teamId, "T2", "temporada recente pesa mais");
});

test("getRankedClubsOutsideTopDivisions: exclui A/B/C", () => {
  const state = makeState();
  seedInitialRanking(state);
  const outside = getRankedClubsOutsideTopDivisions(state);
  const ids = outside.map(r => r.teamId);
  assert.ok(ids.includes("X1") && ids.includes("X2"), "clubes fora das divisões entram");
  assert.ok(!ids.includes("A1") && !ids.includes("B1") && !ids.includes("C1"), "A/B/C ficam de fora");
});

test("getRankingPosition + currentDivisionLabel", () => {
  const state = makeState();
  seedInitialRanking(state);
  assert.ok(getRankingPosition(state, "A1") >= 1);
  assert.equal(currentDivisionLabel(state, "A1"), "Série A");
  assert.equal(currentDivisionLabel(state, "C1"), "Série C");
  assert.equal(currentDivisionLabel(state, "X1"), "—");
});
