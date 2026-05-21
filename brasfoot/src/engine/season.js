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
  // Persistido para revisão posterior (Match Detail Modal)
  match.lineups = result.lineups;
  match.stats = result.stats;
  match.strengths = result.strengths;
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
  // 1. Eventos individuais
  for (const ev of result.events) {
    const player = state.players[ev.playerId];
    if (!player) continue;

    if (ev.type === "yellow") {
      const cards = player.status.yellowCardsInCompetition;
      cards[competitionId] = (cards[competitionId] || 0) + 1;
      if (cards[competitionId] % 3 === 0) {
        player.status.suspendedMatches += 1;
      }
    } else if (ev.type === "red") {
      player.status.suspendedMatches += 1;
    } else if (ev.type === "injury") {
      player.status.injury = { type: "muscular", weeksOut: ev.weeksOut };
    } else if (ev.type === "goal") {
      const season = state.season;
      player.stats[season] = player.stats[season] || {};
      const s = player.stats[season][competitionId] = player.stats[season][competitionId] || {
        apps: 0, goals: 0, assists: 0, avgRating: 0,
      };
      s.goals += 1;
    }
  }

  // 2. Forma e moral — varre os XIs e ajusta com base na partida
  const homeWon = result.score.home > result.score.away;
  const awayWon = result.score.away > result.score.home;

  for (const side of ["home", "away"]) {
    const lineup = result.lineups?.[side] || [];
    const won  = (side === "home" && homeWon) || (side === "away" && awayWon);
    const lost = (side === "home" && awayWon) || (side === "away" && homeWon);
    const goalsScored   = side === "home" ? result.score.home : result.score.away;
    const goalsConceded = side === "home" ? result.score.away : result.score.home;

    for (const lineupEntry of lineup) {
      const p = state.players[lineupEntry.id];
      if (!p) continue;

      // Conta eventos pessoais deste jogador
      let goals = 0, yellows = 0, reds = 0, gotInjured = false;
      for (const ev of result.events) {
        if (ev.playerId !== p.id) continue;
        if (ev.type === "goal") goals++;
        else if (ev.type === "yellow") yellows++;
        else if (ev.type === "red") reds++;
        else if (ev.type === "injury") gotInjured = true;
      }

      // Forma (escala 1.0-10.0, média 6.5)
      let formDelta = 0.1;                       // baseline por participar
      formDelta += goals * 0.8;                  // brilhou
      formDelta -= yellows * 0.15;               // jogo nervoso
      formDelta -= reds * 1.2;                   // catástrofe pessoal
      formDelta -= gotInjured ? 0.4 : 0;         // saiu mal
      // Bônus/penalidade pelo resultado coletivo
      if (won)  formDelta += 0.25;
      if (lost) formDelta -= 0.25;
      // Goleiro penaliza se sofreu muito; ataca se manteve zero
      if (p.position === "GOL") {
        if (goalsConceded === 0)       formDelta += 0.4;
        else if (goalsConceded >= 3)   formDelta -= 0.4;
      }
      // Regressão suave à média (10% do desvio em direção a 6.5)
      const current = p.status.form ?? 6.5;
      formDelta += (6.5 - current) * 0.10;
      p.status.form = clamp(current + formDelta, 1, 10);

      // Moral (escala 0-100, média 70)
      let moraleDelta = 0;
      if (won)  moraleDelta += 3;
      if (lost) moraleDelta -= 3;
      if (goals >= 2)            moraleDelta += 2;  // hat-trick / brace
      if (reds > 0)              moraleDelta -= 4;
      if (goalsConceded >= 4)    moraleDelta -= 2;  // goleada sofrida
      if (goalsScored   >= 4)    moraleDelta += 2;  // goleada aplicada
      p.status.morale = clamp((p.status.morale ?? 70) + moraleDelta, 0, 100);
    }

    // 3. Quem não jogou (reserva, machucado, suspenso) também tem moral mexida
    //    com base no resultado, mas com peso menor.
    const teamId = side === "home" ? result.homeTeamId : result.awayTeamId;
    const team = state.teams[teamId];
    if (team) {
      const lineupIds = new Set(lineup.map(l => l.id));
      for (const pid of team.squad) {
        if (lineupIds.has(pid)) continue;
        const p = state.players[pid];
        if (!p) continue;
        let moraleDelta = 0;
        if (won)  moraleDelta += 1;
        if (lost) moraleDelta -= 1;
        // Pequena regressão também na forma de reservas (perdem ritmo)
        const f = p.status.form ?? 6.5;
        p.status.form = clamp(f + (6.5 - f) * 0.05 - 0.05, 1, 10);
        p.status.morale = clamp((p.status.morale ?? 70) + moraleDelta, 0, 100);
      }
    }
  }
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

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
