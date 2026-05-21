// Copa do Brasil — formato mata-mata com 6 fases.
//
// Estrutura da competição:
//   - 4 cabeças (top 4 da última Série A — Libertadores) entram nas Oitavas.
//   - 12 "intermediários" (rep 5º-16º) entram na 2ª Fase.
//   - 24 restantes começam na 1ª Fase.
//
// Fases:
//   1ª Fase   (24 → 12)  jogo único, menor reputação manda
//   2ª Fase   (24 → 12)  jogo único, menor reputação manda
//   Oitavas   (16 → 8)   ida e volta, melhor campanha joga volta em casa
//   Quartas   (8 → 4)    ida e volta
//   Semifinal (4 → 2)    ida e volta
//   Final     (2 → 1)    ida e volta
//
// Sorteio: aleatório até as Oitavas. A partir das Quartas, segue chaveamento
// fixado (vencedor tie 1 enfrenta vencedor tie 2, etc.).

const PHASE_ORDER = ["fase1", "fase2", "oitavas", "quartas", "semi", "final"];

const PHASE_META = {
  fase1:    { name: "1ª Fase",         legs: 1, slotsIn: 24, slotsOut: 12 },
  fase2:    { name: "2ª Fase",         legs: 1, slotsIn: 24, slotsOut: 12 },
  oitavas:  { name: "Oitavas",         legs: 2, slotsIn: 16, slotsOut: 8 },
  quartas:  { name: "Quartas",         legs: 2, slotsIn: 8,  slotsOut: 4 },
  semi:     { name: "Semifinal",       legs: 2, slotsIn: 4,  slotsOut: 2 },
  final:    { name: "Final",           legs: 2, slotsIn: 2,  slotsOut: 1 },
};

// Em quais rodadas da liga cada fase é jogada (ida, volta)
const DEFAULT_SCHEDULE = {
  fase1:   [5],
  fase2:   [9],
  oitavas: [13, 16],
  quartas: [20, 23],
  semi:    [27, 30],
  final:   [34, 37],
};

// ---------------------- Construção ----------------------

// libertaQualifiers: IDs dos 4 cabeças (top 4 Série A última temporada).
//                    Se vazio (1ª temporada), usa top 4 por reputação da Série A.
// seriesATeamIds, seriesBTeamIds: todos os times das duas séries
export function createCupCompetition({ season, allTeams, libertaQualifiers, seriesATeamIds }) {
  // Garante cabeças
  let cabecas = libertaQualifiers && libertaQualifiers.length >= 4
    ? libertaQualifiers.slice(0, 4)
    : null;

  if (!cabecas) {
    // 1ª temporada — usa top 4 da Série A por reputação
    cabecas = [...seriesATeamIds]
      .map(id => allTeams[id])
      .sort((a, b) => b.reputation - a.reputation)
      .slice(0, 4)
      .map(t => t.id);
  }

  // Demais 36 times (toda a Série A não-cabeça + toda a Série B), ranqueados por rep
  const remaining = Object.values(allTeams)
    .filter(t => !cabecas.includes(t.id))
    .sort((a, b) => b.reputation - a.reputation);

  const seedsFase2 = remaining.slice(0, 12).map(t => t.id);
  const seedsFase1 = remaining.slice(12, 36).map(t => t.id);

  return {
    id: "copa_brasil",
    name: "Copa do Brasil",
    type: "cup",
    tier: 1,
    season,
    teams: [...cabecas, ...seedsFase2, ...seedsFase1],
    libertaEntrants: cabecas,
    fase2Seeds: seedsFase2,
    fase1Seeds: seedsFase1,
    phases: PHASE_ORDER.reduce((acc, key) => {
      acc[key] = { name: PHASE_META[key].name, legs: PHASE_META[key].legs, ties: [], complete: false };
      return acc;
    }, {}),
    phaseOrder: [...PHASE_ORDER],
    currentPhase: "fase1",
    schedule: { ...DEFAULT_SCHEDULE },
    fixtures: [],         // todos os jogos individuais (legs) — compat com season.js
    standings: [],        // não tem (mata-mata) — vazio para compat
    topScorers: [],
    champion: null,
    rules: { pointsWin: 0, pointsDraw: 0, format: "knockout" },
  };
}

// ---------------------- Sorteio de fases ----------------------

