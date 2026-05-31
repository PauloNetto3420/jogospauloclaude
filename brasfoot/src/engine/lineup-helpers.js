// Helpers de escalação compartilhados entre views e o game-loop.
// Tudo aqui é puro: lê do `state` e devolve IDs / objetos, sem mexer no DOM.

import { state, ui } from "../core/store.js";
import { FORMATIONS } from "./match.js";
import { getEstadualMatchesForRound, estadualTotalRounds } from "./estadual.js";

// Agrupa posições do CBF nos 4 grupos clássicos para validar formação
export const POS_GROUP = {
  GOL: "GOL", ZAG: "DEF", LD: "DEF", LE: "DEF",
  VOL: "MID", MEI: "MID", PE: "ATA", PD: "ATA", ATA: "ATA",
};

// XI provável de um time qualquer — usado no scout do próximo adversário
export function scoutBestXI(team) {
  if (!team) return [];
  const formation = FORMATIONS[team.tactics?.formation] || FORMATIONS["4-3-3"];
  const available = team.squad
    .map(pid => state.players[pid])
    .filter(p => p && !p.status.injury && p.status.suspendedMatches === 0);
  const groups = { GOL: [], DEF: [], MID: [], ATA: [] };
  for (const p of available) {
    const g = POS_GROUP[p.position];
    if (g) groups[g].push(p);
  }
  for (const k of Object.keys(groups)) groups[k].sort((a, b) => b.overall - a.overall);
  const xi = [
    ...groups.GOL.slice(0, formation.slots.GOL),
    ...groups.DEF.slice(0, formation.slots.DEF),
    ...groups.MID.slice(0, formation.slots.MID),
    ...groups.ATA.slice(0, formation.slots.ATA),
  ];
  return xi.sort((a, b) => b.overall - a.overall);
}

// Auto-escala: respeita a formação atual e completa com sobras se faltar
export function autoLineup(team) {
  const available = team.squad
    .map(pid => state.players[pid])
    .filter(p => p && !p.status.injury && p.status.suspendedMatches === 0);
  const groups = { GOL: [], DEF: [], MID: [], ATA: [] };
  for (const p of available) {
    const g = POS_GROUP[p.position];
    if (g) groups[g].push(p);
  }
  for (const k of Object.keys(groups)) groups[k].sort((a, b) => b.overall - a.overall);

  const formation = FORMATIONS[team.tactics?.formation] || FORMATIONS["4-3-3"];
  const xi = [
    ...groups.GOL.slice(0, formation.slots.GOL),
    ...groups.DEF.slice(0, formation.slots.DEF),
    ...groups.MID.slice(0, formation.slots.MID),
    ...groups.ATA.slice(0, formation.slots.ATA),
  ];
  // Completa com sobras se o elenco não tem o suficiente em alguma posição
  if (xi.length < 11) {
    const used = new Set(xi.map(p => p.id));
    const rest = available.filter(p => !used.has(p.id)).sort((a, b) => b.overall - a.overall);
    while (xi.length < 11 && rest.length) xi.push(rest.shift());
  }
  return xi.map(p => p.id);
}

// Remove lesionados/suspensos do lineup e auto-completa se ficou incompleto
export function validateLineup() {
  const team = state.teams[ui.myTeamId];
  team.lineup = team.lineup.filter(pid => {
    const p = state.players[pid];
    return p && !p.status.injury && p.status.suspendedMatches === 0;
  });
  if (team.lineup.length < 11) team.lineup = autoLineup(team);
}

// Conta titulares por grupo posicional (GOL/DEF/MID/ATA) — usado pela view
export function groupCount(players) {
  const out = { GOL: 0, DEF: 0, MID: 0, ATA: 0 };
  for (const p of players) {
    if (!p) continue;
    const g = POS_GROUP[p.position];
    if (g) out[g]++;
  }
  return out;
}

// Próxima partida do usuário (pré-temporada → estadual; senão → comp principal)
export function findNextMatch() {
  if (state.seasonPhase === "estadual") {
    const userEst = getUserEstadual();
    if (!userEst) return null;
    for (let r = (state.estadualRound || 1); r <= estadualTotalRounds(userEst); r++) {
      const mm = getEstadualMatchesForRound(state, userEst, r)
        .find(m => !m.match.played && (m.match.homeTeamId === ui.myTeamId || m.match.awayTeamId === ui.myTeamId));
      if (mm) return mm.match;
    }
    return null;
  }
  const comp = state.competitions[ui.myCompId];
  if (!comp) return null;
  return comp.fixtures.find(m =>
    !m.played && (m.homeTeamId === ui.myTeamId || m.awayTeamId === ui.myTeamId)
  );
}

// Estadual do usuário (helper interno, espelha o do main)
function getUserEstadual() {
  const userTeam = state.teams[ui.myTeamId];
  return state.estaduais?.[userTeam?.state];
}
