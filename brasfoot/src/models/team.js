// Fábrica de times. Recebe dados-base (do seed) e completa com defaults.

export function createTeam(base) {
  return {
    id: base.id,
    name: base.name,
    shortName: base.shortName,
    city: base.city,
    state: base.state,
    colors: base.colors,
    stadium: base.stadium,
    reputation: base.reputation,
    finances: {
      balance: base.finances?.balance ?? 10_000_000,
      monthlyIncome: base.finances?.monthlyIncome ?? 2_000_000,
      monthlyExpenses: 0, // recalculado a partir dos salários do elenco
      debt: 0,
    },
    tactics: {
      formation: "4-3-3",
      style: "equilibrado",
      pressing: "medio",
    },
    squad: [],          // preenchido pelo gerador de jogadores
    staff: { coachId: null, scouts: 1 },
    trophies: [],
    morale: 70,
    fanHappiness: 70,
  };
}

// Recalcula despesas mensais a partir dos salários dos jogadores
export function recalcExpenses(team, playersById) {
  const wages = team.squad.reduce((sum, pid) => {
    const p = playersById[pid];
    return sum + (p?.contract?.salary ?? 0);
  }, 0);
  team.finances.monthlyExpenses = wages + 500_000; // estrutura fixa
}
