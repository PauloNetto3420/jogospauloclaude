// Finanças: receitas de bilheteria + folha salarial semanal.
//
// Convenção: 1 rodada = 1 semana. weeklyTick(state, results) deve ser
// chamado pelo caller logo após runRound() — ele aplica receitas de mando
// para os jogos da rodada e desconta salários de TODOS os times.

const TICKET_PRICE = 80;            // R$ médio por ingresso
const OCCUPANCY_BASE = 0.55;        // taxa média de ocupação
const REPUTATION_OCCUPANCY = 0.004; // +0,4% por ponto de reputação
const STRUCTURE_COST_WEEKLY = 120_000; // CT, viagens, staff fixo

// Bilheteria de uma partida (somente o mandante recebe).
// Ocupação cresce com reputação do time e com o "tamanho" do adversário.
export function calcMatchRevenue(homeTeam, awayTeam) {
  const cap = homeTeam.stadium.capacity;
  const baseOcc = OCCUPANCY_BASE + (homeTeam.reputation - 60) * REPUTATION_OCCUPANCY;
  const rivalBonus = Math.max(0, (awayTeam.reputation - 70) * 0.003);
  const occupancy = Math.max(0.15, Math.min(0.98, baseOcc + rivalBonus));
  const attendance = Math.round(cap * occupancy);
  const revenue = attendance * TICKET_PRICE;
  return { attendance, revenue, occupancy };
}

export function applyMatchdayRevenue(state, result) {
  const home = state.teams[result.homeTeamId];
  const away = state.teams[result.awayTeamId];
  const { attendance, revenue } = calcMatchRevenue(home, away);
  home.finances.balance += revenue;
  // Persiste no fixture para a UI
  const match = state.competitions[result.competitionId]?.fixtures
    .find(m => m.id === result.matchId);
  if (match) match.attendance = attendance;
  return { teamId: home.id, attendance, revenue };
}

// Salário semanal = mensal / 4. Desconta de TODOS os times (jogaram ou não).
export function payWeeklyWages(state) {
  const report = [];
  for (const team of Object.values(state.teams)) {
    const monthly = team.squad.reduce(
      (sum, pid) => sum + (state.players[pid]?.contract.salary ?? 0), 0
    );
    const weekly = Math.round(monthly / 4) + STRUCTURE_COST_WEEKLY;
    team.finances.balance -= weekly;
    if (team.finances.balance < 0) {
      team.finances.debt += -team.finances.balance;
      team.finances.balance = 0;
    }
    report.push({ teamId: team.id, wagesPaid: weekly });
  }
  return report;
}

// Receita semanal recorrente (patrocínio + sócios + TV), distribuída por semana.
export function applyWeeklyIncome(state) {
  for (const team of Object.values(state.teams)) {
    const weekly = Math.round(team.finances.monthlyIncome / 4);
    team.finances.balance += weekly;
  }
}

// Orquestrador: chamado uma vez por rodada/semana.
export function weeklyTick(state, roundResults, competitionId) {
  const revenues = [];
  for (const result of roundResults) {
    revenues.push(applyMatchdayRevenue(state, { ...result, competitionId }));
  }
  applyWeeklyIncome(state);
  const wages = payWeeklyWages(state);
  return { revenues, wages };
}
