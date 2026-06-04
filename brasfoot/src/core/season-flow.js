// Fluxo de rodada e temporada.
//
// Orquestra tudo que acontece entre cliques do "Jogar Rodada":
//   - Pré-temporada (estaduais) e nacional (Brasileirão A/B/C + Copa).
//   - Coleta de partidas paralelas, transição de fases da Copa e da Série C.
//   - Pós-rodada (finanças, IA de mercado, manchetes, save) e virada de
//     temporada (showSeasonRecap).
//
// Módulo puro de orquestração: main.js registra `render` e `log` via
// `registerSeasonFlowHooks` e a partir daí esquece do game-loop.

import { state, ui, rng } from "./store.js";
import { fmt } from "../ui/format.js";
import { applyMatchResult, getCurrentRound, decrementSuspensions, getMatchesOfRound, recalcTopScorers } from "../engine/season.js";
import { simulateMatch, createMatchSimulator } from "../engine/match.js";
import { weeklyTick } from "../engine/finance.js";
import { runAITransfers, generateIncomingOffers, generateTransferRequests, getTransferWindowStatus } from "../engine/transfers.js";
import { isSeasonOver, endSeason } from "../engine/season-end.js";
import { generateNewsForRound, generateSeasonEndNews } from "../engine/news.js";
import {
  createCupCompetition, getCupLegsForRound, maybeDrawNextPhase, drawPhase,
  payPhasePrizes, CUP_PHASE_ORDER, CHAMPION_BONUS,
} from "../engine/cup.js";
import {
  createSerieCGroups, createSerieCFinal, decideSerieCChampion, getSerieCPromoted,
  SERIE_C_STAGE_IDS,
} from "../engine/serie-c.js";
import {
  getEstadualMatchesForRound, advanceEstadualPhase, estadualTotalRounds,
  createEstaduais,
} from "../engine/estadual.js";
import { applyTraining, TRAINING_FOCI } from "../engine/training.js";
import { validateLineup, autoLineup } from "../engine/lineup-helpers.js";
import { saveGame } from "../db.js";
import { showCupDrawModal, showEstadualDrawModal, showPenaltyShootoutModal, showSeasonRecapModal } from "../ui/modals.js";
import { playMatchOnScreen } from "../ui/match-screen.js";
import { applyCupLegToState, applyEstadualMatchResult } from "./match-apply.js";

// -------------------- Hooks externos (render + log) --------------------
let _hooks = { render: () => {}, log: () => {} };
export function registerSeasonFlowHooks(hooks) {
  _hooks = { ..._hooks, ...hooks };
}
const render = (...args) => _hooks.render(...args);
const log = (msg) => _hooks.log(msg);

// =====================================================================
// Pré-temporada · Estaduais
// =====================================================================

export function getUserEstadual() {
  const team = state.teams[ui.myTeamId];
  if (!team || !state.estaduais) return null;
  return state.estaduais[team.state] || null;
}

export function getMaxEstadualRound() {
  const es = state.estaduais || {};
  const vals = Object.values(es).map(e => estadualTotalRounds(e));
  return vals.length ? Math.max(...vals) : 0;
}

// Coleta partidas de TODOS os estaduais nesta rodada (exceto a do usuário).
function collectEstadualParallels(round, excludeMatch) {
  const list = [];
  for (const e of Object.values(state.estaduais || {})) {
    for (const mm of getEstadualMatchesForRound(state, e, round)) {
      if (mm.match.played || mm.match === excludeMatch) continue;
      list.push({
        match: mm.match,
        isCup: false,
        compId: mm.compId,        // só pra grupos
        estadual: { uf: e.uf, kind: mm.kind },
      });
    }
  }
  return list;
}

function playEstadualWeek() {
  const maxRound = getMaxEstadualRound();
  const round = state.estadualRound || 1;

  // Sorteio dos grupos antes da estreia (só do estadual do usuário, 1x)
  const userEstForDraw = getUserEstadual();
  if (userEstForDraw && !userEstForDraw.drawShown && round === 1) {
    userEstForDraw.drawShown = true;
    showEstadualDrawModal(userEstForDraw, () => playEstadualWeek());
    return;
  }

  if (round > maxRound) {
    finishEstadualPhase();
    render();
    return;
  }

  // Jogo do usuário nesta rodada?
  const userEst = getUserEstadual();
  let userMatch = null;
  if (userEst) {
    const mm = getEstadualMatchesForRound(state, userEst, round)
      .find(m => !m.match.played && (m.match.homeTeamId === ui.myTeamId || m.match.awayTeamId === ui.myTeamId));
    if (mm) userMatch = mm;
  }

  if (userMatch) {
    const home = state.teams[userMatch.match.homeTeamId];
    const away = state.teams[userMatch.match.awayTeamId];
    const sim = createMatchSimulator({ homeTeam: home, awayTeam: away, playersById: state.players, rng });
    const parallels = collectEstadualParallels(round, userMatch.match);

    playMatchOnScreen(userMatch.match, sim, async () => {
      applyEstadualMatchResult(userMatch.match, sim.getResult(), { uf: userEst.uf, kind: userMatch.kind, compId: userMatch.compId });
      finalizeEstadualRound(round);
      try { await saveGame(state); } catch (e) { console.warn(e); }
      render();
    }, parallels);
  } else {
    // Usuário não joga — simula tudo da rodada
    simulateEstadualRoundInstant(round);
    finalizeEstadualRound(round);
    try { saveGame(state); } catch (e) { console.warn(e); }
    render();
  }
}

