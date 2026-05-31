// Aplicação de resultado de partida no estado.
// Vive aqui (e não em season-flow / match-screen) porque é chamado de
// ambos os lados — separar evita dependência circular entre eles.

import { state, rng } from "./store.js";
import { applyMatchResult, applyMatchEffects } from "../engine/season.js";
import { applyCupLegResult } from "../engine/cup.js";
import { applyEstadualKnockoutResult } from "../engine/estadual.js";

// Aplica o resultado de uma perna de Copa: marca played, persiste placar/
// eventos/escalações, dispara efeitos (lesões/cartões/forma) e atualiza
// o tie (vencedor, agregado, pênaltis).
export function applyCupLegToState(leg, result) {
  leg.played = true;
  leg.score = { ...result.score };
  leg.events = result.events;
  leg.date = state.currentDate;
  leg.lineups = result.lineups;
  leg.stats = result.stats;
  applyMatchEffects(state, result, "copa_brasil");
  const cup = state.competitions.copa_brasil;
  applyCupLegResult(cup, leg, rng, { teamsById: state.teams, playersById: state.players });
}

// Aplica resultado de partida estadual.
// estadualMeta: { uf, kind: "group"|"semi"|"final", compId? }
//   - kind "group" → vai pro standings da subcomp via applyMatchResult
//   - kind "semi"/"final" → trata como mata-mata e avança o knockout
export function applyEstadualMatchResult(match, result, estadualMeta) {
  if (estadualMeta.kind === "group") {
    const comp = state.competitions[estadualMeta.compId];
    if (comp) applyMatchResult(state, match, result, comp); // já seta tudo + standings
  } else {
    match.played = true;
    match.score = { ...result.score };
    match.events = result.events;
    match.date = state.currentDate;
    match.lineups = result.lineups;
    match.stats = result.stats;
    applyMatchEffects(state, result, "estadual");
    const est = state.estaduais[estadualMeta.uf];
    applyEstadualKnockoutResult(est, match, rng);
  }
}
