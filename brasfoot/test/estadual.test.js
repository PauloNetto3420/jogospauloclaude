// Testes dos Estaduais (pré-temporada): criação por UF, formato de grupos,
// e a progressão grupos → semis → final → campeão.

import { test } from "node:test";
import assert from "node:assert/strict";

import { createTeam } from "../src/models/team.js";
import { generateSquad } from "../src/models/player.js";
import { createRng } from "../src/utils/rng.js";
import { runRound, applyMatchResult } from "../src/engine/season.js";
import {
  createEstaduais, getEstadualMatchesForRound, estadualTotalRounds,
  advanceEstadualPhase, applyEstadualKnockoutResult, isEstadualDone,
  ESTADUAL_STATES,
} from "../src/engine/estadual.js";

// Monta um estado com N times por UF dos 4 estados oficiais (SP/RJ/MG/RS).
// IDs reais usados pelos formatos especiais (SP=Paulista, RJ=Carioca, MG=Mineiro).
const PAULISTA_IDS = ["cor","pal","spo","sant","ber","nov","rbb","mir","gua","pon","vel","por","pma","cpv","nrt","bfc"];
const CARIOCA_IDS = ["fla","flu","bot","vas","vol","ban","boa","mad","mca","nig","samr","porj"];
const MINEIRO_IDS = ["atm","cru","amg","atc","tom","ube","bet","itb","dgv","urt","poa","nor"];

function makeTeamInState(state, rng, { id, uf }) {
  const team = createTeam({
    id, name: id, shortName: id, city: "Cidade", state: uf,
    reputation: 50, colors: { primary: "#111111", secondary: "#eeeeee" },
  });
  for (const p of generateSquad(rng, team)) {
    state.players[p.id] = p;
    team.squad.push(p.id);
  }
  state.teams[team.id] = team;
}

function stateWithEstaduais({ seed = 7, perUf = 6 } = {}) {
  const rng = createRng(seed);
  const state = {
    season: 2026, currentDate: "2026-02-01", managedTeamId: null,
    teams: {}, players: {}, competitions: {}, log: [],
  };
  // SP (Paulista, 16), RJ (Carioca, 12) e MG (Mineiro, 12) usam ids fixos.
  for (const id of PAULISTA_IDS) makeTeamInState(state, rng, { id, uf: "SP" });
  for (const id of CARIOCA_IDS) makeTeamInState(state, rng, { id, uf: "RJ" });
  for (const id of MINEIRO_IDS) makeTeamInState(state, rng, { id, uf: "MG" });
  // RS usa o formato de grupos — times fake.
  for (const uf of ESTADUAL_STATES) {
    if (uf === "SP" || uf === "RJ" || uf === "MG") continue;
    for (let i = 0; i < perUf; i++) makeTeamInState(state, rng, { id: `${uf}${i}`, uf });
  }
  state.estaduais = createEstaduais(state, state.season, rng);
  return { state, rng };
}

// Joga todas as rodadas de grupo + mata-mata de UM estadual até sair campeão.
function playEstadualToEnd(state, estadual, rng) {
  const total = estadualTotalRounds(estadual);
  for (let round = 1; round <= total; round++) {
    const matches = getEstadualMatchesForRound(state, estadual, round);
    for (const mm of matches) {
      const m = mm.match;
      if (m.played) continue;
      m.played = true;
      m.score = { home: rng.int(0, 3), away: rng.int(0, 2) };
      m.events = [];
      if (mm.kind === "group") {
        applyMatchResult(state, m, { ...m, homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId, score: m.score, events: [], stats: { home: {}, away: {} }, lineups: { home: [], away: [] } }, state.competitions[mm.compId]);
      } else {
        applyEstadualKnockoutResult(estadual, m, rng);
      }
    }
    advanceEstadualPhase(state, estadual, state.season, rng);
  }
}

test("createEstaduais: cria 1 estadual por UF oficial (com times suficientes)", () => {
  const { state } = stateWithEstaduais({ perUf: 6 });
  for (const uf of ESTADUAL_STATES) {
    assert.ok(state.estaduais[uf], `estadual de ${uf} existe`);
    assert.equal(state.estaduais[uf].uf, uf);
    assert.equal(state.estaduais[uf].phase, "groups", "começa na fase de grupos");
  }
});

test("UF de grupos com menos de 4 times não gera estadual", () => {
  // RS com apenas 3 times — abaixo do mínimo de 4 do formato de grupos.
  // (SP usa Paulista e RJ usa Carioca, ambos com ids fixos, sempre criados.)
  const rng = createRng(1);
  const mini = { season: 2026, teams: {}, players: {}, competitions: {} };
  for (let i = 0; i < 3; i++) {
    const t = createTeam({ id: `RS${i}`, name: `x`, shortName: `x`, city: "c", state: "RS", reputation: 60, colors: { primary: "#000", secondary: "#fff" } });
    mini.teams[t.id] = t;
  }
  const es = createEstaduais(mini, 2026, rng);
  assert.equal(es.RS, undefined, "RS com 3 times não vira estadual");
});

// Os testes de FORMATO DE GRUPOS usam MG (SP virou formato Paulista).
test("≤8 times: grupo único; >8 times: dois grupos", () => {
  const small = stateWithEstaduais({ perUf: 6 });   // 6 → grupo único
  assert.equal(small.state.estaduais.RS.twoGroups, false, "6 times = grupo único");

  const big = stateWithEstaduais({ perUf: 10 });     // 10 → dois grupos
  assert.equal(big.state.estaduais.RS.twoGroups, true, "10 times = dois grupos");
  assert.equal(big.state.estaduais.RS.groupIds.length, 2, "dois ids de grupo");
});