function simulateEstadualRoundInstant(round) {
  for (const e of Object.values(state.estaduais || {})) {
    for (const mm of getEstadualMatchesForRound(state, e, round)) {
      if (mm.match.played) continue;
      const r = simulateMatch({
        homeTeam: state.teams[mm.match.homeTeamId],
        awayTeam: state.teams[mm.match.awayTeamId],
        playersById: state.players, rng,
      });
      applyEstadualMatchResult(mm.match, r, { uf: e.uf, kind: mm.kind, compId: mm.compId });
    }
  }
}

function finalizeEstadualRound(round) {
  // Finanças: bilheteria dos jogos desta rodada + folha semanal
  const roundResults = [];
  for (const e of Object.values(state.estaduais || {})) {
    for (const mm of getEstadualMatchesForRound(state, e, round)) {
      if (mm.match.played && mm.match.score) {
        roundResults.push({
          homeTeamId: mm.match.homeTeamId,
          awayTeamId: mm.match.awayTeamId,
          score: mm.match.score,
        });
      }
    }
  }
  const tick = weeklyTick(state, roundResults, "estadual");
  const myRev = tick.revenues.find(r => r.teamId === ui.myTeamId);
  const myWages = tick.wages.find(w => w.teamId === ui.myTeamId);
  if (myWages) {
    log(`Pré-temporada R${round}${myRev ? ` · bilheteria +R$ ${fmt(myRev.revenue)}` : ""} · folha -R$ ${fmt(myWages.wagesPaid)}.`);
  }

  // Avança fases de cada estadual (grupos→semis→final→campeão)
  for (const e of Object.values(state.estaduais || {})) {
    advanceEstadualPhase(state, e, state.season, rng);
  }
  state.estadualRound = round + 1;

  // Acabou a pré-temporada?
  if (state.estadualRound > getMaxEstadualRound()) {
    finishEstadualPhase();
  }
}

function finishEstadualPhase() {
  // Garante que todos os estaduais terminaram (simula resto se faltou)
  const maxRound = getMaxEstadualRound();
  for (let r = (state.estadualRound || 1); r <= maxRound; r++) {
    simulateEstadualRoundInstant(r);
    for (const e of Object.values(state.estaduais || {})) {
      advanceEstadualPhase(state, e, state.season, rng);
    }
  }

  // Premia campeões estaduais (valor varia por estadual: e.prize)
  for (const e of Object.values(state.estaduais || {})) {
    if (!e.champion) continue;
    const champ = state.teams[e.champion];
    const prize = e.prize ?? 3_000_000;
    champ.trophies.push({ competitionId: `estadual_${e.uf.toLowerCase()}`, season: state.season });
    champ.finances.balance += prize;
    state.inbox = state.inbox || [];
    state.inbox.push({
      id: `n_estadual_${e.uf}_${state.season}`,
      date: state.currentDate, type: "season",
      priority: e.champion === ui.myTeamId ? "high" : "normal",
      subject: `🏆 ${champ.name} é campeão do ${e.name} ${state.season}`,
      body: `${champ.name} conquistou o ${e.name}. Prêmio: R$ ${fmt(prize)}.`,
      read: false, teamFocus: e.champion,
    });
    log(`🏆 ${champ.shortName} campeão do ${e.name}!`);
  }

  // Transição pra temporada nacional
  state.seasonPhase = "national";
  state.estadualRound = 1;
  log(`Pré-temporada encerrada. Começa o Brasileirão ${state.season}!`);
}

// =====================================================================
// Rodada nacional (Brasileirão + Copa) — paralelos ao vivo
// =====================================================================

