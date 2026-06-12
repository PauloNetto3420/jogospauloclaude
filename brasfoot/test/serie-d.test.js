// Testes da Série D — 96 clubes, 24 grupos de 4 (turno e returno), 32 ao
// mata-mata (24 líderes + 8 melhores vices), KO 32→16→8→4 (acesso)→semis→final.

import { test } from "node:test";
import assert from "node:assert/strict";

import { createRng } from "../src/utils/rng.js";
import { updateStandings } from "../src/engine/season.js";
import {
  createSerieD, buildRegionalGroups, getSerieDQualified, createSerieDKnockout,
  advanceSerieDPhase, applySerieDKnockoutResult, getSerieDMatchesForRound,
  applySerieDMatchResult, isSerieDDone, getSerieDPromoted, nextSerieDField, pickSerieDField,
  SERIE_D_TEAMS, SERIE_D_GROUPS, SERIE_D_GROUP_ROUNDS, SERIE_D_TOTAL_ROUNDS,
  REGION_BY_UF,
} from "../src/engine/serie-d.js";

const UFS = Object.keys(REGION_BY_UF);

// 96 times sintéticos espalhados por UF (para exercitar a regionalização).
function makeTeams(n = SERIE_D_TEAMS) {
  const teams = {};
  const ids = [];
  for (let i = 0; i < n; i++) {
    const id = `t${i}`;
    teams[id] = { id, name: `Time ${i}`, shortName: `T${i}`, state: UFS[i % UFS.length] };
    ids.push(id);
  }
  return { teams, ids };
}

// Simula a Série D inteira com placares pseudo-aleatórios determinísticos.
function playWholeSerieD(serieD, teams, rng) {
  for (let safety = 0; safety < 100 && !isSerieDDone(serieD); safety++) {
    const entries = getSerieDMatchesForRound(serieD, serieD.round);
    for (const e of entries) {
      const result = { score: { home: rng.int(0, 4), away: rng.int(0, 3) }, events: [] };
      applySerieDMatchResult(serieD, e, result, rng);
    }
    advanceSerieDPhase(serieD, teams, rng);
  }
  return serieD;
}

test("buildRegionalGroups: 24 grupos de 4, todos os 96 sem repetição", () => {
  const { teams, ids } = makeTeams();
  const rng = createRng(1);
  const groups = buildRegionalGroups(ids, teams, rng);
  assert.equal(groups.length, SERIE_D_GROUPS);
  const seen = new Set();
  for (const g of groups) {
    assert.equal(g.length, 4);
    for (const id of g) { assert.ok(!seen.has(id), "sem duplicata"); seen.add(id); }
  }
  assert.equal(seen.size, SERIE_D_TEAMS);
});

test("createSerieD: 24 grupos, 12 jogos e 6 rodadas cada", () => {
  const { teams, ids } = makeTeams();
  const sd = createSerieD({ season: 2026, teamIds: ids, teams, rng: createRng(2) });
  assert.equal(sd.groups.length, SERIE_D_GROUPS);
  for (const g of sd.groups) {
    assert.equal(g.teams.length, 4);
    assert.equal(g.fixtures.length, 12); // 4 times, turno e returno
    assert.equal(Math.max(...g.fixtures.map(m => m.round)), SERIE_D_GROUP_ROUNDS);
  }
});

test("rejeita campo diferente de 96", () => {
  const { teams } = makeTeams();
  assert.throws(() => createSerieD({ season: 2026, teamIds: ["a", "b"], teams, rng: createRng(3) }));
});

test("getSerieDQualified: 32 classificados (24 líderes + 8 vices), sem repetição", () => {
  const { teams, ids } = makeTeams();
  const rng = createRng(4);
  const sd = createSerieD({ season: 2026, teamIds: ids, teams, rng });
  // joga só os grupos (rodadas 1..6)
  for (let r = 1; r <= SERIE_D_GROUP_ROUNDS; r++) {
    for (const e of getSerieDMatchesForRound(sd, r)) {
      applySerieDMatchResult(sd, e, { score: { home: rng.int(0, 4), away: rng.int(0, 3) }, events: [] }, rng);
    }
    sd.round = r; advanceSerieDPhase(sd, teams, rng);
  }
  const q = getSerieDQualified(sd, teams);
  assert.equal(q.length, 32);
  assert.equal(new Set(q).size, 32);
});

