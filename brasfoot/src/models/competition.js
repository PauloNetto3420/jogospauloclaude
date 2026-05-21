// Fábrica de campeonatos + gerador de tabela (algoritmo round-robin).

export function createCompetition({ id, name, tier, season, teamIds, rules }) {
  return {
    id,
    name,
    type: "league",
    tier,
    season,
    teams: [...teamIds],
    rules: {
      rounds: 2,
      promotion: 0,
      relegation: 4,
      promotedTo: null,
      relegatedTo: null,
      pointsWin: 3,
      pointsDraw: 1,
      ...rules,
    },
    fixtures: generateFixtures(teamIds, season),
    standings: teamIds.map(tid => emptyStanding(tid)),
    topScorers: [],
    champion: null,
  };
}

function emptyStanding(teamId) {
  return {
    teamId,
    played: 0, wins: 0, draws: 0, losses: 0,
    goalsFor: 0, goalsAgainst: 0, points: 0,
  };
}

// Algoritmo round-robin (circle method) — gera turno + returno.
// Para n times produz n-1 rodadas × 2 = 2(n-1) rodadas totais.
function generateFixtures(teamIds, season) {
  const teams = [...teamIds];
  if (teams.length % 2 === 1) teams.push(null); // bye fictício
  const n = teams.length;
  const half = n / 2;

  const fixtures = [];
  let mid = 0;

  // turno
  let arr = [...teams];
  for (let round = 0; round < n - 1; round++) {
    for (let i = 0; i < half; i++) {
      const home = arr[i];
      const away = arr[n - 1 - i];
      if (home && away) {
        fixtures.push(makeMatch(++mid, round + 1, home, away, season));
      }
    }
    // rotaciona (fixa o primeiro)
    arr = [arr[0], arr[n - 1], ...arr.slice(1, n - 1)];
  }

  // returno (mesmos confrontos com mando invertido)
  const firstLeg = fixtures.slice();
  for (const m of firstLeg) {
    fixtures.push(makeMatch(++mid, m.round + (n - 1), m.awayTeamId, m.homeTeamId, season));
  }

  return fixtures;
}

function makeMatch(idNum, round, homeId, awayId, season) {
  return {
    id: `m_${season}_${String(idNum).padStart(4, "0")}`,
    round,
    date: null, // será atribuído pelo scheduler (próximo módulo)
    homeTeamId: homeId,
    awayTeamId: awayId,
    played: false,
    score: null,
    events: [],
    attendance: null,
  };
}