// Cada clique do usuário joga UMA partida ao vivo, mas TODAS as outras
// partidas da rodada (das duas séries e da copa) acontecem em paralelo,
// tickando minuto a minuto junto com a sua. Ao fim do jogo do usuário,
// todos os outros resultados já estão prontos. Se for o último compromisso
// do usuário na rodada, finanças/notícias/IA de mercado rodam aqui.
export function playRound() {
  // Pré-temporada: estaduais antes do nacional
  if (state.seasonPhase === "estadual") {
    playEstadualWeek();
    return;
  }

  const comp = state.competitions[ui.myCompId];
  const round = getCurrentRound(comp);
  if (round == null) return;

  const cup = state.competitions.copa_brasil;
  if (cup) maybeDrawNextPhase(cup, round - 1, rng, state.teams);

  const next = findNextUserCommitment(round);
  if (!next) {
    // Sem partidas do usuário nesta rodada — simula IA e fecha a semana.
    finalizeRound(round);
    return;
  }

  // Se for partida de Copa numa fase cujo sorteio ainda não foi exibido,
  // mostra o sorteio antes de partir pra simulação.
  if (next.isCup && cup) {
    const phaseKey = next.match.phase;
    cup.drawsShown = cup.drawsShown || [];
    const myTieInPhase = cup.phases[phaseKey]?.ties?.some(t =>
      t.teamAId === ui.myTeamId || t.teamBId === ui.myTeamId
    );
    if (myTieInPhase && !cup.drawsShown.includes(phaseKey)) {
      cup.drawsShown.push(phaseKey);
      showCupDrawModal(cup, phaseKey, () => proceedToMatch(next, round));
      return;
    }
  }

  proceedToMatch(next, round);
}

function proceedToMatch(next, round) {
  const comp = state.competitions[ui.myCompId];
  const home = state.teams[next.match.homeTeamId];
  const away = state.teams[next.match.awayTeamId];
  const sim = createMatchSimulator({
    homeTeam: home, awayTeam: away, playersById: state.players, rng,
  });
  const parallels = collectParallelMatches(round, next.match);

  playMatchOnScreen(next.match, sim, async () => {
    const result = sim.getResult();
    if (next.isCup) {
      applyCupLegToState(next.match, result);
      log(`🏆 Copa: ${state.teams[next.match.homeTeamId].shortName} ${result.score.home}×${result.score.away} ${state.teams[next.match.awayTeamId].shortName}`);
    } else {
      applyMatchResult(state, next.match, result, comp);
    }

    // Pênaltis quando o tie acabou com decisão e envolve o usuário
    const cup = state.competitions.copa_brasil;
    const tie = cup?.phases[next.match.phase]?.ties.find(t => t.id === next.match.cupTieId);
    const userInTie = tie && (tie.teamAId === ui.myTeamId || tie.teamBId === ui.myTeamId);
    if (next.isCup && tie?.penalties && userInTie && !tie.penaltiesShown) {
      tie.penaltiesShown = true;
      showPenaltyShootoutModal(tie, async () => {
        await afterUserMatchFlow(round);
      });
      return;
    }

    await afterUserMatchFlow(round);
  }, parallels);
}

async function afterUserMatchFlow(round) {
  const stillHasUserMatch = findNextUserCommitment(round) !== null;
  if (!stillHasUserMatch) {
    await closeWeek(round);
  } else {
    try { await saveGame(state); } catch (e) { console.warn("Save falhou:", e); }
  }
  render();
}

// Coleta partidas ainda não jogadas desta rodada (excluindo a do usuário)
// para tickarem em paralelo durante o playback ao vivo.
function collectParallelMatches(round, excludeMatch) {
  const list = [];
  const cup = state.competitions.copa_brasil;
  if (cup) {
    for (const leg of getCupLegsForRound(cup, round)) {
      // Identidade do objeto, NÃO por id (IDs podem se repetir entre competições)
      if (!leg.played && leg !== excludeMatch) {
        list.push({ match: leg, isCup: true, compId: "copa_brasil" });
      }
    }
  }
  // Ligas + sub-comps da Série C
  const leagueIds = ["brasileirao_a", "brasileirao_b", ...SERIE_C_STAGE_IDS];
  for (const compId of leagueIds) {
    const c = state.competitions[compId];
    if (!c) continue;
    for (const m of getMatchesOfRound(c, round)) {
      if (!m.played && m !== excludeMatch) {
        list.push({ match: m, isCup: false, compId });
      }
    }
  }
  return list;
}

