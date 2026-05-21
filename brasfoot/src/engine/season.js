// Lógica de campeonato: rodar rodada, atualizar tabela, aplicar efeitos colaterais.
//
// API pública:
//   getCurrentRound(competition)    -> número da próxima rodada não jogada (ou null)
//   runRound(state, competitionId, rng) -> { round, results: MatchResult[] }
//   updateStandings(competition, result) -> muta competition.standings
//   sortStandings(competition)      -> retorna array ordenado (pontos → SG → GP)
//   applyMatchEffects(state, result)-> aplica cartões/lesões/forma ao GameState
//
// season.js orquestra; match.js calcula. Separação intencional para testabilidade.

import { simulateMatch } from "./match.js";

// -------------------- Geração de tabela --------------------
// (já existe em models/competition.js usando o "circle method".
//  Reexportado aqui só para deixar a API do módulo de temporada completa.)
export { } from "../models/competition.js";

// -------------------- Rodadas --------------------
export function getCurrentRound(competition) {
  const pending = competition.fixtures.find(m => !m.played);
  return pending ? pending.round : null;
}

export function getMatchesOfRound(competition, round) {
  return competition.fixtures.filter(m => m.round === round);
}

// Aplica o resultado de UMA partida ao estado: persiste no fixture,
// atualiza tabela e aplica efeitos (cartões, lesões, gols nas stats).
// Usado tanto por runRound quanto pelo flow do usuário (playback animado).
export function applyMatchResult(state, match, result, competition) {
  match.played = true;
  match.score = { ...result.score };
  match.events = result.events;
  match.date = state.currentDate;
  updateStandings(competition, result);
  applyMatchEffects(state, result, competition.id);
}

// Simula todos os jogos da próxima rodada pendente, em "paralelo" lógico
// (jogador e IA na mesma rodada, como pediu o requisito).
export function runRound(state, competitionId, rng) {
  const competition = state.competitions[competitionId];
  const round = getCurrentRound(competition);
  if (round == null) return { round: null, results: [] };

  const matches = getMatchesOfRound(competition, round);
  const results = [];

  for (const match of matches) {
    const result = simulateMatch({
      homeTeam: state.teams[match.homeTeamId],
      awayTeam: state.teams[match.awayTeamId],
      playersById: state.players,
      rng,
    });
    applyMatchResult(state, match, result, competition);
    results.push(result);
  }

  recalcTopScorers(competition, state.players);
  return { round, results };
}

// -------------------- Classificação --------------------
export function updateStandings(competition, result) {
  const { homeTeamId, awayTeamId, score } = result;
  const home = competition.standings.find(s => s.teamId === homeTeamId);
  const away = competition.standings.find(s => s.teamId === awayTeamId);
  const { pointsWin, pointsDraw } = competition.rules;

  home.played++; away.played++;
  home.goalsFor += score.home; home.goalsAgainst += score.away;
  away.goalsFor += score.away; away.goalsAgainst += score.home;

  if (score.home > score.away) {
    home.wins++;   home.points += pointsWin;
    away.losses++;
  } else if (score.home < score.away) {
    away.wins++;   away.points += pointsWin;
    home.losses++;
  } else {
    home.draws++;  home.points += pointsDraw;
    away.draws++;  away.points += pointsDraw;
  }
}

// Devolve cópia ordenada (pontos → SG → GP → nome). Não muta.
export function sortStandings(competition, teams) {
  return [...competition.standings].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    const sgA = a.goalsFor - a.goalsAgainst;
    const sgB = b.goalsFor - b.goalsAgainst;
    if (sgB !== sgA) return sgB - sgA;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    if (teams) return teams[a.teamId].name.localeCompare(teams[b.teamId].name);
    return 0;
  });
}

// -------------------- Efeitos colaterais no estado --------------------
export function applyMatchEffects(state, result, competitionId) {
  for (const ev of result.events) {
    const player = state.players[ev.playerId];
    if (!player) continue;

    if (ev.type === "yellow") {
      const cards = player.status.yellowCardsInCompetition;
      cards[competitionId] = (cards[competitionId] || 0) + 1;
      // a cada 3 amarelos, 1 jogo de suspensão
      if (cards[competitionId] % 3 === 0) {
        player.status.suspendedMatches += 1;
      }
    } else if (ev.type === "red") {
      player.status.suspendedMatches += 1;
    } else if (ev.type === "injury") {
      player.status.injury = {
        type: "muscular",
        weeksOut: ev.weeksOut,
      };
    } else if (ev.type === "goal") {
      // estatística por temporada/campeonato
      const season = state.season;
      player.stats[season] = player.stats[season] || {};
      const s = player.stats[season][competitionId] = player.stats[season][competitionId] || {
        apps: 0, goals: 0, assists: 0, avgRating: 0,
      };
      s.goals += 1;
    }
  }

  // Decrementa suspensões dos jogadores que estavam suspensos e jogaram esta rodada
  // (simplificação: cumpre suspensão no próximo jogo do campeonato)
  // -> tratado pelo loop de rodada do caller, não aqui.
}

export function recalcTopScorers(competition, playersById) {
  const goals = {};
  for (const match of competition.fixtures) {
    if (!match.played) continue;
    for (const ev of match.events) {
      if (ev.type === "goal") {
        goals[ev.playerId] = (goals[ev.playerId] || 0) + 1;
      }
    }
  }
  competition.topScorers = Object.entries(goals)
    .map(([playerId, g]) => ({
      playerId,
      playerName: playersById[playerId]?.name ?? "?",
      teamId: playersById[playerId]?.teamId,
      goals: g,
    }))
    .sort((a, b) => b.goals - a.goals)
    .slice(0, 20);
}

// Após uma rodada, libera quem cumpriu suspensão (decrementa 1 jogo).
// Chamado pelo caller depois de runRound, para os times que jogaram.
export function decrementSuspensions(state, teamIds) {
  for (const tid of teamIds) {
    const team = state.teams[tid];
    if (!team) continue;
    for (const pid of team.squad) {
      const p = state.players[pid];
      if (p && p.status.suspendedMatches > 0) {
        p.status.suspendedMatches -= 1;
      }
    }
  }
}
