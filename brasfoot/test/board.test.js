// Testes das Metas da Diretoria: definição por percentil de reputação,
// confiança ao vivo e avaliação de fim de temporada.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  assignBoardObjective, computeConfidence, evaluateObjective, findNationalCompId,
} from "../src/engine/board.js";

// Estado mínimo: uma competição A com N times de reputações distintas,
// standings opcionais e fixtures para marcar "jogou".
function makeAState({ played = false, order = null } = {}) {
  const ids = Array.from({ length: 20 }, (_, i) => "T" + i);
  const teams = {};
  ids.forEach((id, i) => { teams[id] = { id, name: id, reputation: 95 - i * 2 }; }); // T0 melhor
  // standings: usa `order` (lista de teamIds do 1º ao último) se dado
  const ord = order || ids;
  const standings = ord.map((id, i) => ({
    teamId: id, points: (20 - i) * 3, goalsFor: 30 - i, goalsAgainst: 10 + i,
  }));
  const fixtures = played ? [{ round: 1, played: true }] : [{ round: 1, played: false }];
  return {
    season: 2026,
    teams,
    competitions: { brasileirao_a: { id: "brasileirao_a", teams: ids, standings, fixtures } },
    serieCMeta: null,
  };
}

test("findNationalCompId: localiza a divisão do clube", () => {
  const state = makeAState();
  assert.equal(findNationalCompId(state, "T0"), "brasileirao_a");
  assert.equal(findNationalCompId(state, "ZZ"), null);
});

test("assignBoardObjective: clube forte recebe meta de Libertadores", () => {
  const state = makeAState();
  const board = assignBoardObjective(state, "T0"); // melhor reputação
  assert.equal(board.objective.kind, "libertadores");
  assert.equal(board.objective.targetPos, 6);
  assert.equal(board.confidence, 60);
});

test("assignBoardObjective: clube médio recebe meio de tabela; fraco, permanência", () => {
  const state = makeAState();
  const mid = assignBoardObjective(state, "T9").objective;   // ~meio
  assert.equal(mid.kind, "top_half");
  const weak = assignBoardObjective(state, "T19").objective;  // pior reputação
  assert.equal(weak.kind, "survival_a");
  assert.equal(weak.targetPos, 16);
});

test("computeConfidence: alta acima da meta, baixa abaixo", () => {
  // T0 é favorito (meta G6). Se está em 1º, confiança alta.
  const top = makeAState({ played: true, order: ["T0", ...Array.from({ length: 19 }, (_, i) => "T" + (i + 1))] });
  assignBoardObjective(top, "T0");
  assert.ok(computeConfidence(top, "T0") >= 80, "líder → confiança alta");

  // T0 em último (20º) com meta G6 → confiança no chão
  const order = [...Array.from({ length: 19 }, (_, i) => "T" + (i + 1)), "T0"];
  const bottom = makeAState({ played: true, order });
  assignBoardObjective(bottom, "T0");
  assert.ok(computeConfidence(bottom, "T0") <= 20, "afundando → confiança baixa");
});

test("computeConfidence: sem jogos retorna confiança inicial", () => {
  const state = makeAState({ played: false });
  assignBoardObjective(state, "T0");
  assert.equal(computeConfidence(state, "T0"), 60);
});

test("evaluateObjective: cumprida quando posição <= alvo", () => {
  // T0 (meta G6) termina em 3º → cumpriu
  const order = ["T1", "T2", "T0", ...Array.from({ length: 17 }, (_, i) => "T" + (i + 3))];
  const state = makeAState({ played: true, order });
  assignBoardObjective(state, "T0");
  const ev = evaluateObjective(state, "T0", { relegated: [], promoted: [] });
  assert.equal(ev.finalPos, 3);
  assert.equal(ev.met, true);
  assert.equal(ev.failedBadly, false);
});

test("evaluateObjective: título conta como superação", () => {
  const order = ["T0", ...Array.from({ length: 19 }, (_, i) => "T" + (i + 1))];
  const state = makeAState({ played: true, order });
  assignBoardObjective(state, "T0");
  const ev = evaluateObjective(state, "T0", { relegated: [] });
  assert.equal(ev.champion, true);
  assert.equal(ev.exceeded, true);
});

test("evaluateObjective: rebaixamento é fracasso retumbante", () => {
  const order = [...Array.from({ length: 19 }, (_, i) => "T" + (i + 1)), "T0"];
  const state = makeAState({ played: true, order });
  assignBoardObjective(state, "T0");
  const ev = evaluateObjective(state, "T0", { relegated: ["T0"] });
  assert.equal(ev.met, false);
  assert.equal(ev.failedBadly, true);
});

test("evaluateObjective: meta de permanência cumprida fora do Z4", () => {
  // T19 (fraco, meta survival alvo 16) termina em 14º → cumpriu
  const order = [...Array.from({ length: 13 }, (_, i) => "T" + i), "T19", ...["T13","T14","T15","T16","T17","T18"]];
  const state = makeAState({ played: true, order });
  assignBoardObjective(state, "T19");
  const ev = evaluateObjective(state, "T19", { relegated: [] });
  assert.equal(ev.finalPos, 14);
  assert.equal(ev.met, true);
});

test("evaluateObjective: Série C avaliada pelo acesso (serieCMeta)", () => {
  const state = {
    season: 2026,
    teams: { A: { id: "A", reputation: 58 }, B: { id: "B", reputation: 40 } },
    competitions: { brasileirao_c_p1: { id: "brasileirao_c_p1", teams: ["A", "B"], standings: [], fixtures: [] } },
    serieCMeta: { promoted: ["A"], champion: "A" },
  };
  assignBoardObjective(state, "A");
  const ev = evaluateObjective(state, "A", { relegated: [] });
  assert.equal(ev.met, true, "A subiu → meta de acesso cumprida");
  assert.equal(ev.exceeded, true, "campeão da C → superação");
});