// Próximo compromisso do USUÁRIO na rodada atual. Copa antes, liga depois.
export function findNextUserCommitment(round) {
  const comp = state.competitions[ui.myCompId];
  if (!comp) return null;
  const cup = state.competitions.copa_brasil;

  if (cup) {
    const myCupLeg = getCupLegsForRound(cup, round)
      .find(l => !l.played && (l.homeTeamId === ui.myTeamId || l.awayTeamId === ui.myTeamId));
    if (myCupLeg) return { isCup: true, match: myCupLeg };
  }

  const myLeagueMatch = getMatchesOfRound(comp, round)
    .find(m => !m.played && (m.homeTeamId === ui.myTeamId || m.awayTeamId === ui.myTeamId));
  if (myLeagueMatch) return { isCup: false, match: myLeagueMatch };

  return null;
}

// =====================================================================
// Fechamento da semana (pós-última partida do usuário)
// =====================================================================

// Roda quando todas as partidas da rodada já estão jogadas (paralelas incluídas).
// Cuida de finanças, notícias, IA de mercado, virada de temporada e save.
async function closeWeek(round) {
  const allResults = gatherRoundResults(round);

  // Recalcula artilharia de todas as competições
  for (const compId of ["brasileirao_a", "brasileirao_b", ...SERIE_C_STAGE_IDS]) {
    const comp = state.competitions[compId];
    if (comp) recalcTopScorers(comp, state.players);
  }

  // Treinamento semanal — aplica foco escolhido pra cada time
  for (const teamId of Object.keys(state.teams)) {
    const result = applyTraining(state, teamId, rng);
    if (teamId === ui.myTeamId && result) {
      const focusName = TRAINING_FOCI[result.focusKey]?.label || "—";
      if (result.totalGains > 0) {
        log(`🏋️ Treino (${focusName}): ${result.totalGains} ganho${result.totalGains > 1 ? "s" : ""} de atributo em ${result.playerGains.size} jogador${result.playerGains.size > 1 ? "es" : ""}.`);
      } else if (result.rested > 0) {
        log(`🧊 Recuperação: ${result.rested} jogadores recuperaram fitness e forma.`);
      }
      // Manchete só pra ganhos grandes (5+) — evita spam semanal
      if (result.totalGains >= 5) {
        state.inbox = state.inbox || [];
        state.inbox.push({
          id: `n_train_${state.currentDate}_${round}`,
          date: state.currentDate, type: "highlight", priority: "normal",
          subject: `🏋️ ${result.totalGains} ganhos de atributo no treino de ${focusName}`,
          body: `Sua semana de treino rendeu evolução para ${result.playerGains.size} jogadores. Confira a aba Escalação pra ver quem cresceu.`,
          read: false, teamFocus: ui.myTeamId,
        });
      }
    }
  }

  // Transições de fase da Série C
  advanceSerieCIfNeeded();

  // Premiação por fase da Copa — paga quem ENTROU em cada fase, idempotente
  const cup = state.competitions.copa_brasil;
  if (cup) {
    for (const phaseKey of CUP_PHASE_ORDER) {
      const result = payPhasePrizes(state, cup, phaseKey);
      if (result) {
        const myReceived = result.teams.includes(ui.myTeamId);
        if (myReceived) {
          log(`💰 Cota da Copa (${result.phaseName}): +R$ ${fmt(result.prize)}.`);
        }
      }
    }
  }

  // Campeão da Copa?
  if (cup && cup.phases.final?.complete && !cup.champion) {
    const finalTie = cup.phases.final.ties[0];
    cup.champion = finalTie.winnerId;
    state.teams[cup.champion].trophies.push({ competitionId: "copa_brasil", season: state.season });
    // Bônus do campeão (além do prêmio de chegar à final, que já foi pago)
    state.teams[cup.champion].finances.balance += CHAMPION_BONUS;
    log(`🏆 ${state.teams[cup.champion].name} é CAMPEÃO DA COPA DO BRASIL ${state.season}! (+R$ ${fmt(CHAMPION_BONUS)})`);
    state.inbox = state.inbox || [];
    state.inbox.push({
      id: `n_cup_champ_${state.season}`,
      date: state.currentDate, type: "season", priority: "high",
      subject: `🏆 ${state.teams[cup.champion].name} conquista a Copa do Brasil ${state.season}!`,
      body: `Após vencer ${state.teams[finalTie.teamAId === cup.champion ? finalTie.teamBId : finalTie.teamAId].name} no agregado da final, o ${state.teams[cup.champion].name} levantou a taça da Copa do Brasil. Bônus de campeão: R$ ${fmt(CHAMPION_BONUS)}.`,
      read: false, teamFocus: cup.champion,
    });
  }

  // Finanças
  const tick = weeklyTick(state, allResults, ui.myCompId);
  const myRev = tick.revenues.find(r => r.teamId === ui.myTeamId);
  const myWages = tick.wages.find(w => w.teamId === ui.myTeamId);
  log(`Rodada ${round} fechada · ${myRev ? `bilheteria +R$ ${fmt(myRev.revenue)} · ` : ""}folha -R$ ${fmt(myWages.wagesPaid)}.`);

  // Suspensões + IA de mercado (só durante janela)
  decrementSuspensions(state, allResults.flatMap(r => [r.homeTeamId, r.awayTeamId]));
  const aiMoves = runAITransfers(state, rng, { excludeTeamId: ui.myTeamId, currentRound: round });
  for (const m of aiMoves) log(`🔁 ${m.message}`);

  // Mercado em duas vias: IA propõe pelos jogadores do usuário (só na janela)
  const newOffers = generateIncomingOffers(state, rng, ui.myTeamId, round);
  for (const offer of newOffers) {
    const fromTeam = state.teams[offer.fromTeamId];
    log(`📩 Proposta: ${fromTeam.shortName} oferece R$ ${fmt(offer.fee)} por ${offer.playerName}.`);
    state.inbox = state.inbox || [];
    state.inbox.push({
      id: `n_offer_${offer.id}`,
      date: state.currentDate, type: "transfer",
      priority: offer.fee >= 30_000_000 ? "high" : "normal",
      subject: `📩 ${fromTeam.name} oferece R$ ${fmt(offer.fee)} por ${offer.playerName}`,
      body: `Salário oferecido: R$ ${fmt(offer.salaryOffer)}/mês. Acesse o Mercado para aceitar, contrapor ou recusar. (Expira em 4 rodadas.)`,
      read: false, teamFocus: ui.myTeamId,
    });
  }

  // Pedidos de transferência (jogadores insatisfeitos pedem pra sair)
  const newRequests = generateTransferRequests(state, rng, ui.myTeamId, round);
  for (const req of newRequests) {
    const reasonLabel = ({
      very_low_morale: "moral muito baixa",
      low_morale: "moral baixa",
      veteran_unhappy: "veterano insatisfeito",
    })[req.reason] || "insatisfação";
    log(`🔻 ${req.playerName} pediu para sair (${reasonLabel}).`);
    state.inbox = state.inbox || [];
    state.inbox.push({
      id: `n_req_${req.id}`,
      date: state.currentDate, type: "transfer", priority: "high",
      subject: `🔻 ${req.playerName} pediu para sair do clube`,
      body: `Motivo: ${reasonLabel}. No Mercado você pode listá-lo pra venda, prometer mais espaço (acalma) ou recusar (perde moral).`,
      read: false, teamFocus: ui.myTeamId,
    });
  }

  // Inbox: notifica janela abrindo/fechando
  const winStatus = getTransferWindowStatus(round);
  const prevWinStatus = state._prevWindowOpen;
  if (prevWinStatus !== winStatus.open) {
    state._prevWindowOpen = winStatus.open;
    state.inbox.push({
      id: `n_window_${round}_${winStatus.open}`,
      date: state.currentDate, type: "transfer", priority: "normal",
      subject: winStatus.open ? `${winStatus.icon} Janela de transferências ABERTA` : `${winStatus.icon} Janela de transferências FECHADA`,
      body: winStatus.label,
      read: false,
    });
  }

  // Manchetes
  generateNewsForRound(state, round, allResults, ui.myTeamId);

  validateLineup();

  // Virada de temporada
  if (isSeasonOver(state) && (!cup || cup.champion || !cup.phases.final.ties.length)) {
    const report = endSeason(state, rng);
    generateSeasonEndNews(state, report);
    state.competitions.copa_brasil = createCupCompetition({
      season: state.season,
      allTeams: state.teams,
      libertaQualifiers: report.libertaQualifiers || null,
      seriesATeamIds: state.competitions.brasileirao_a.teams,
    });
    showSeasonRecap(report);
  }

  try { await saveGame(state); } catch (e) { console.warn("Save falhou:", e); }
}