test("mata-mata: progride 32→16→8→4 (acesso) → semis → final → campeão", () => {
  const { teams, ids } = makeTeams();
  const rng = createRng(5);
  const sd = createSerieD({ season: 2026, teamIds: ids, teams, rng });
  playWholeSerieD(sd, teams, rng);

  assert.equal(sd.phase, "done");
  assert.ok(sd.champion, "tem campeão");
  assert.equal(getSerieDPromoted(sd).length, 4, "4 acessos");
  assert.equal(new Set(getSerieDPromoted(sd)).size, 4);
  // O campeão tem que estar entre os 4 que subiram (saiu das quartas).
  assert.ok(getSerieDPromoted(sd).includes(sd.champion));
  assert.ok(sd.round <= SERIE_D_TOTAL_ROUNDS);
});

test("seedBracketOrder via createSerieDKnockout: 16-avos com 16 confrontos e 1×32", () => {
  const qualified = Array.from({ length: 32 }, (_, i) => `s${i}`);
  const sd = { ko: { seedOf: {}, r32: [] } };
  createSerieDKnockout(sd, qualified);
  assert.equal(sd.ko.r32.length, 16);
  // Confronto do top seed (s0) deve ser contra o pior (s31).
  const top = sd.ko.r32.find(t => t.teamAId === "s0" || t.teamBId === "s0");
  assert.ok(top && (top.teamAId === "s31" || top.teamBId === "s31"), "1×32");
  // teamA é sempre o melhor seed (joga a volta em casa).
  for (const t of sd.ko.r32) {
    assert.ok(sd.ko.seedOf[t.teamAId] < sd.ko.seedOf[t.teamBId]);
    assert.equal(t.legs[1].homeTeamId, t.teamAId);
  }
});

test("agregado empatado vai a pênaltis (rng decide)", () => {
  const tie = {
    teamAId: "A", teamBId: "B",
    legs: [
      { played: true, score: { home: 1, away: 1 } }, // B casa, A fora
      { played: true, score: { home: 1, away: 1 } }, // A casa, B fora
    ],
    winnerId: null, aggregate: null,
  };
  applySerieDKnockoutResult(tie, createRng(7));
  assert.ok(tie.winnerId === "A" || tie.winnerId === "B");
  assert.deepEqual(tie.aggregate, { teamA: 2, teamB: 2 });
});

test("pickSerieDField: top 96 do ranking", () => {
  const ranked = Array.from({ length: 150 }, (_, i) => ({ teamId: `r${i}`, points: 150 - i }));
  const field = pickSerieDField(ranked);
  assert.equal(field.length, 96);
  assert.equal(field[0], "r0");
  assert.equal(field[95], "r95");
});

test("nextSerieDField: troca os 4 que subiram pelos 4 rebaixados da C (mantém 96)", () => {
  const prev = Array.from({ length: 96 }, (_, i) => `d${i}`);
  const promotedToC = ["d0", "d1", "d2", "d3"];          // sobem (saem da D)
  const relegatedFromC = ["c1", "c2", "c3", "c4"];        // descem da C (entram na D)
  const next = nextSerieDField(prev, promotedToC, relegatedFromC);
  assert.equal(next.length, 96);
  for (const id of promotedToC) assert.ok(!next.includes(id), `${id} saiu`);
  for (const id of relegatedFromC) assert.ok(next.includes(id), `${id} entrou`);
  assert.equal(new Set(next).size, 96, "sem duplicatas");
});

test("determinismo: mesma seed → mesmo campeão e mesmos acessos", () => {
  const a = makeTeams(), b = makeTeams();
  const sdA = createSerieD({ season: 2026, teamIds: a.ids, teams: a.teams, rng: createRng(9) });
  const sdB = createSerieD({ season: 2026, teamIds: b.ids, teams: b.teams, rng: createRng(9) });
  playWholeSerieD(sdA, a.teams, createRng(42));
  playWholeSerieD(sdB, b.teams, createRng(42));
  assert.equal(sdA.champion, sdB.champion);
  assert.deepEqual(getSerieDPromoted(sdA), getSerieDPromoted(sdB));
});
