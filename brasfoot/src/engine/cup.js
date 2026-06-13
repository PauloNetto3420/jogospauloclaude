// Copa do Brasil — 126 clubes, mata-mata em 8 fases.
//
// Vagas (126): 20 da Série A + 2 campeões nacionais (Série C e D do ano
//   anterior) + 104 via estaduais, distribuídas por cota conforme o Ranking
//   Nacional das Federações (RNF) e preenchidas pelo RNC.
//
// Fases (bracket que fecha com 126):
//   1ª Fase  (40 → 20)   jogo único, pior ranqueado manda
//   2ª Fase  (84 → 42)   jogo único, pior ranqueado manda   [+64 estaduais]
//   3ª Fase  (64 → 32)   jogo único                          [+22 seeded: A + campeões]
//   4ª Fase  (32 → 16)   jogo único
//   Oitavas  (16 → 8)    ida e volta
//   Quartas  (8 → 4)     ida e volta
//   Semifinal(4 → 2)     ida e volta
//   Final    (2 → 1)     jogo único
//
// Os 22 "seeded" (Série A + 2 campeões) têm bye até a 3ª fase. Sorteio
// aleatório até as oitavas; chaveamento fixo das quartas em diante.

import { computeRNF, getRankedClubsOutsideTopDivisions } from "./ranking.js";

const PHASE_ORDER = ["f1", "f2", "f3", "f4", "oitavas", "quartas", "semi", "final"];

const PHASE_META = {
  f1:       { name: "1ª Fase",   legs: 1, slotsIn: 40, prize:    400_000 },
  f2:       { name: "2ª Fase",   legs: 1, slotsIn: 84, prize:    830_000 },
  f3:       { name: "3ª Fase",   legs: 1, slotsIn: 64, prize:    950_000 },
  f4:       { name: "4ª Fase",   legs: 1, slotsIn: 32, prize:  1_500_000 },
  oitavas:  { name: "Oitavas",   legs: 2, slotsIn: 16, prize:  3_000_000 },
  quartas:  { name: "Quartas",   legs: 2, slotsIn:  8, prize:  4_000_000 },
  semi:     { name: "Semifinal", legs: 2, slotsIn:  4, prize:  9_000_000 },
  final:    { name: "Final",     legs: 1, slotsIn:  2, prize: 34_000_000 }, // vice; ambos finalistas recebem
};
export const CHAMPION_BONUS = 44_000_000; // campeão total = 34M (final) + 44M = 78M

// Tamanhos do campo
const COPA_SEEDED = 22;       // 20 Série A + 2 campeões (entram na 3ª fase)
const COPA_ESTADUAIS = 104;   // 40 começam na 1ª, 64 entram na 2ª
const COPA_F1 = 40;

// Cota base de vagas estaduais por posição no RNF; o restante até 104 é
// preenchido pelos melhores clubes elegíveis no RNC.
function copaCota(rank) {
  if (rank <= 2) return 6;
  if (rank <= 4) return 5;
  if (rank === 5) return 4;
  if (rank <= 10) return 3;
  if (rank <= 16) return 2;
  return 1;
}

// Em quais rodadas da liga cada fase é jogada (ida, volta)
const DEFAULT_SCHEDULE = {
  f1:      [2],
  f2:      [5],
  f3:      [8],
  f4:      [11],
  oitavas: [14, 17],
  quartas: [20, 23],
  semi:    [26, 29],
  final:   [33],
};

// ---------------------- Montagem do campo (vagas) ----------------------