// Reconstrói a lista de resultados a partir das fixtures já jogadas da rodada.
function gatherRoundResults(round) {
  const results = [];
  for (const compId of ["brasileirao_a", "brasileirao_b", ...SERIE_C_STAGE_IDS]) {
    const comp = state.competitions[compId];
    if (!comp) continue;
    for (const m of getMatchesOfRound(comp, round)) {
      if (m.played) results.push(toResultShape(m));
    }
  }
  const cup = state.competitions.copa_brasil;
  if (cup) {
    for (const leg of getCupLegsForRound(cup, round)) {
      if (leg.played) results.push(toResultShape(leg));
    }
  }
  return results;
}

// Detecta fim de fase da Série C e cria a próxima.
// Também ajusta ui.myCompId se o usuário avançar de fase.
function advanceSerieCIfNeeded() {
  const meta = state.serieCMeta;
  if (!meta || meta.currentPhase === "done") return;

  // Fase 1 → Grupos
  if (meta.currentPhase === "phase1") {
    const p1 = state.competitions.brasileirao_c_p1;
    if (p1 && p1.fixtures.every(m => m.played)) {
      const { groupA, groupB, relegated } = createSerieCGroups({
        season: state.season,
        phase1: p1,
      });
      state.competitions.brasileirao_c_ga = groupA;
      state.competitions.brasileirao_c_gb = groupB;
      meta.relegated = relegated;
      meta.currentPhase = "groups";

      // Se o usuário está na Série C e classificou, atualiza ui.myCompId
      if (ui.myCompId === "brasileirao_c_p1") {
        if (groupA.teams.includes(ui.myTeamId)) ui.myCompId = "brasileirao_c_ga";
        else if (groupB.teams.includes(ui.myTeamId)) ui.myCompId = "brasileirao_c_gb";
        // Senão: time eliminado, ui.myCompId permanece em p1 (sem mais jogos)
      }

      log(`Série C → Quadrangulares definidos. Grupo A: ${groupA.teams.map(id => state.teams[id].shortName).join(", ")}. Grupo B: ${groupB.teams.map(id => state.teams[id].shortName).join(", ")}.`);
    }
  }
  // Grupos → Final
  else if (meta.currentPhase === "groups") {
    const ga = state.competitions.brasileirao_c_ga;
    const gb = state.competitions.brasileirao_c_gb;
    const gaDone = ga && ga.fixtures.every(m => m.played);
    const gbDone = gb && gb.fixtures.every(m => m.played);
    if (gaDone && gbDone) {
      meta.promoted = getSerieCPromoted({ groupA: ga, groupB: gb });
      const finalComp = createSerieCFinal({ season: state.season, groupA: ga, groupB: gb });
      state.competitions.brasileirao_c_final = finalComp;
      meta.currentPhase = "final";

      if ([ui.myCompId, "brasileirao_c_ga", "brasileirao_c_gb"].includes(ui.myCompId)) {
        if (finalComp.teams.includes(ui.myTeamId)) ui.myCompId = "brasileirao_c_final";
      }

      log(`Série C → Final: ${state.teams[finalComp.teamAId].name} × ${state.teams[finalComp.teamBId].name}. Promovidos para a Série B: ${meta.promoted.map(id => state.teams[id].shortName).join(", ")}.`);
    }
  }
  // Final → Campeão
  else if (meta.currentPhase === "final") {
    const fn = state.competitions.brasileirao_c_final;
    if (fn && fn.fixtures.every(m => m.played) && !meta.champion) {
      const champId = decideSerieCChampion(fn, rng);
      meta.champion = champId;
      meta.currentPhase = "done";
      state.teams[champId].trophies.push({ competitionId: "brasileirao_c", season: state.season });
      log(`🏆 ${state.teams[champId].name} é CAMPEÃO DA SÉRIE C ${state.season}!`);
      state.inbox = state.inbox || [];
      state.inbox.push({
        id: `n_serie_c_champ_${state.season}`,
        date: state.currentDate, type: "season", priority: "high",
        subject: `🏆 ${state.teams[champId].name} conquista a Série C ${state.season}!`,
        body: `No agregado da final, o ${state.teams[champId].name} levou a taça da Série C. Promovidos à Série B: ${meta.promoted.map(id => state.teams[id]?.name).join(", ")}.`,
        read: false, teamFocus: champId,
      });
    }
  }
}

