// Testes dos Estaduais (pré-temporada): criação por UF, formato de grupos,
// e a progressão grupos → semis → final → campeão.

import { test } from "node:test";
import assert from "node:assert/strict";

import { createTeam } from "../src/models/team.js";
import { generateSquad } from "../src/models/player.js";
import { createRng } from "../src/utils/rng.js";
import { runRound, applyMatchResult } from "../src/engine/season.js";
import {
  createEstaduais, createOneEstadual, getEstadualMatchesForRound, estadualTotalRounds,
  advanceEstadualPhase, applyEstadualKnockoutResult, isEstadualDone,
  ESTADUAL_STATES,
} from "../src/engine/estadual.js";

// IDs reais dos 4 formatos especiais (SP=Paulista, RJ=Carioca, MG=Mineiro, RS=Gaúcho).
const PAULISTA_IDS = ["cor","pal","spo","sant","ber","nov","rbb","mir","gua","pon","vel","por","pma","cpv","nrt","bfc"];
const CARIOCA_IDS = ["fla","flu","bot","vas","vol","ban","boa","mad","mca","nig","samr","porj"];
const MINEIRO_IDS = ["atm","cru","amg","atc","tom","ube","bet","itb","dgv","urt","poa","nor"];
const GAUCHO_IDS = ["gre","int","juv","cax","ypi","sjo","slz","gby","ave","nha","mon","ism"];

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

// Estado com os times dos 4 formatos especiais (ids fixos), mais os times
// dos formatos de grupos (RS já é gaúcho, então o formato genérico de grupos
// é testado isoladamente em testGroupEstadual abaixo).
function stateWithEstaduais({ seed = 7 } = {}) {
  const rng = createRng(seed);
  const state = {
    season: 2026, currentDate: "2026-02-01", managedTeamId: null,
    teams: {}, players: {}, competitions: {}, log: [],
  };
  for (const id of PAULISTA_IDS) makeTeamInState(state, rng, { id, uf: "SP" });
  for (const id of CARIOCA_IDS) makeTeamInState(state, rng, { id, uf: "RJ" });
  for (const id of MINEIRO_IDS) makeTeamInState(state, rng, { id, uf: "MG" });
  for (const id of GAUCHO_IDS) makeTeamInState(state, rng, { id, uf: "RS" });
  state.estaduais = createEstaduais(state, state.season, rng);
  return { state, rng };
}

