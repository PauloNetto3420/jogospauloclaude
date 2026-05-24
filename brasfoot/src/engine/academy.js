// Sistema de Categoria de Base / Academia.
//
// Cada clube tem `team.academy.prospects = [playerIds]`, capacidade máxima
// de 8 slots. A cada 4 rodadas (PROSPECT_INTERVAL), um novo prospecto aparece
// no clube — desde que haja vaga. Qualidade depende da reputação do clube.
//
// O jogador pode (somente pro time gerenciado):
//   - PROMOVER ao elenco principal
//   - VENDER (50% do valor de mercado)
//   - LIBERAR (sem custo, libera vaga)
//
// IA (outros clubes) é processada no fim da temporada:
//   - Prospectos com 19+ anos e POT >= 70 → promovidos automaticamente
//   - Prospectos com 19+ anos e POT < 70 → liberados
//
// Pro time gerenciado, prospectos que envelhecem até 19+ sem ação ficam até
// o fim da temporada e são auto-liberados com aviso no Inbox.

import { generateProspect } from "../models/player.js";
import { recalcExpenses } from "../models/team.js";

export const MAX_ACADEMY_SLOTS = 8;
export const PROSPECT_INTERVAL = 4; // rodadas entre prospectos

// Garante que o time tem o objeto academy (compatibilidade com saves antigos)
export function ensureAcademy(team) {
  if (!team.academy) team.academy = { prospects: [], lastGeneratedRound: 0 };
  return team.academy;
}

// Gera prospectos para todos os clubes na rodada certa. Chamado em closeWeek.
// Retorna lista de novos prospectos gerados ({ teamId, playerId }).
export function generateProspectsForRound(state, round, rng) {
  if (round % PROSPECT_INTERVAL !== 0) return [];

  const generated = [];
  for (const team of Object.values(state.teams)) {
    const academy = ensureAcademy(team);
    if (academy.prospects.length >= MAX_ACADEMY_SLOTS) continue;

    const prospect = generateProspect(rng, team);
    state.players[prospect.id] = prospect;
    academy.prospects.push(prospect.id);
    academy.lastGeneratedRound = round;
    generated.push({ teamId: team.id, playerId: prospect.id });
  }
  return generated;
}

// Promove o prospecto pro elenco principal.
export function promoteProspect(state, teamId, prospectId) {
  const team = state.teams[teamId];
  if (!team) return reject("Clube inválido.");
  const academy = ensureAcademy(team);
  const idx = academy.prospects.indexOf(prospectId);
  if (idx < 0) return reject("Prospecto não está na base.");

  const player = state.players[prospectId];
  if (!player) return reject("Jogador não encontrado.");

  if (team.squad.length >= 32) {
    return reject("Elenco lotado (máx. 32). Libere um jogador antes.");
  }

  academy.prospects.splice(idx, 1);
  team.squad.push(prospectId);
  recalcExpenses(team, state.players);
  return { ok: true, message: `${player.name} promovido ao elenco principal.` };
}

// Vende o prospecto (50% do valor de mercado).
export function sellProspect(state, teamId, prospectId) {
  const team = state.teams[teamId];
  if (!team) return reject("Clube inválido.");
  const academy = ensureAcademy(team);
  const idx = academy.prospects.indexOf(prospectId);
  if (idx < 0) return reject("Prospecto não está na base.");

  const player = state.players[prospectId];
  if (!player) return reject("Jogador não encontrado.");

  const sellPrice = Math.max(50_000, Math.round(player.marketValue * 0.5));
  team.finances.balance += sellPrice;
  academy.prospects.splice(idx, 1);
  delete state.players[prospectId];

  return {
    ok: true,
    sellPrice,
    message: `${player.name} vendido por R$ ${sellPrice.toLocaleString("pt-BR")}.`,
  };
}

// Libera o prospecto (sem custo, sem retorno).
export function releaseProspect(state, teamId, prospectId) {
  const team = state.teams[teamId];
  if (!team) return reject("Clube inválido.");
  const academy = ensureAcademy(team);
  const idx = academy.prospects.indexOf(prospectId);
  if (idx < 0) return reject("Prospecto não está na base.");

  const player = state.players[prospectId];
  academy.prospects.splice(idx, 1);
  if (player) delete state.players[prospectId];
  return { ok: true, message: `${player?.name ?? "Prospecto"} liberado.` };
}

// No fim da temporada: envelhece prospectos (já feito por evolvePlayer),
// processa quem chegou a 19+. IA auto-decide. User team auto-libera com aviso.
// Retorna { released, promoted } para alimentar o inbox.
export function processSeasonEndAcademy(state, managedTeamId) {
  const released = [];
  const promoted = [];

  for (const team of Object.values(state.teams)) {
    const academy = ensureAcademy(team);
    const newProspects = [];

    for (const pid of academy.prospects) {
      const player = state.players[pid];
      if (!player) continue;

      if (player.age >= 19) {
        if (team.id === managedTeamId) {
          // Time do usuário — auto-libera (não foi promovido a tempo)
          released.push({ teamId: team.id, playerId: pid, name: player.name });
          delete state.players[pid];
        } else {
          // IA — decide pelo potencial
          if (player.potential >= 70 && team.squad.length < 32) {
            team.squad.push(pid);
            promoted.push({ teamId: team.id, playerId: pid });
          } else {
            delete state.players[pid];
          }
        }
      } else {
        newProspects.push(pid);
      }
    }

    academy.prospects = newProspects;
    recalcExpenses(team, state.players);
  }

  return { released, promoted };
}

function reject(message) { return { ok: false, message }; }