// Monta as 126 vagas: { serieA(20), champions, seeded(22), estaduais(104) }.
export function buildCopaField(state, { serieCChampion = null, serieDChampion = null } = {}) {
  const used = new Set();
  const serieA = (state.competitions.brasileirao_a?.teams || []).slice(0, 20);
  serieA.forEach(id => used.add(id));

  const ranked = getRankedClubsOutsideTopDivisions(state); // [{teamId}] fora de A/B/C

  // Seeded (22) = Série A (20) + 2 campeões nacionais (C/D do ano anterior).
  // Campeão na Série A ou ausente → completa com o melhor clube por RNC.
  const champions = [];
  for (const id of [serieCChampion, serieDChampion]) {
    if (id && !used.has(id)) { used.add(id); champions.push(id); }
  }
  const seeded = [...serieA, ...champions];
  for (const r of ranked) {
    if (seeded.length >= COPA_SEEDED) break;
    if (!used.has(r.teamId)) { used.add(r.teamId); seeded.push(r.teamId); }
  }

  // Estaduais (104) por cota RNF (campeão estadual primeiro) + fill por RNC.
  const rnf = computeRNF(state);
  const byUf = {};
  for (const r of ranked) {
    if (used.has(r.teamId)) continue;
    const uf = state.teams[r.teamId]?.state;
    if (uf) (byUf[uf] = byUf[uf] || []).push(r.teamId);
  }
  const champByUf = {};
  for (const e of Object.values(state.estaduais || {})) {
    if (e?.champion && e.uf && !used.has(e.champion)) champByUf[e.uf] = e.champion;
  }
  const estaduais = [];
  const pushEst = (id) => {
    if (estaduais.length >= COPA_ESTADUAIS || !id || used.has(id)) return false;
    used.add(id); estaduais.push(id); return true;
  };
  for (const { uf, rank } of rnf) {
    const quota = copaCota(rank);
    let got = 0;
    const cands = [];
    if (champByUf[uf]) cands.push(champByUf[uf]);
    for (const id of (byUf[uf] || [])) if (id !== champByUf[uf]) cands.push(id);
    for (const id of cands) {
      if (got >= quota || estaduais.length >= COPA_ESTADUAIS) break;
      if (pushEst(id)) got++;
    }
  }
  for (const r of ranked) {
    if (estaduais.length >= COPA_ESTADUAIS) break;
    pushEst(r.teamId);
  }

  return { serieA, champions, seeded, estaduais };
}

// ---------------------- Construção ----------------------

// Cria a Copa do Brasil da temporada a partir do estado (Série A atual +
// campeões C/D do ano anterior + estaduais por RNF). Chamada após os estaduais.
export function createCupCompetition({ state, season, serieCChampion = null, serieDChampion = null }) {
  const { serieA, champions, seeded, estaduais } = buildCopaField(state, { serieCChampion, serieDChampion });

  // Estaduais vêm do mais forte (início) ao mais fraco (fim). Os 40 mais
  // fracos começam na 1ª fase; os 64 mais fortes entram na 2ª.
  const f1Seeds = estaduais.slice(COPA_ESTADUAIS - COPA_F1); // 40 mais fracos
  const f2Seeds = estaduais.slice(0, COPA_ESTADUAIS - COPA_F1); // 64
  const f3Seeds = [...seeded]; // 22 (Série A + campeões)

  return {
    id: "copa_brasil",
    name: "Copa do Brasil",
    type: "cup",
    tier: 1,
    season,
    teams: [...f3Seeds, ...f2Seeds, ...f1Seeds],
    seeded: f3Seeds,
    champions,
    serieAEntrants: serieA,
    f1Seeds,
    f2Seeds,
    f3Seeds,
    phases: PHASE_ORDER.reduce((acc, key) => {
      acc[key] = { name: PHASE_META[key].name, legs: PHASE_META[key].legs, ties: [], complete: false, prizesPaid: false };
      return acc;
    }, {}),
    phaseOrder: [...PHASE_ORDER],
    currentPhase: "f1",
    schedule: { ...DEFAULT_SCHEDULE },
    fixtures: [],
    standings: [],
    topScorers: [],
    champion: null,
    drawsShown: [],
    rules: { pointsWin: 0, pointsDraw: 0, format: "knockout" },
  };
}

// ---------------------- Sorteio de fases ----------------------