function toResultShape(m) {
  return {
    homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId,
    score: m.score, events: m.events,
    stats: m.stats, lineups: m.lineups,
  };
}

// Roda quando o usuário não tem partida na rodada — simula tudo e fecha.
async function finalizeRound(round) {
  const allResults = [];
  const cup = state.competitions.copa_brasil;

  // 1. Simula partidas pendentes das DUAS competições da liga (rodada atual)
  for (const compId of ["brasileirao_a", "brasileirao_b"]) {
    const comp = state.competitions[compId];
    if (!comp) continue;
    const matches = getMatchesOfRound(comp, round).filter(m => !m.played);
    for (const m of matches) {
      const r = simulateMatch({
        homeTeam: state.teams[m.homeTeamId],
        awayTeam: state.teams[m.awayTeamId],
        playersById: state.players, rng,
      });
      applyMatchResult(state, m, r, comp);
      allResults.push(r);
    }
    recalcTopScorers(comp, state.players);
  }

  // 2. Simula legs da Copa do Brasil agendados para esta rodada
  if (cup) {
    const legs = getCupLegsForRound(cup, round).filter(l => !l.played);
    for (const leg of legs) {
      const r = simulateMatch({
        homeTeam: state.teams[leg.homeTeamId],
        awayTeam: state.teams[leg.awayTeamId],
        playersById: state.players, rng,
      });
      applyCupLegToState(leg, r);
      allResults.push(r);
    }
    // Define campeão se a final terminou
    if (cup.phases.final?.complete && !cup.champion) {
      const finalTie = cup.phases.final.ties[0];
      cup.champion = finalTie.winnerId;
      state.teams[cup.champion].trophies.push({ competitionId: "copa_brasil", season: state.season });
      log(`🏆 ${state.teams[cup.champion].name} é CAMPEÃO DA COPA DO BRASIL ${state.season}!`);
      state.inbox = state.inbox || [];
      state.inbox.push({
        id: `n_cup_champ_${state.season}`,
        date: state.currentDate, type: "season", priority: "high",
        subject: `🏆 ${state.teams[cup.champion].name} conquista a Copa do Brasil ${state.season}!`,
        body: `Após vencer ${state.teams[finalTie.teamAId === cup.champion ? finalTie.teamBId : finalTie.teamAId].name} no agregado da final, o ${state.teams[cup.champion].name} levantou a taça da Copa do Brasil.`,
        read: false, teamFocus: cup.champion,
      });
    }
  }

  // 3. Finanças
  const tick = weeklyTick(state, allResults, ui.myCompId);
  const myRev = tick.revenues.find(r => r.teamId === ui.myTeamId);
  const myWages = tick.wages.find(w => w.teamId === ui.myTeamId);
  log(`Rodada ${round} fechada · ${myRev ? `bilheteria +R$ ${fmt(myRev.revenue)} · ` : ""}folha -R$ ${fmt(myWages.wagesPaid)}.`);

  // 4. Suspensões + IA de mercado
  decrementSuspensions(state, allResults.flatMap(r => [r.homeTeamId, r.awayTeamId]));
  const aiMoves = runAITransfers(state, rng, { excludeTeamId: ui.myTeamId });
  for (const m of aiMoves) log(`🔁 ${m.message}`);

  // 5. Manchetes
  generateNewsForRound(state, round, allResults, ui.myTeamId);

  validateLineup();

  // 6. Virada de temporada
  if (isSeasonOver(state) && (!cup || cup.champion || !cup.phases.final.ties.length)) {
    const report = endSeason(state, rng);
    generateSeasonEndNews(state, report);
    state.competitions.copa_brasil = createCupCompetition({
      season: state.season,
      allTeams: state.teams,
      libertaQualifiers: report.libertaQualifiers || null,
      seriesATeamIds: state.competitions.brasileirao_a.teams,
    });
    showSeasonRecap(report);
  }

  // 7. Persiste
  try { await saveGame(state); } catch (e) { console.warn("Save falhou:", e); }
  render();
}

