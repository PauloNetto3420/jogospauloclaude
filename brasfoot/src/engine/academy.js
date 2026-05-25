// Sistema de Categoria de Base / Academia.
//
// Cada clube tem `team.academy.prospects = [playerIds]`, capacidade máxima
// de 12 slots. A cada virada de temporada, novos prospectos são gerados
// com quantidade baseada na reputação do clube (clubes grandes geram mais).
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

export const MAX_ACADEMY_SLOTS = 12;

// Garante que o time tem o objeto academy (compatibilidade com saves antigos)
export function ensureAcademy(team) {
  if (!team.academy) team.academy = { prospects: [], lastGeneratedRound: 0 };
  return team.academy;
}

// Quantos prospectos um clube gera por temporada, baseado em reputação.
// Clubes maiores produzem mais base — mais infraestrutura, mais olheiros.
export function prospectCountForReputation(rep, rng) {
  if (rep >= 90) return rng.int(4, 5);
  if (rep >= 80) return rng.int(3, 4);
  if (rep >= 70) return rng.int(2, 3);
  if (rep >= 60) return rng.int(1, 3);
  return rng.int(1, 2);
}

// Gera os prospectos da temporada para todos os clubes (chamado no início de
// cada temporada, seja no startGame ou após endSeason).
// Retorna { perTeam: { [teamId]: [playerId, ...] }, total }.
export function generateSeasonalYouth(state, rng) {
  const perTeam = {};
  let total = 0;

  for (const team of Object.values(state.teams)) {
    const academy = ensureAcademy(team);
    const desired = prospectCountForReputation(team.reputation, rng);
    const available = Math.max(0, MAX_ACADEMY_SLOTS - academy.prospects.length);
    const actually = Math.min(desired, available);

    const newIds = [];
    for (let i = 0; i < actually; i++) {
      const prospect = generateProspect(rng, team);
      state.players[prospect.id] = prospect;
      academy.prospects.push(prospect.id);
      newIds.push(prospect.id);
    }
    if (newIds.length) {
      perTeam[team.id] = { generated: newIds, missed: desired - actually };
      total += newIds.length;
    } else if (desired > 0) {
      perTeam[team.id] = { generated: [], missed: desired };
    }
  }

  return { perTeam, total };
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
