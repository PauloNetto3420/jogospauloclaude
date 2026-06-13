// Testes da Série C: pipeline phase1 → quadrangulares → final → promoção.
// A Série C tem um formato próprio (pontos corridos turno único, depois 2
// grupos de 4, depois final ida/volta), então cada transição merece rede.

import { test } from "node:test";
import assert from "node:assert/strict";

import { runRound, sortStandings as sortStandingsTeams } from "../src/engine/season.js";
import {
  createSerieCPhase1, createSerieCGroups, createSerieCFinal,
  decideSerieCChampion, getSerieCPromoted,
} from "../src/engine/serie-c.js";
import { fakeSeeds, makeState } from "./helpers.js";

// Cria um estado com 20 times e a Série C 1ª fase já registrada + jogada.
function playedPhase1(seed = 5) {
  const seeds = fakeSeeds(20, { tierOffset: 40 });
  const { state, rng } = makeState({ seed, teamSeeds: seeds });
  const p1 = createSerieCPhase1({ season: state.season, teamIds: seeds.map(t => t.id) });
  state.competitions.brasileirao_c_p1 = p1;
  const totalRounds = Math.max(...p1.fixtures.map(m => m.round));
  for (let r = 1; r <= totalRounds; r++) runRound(state, "brasileirao_c_p1", rng);
  return { state, rng, p1 };
}

test("createSerieCPhase1: 20 times, turno único = 19 rodadas / 190 jogos", () => {
  const seeds = fakeSeeds(20, { tierOffset: 40 });
  const p1 = createSerieCPhase1({ season: 2026, teamIds: seeds.map(t => t.id) });
  const rounds = new Set(p1.fixtures.map(m => m.round));
  assert.equal(rounds.size, 19, "19 rodadas (turno único)");
  assert.equal(p1.fixtures.length, 190, "190 jogos (20*19/2)");
});

test("createSerieCGroups: 8 melhores viram 2 grupos de 4", () => {
  const { p1 } = playedPhase1();
  const { groupA, groupB, top8, relegated } = createSerieCGroups({ season: 2026, phase1: p1 });

  assert.equal(top8.length, 8, "8 classificados");
  assert.equal(relegated.length, 4, "4 rebaixados à Série D (últimos)");
  assert.equal(groupA.teams.length, 4, "grupo A com 4");
  assert.equal(groupB.teams.length, 4, "grupo B com 4");

  // Grupos disjuntos e formados só pelos top8
  const all = [...groupA.teams, ...groupB.teams];
  assert.equal(new Set(all).size, 8, "8 times únicos entre os grupos");
  for (const id of all) assert.ok(top8.includes(id), `${id} está entre os top8`);
});

test("grupos: distribuição 1/3/4/7 (A) e 2/5/6/8 (B) pela classificação", () => {
  const { p1 } = playedPhase1();
  const sorted = sortStandingsTeams(p1, null);
  const { groupA, groupB } = createSerieCGroups({ season: 2026, phase1: p1 });
  const pos = sorted.map(s => s.teamId);

  assert.deepEqual(groupA.teams, [pos[0], pos[2], pos[3], pos[6]], "Grupo A = 1º,3º,4º,7º");
  assert.deepEqual(groupB.teams, [pos[1], pos[4], pos[5], pos[7]], "Grupo B = 2º,5º,6º,8º");
});

test("getSerieCPromoted: 4 promovidos = top 2 de cada grupo", () => {
  const { state, rng, p1 } = playedPhase1();
  const { groupA, groupB } = createSerieCGroups({ season: 2026, phase1: p1 });
  state.competitions.brasileirao_c_ga = groupA;
  state.competitions.brasileirao_c_gb = groupB;
  for (const cid of ["brasileirao_c_ga", "brasileirao_c_gb"]) {
    const comp = state.competitions[cid];
    const tr = Math.max(...comp.fixtures.map(m => m.round));
    for (let r = 1; r <= tr; r++) runRound(state, cid, rng);
  }
  const promoted = getSerieCPromoted({ groupA, groupB });
  assert.equal(promoted.length, 4, "4 promovidos");
  assert.equal(new Set(promoted).size, 4, "sem duplicados");

  const top2A = sortStandingsTeams(groupA, null).slice(0, 2).map(s => s.teamId);
  const top2B = sortStandingsTeams(groupB, null).slice(0, 2).map(s => s.teamId);
  assert.deepEqual(promoted, [...top2A, ...top2B], "ordem A1,A2,B1,B2");
});

test("createSerieCFinal + decideSerieCChampion: campeão sai do agregado", () => {
  const { state, rng, p1 } = playedPhase1();
  const { groupA, groupB } = createSerieCGroups({ season: 2026, phase1: p1 });
  state.competitions.brasileirao_c_ga = groupA;
  state.competitions.brasileirao_c_gb = groupB;
  for (const cid of ["brasileirao_c_ga", "brasileirao_c_gb"]) {
    const comp = state.competitions[cid];
    const tr = Math.max(...comp.fixtures.map(m => m.round));
    for (let r = 1; r <= tr; r++) runRound(state, cid, rng);
  }

  const fin = createSerieCFinal({ season: 2026, groupA, groupB });
  assert.equal(fin.fixtures.length, 2, "final tem 2 jogos");
  assert.ok(fin.teamAId && fin.teamBId, "tem os dois finalistas");

  // Antes de jogar, campeão é null
  assert.equal(decideSerieCChampion(fin, rng), null, "sem campeão antes de jogar");

  // Força placar: teamA vence agregado (joga R26 fora, R27 casa)
  const r26 = fin.fixtures.find(f => f.round === 26);
  const r27 = fin.fixtures.find(f => f.round === 27);
  r26.played = true; r26.score = { home: 0, away: 2 }; // teamA (visitante) faz 2
  r27.played = true; r27.score = { home: 1, away: 0 }; // teamA (mandante) faz 1
  // teamA agregado = 2 (fora R26) + 1 (casa R27) = 3; teamB = 0 + 0 = 0

  const champ = decideSerieCChampion(fin, rng);
  assert.equal(champ, fin.teamAId, "teamA campeão pelo agregado 3x0");
  assert.equal(fin.aggregate.teamA, 3);
  assert.equal(fin.aggregate.teamB, 0);
});

test("pipeline completo Série C é determinístico por seed", () => {
  const run = () => {
    const { state, rng, p1 } = playedPhase1(2024);
    const { groupA, groupB } = createSerieCGroups({ season: 2026, phase1: p1 });
    state.competitions.brasileirao_c_ga = groupA;
    state.competitions.brasileirao_c_gb = groupB;
    for (const cid of ["brasileirao_c_ga", "brasileirao_c_gb"]) {
      const comp = state.competitions[cid];
      const tr = Math.max(...comp.fixtures.map(m => m.round));
      for (let r = 1; r <= tr; r++) runRound(state, cid, rng);
    }
    return getSerieCPromoted({ groupA, groupB }).join(",");
  };
  assert.equal(run(), run(), "mesma seed → mesmos promovidos");
});