// =====================================================================
// Recuperação: força conclusão da temporada (botão de pânico)
// =====================================================================

// Resolução forçada: garante que todas as competições terminem (sorteia
// fases pendentes da copa e simula tudo), dispara endSeason e cria a
// nova temporada. Usado como fallback se a temporada travar.
export async function forceResolveSeason() {
  const cup = state.competitions.copa_brasil;

  // 1. Tenta sortear e jogar todas as fases da copa pendentes (em ordem)
  if (cup) {
    for (const phaseKey of cup.phaseOrder) {
      const phase = cup.phases[phaseKey];
      if (!phase.ties.length) {
        try { drawPhase(cup, phaseKey, rng, state.teams); }
        catch (e) { console.warn("Não foi possível sortear", phaseKey, e); break; }
      }
      for (const tie of phase.ties) {
        for (const leg of tie.legs) {
          if (!leg.played) {
            const r = simulateMatch({
              homeTeam: state.teams[leg.homeTeamId],
              awayTeam: state.teams[leg.awayTeamId],
              playersById: state.players, rng,
            });
            applyCupLegToState(leg, r);
          }
        }
      }
    }
    // Define campeão se a final foi completada
    if (cup.phases.final?.complete && !cup.champion) {
      const finalTie = cup.phases.final.ties[0];
      cup.champion = finalTie.winnerId;
      state.teams[cup.champion].trophies.push({ competitionId: "copa_brasil", season: state.season });
      log(`🏆 ${state.teams[cup.champion].name} é CAMPEÃO DA COPA DO BRASIL ${state.season}!`);
    }
  }

  // 2. Garante que as duas ligas + Série C estão 100% jogadas
  //    (loop interno porque fases da C só criam ao terminar a anterior)
  for (let pass = 0; pass < 4; pass++) {
    for (const compId of ["brasileirao_a", "brasileirao_b", ...SERIE_C_STAGE_IDS]) {
      const comp = state.competitions[compId];
      if (!comp) continue;
      for (const m of comp.fixtures) {
        if (!m.played) {
          const r = simulateMatch({
            homeTeam: state.teams[m.homeTeamId],
            awayTeam: state.teams[m.awayTeamId],
            playersById: state.players, rng,
          });
          applyMatchResult(state, m, r, comp);
        }
      }
      recalcTopScorers(comp, state.players);
    }
    advanceSerieCIfNeeded();
  }

  // 3. Dispara endSeason e cria nova copa
  const report = endSeason(state, rng);
  generateSeasonEndNews(state, report);
  state.competitions.copa_brasil = createCupCompetition({
    season: state.season,
    allTeams: state.teams,
    libertaQualifiers: report.libertaQualifiers || null,
    seriesATeamIds: state.competitions.brasileirao_a.teams,
  });
  showSeasonRecap(report);

  try { await saveGame(state); } catch (e) { console.warn("Save falhou:", e); }
  render();
}