export function drawPhase(competition, phaseKey, rng, teamsById) {
  const phase = competition.phases[phaseKey];
  if (phase.ties.length) return phase.ties; // já sorteada

  let entrants = [];

  if (phaseKey === "fase1") {
    entrants = [...competition.fase1Seeds];
  } else if (phaseKey === "fase2") {
    const winnersFase1 = competition.phases.fase1.ties.map(t => t.winnerId).filter(Boolean);
    entrants = [...winnersFase1, ...competition.fase2Seeds];
  } else if (phaseKey === "oitavas") {
    const winnersFase2 = competition.phases.fase2.ties.map(t => t.winnerId).filter(Boolean);
    entrants = [...winnersFase2, ...competition.libertaEntrants];
  } else {
    // Quartas, semi, final: segue chaveamento (vencedores pareados em ordem)
    const prevKey = competition.phaseOrder[competition.phaseOrder.indexOf(phaseKey) - 1];
    const prevWinners = competition.phases[prevKey].ties.map(t => t.winnerId).filter(Boolean);
    entrants = prevWinners;
  }

  const legs = PHASE_META[phaseKey].legs;
  const isRandomDraw = ["fase1", "fase2", "oitavas"].includes(phaseKey);

  // Para fases aleatórias: embaralha. Para chaveamento: mantém ordem.
  const pairs = [];
  if (isRandomDraw) {
    const shuffled = shuffle([...entrants], rng);
    for (let i = 0; i < shuffled.length; i += 2) {
      pairs.push([shuffled[i], shuffled[i + 1]]);
    }
  } else {
    // Chaveamento: 1×2, 3×4, 5×6, ...
    for (let i = 0; i < entrants.length; i += 2) {
      pairs.push([entrants[i], entrants[i + 1]]);
    }
  }

  // Monta os ties
  pairs.forEach(([aId, bId], idx) => {
    const tie = makeTie({
      phaseKey, idx, teamAId: aId, teamBId: bId,
      legs, teamsById, season: competition.season,
    });
    phase.ties.push(tie);
    // Cada leg vira um fixture na lista principal
    for (const leg of tie.legs) competition.fixtures.push(leg);
  });

  return phase.ties;
}

// Decide mando inicial baseado na regra:
// - Fase única: time de MENOR reputação manda em casa (vantagem do "azarão")
// - Ida e volta: mandante da volta é o time com MELHOR campanha (proxy: maior reputação
//   na primeira fase mata-mata; nas seguintes, é o time com mais gols pró acumulados).
function makeTie({ phaseKey, idx, teamAId, teamBId, legs, teamsById, season }) {
  const teamA = teamsById[teamAId];
  const teamB = teamsById[teamBId];

  let bestSeedId, otherId;
  if (legs === 1) {
    // Único jogo: menor reputação tem mando
    if (teamA.reputation <= teamB.reputation) { bestSeedId = teamB.id; otherId = teamA.id; }
    else                                        { bestSeedId = teamA.id; otherId = teamB.id; }
    // No jogo único, o "underdog" joga em casa
    const tie = {
      id: `tie_${phaseKey}_${idx}`,
      phase: phaseKey,
      bracketPos: idx,
      teamAId: otherId,    // mandante (azarão)
      teamBId: bestSeedId, // visitante
      legs: [
        makeLeg({ phaseKey, idx, legNum: 1, homeId: otherId, awayId: bestSeedId, season }),
      ],
      aggregate: null,
      winnerId: null,
    };
    return tie;
  }

  // Ida e volta: melhor seed (= melhor campanha) joga a volta em casa
  // Para a primeira fase mata-mata (oitavas), usar reputação.
  // Para quartas+, usar campanha (gols pró na copa até aqui — mas como ainda não temos,
  //   sumimos com reputação no momento da chamada; será reordenado em redrawSeeds).
  if (teamA.reputation >= teamB.reputation) { bestSeedId = teamA.id; otherId = teamB.id; }
  else                                        { bestSeedId = teamB.id; otherId = teamA.id; }

  return {
    id: `tie_${phaseKey}_${idx}`,
    phase: phaseKey,
    bracketPos: idx,
    teamAId: bestSeedId,
    teamBId: otherId,
    legs: [
      // Leg 1: melhor seed JOGA FORA (manda na volta)
      makeLeg({ phaseKey, idx, legNum: 1, homeId: otherId, awayId: bestSeedId, season }),
      makeLeg({ phaseKey, idx, legNum: 2, homeId: bestSeedId, awayId: otherId, season }),
    ],
    aggregate: null,
    winnerId: null,
  };
}

