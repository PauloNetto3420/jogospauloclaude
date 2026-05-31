// Estado central da aplicação.
//
// `state` e `rng` usam LIVE BINDINGS de ES modules: outros módulos importam
// `import { state } from "../core/store.js"` e enxergam sempre o valor atual.
// A reatribuição só pode acontecer aqui, via setState/setRng — por isso o
// main.js chama esses setters em vez de `state = ...`.
//
// `ui` é um objeto mutável com o estado de interface (view ativa, time
// gerenciado, filtros de telas). Acessado como ui.myTeamId, ui.view, etc.

export let state = null;
export let rng = null;

export function setState(s) { state = s; }
export function setRng(r) { rng = r; }

export const ui = {
  myTeamId: null,
  myCompId: null,
  view: "lineup",
  standingsView: null,
  calendarMode: "mine",
  calendarCompId: null,
};
