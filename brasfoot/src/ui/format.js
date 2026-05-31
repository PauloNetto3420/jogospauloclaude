// Helpers de formatação e UI reaproveitados por todas as telas.

import { state } from "../core/store.js";
import { TEAM_LOGOS } from "../../data/team-logos.js";

// Classe CSS do badge de overall
export function ovrClass(ovr) {
  return ovr >= 80 ? "" : ovr >= 70 ? "mid" : "low";
}

// Número formatado em pt-BR (arredondado)
export function fmt(n) {
  return Math.round(n).toLocaleString("pt-BR");
}

// Converte multiplicador (1.10) em rótulo de variação (+10%)
export function pct(mult) {
  const diff = Math.round((mult - 1) * 100);
  return diff === 0 ? "0%" : (diff > 0 ? "+" : "") + diff + "%";
}

// Renderiza o escudo do time. Aceita seed (objeto com colors) ou usa state.teams.
// Sem logo cadastrado → bolinha com a cor primária. Falha de carregamento (onerror)
// também cai para a bolinha.
export function teamLogo(teamId, size = 24, teamObj = null) {
  const path = TEAM_LOGOS[teamId];
  const team = teamObj || state?.teams?.[teamId];
  const color = team?.colors?.primary ?? "#888";
  if (path) {
    return `<img src="${path}" alt="${team?.shortName ?? teamId}"
              style="width:${size}px;height:${size}px;object-fit:contain;vertical-align:middle;display:inline-block"
              onerror="this.outerHTML='<span style=\\'display:inline-block;width:${size}px;height:${size}px;border-radius:50%;background:${color};vertical-align:middle\\'></span>'" />`;
  }
  return `<span style="display:inline-block;width:${size}px;height:${size}px;border-radius:50%;background:${color};vertical-align:middle"></span>`;
}