test("getEstadualMatchesForRound: rodada 1 traz jogos de grupo", () => {
  const { state } = stateWithEstaduais({ perUf: 6 });
  const est = state.estaduais.RS;
  const r1 = getEstadualMatchesForRound(state, est, 1);
  assert.ok(r1.length > 0, "tem jogos na rodada 1");
  for (const mm of r1) assert.equal(mm.kind, "group", "rodada 1 = grupo");
});

test("progressão completa: grupos → semis → final → campeão", () => {
  const { state, rng } = stateWithEstaduais({ perUf: 6 });
  const est = state.estaduais.RS;

  assert.equal(est.phase, "groups");
  playEstadualToEnd(state, est, rng);

  assert.equal(est.phase, "done", "terminou na fase done");
  assert.ok(isEstadualDone(est), "isEstadualDone = true");
  assert.ok(est.champion, "tem campeão");
  assert.ok(state.teams[est.champion], "campeão é um time válido");
  assert.equal(est.teams.includes(est.champion), true, "campeão participou do estadual");
});

test("semis sempre montam 2 confrontos", () => {
  const { state, rng } = stateWithEstaduais({ perUf: 6 });
  const est = state.estaduais.RS;
  // Joga só até o fim dos grupos
  const groupRounds = est.schedule.groupRounds;
  for (let round = 1; round <= groupRounds; round++) {
    for (const mm of getEstadualMatchesForRound(state, est, round)) {
      const m = mm.match;
      m.played = true; m.score = { home: rng.int(0, 3), away: rng.int(0, 2) }; m.events = [];
      applyMatchResult(state, m, { homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId, score: m.score, events: [], stats: { home: {}, away: {} }, lineups: { home: [], away: [] } }, state.competitions[mm.compId]);
    }
    advanceEstadualPhase(state, est, state.season, rng);
  }
  assert.equal(est.phase, "semis", "entrou na fase de semis");
  assert.equal(est.knockout.semis.length, 2, "2 semifinais");
});

test("determinismo: mesmo seed → mesmo campeão estadual (RS)", () => {
  const run = () => {
    const { state, rng } = stateWithEstaduais({ seed: 2024, perUf: 6 });
    const est = state.estaduais.RS;
    playEstadualToEnd(state, est, rng);
    return est.champion;
  };
  assert.equal(run(), run(), "mesmo campeão com a mesma seed");
});

// -------------------- Formato Paulista (SP) --------------------

test("SP usa o formato Paulista (16 times, format=paulista)", () => {
  const { state } = stateWithEstaduais({ perUf: 6 });
  const sp = state.estaduais.SP;
  assert.equal(sp.format, "paulista", "SP é formato paulista");
  assert.equal(sp.teams.length, 16, "16 participantes");
  assert.ok(state.competitions.estadual_sp, "competição da 1ª fase registrada");
});

test("Paulista: progressão 1ª fase → quartas → semis → final → campeão", () => {
  const { state, rng } = stateWithEstaduais({ perUf: 6 });
  const sp = state.estaduais.SP;
  assert.equal(sp.phase, "groups");
  playEstadualToEnd(state, sp, rng);
  assert.equal(sp.phase, "done", "terminou");
  assert.ok(sp.champion, "tem campeão");
  assert.ok(sp.teams.includes(sp.champion), "campeão disputou o Paulista");
});

// -------------------- Formato Carioca (RJ) --------------------

test("RJ usa o formato Carioca (12 times, format=carioca)", () => {
  const { state } = stateWithEstaduais({ perUf: 6 });
  const rj = state.estaduais.RJ;
  assert.equal(rj.format, "carioca", "RJ é formato carioca");
  assert.equal(rj.teams.length, 12, "12 participantes");
  assert.ok(state.competitions.estadual_rj, "competição da 1ª fase registrada");
});

test("Carioca: progressão grupos → quartas → semis → final → campeão", () => {
  const { state, rng } = stateWithEstaduais({ perUf: 6 });
  const rj = state.estaduais.RJ;
  assert.equal(rj.phase, "groups");
  playEstadualToEnd(state, rj, rng);
  assert.equal(rj.phase, "done", "terminou");
  assert.ok(rj.champion, "tem campeão");
  assert.ok(rj.teams.includes(rj.champion), "campeão disputou o Carioca");
});

// -------------------- Formato Mineiro (MG) --------------------

test("MG usa o formato Mineiro (12 times, format=mineiro)", () => {
  const { state } = stateWithEstaduais({ perUf: 6 });
  const mg = state.estaduais.MG;
  assert.equal(mg.format, "mineiro", "MG é formato mineiro");
  assert.equal(mg.teams.length, 12, "12 participantes");
  assert.ok(state.competitions.estadual_mg, "competição da 1ª fase registrada");
});

test("Mineiro: progressão grupos → semis → final → campeão", () => {
  const { state, rng } = stateWithEstaduais({ perUf: 6 });
  const mg = state.estaduais.MG;
  assert.equal(mg.phase, "groups");
  playEstadualToEnd(state, mg, rng);
  assert.equal(mg.phase, "done", "terminou");
  assert.ok(mg.champion, "tem campeão");
  assert.ok(mg.teams.includes(mg.champion), "campeão disputou o Mineiro");
});