export function drawPhase(competition, phaseKey, rng, teamsById) {
  const phase = competition.phases[phaseKey];
  if (phase.ties.length) return phase.ties; // já sorteada

  let entrants = [];

  if (phaseKey === "f1") {
    entrants = [...competition.f1Seeds];
  } else if (phaseKey === "f2") {
    const winnersF1 = competition.phases.f1.ties.map(t => t.winnerId).filter(Boolean);
    entrants = [...winnersF1, ...competition.f2Seeds];
  } else if (phaseKey === "f3") {
    const winnersF2 = competition.phases.f2.ties.map(t => t.winnerId).filter(Boolean);
    entrants = [...winnersF2, ...competition.f3Seeds];
  } else if (phaseKey === "f4" || phaseKey === "oitavas") {
    const prevKey = phaseKey === "f4" ? "f3" : "f4";
    entrants = competition.phases[prevKey].ties.map(t => t.winnerId).filter(Boolean);
  } else {
    // Quartas, semi, final: segue chaveamento (vencedores pareados em ordem)
    const prevKey = competition.phaseOrder[competition.phaseOrder.indexOf(phaseKey) - 1];
    const prevWinners = competition.phases[prevKey].ties.map(t => t.winnerId).filter(Boolean);
    entrants = prevWinners;
  }

  const legs = PHASE_META[phaseKey].legs;
  const isRandomDraw = ["f1", "f2", "f3", "f4", "oitavas"].includes(phaseKey);

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
    if (teamA.reputation <= teamB.reputation) { bestSeedId = teamB.id; otherId = teamA.id; }
    else                                        { bestSeedId = teamA.id; otherId = teamB.id; }
    // Jogo único: o "azarão" (pior ranqueado) manda em casa — EXCETO na final,
    // onde manda o de melhor campanha (proxy: maior reputação).
    const homeId = phaseKey === "final" ? bestSeedId : otherId;
    const awayId = phaseKey === "final" ? otherId : bestSeedId;
    return {
      id: `tie_${phaseKey}_${idx}`,
      phase: phaseKey,
      bracketPos: idx,
      teamAId: homeId,
      teamBId: awayId,
      legs: [
        makeLeg({ phaseKey, idx, legNum: 1, homeId, awayId, season }),
      ],
      aggregate: null,
      winnerId: null,
    };
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
// para decidir. Empate → pênaltis reais (precisa de ctx.teamsById + playersById).
export function applyCupLegResult(competition, leg, rng, ctx = {}) {
  const phase = competition.phases[leg.phase];
  const tie = phase.ties.find(t => t.id === leg.cupTieId);
  if (!tie) return;

  // Jogo único (1 leg)
  if (PHASE_META[leg.phase].legs === 1) {
    const home = leg.score.home, away = leg.score.away;
    if (home > away) tie.winnerId = leg.homeTeamId;
    else if (away > home) tie.winnerId = leg.awayTeamId;
    else {
      const shootout = runShootout(tie.teamAId, tie.teamBId, ctx, rng);
      tie.winnerId = shootout.winnerId;
      tie.penalties = { scoreA: shootout.scoreA, scoreB: shootout.scoreB, kicks: shootout.kicks };
    }
    tie.aggregate = { home, away };
    if (phase.ties.every(t => t.winnerId)) phase.complete = true;
    return;
  }

  // 2 legs: só decide quando o leg 2 for jogado
  if (leg.legNum !== 2) return;
  const [leg1, leg2] = tie.legs;
  if (!leg1.played || !leg2.played) return;

  // teamA é o de melhor seed (manda no leg2)
  const aTotal = leg1.score.away + leg2.score.home;
  const bTotal = leg1.score.home + leg2.score.away;

  if (aTotal > bTotal) tie.winnerId = tie.teamAId;
  else if (bTotal > aTotal) tie.winnerId = tie.teamBId;
  else {
    const shootout = runShootout(tie.teamAId, tie.teamBId, ctx, rng);
    tie.winnerId = shootout.winnerId;
    tie.penalties = { scoreA: shootout.scoreA, scoreB: shootout.scoreB, kicks: shootout.kicks };
  }

  tie.aggregate = { teamA: aTotal, teamB: bTotal };

  if (phase.ties.every(t => t.winnerId)) phase.complete = true;
}

// Tenta rodar shootout real com playersById. Se faltar contexto, cai pra 50/50.
function runShootout(teamAId, teamBId, ctx, rng) {
  if (ctx.teamsById && ctx.playersById) {
    return penaltyShootout(ctx.teamsById[teamAId], ctx.teamsById[teamBId], ctx.playersById, rng);
  }
  // Fallback
  return {
    scoreA: 0, scoreB: 0, kicks: [],
    winnerId: rng.chance(0.5) ? teamAId : teamBId,
  };
}

// Disputa de pênaltis: 5 cobranças cada, depois morte súbita.
// Probabilidade por cobrança baseada em finishing do batedor vs goalkeeping do GK.
// Cobradores ordenados por finishing (melhor primeiro). Wraparound em morte súbita.
export function penaltyShootout(teamA, teamB, playersById, rng) {
  const takersA = pickTakers(teamA, playersById);
  const takersB = pickTakers(teamB, playersById);
  const gkA = pickGK(teamA, playersById);
  const gkB = pickGK(teamB, playersById);

  const kicks = [];
  let scoreA = 0, scoreB = 0;
  let aIdx = 0, bIdx = 0;

  function kickA() {
    const taker = takersA[aIdx % Math.max(1, takersA.length)] || { name: "?", attributes: { finishing: 50 } };
    const scored = attemptKick(taker, gkB, rng);
    kicks.push({ team: "A", takerId: taker.id, takerName: taker.name, scored, kick: aIdx + 1 });
    if (scored) scoreA++;
    aIdx++;
  }
  function kickB() {
    const taker = takersB[bIdx % Math.max(1, takersB.length)] || { name: "?", attributes: { finishing: 50 } };
    const scored = attemptKick(taker, gkA, rng);
    kicks.push({ team: "B", takerId: taker.id, takerName: taker.name, scored, kick: bIdx + 1 });
    if (scored) scoreB++;
    bIdx++;
  }

  // Primeiras 5 cobranças cada
  for (let r = 0; r < 5; r++) {
    if (aIdx < 5) {
      kickA();
      if (cannotCatchUp(scoreA, scoreB, 5 - aIdx, 5 - bIdx)) break;
    }
    if (bIdx < 5) {
      kickB();
      if (cannotCatchUp(scoreA, scoreB, 5 - aIdx, 5 - bIdx)) break;
    }
  }

  // Morte súbita: continua par a par até alguém ficar atrás após par completo
  while (scoreA === scoreB) {
    kickA();
    kickB();
  }

  return {
    scoreA, scoreB,
    winnerId: scoreA > scoreB ? teamA.id : teamB.id,
    kicks,
  };
}

function cannotCatchUp(scoreA, scoreB, leftA, leftB) {
  return Math.abs(scoreA - scoreB) > Math.max(leftA, leftB);
}

function attemptKick(taker, gk, rng) {
  const finishing = taker?.attributes?.finishing ?? 50;
  const gkSkill = gk?.attributes?.goalkeeping ?? 50;
  // Base 75% (alinha com mundo real) + swing pelos atributos.
  const swing = (finishing - gkSkill) / 250;
  const prob = Math.max(0.40, Math.min(0.93, 0.75 + swing));
  return rng.next() < prob;
}

function pickTakers(team, playersById) {
  if (!team) return [];
  const candidates = team.squad
    .map(id => playersById[id])
    .filter(p => p && p.position !== "GOL" && !p.status.injury && p.status.suspendedMatches === 0);
  candidates.sort((a, b) => (b.attributes.finishing || 0) - (a.attributes.finishing || 0));
  return candidates;
}

function pickGK(team, playersById) {
  if (!team) return null;
  const gks = team.squad
    .map(id => playersById[id])
    .filter(p => p && p.position === "GOL" && !p.status.injury && p.status.suspendedMatches === 0);
  gks.sort((a, b) => (b.attributes.goalkeeping || 0) - (a.attributes.goalkeeping || 0));
  return gks[0] || null;
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
  if (phaseKey === "f1") return true;
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

// Paga o prêmio de uma fase para todos os times que ENTRARAM nela.
// Idempotente: marca phase.prizesPaid pra não pagar duas vezes.
// Retorna { phaseKey, prize, teams } ou null se nada a pagar.
export function payPhasePrizes(state, competition, phaseKey) {
  const phase = competition.phases[phaseKey];
  if (!phase || phase.prizesPaid) return null;
  if (!phase.ties.length) return null;
  const prize = PHASE_META[phaseKey]?.prize || 0;
  if (!prize) { phase.prizesPaid = true; return null; }

  const teamsInPhase = new Set();
  for (const tie of phase.ties) {
    if (tie.teamAId) teamsInPhase.add(tie.teamAId);
    if (tie.teamBId) teamsInPhase.add(tie.teamBId);
  }
  for (const teamId of teamsInPhase) {
    if (state.teams[teamId]) {
      state.teams[teamId].finances.balance += prize;
    }
  }
  phase.prizesPaid = true;
  return { phaseKey, phaseName: phase.name, prize, teams: [...teamsInPhase] };
}

export const CUP_PHASE_META = PHASE_META;
export const CUP_PHASE_ORDER = PHASE_ORDER;