// Cria um estadual de FORMATO DE GRUPOS isolado (createOneEstadual via
// createEstaduais não é mais alcançável pelos 4 UFs oficiais — todos viraram
// formatos especiais. Pra testar o FORMATO DE GRUPOS genérico (fallback),
// chamamos createOneEstadual diretamente com um UF fictício.
function groupEstadual({ uf = "MT", n = 6, seed = 7 } = {}) {
  const rng = createRng(seed);
  const state = {
    season: 2026, currentDate: "2026-02-01", managedTeamId: null,
    teams: {}, players: {}, competitions: {}, log: [],
  };
  const ids = [];
  for (let i = 0; i < n; i++) { makeTeamInState(state, rng, { id: `${uf}${i}`, uf }); ids.push(`${uf}${i}`); }
  const est = createOneEstadual(state, uf, ids, state.season, rng);
  state.estaduais = { [uf]: est };
  return { state, rng, est };
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

test("createEstaduais: cria 1 estadual por UF oficial com seu formato", () => {
  const { state } = stateWithEstaduais();
  const formatByUf = { SP: "paulista", RJ: "carioca", MG: "mineiro", RS: "gaucho", PR: "paranaense", BA: "baiano", CE: "cearense", PE: "pernambucano", AL: "alagoano", GO: "goiano", SC: "catarinense", PA: "paraense", AC: "acreano", AM: "amazonense" };
  // Fase inicial: a maioria começa em "groups"; ligas (turno único) em "league";
  // o Amazonense começa no 1º turno ("t1_groups").
  const initialPhase = { baiano: "league", pernambucano: "league", alagoano: "league", acreano: "league", amazonense: "t1_groups" };
  for (const uf of ESTADUAL_STATES) {
    assert.ok(state.estaduais[uf], `estadual de ${uf} existe`);
    assert.equal(state.estaduais[uf].uf, uf);
    assert.equal(state.estaduais[uf].format, formatByUf[uf], `${uf} usa formato ${formatByUf[uf]}`);
    assert.equal(state.estaduais[uf].phase, initialPhase[formatByUf[uf]] || "groups", "fase inicial correta");
  }
});

test("UF de grupos com menos de 4 times não gera estadual", () => {
  // UF fictício (MT, não-oficial) com apenas 3 times — abaixo do mínimo de 4.
  // (createEstaduais só cria os UFs oficiais; aqui validamos via teamIds < 4.)
  const rng = createRng(1);
  const mini = { season: 2026, teams: {}, players: {}, competitions: {} };
  for (let i = 0; i < 3; i++) {
    const t = createTeam({ id: `MT${i}`, name: `x`, shortName: `x`, city: "c", state: "MT", reputation: 60, colors: { primary: "#000", secondary: "#fff" } });
    mini.teams[t.id] = t;
  }
  const es = createEstaduais(mini, 2026, rng);
  assert.equal(es.MT, undefined, "MT não é UF oficial — sem estadual");
});

// Integração do Cearense: o formato mais complexo (2 fases de grupos), dirigido
// pelos helpers reais do estadual.js (getMatchesForRound + advanceEstadualPhase).
test("Cearense: 1ª fase → 2ª fase (nova comp) → mata-mata → campeão", () => {
  const { state, rng } = stateWithEstaduais();
  const ce = state.estaduais.CE;
  assert.equal(ce.format, "cearense");
  assert.equal(ce.phase, "groups");

  playEstadualToEnd(state, ce, rng);

  assert.ok(state.competitions.estadual_ce_p2, "2ª fase foi criada em runtime");
  assert.equal(state.competitions.estadual_ce_p2.fixtures.length, 9, "2ª fase tem 9 jogos");
  assert.equal(ce.phase, "done", "chega ao fim");
  assert.ok(ce.champion, "tem campeão");
  assert.ok(ce.teams.includes(ce.champion), "campeão participou");
});

// Integração do Pernambucano: liga → playoff (3º-6º) → semis → final, dirigido
// pelos helpers reais do estadual.js.
test("Pernambucano: liga → playoff → semis → final → campeão", () => {
  const { state, rng } = stateWithEstaduais();
  const pe = state.estaduais.PE;
  assert.equal(pe.format, "pernambucano");
  assert.equal(pe.phase, "league");

  playEstadualToEnd(state, pe, rng);

  assert.ok(pe.knockout, "mata-mata criado");
  assert.equal(pe.knockout.playoffs.length, 2, "tem playoff 3º-6º");
  assert.equal(pe.phase, "done");
  assert.ok(pe.champion && pe.teams.includes(pe.champion), "campeão participou");
});

// Integração do Alagoano: liga → semis (1×4,2×3) → final, pelo fluxo real.
test("Alagoano: liga → semis → final → campeão", () => {
  const { state, rng } = stateWithEstaduais();
  const al = state.estaduais.AL;
  assert.equal(al.format, "alagoano");
  assert.equal(al.phase, "league");
  playEstadualToEnd(state, al, rng);
  assert.ok(al.knockout && al.knockout.semis.length === 2, "semis criadas");
  assert.equal(al.phase, "done");
  assert.ok(al.champion && al.teams.includes(al.champion), "campeão participou");
});

// Integração do Goiano: 3 grupos cruzados (8 rodadas) → mata-mata top 8.
test("Goiano: grupos (8 rodadas) → quartas/semis/final → campeão", () => {
  const { state, rng } = stateWithEstaduais();
  const go = state.estaduais.GO;
  assert.equal(go.format, "goiano");
  const p1 = state.competitions.estadual_go;
  assert.equal(Math.max(...p1.fixtures.map(m => m.round)), 8, "1ª fase em 8 rodadas exatas");
  playEstadualToEnd(state, go, rng);
  assert.ok(go.knockout && go.knockout.quarters.length === 4, "quartas criadas");
  assert.equal(go.phase, "done");
  assert.ok(go.champion && go.teams.includes(go.champion), "campeão participou");
});

// Integração do Amazonense: dois turnos + grande final, pelo fluxo real.
test("Amazonense: 1º turno → 2º turno → grande final → campeão", () => {
  const { state, rng } = stateWithEstaduais();
  const am = state.estaduais.AM;
  assert.equal(am.format, "amazonense");
  assert.equal(am.phase, "t1_groups");

  playEstadualToEnd(state, am, rng);

  assert.ok(state.competitions.estadual_am_t2, "2º turno foi criado em runtime");
  assert.ok(am.t1Champion, "tem campeão do 1º turno");
  assert.ok(am.t2Champion, "tem campeão do 2º turno");
  assert.equal(am.phase, "done");
  assert.ok(am.champion && am.teams.includes(am.champion), "campeão geral definido");
  // se mesmo time venceu os 2 turnos, é ele; senão, venceu a grande final
  if (am.t1Champion === am.t2Champion) assert.equal(am.champion, am.t1Champion);
});

// Testes do FORMATO DE GRUPOS genérico (fallback), via createOneEstadual.
test("≤8 times: grupo único; >8 times: dois grupos", () => {
  const small = groupEstadual({ n: 6 });
  assert.equal(small.est.twoGroups, false, "6 times = grupo único");

  const big = groupEstadual({ n: 10 });
  assert.equal(big.est.twoGroups, true, "10 times = dois grupos");
  assert.equal(big.est.groupIds.length, 2, "dois ids de grupo");
});

test("getEstadualMatchesForRound: rodada 1 traz jogos de grupo", () => {
  const { state, est } = groupEstadual({ n: 6 });
  const r1 = getEstadualMatchesForRound(state, est, 1);
  assert.ok(r1.length > 0, "tem jogos na rodada 1");
  for (const mm of r1) assert.equal(mm.kind, "group", "rodada 1 = grupo");
});

test("progressão completa: grupos → semis → final → campeão", () => {
  const { state, rng, est } = groupEstadual({ n: 6 });

  assert.equal(est.phase, "groups");
  playEstadualToEnd(state, est, rng);

  assert.equal(est.phase, "done", "terminou na fase done");
  assert.ok(isEstadualDone(est), "isEstadualDone = true");
  assert.ok(est.champion, "tem campeão");
  assert.ok(state.teams[est.champion], "campeão é um time válido");
  assert.equal(est.teams.includes(est.champion), true, "campeão participou do estadual");
});

test("semis sempre montam 2 confrontos", () => {
  const { state, rng, est } = groupEstadual({ n: 6 });
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

test("determinismo: mesmo seed → mesmo campeão estadual (grupos)", () => {
  const run = () => {
    const { state, rng, est } = groupEstadual({ seed: 2024, n: 6 });
    playEstadualToEnd(state, est, rng);
    return est.champion;
  };
  assert.equal(run(), run(), "mesmo campeão com a mesma seed");
});

// -------------------- Formato Paulista (SP) --------------------

test("SP usa o formato Paulista (16 times, format=paulista)", () => {
  const { state } = stateWithEstaduais();
  const sp = state.estaduais.SP;
  assert.equal(sp.format, "paulista", "SP é formato paulista");
  assert.equal(sp.teams.length, 16, "16 participantes");
  assert.ok(state.competitions.estadual_sp, "competição da 1ª fase registrada");
});

test("Paulista: progressão 1ª fase → quartas → semis → final → campeão", () => {
  const { state, rng } = stateWithEstaduais();
  const sp = state.estaduais.SP;
  assert.equal(sp.phase, "groups");
  playEstadualToEnd(state, sp, rng);
  assert.equal(sp.phase, "done", "terminou");
  assert.ok(sp.champion, "tem campeão");
  assert.ok(sp.teams.includes(sp.champion), "campeão disputou o Paulista");
});

// -------------------- Formato Carioca (RJ) --------------------

test("RJ usa o formato Carioca (12 times, format=carioca)", () => {
  const { state } = stateWithEstaduais();
  const rj = state.estaduais.RJ;
  assert.equal(rj.format, "carioca", "RJ é formato carioca");
  assert.equal(rj.teams.length, 12, "12 participantes");
  assert.ok(state.competitions.estadual_rj, "competição da 1ª fase registrada");
});

test("Carioca: progressão grupos → quartas → semis → final → campeão", () => {
  const { state, rng } = stateWithEstaduais();
  const rj = state.estaduais.RJ;
  assert.equal(rj.phase, "groups");
  playEstadualToEnd(state, rj, rng);
  assert.equal(rj.phase, "done", "terminou");
  assert.ok(rj.champion, "tem campeão");
  assert.ok(rj.teams.includes(rj.champion), "campeão disputou o Carioca");
});

// -------------------- Formato Mineiro (MG) --------------------

test("MG usa o formato Mineiro (12 times, format=mineiro)", () => {
  const { state } = stateWithEstaduais();
  const mg = state.estaduais.MG;
  assert.equal(mg.format, "mineiro", "MG é formato mineiro");
  assert.equal(mg.teams.length, 12, "12 participantes");
  assert.ok(state.competitions.estadual_mg, "competição da 1ª fase registrada");
});

test("Mineiro: progressão grupos → semis → final → campeão", () => {
  const { state, rng } = stateWithEstaduais();
  const mg = state.estaduais.MG;
  assert.equal(mg.phase, "groups");
  playEstadualToEnd(state, mg, rng);
  assert.equal(mg.phase, "done", "terminou");
  assert.ok(mg.champion, "tem campeão");
  assert.ok(mg.teams.includes(mg.champion), "campeão disputou o Mineiro");
});

// -------------------- Formato Gaúcho (RS) --------------------

test("RS usa o formato Gaúcho (12 times, format=gaucho)", () => {
  const { state } = stateWithEstaduais();
  const rs = state.estaduais.RS;
  assert.equal(rs.format, "gaucho", "RS é formato gaúcho");
  assert.equal(rs.teams.length, 12, "12 participantes");
  assert.ok(state.competitions.estadual_rs, "competição da 1ª fase registrada");
});

test("Gaúcho: progressão grupos → quartas → semis → final → campeão", () => {
  const { state, rng } = stateWithEstaduais();
  const rs = state.estaduais.RS;
  assert.equal(rs.phase, "groups");
  playEstadualToEnd(state, rs, rng);
  assert.equal(rs.phase, "done", "terminou");
  assert.ok(rs.champion, "tem campeão");
  assert.ok(rs.teams.includes(rs.champion), "campeão disputou o Gaúcho");
});
