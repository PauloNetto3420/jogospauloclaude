// Testes da recuperação de lesões.
// Antes deste fix as lesões eram permanentes na temporada (weeksOut nunca
// decrementava), esvaziando elencos e gerando W.O. em série.

import { test } from "node:test";
import assert from "node:assert/strict";

import { recoverInjuries } from "../src/engine/season.js";

function stateWith(players) {
  const map = {};
  for (const p of players) map[p.id] = p;
  return { players: map };
}

function injured(id, weeksOut) {
  return { id, status: { injury: { type: "muscular", weeksOut } } };
}

test("recoverInjuries: desconta 1 semana por rodada", () => {
  const state = stateWith([injured("p1", 3)]);
  recoverInjuries(state);
  assert.equal(state.players.p1.status.injury.weeksOut, 2);
  recoverInjuries(state);
  assert.equal(state.players.p1.status.injury.weeksOut, 1);
});

test("recoverInjuries: cura (injury=null) quando chega a 0", () => {
  const state = stateWith([injured("p1", 1)]);
  const healed = recoverInjuries(state);
  assert.equal(state.players.p1.status.injury, null, "voltou a ficar apto");
  assert.equal(healed, 1, "retorna quantos curaram");
});

test("recoverInjuries: lesão de 1 semana some na rodada seguinte", () => {
  const state = stateWith([injured("p1", 2)]);
  recoverInjuries(state); // 1
  assert.ok(state.players.p1.status.injury, "ainda lesionado");
  recoverInjuries(state); // 0 → cura
  assert.equal(state.players.p1.status.injury, null);
});

test("recoverInjuries: ignora jogadores aptos", () => {
  const state = stateWith([{ id: "p1", status: { injury: null } }, { id: "p2", status: {} }]);
  assert.doesNotThrow(() => recoverInjuries(state));
  assert.equal(recoverInjuries(state), 0, "ninguém para curar");
});

test("recoverInjuries: várias lesões em paralelo decrementam juntas", () => {
  const state = stateWith([injured("p1", 1), injured("p2", 5), injured("p3", 2)]);
  const healed = recoverInjuries(state);
  assert.equal(healed, 1, "só p1 curou");
  assert.equal(state.players.p1.status.injury, null);
  assert.equal(state.players.p2.status.injury.weeksOut, 4);
  assert.equal(state.players.p3.status.injury.weeksOut, 1);
});