function makeLeg({ phaseKey, idx, legNum, homeId, awayId, season }) {
  return {
    id: `m_cb_${season}_${phaseKey}_${idx}_${legNum}`,
    round: null, // será atribuído na hora do agendamento (ver getCupRoundFor)
    phase: phaseKey,
    legNum,
    cupTieId: `tie_${phaseKey}_${idx}`,
    homeTeamId: homeId,
    awayTeamId: awayId,
    played: false,
    score: null,
    events: [],
    date: null,
    attendance: null,
  };
}

// ---------------------- Aplicar resultado ----------------------

// Aplica resultado a um leg da copa. Se a fase é de 2 legs, espera o segundo
// para decidir o vencedor. Empate no agregado → decisão por sorte (proxy de pênaltis).
export function applyCupLegResult(competition, leg, rng) {
  const phase = competition.phases[leg.phase];
  const tie = phase.ties.find(t => t.id === leg.cupTieId);
  if (!tie) return;

  // Se é jogo único (1 leg), já decide
  if (PHASE_META[leg.phase].legs === 1) {
    const home = leg.score.home, away = leg.score.away;
    if (home > away) tie.winnerId = leg.homeTeamId;
    else if (away > home) tie.winnerId = leg.awayTeamId;
    else {
      // Empate no jogo único: decide nos "pênaltis" (proxy: 50/50 com tempero pela reputação)
      tie.winnerId = penaltyShootout(competition, leg.homeTeamId, leg.awayTeamId, rng);
    }
    tie.aggregate = { home, away };
    if (phase.ties.every(t => t.winnerId)) phase.complete = true;
    return;
  }

  // 2 legs: só decide quando o leg 2 for jogado
  if (leg.legNum !== 2) return;
  const leg1 = tie.legs[0];
  const leg2 = tie.legs[1];
  if (!leg1.played || !leg2.played) return;

  // tie.teamAId é o de MELHOR seed (joga volta em casa = leg2 home)
  // No leg1: teamA está fora (away). No leg2: teamA está em casa (home).
  const aTotal = leg1.score.away + leg2.score.home;
  const bTotal = leg1.score.home + leg2.score.away;

  if (aTotal > bTotal) tie.winnerId = tie.teamAId;
  else if (bTotal > aTotal) tie.winnerId = tie.teamBId;
  else tie.winnerId = penaltyShootout(competition, tie.teamAId, tie.teamBId, rng);

  tie.aggregate = { teamA: aTotal, teamB: bTotal };

  if (phase.ties.every(t => t.winnerId)) phase.complete = true;
}

function penaltyShootout(competition, teamAId, teamBId, rng) {
  // Coin flip influenciado por reputação (proxy bem simplificado)
  return rng.chance(0.5) ? teamAId : teamBId;
}

// ---------------------- Calendário ----------------------

// Retorna os legs agendados para uma rodada de liga específica.
export function getCupLegsForRound(competition, leagueRound) {
  const out = [];
  for (const [phaseKey, rounds] of Object.entries(competition.schedule)) {
    const legNumIdx = rounds.indexOf(leagueRound);
    if (legNumIdx === -1) continue;
    const phase = competition.phases[phaseKey];
    for (const tie of phase.ties) {
      const leg = tie.legs[legNumIdx];
      if (leg && !leg.played) {
        leg.round = leagueRound;
        out.push(leg);
      }
    }
  }
  return out;
}

// Verifica se uma fase precisa ser sorteada para a próxima rodada
export function maybeDrawNextPhase(competition, leagueRound, rng, teamsById) {
  for (const phaseKey of competition.phaseOrder) {
    const phaseRounds = competition.schedule[phaseKey];
    const startRound = phaseRounds[0];
    // Sorteia logo antes da fase começar (na rodada anterior)
    if (leagueRound + 1 === startRound) {
      const phase = competition.phases[phaseKey];
      if (!phase.ties.length) {
        const canDraw = canPhaseBeDrawn(competition, phaseKey);
        if (canDraw) drawPhase(competition, phaseKey, rng, teamsById);
      }
    }
  }
}

function canPhaseBeDrawn(competition, phaseKey) {
  if (phaseKey === "fase1") return true;
  const idx = competition.phaseOrder.indexOf(phaseKey);
  const prevKey = competition.phaseOrder[idx - 1];
  return competition.phases[prevKey].complete;
}

// ---------------------- Setters/Helpers ----------------------

function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export const CUP_PHASE_META = PHASE_META;
export const CUP_PHASE_ORDER = PHASE_ORDER;