// =====================================================================
// Virada de temporada
// =====================================================================

function showSeasonRecap(report) {
  try {
    const champA = state.teams[report.champions.brasileirao_a]?.name ?? "?";
    const champB = state.teams[report.champions.brasileirao_b]?.name ?? "?";
    const champCId = state.serieCMeta?.champion;
    const champC = champCId ? state.teams[champCId]?.name : null;
    const relegated = (report.relegated || []).map(id => state.teams[id]?.shortName).filter(Boolean).join(", ") || "—";
    const promoted = (report.promoted || []).map(id => state.teams[id]?.shortName).filter(Boolean).join(", ") || "—";
    const relegatedToC = (report.relegatedToC || []).map(id => state.teams[id]?.shortName).filter(Boolean).join(", ") || "—";
    const promotedFromC = (report.promotedFromC || []).map(id => state.teams[id]?.shortName).filter(Boolean).join(", ") || "—";

    log(`🏆 Fim da temporada ${report.season}. Campeão A: ${champA}. Campeão B: ${champB}.${champC ? ` Campeão C: ${champC}.` : ""}`);
    log(`A↔B: ⬇️ ${relegated} ⬆️ ${promoted}. B↔C: ⬇️ ${relegatedToC} ⬆️ ${promotedFromC}.`);
    log(`👋 ${report.retired.length} aposentadorias · ${report.freeAgents.length} contratos vencidos.`);

    // Atualiza ui.myCompId com base na nova divisão do usuário.
    const newMyComp = resolveUserCompetition();
    if (newMyComp) {
      ui.myCompId = newMyComp;
      ui.standingsView = ui.myCompId;
    }

    // Reescala automaticamente para a próxima temporada
    if (state.teams[ui.myTeamId]) {
      state.teams[ui.myTeamId].lineup = autoLineup(state.teams[ui.myTeamId]);
    }

    // Recria estaduais e volta pra pré-temporada da nova temporada.
    for (const cid of Object.keys(state.competitions)) {
      if (cid.startsWith("estadual_")) delete state.competitions[cid];
    }
    state.estaduais = createEstaduais(state, state.season, rng);
    state.seasonPhase = "estadual";
    state.estadualRound = 1;

    const myCompName = state.competitions[ui.myCompId]?.name ?? "—";
    // Modal visual (substitui o antigo alert de texto). Recebe IDs pra
    // renderizar escudos; o estado da nova temporada já foi montado acima,
    // então quando o usuário fecha o modal a UI re-renderiza atualizada.
    showSeasonRecapModal({
      season: report.season,
      nextSeason: state.season,
      myCompName,
      champA: report.champions.brasileirao_a,
      champB: report.champions.brasileirao_b,
      champC: champCId || null,
      promoted: report.promoted || [],
      relegated: report.relegated || [],
      promotedFromC: report.promotedFromC || [],
      relegatedToC: report.relegatedToC || [],
      retiredCount: report.retired.length,
      freeAgentsCount: report.freeAgents.length,
    }, () => render());
  } catch (e) {
    console.error("Erro no showSeasonRecap:", e);
    const fallback = resolveUserCompetition();
    if (fallback) { ui.myCompId = fallback; ui.standingsView = ui.myCompId; }
  }
}

// Descobre em qual competição o time do usuário está participando agora.
export function resolveUserCompetition() {
  if (!ui.myTeamId) return null;
  const compsToCheck = ["brasileirao_a", "brasileirao_b", "brasileirao_c_p1"];
  for (const cid of compsToCheck) {
    const c = state.competitions[cid];
    if (c?.teams?.includes(ui.myTeamId)) return cid;
  }
  return null;
}
