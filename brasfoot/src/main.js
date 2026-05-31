// Dashboard unificado — integra escalação, classificação, mercado, finanças
// e tela de jogo com playback minuto a minuto.

import { createRng } from "./utils/rng.js";
import { createTeam } from "./models/team.js";
import { generateSquad, syncPlayerIdCounter } from "./models/player.js";
import { createCompetition } from "./models/competition.js";
import {
  getCurrentRound, decrementSuspensions, getMatchesOfRound,
  applyMatchResult, recalcTopScorers, applyMatchEffects,
} from "./engine/season.js";
import { simulateMatch, createMatchSimulator, FORMATIONS } from "./engine/match.js";
import { weeklyTick } from "./engine/finance.js";
import {
  makeBid, signFreeAgent, generateFreeAgents,
  runAITransfers, renewContract, getRenewalExpectation,
  generateIncomingOffers, respondToOffer,
  generateTransferRequests, resolveTransferRequest, unlistPlayer,
  isTransferWindowOpen, getTransferWindowStatus,
} from "./engine/transfers.js";
import { isSeasonOver, endSeason } from "./engine/season-end.js";
import { generateNewsForRound, generateSeasonEndNews } from "./engine/news.js";
import {
  createCupCompetition, getCupLegsForRound, applyCupLegResult,
  maybeDrawNextPhase, drawPhase, payPhasePrizes,
  CUP_PHASE_ORDER, CHAMPION_BONUS,
} from "./engine/cup.js";
import {
  createSerieCPhase1, createSerieCGroups, createSerieCFinal,
  decideSerieCChampion, getSerieCPromoted,
  SERIE_C_STAGE_IDS, isSerieCStage,
} from "./engine/serie-c.js";
import {
  generateSeasonalYouth, promoteProspect, sellProspect, releaseProspect,
  ensureAcademy, MAX_ACADEMY_SLOTS,
} from "./engine/academy.js";
import {
  applyTraining, pickAITrainingFocus, TRAINING_FOCI,
} from "./engine/training.js";
import {
  createEstaduais, getEstadualMatchesForRound, advanceEstadualPhase,
  applyEstadualKnockoutResult, estadualTotalRounds, isEstadualDone,
  ESTADUAL_STATES,
} from "./engine/estadual.js";
import { saveGame, loadGame, listSaves, deleteSave } from "./db.js";
import { SERIE_A_SEED, SERIE_B_SEED, SERIE_C_SEED } from "../data/teams.seed.js";
import { state, rng, setState, setRng, ui } from "./core/store.js";
import { fmt, ovrClass, teamLogo } from "./ui/format.js";
import { applyTeamTheme } from "./ui/theme.js";
import {
  openMatchDetail, wirePlayerClicks,
  showPenaltyShootoutModal, showEstadualDrawModal, showCupDrawModal,
  registerModalActions,
} from "./ui/modals.js";
import { renderFinance } from "./ui/views/finance.js";
import { renderInbox } from "./ui/views/inbox.js";
import { renderAcademy } from "./ui/views/academy.js";
import { renderCalendar } from "./ui/views/calendar.js";
import { renderCup } from "./ui/views/cup.js";
import { renderLineup } from "./ui/views/lineup.js";
import { renderStandings } from "./ui/views/standings.js";
import { renderMarket } from "./ui/views/market.js";
import { autoLineup, validateLineup, findNextMatch } from "./engine/lineup-helpers.js";

// -------------------- Constantes --------------------
// POS_GROUP, scoutBestXI, autoLineup, findNextMatch → engine/lineup-helpers.js
// fmt, ovrClass, pct, teamLogo → ui/format.js
// applyTeamTheme + helpers de cor → ui/theme.js

const COMPS = {
  brasileirao_a: { name: "Brasileirão Série A", tier: 1, seed: SERIE_A_SEED },
  brasileirao_b: { name: "Brasileirão Série B", tier: 2, seed: SERIE_B_SEED },
};

// Stages internos da Série C (uma "competição lógica" abrindo subcompetições por fase)
const SERIE_C_DISPLAY_NAME = "Brasileirão Série C";

const VIEWS = [
  { id: "lineup",    label: "Escalação",     icon: "⚽" },
  { id: "standings", label: "Classificação", icon: "📊" },
  { id: "cup",       label: "Copa do Brasil",icon: "🏆" },
  { id: "calendar",  label: "Calendário",    icon: "📅" },
  { id: "market",    label: "Mercado",       icon: "💼" },
  { id: "academy",   label: "Base",          icon: "🌱" },
  { id: "finance",   label: "Finanças",      icon: "💰" },
  { id: "inbox",     label: "Inbox",         icon: "📰" },
];

// Estado da aba Calendário

// -------------------- Estado de UI local --------------------
// (state e rng vêm do core/store.js via live-binding; reatribuídos por setState/setRng)

const $main = document.getElementById("main");
const $topInfo = document.getElementById("topbar-info");
const $teamCard = document.getElementById("team-card");
const $nav = document.getElementById("nav");
const $btnPlay = document.getElementById("btn-play-round");
const $overlay = document.getElementById("match-overlay");
const $sidebar = document.getElementById("sidebar");
const $topbar = document.getElementById("topbar");

// -------------------- Boot --------------------
bootstrap();

// Registra callbacks que os modais precisam disparar de volta no main
registerModalActions({ onBid: handleBid });

async function bootstrap() {
  const saves = await listSaves();
  if (saves.length > 0) {
    renderBootScreen(saves[saves.length - 1]);
  } else {
    renderTeamPicker();
  }
}

function renderBootScreen(save) {
  $teamCard.innerHTML = "";
  $nav.innerHTML = "";
  $btnPlay.style.display = "none";
  $topInfo.innerHTML = "";

  const my = save.teams[save.managedTeamId];
  applyTeamTheme(my.colors); // já aplica o tema do save antes do "Continuar"
  $main.innerHTML = `
    <div class="view-title">Bem-vindo de volta</div>
    <div class="view-sub">Há um jogo em andamento. O que deseja fazer?</div>

    <div class="card" style="max-width:480px;margin-top:8px">
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px">
        <div style="width:48px;height:48px;border-radius:50%;background:${my.colors.primary};display:flex;align-items:center;justify-content:center;font-weight:800;color:${my.colors.secondary}">
          ${my.shortName}
        </div>
        <div>
          <div style="font-weight:700;font-size:16px">${my.name}</div>
          <div style="font-size:12px;color:var(--muted)">Temporada ${save.season} · Caixa R$ ${fmt(my.finances.balance)}</div>
        </div>
      </div>
      <div style="display:flex;gap:10px">
        <button class="btn" id="btn-continue-save" style="flex:1">▶  Continuar</button>
        <button class="btn btn-secondary" id="btn-new-game" style="flex:1">+ Novo Jogo</button>
      </div>
    </div>
  `;

  document.getElementById("btn-continue-save").onclick = () => loadIntoState(save);
  document.getElementById("btn-new-game").onclick = async () => {
    if (confirm("Apagar o save atual e começar um novo jogo?")) {
      await deleteSave(save.saveId);
      renderTeamPicker();
    }
  };
}

function loadIntoState(save) {
  setState(save);
  ui.myTeamId = save.managedTeamId;
  ui.myCompId = SERIE_A_SEED.some(t => t.id === ui.myTeamId) ? "brasileirao_a" : "brasileirao_b";
  // Após mudança de divisão por rebaixamento/acesso, recalcula
  if (!state.competitions[ui.myCompId]?.teams.includes(ui.myTeamId)) {
    ui.myCompId = Object.keys(state.competitions)
      .find(cid => state.competitions[cid].teams.includes(ui.myTeamId)) ?? ui.myCompId;
  }
  ui.standingsView = ui.myCompId;
  setRng(createRng(state.settings?.seed ?? Date.now()));
  syncPlayerIdCounter(state.players);

  applyTeamTheme(state.teams[ui.myTeamId].colors);

  $btnPlay.style.display = "";
  ui.view = "lineup";
  render();
}

function renderTeamPicker() {
  applyTeamTheme(null); // reseta para o verde padrão
  $teamCard.innerHTML = "";
  $nav.innerHTML = "";
  $btnPlay.style.display = "none";
  $topInfo.innerHTML = "";

  const tierBlock = (label, seed, accent) => `
    <div style="margin-bottom:28px">
      <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:1px;color:${accent};margin-bottom:14px;border-left:4px solid ${accent};padding-left:10px">
        ${label} · ${seed.length} clubes
      </h2>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px">
        ${seed.map(t => teamCard(t)).join("")}
      </div>
    </div>
  `;

  $main.innerHTML = `
    <div class="view-title">Escolha seu Clube</div>
    <div class="view-sub">60 clubes em 3 divisões disputam simultaneamente. Selecione o seu.</div>
    ${tierBlock("Série A", SERIE_A_SEED, "var(--accent)")}
    ${tierBlock("Série B", SERIE_B_SEED, "var(--accent-2)")}
    ${tierBlock("Série C", SERIE_C_SEED, "var(--warning)")}
  `;

  $main.querySelectorAll(".team-pick").forEach(card => {
    card.addEventListener("mouseenter", () => {
      card.style.transform = "translateY(-3px)";
      card.style.borderColor = "var(--accent)";
    });
    card.addEventListener("mouseleave", () => {
      card.style.transform = "";
      card.style.borderColor = "";
    });
    card.onclick = () => startGame(card.dataset.team);
  });
}

function teamCard(t) {
  return `
    <div class="card team-pick" data-team="${t.id}" style="cursor:pointer;border-top:4px solid ${t.colors.primary};transition:transform .15s,border-color .15s;padding:14px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
        ${teamLogo(t.id, 36, t)}
        <div style="min-width:0">
          <div style="font-weight:700;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${t.name}</div>
          <div style="font-size:11px;color:var(--muted)">${t.city}/${t.state}</div>
        </div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted);margin-top:4px">
        <span>Rep</span><b style="color:var(--text)">${t.reputation}</b>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted);margin-top:2px">
        <span>Caixa</span><b style="color:var(--accent)">R$ ${fmt(t.finances.balance)}</b>
      </div>
      <button class="btn btn-sm" style="width:100%;margin-top:10px">Dirigir</button>
    </div>
  `;
}

async function startGame(teamId) {
  ui.myTeamId = teamId;
  if (SERIE_A_SEED.some(t => t.id === teamId)) ui.myCompId = "brasileirao_a";
  else if (SERIE_B_SEED.some(t => t.id === teamId)) ui.myCompId = "brasileirao_b";
  else ui.myCompId = "brasileirao_c_p1"; // Série C começa na 1ª Fase
  ui.standingsView = ui.myCompId;
  const seed = Date.now() & 0xffffffff;
  setRng(createRng(seed));

  setState({
    saveId: `save_${Date.now()}`,
    season: 2026,
    currentDate: "2026-04-01",
    managedTeamId: ui.myTeamId,
    teams: {}, players: {}, freeAgents: [],
    competitions: {}, log: [],
    transferOffers: [],
    transferRequests: [],
    seasonPhase: "estadual",   // estadual (pré-temporada) → national
    estadualRound: 1,
    estaduais: null,
    settings: { difficulty: "normal", language: "pt-BR", seed },
  });

  // Cria todos os 60 times (Série A + B + C) e seus elencos
  for (const seed of [...SERIE_A_SEED, ...SERIE_B_SEED, ...SERIE_C_SEED]) {
    const team = createTeam(seed);
    for (const p of generateSquad(rng, team)) {
      state.players[p.id] = p;
      team.squad.push(p.id);
    }
    state.teams[team.id] = team;
  }

  // Cria as duas competições em paralelo
  for (const [compId, cfg] of Object.entries(COMPS)) {
    state.competitions[compId] = createCompetition({
      id: compId, name: cfg.name, tier: cfg.tier, season: 2026,
      teamIds: cfg.seed.map(t => t.id),
      rules: compId === "brasileirao_a"
        ? { relegation: 4, relegatedTo: "brasileirao_b" }
        : { promotion: 4, promotedTo: "brasileirao_a" },
    });
  }

  generateFreeAgents(state, rng, 60);

  // Promove a primeira leva de prospectos das categorias de base (1ª temporada)
  generateSeasonalYouth(state, rng);

  // Cria os estaduais (pré-temporada)
  state.estaduais = createEstaduais(state, 2026, rng);

  // Cria Série C (1ª Fase) — grupos e final são criados em runtime
  state.competitions.brasileirao_c_p1 = createSerieCPhase1({
    season: 2026,
    teamIds: SERIE_C_SEED.map(t => t.id),
  });
  state.serieCMeta = {
    currentPhase: "phase1",   // phase1 | groups | final | done
    champion: null,
    promoted: [],
    relegated: [],
  };

  // Cria Copa do Brasil para esta temporada
  state.competitions.copa_brasil = createCupCompetition({
    season: 2026,
    allTeams: state.teams,
    libertaQualifiers: null,
    seriesATeamIds: SERIE_A_SEED.map(t => t.id),
  });

  // Diversifica formações e foco de treino da IA (usuário começa em 4-3-3 + técnica)
  const aiFormations = Object.keys(FORMATIONS);
  for (const t of Object.values(state.teams)) {
    if (t.id !== ui.myTeamId) {
      t.tactics.formation = aiFormations[rng.int(0, aiFormations.length - 1)];
      t.tactics.training = pickAITrainingFocus(rng, t.tactics.formation);
    }
  }

  state.teams[ui.myTeamId].lineup = autoLineup(state.teams[ui.myTeamId]);

  applyTeamTheme(state.teams[ui.myTeamId].colors);

  try { await saveGame(state); } catch (e) { console.warn("Save inicial falhou:", e); }

  $btnPlay.style.display = "";
  ui.view = "lineup";
  render();
}

// -------------------- Render principal --------------------
function renderShell() {
  const my = state.teams[ui.myTeamId];
  // Se a competição atual sumiu (ex.: subcomps da Série C após endSeason),
  // recoloca o usuário na sua nova divisão antes de seguir.
  if (!state.competitions[ui.myCompId]) {
    const resolved = resolveUserCompetition();
    if (resolved) { ui.myCompId = resolved; ui.standingsView = ui.myCompId; }
  }
  const comp = state.competitions[ui.myCompId];
  if (!comp) {
    // Ainda nada — não trava a UI, apenas avisa
    console.warn("ui.myCompId inválido e nenhuma competição encontrada para", ui.myTeamId);
    return;
  }
  const isEstadual = state.seasonPhase === "estadual";
  const round = getCurrentRound(comp);
  const total = Math.max(...comp.fixtures.map(m => m.round));

  if (isEstadual) {
    const eRound = state.estadualRound || 1;
    const eMax = getMaxEstadualRound();
    const userEst = getUserEstadual();
    $topInfo.innerHTML = `
      <div>Temporada <b>${state.season}</b></div>
      <div style="color:var(--warning)"><b>PRÉ-TEMPORADA</b> · Estaduais</div>
      <div>Rodada <b>${Math.min(eRound, eMax)}/${eMax}</b></div>
      ${userEst ? `<div>Seu estadual: <b>${userEst.name}</b></div>` : `<div style="color:var(--muted)">Seu time não tem estadual</div>`}
      <div>Caixa <b>R$ ${fmt(my.finances.balance)}</b></div>
    `;
  } else {
    const nextMatch = findNextMatch();
    const nextOpp = nextMatch ? state.teams[
      nextMatch.homeTeamId === ui.myTeamId ? nextMatch.awayTeamId : nextMatch.homeTeamId
    ] : null;
    const nextLocation = nextMatch
      ? (nextMatch.homeTeamId === ui.myTeamId ? "🏠" : "✈️")
      : "";

    $topInfo.innerHTML = `
      <div>Temporada <b>${state.season}</b></div>
      <div>Rodada <b>${round ?? total}/${total}</b></div>
      ${nextOpp ? `<div>Próx. <b>${nextLocation} vs ${nextOpp.shortName}</b></div>` : ""}
      <div>Caixa <b>R$ ${fmt(my.finances.balance)}</b></div>
    `;
  }

  $teamCard.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
      ${teamLogo(ui.myTeamId, 32)}
      <div class="name">${my.name}</div>
    </div>
    <div class="meta">Reputação ${my.reputation} · ${my.squad.length} jogadores</div>
  `;

  const unread = (state.inbox || []).filter(n => !n.read).length;
  $nav.innerHTML = VIEWS.map(v => {
    const badge = v.id === "inbox" && unread > 0
      ? `<span style="margin-left:auto;background:var(--danger);color:#fff;font-size:10px;padding:1px 7px;border-radius:8px;font-weight:700">${unread}</span>`
      : "";
    return `
      <button class="nav-btn ${ui.view === v.id ? "active" : ""}" data-view="${v.id}" style="display:flex;align-items:center;gap:12px">
        <span class="icon">${v.icon}</span>${v.label}${badge}
      </button>
    `;
  }).join("");
  $nav.querySelectorAll("[data-view]").forEach(btn => {
    btn.onclick = () => { ui.view = btn.dataset.view; render(); };
  });

  // Botão durante a pré-temporada (estaduais)
  if (isEstadual) {
    $btnPlay.disabled = false;
    const userEst = getUserEstadual();
    const eRound = state.estadualRound || 1;
    if (userEst) {
      const mm = getEstadualMatchesForRound(state, userEst, eRound)
        .find(m => !m.match.played && (m.match.homeTeamId === ui.myTeamId || m.match.awayTeamId === ui.myTeamId));
      if (mm) {
        const oppId = mm.match.homeTeamId === ui.myTeamId ? mm.match.awayTeamId : mm.match.homeTeamId;
        const local = mm.match.homeTeamId === ui.myTeamId ? "🏠" : "✈️";
        const kindLabel = mm.kind === "group" ? "Estadual" : mm.kind === "semi" ? "SEMI" : "FINAL";
        $btnPlay.textContent = `🏟️ ${kindLabel} · ${local} vs ${state.teams[oppId].shortName}`;
      } else {
        $btnPlay.textContent = `🏟️ AVANÇAR PRÉ-TEMPORADA`;
      }
    } else {
      $btnPlay.textContent = `🏟️ SIMULAR PRÉ-TEMPORADA`;
    }
    $btnPlay.onclick = playRound;
    injectResetButton();
    return;
  }

  if (round == null) {
    $btnPlay.disabled = false;
    $btnPlay.textContent = "▶ INICIAR NOVA TEMPORADA";
    $btnPlay.onclick = forceResolveSeason;
    return;
  }
  $btnPlay.disabled = false;
  {
    const next = findNextUserCommitment(round);
    if (next) {
      const oppId = next.match.homeTeamId === ui.myTeamId
        ? next.match.awayTeamId
        : next.match.homeTeamId;
      const oppShort = state.teams[oppId]?.shortName ?? "?";
      const local = next.match.homeTeamId === ui.myTeamId ? "🏠" : "✈️";
      const prefix = next.isCup ? "🏆 COPA" : `▶ RODADA ${round}`;
      $btnPlay.textContent = `${prefix} · ${local} vs ${oppShort}`;
    } else {
      // Sem partidas do usuário nesta rodada — simulação rápida da IA
      $btnPlay.textContent = `▶ PRÓXIMA RODADA (R${round})`;
    }
  }
  $btnPlay.onclick = playRound;
  injectResetButton();
}

// Botão de "novo jogo" injetado uma vez na sidebar
function injectResetButton() {
  if (document.getElementById("btn-reset-save")) return;
  const btn = document.createElement("button");
  btn.id = "btn-reset-save";
  btn.className = "btn-toggle";
  btn.style.cssText = "width:calc(100% - 24px);margin:8px 12px 0;font-size:11px";
  btn.textContent = "Apagar save e recomeçar";
  btn.onclick = async () => {
    if (!confirm("Apagar progresso e voltar à seleção de time?")) return;
    if (state?.saveId) await deleteSave(state.saveId);
    location.reload();
  };
  document.querySelector(".play-section").appendChild(btn);
}

function render() {
  renderShell();
  if (ui.view === "lineup")    $main.innerHTML = renderLineup();
  if (ui.view === "standings") $main.innerHTML = renderStandings();
  if (ui.view === "cup")       $main.innerHTML = renderCup();
  if (ui.view === "calendar")  $main.innerHTML = renderCalendar();
  if (ui.view === "market")    $main.innerHTML = renderMarket();
  if (ui.view === "academy")   $main.innerHTML = renderAcademy();
  if (ui.view === "finance")   $main.innerHTML = renderFinance();
  if (ui.view === "inbox")     $main.innerHTML = renderInbox();
  wireView();
}





// -------------------- Wire interações --------------------
function wireView() {
  $main.querySelector("#btn-auto")?.addEventListener("click", () => {
    state.teams[ui.myTeamId].lineup = autoLineup(state.teams[ui.myTeamId]);
    render();
  });
  $main.querySelectorAll("[data-toggle]").forEach(btn => {
    btn.onclick = () => {
      const pid = btn.dataset.toggle;
      const team = state.teams[ui.myTeamId];
      const set = new Set(team.lineup);
      if (set.has(pid)) set.delete(pid);
      else if (set.size < 11) set.add(pid);
      team.lineup = [...set];
      render();
    };
  });
  $main.querySelectorAll("[data-action]").forEach(btn => {
    btn.onclick = () => handleBid(btn.dataset.action, btn.dataset.pid);
  });
  $main.querySelectorAll("[data-offer]").forEach(btn => {
    btn.onclick = () => handleOfferAction(btn.dataset.offer, btn.dataset.oid);
  });
  $main.querySelectorAll("[data-req]").forEach(btn => {
    btn.onclick = () => handleRequestAction(btn.dataset.req, btn.dataset.rid);
  });
  $main.querySelectorAll("[data-unlist]").forEach(btn => {
    btn.onclick = () => {
      const res = unlistPlayer(state, ui.myTeamId, btn.dataset.unlist);
      log((res.ok ? "✅ " : "❌ ") + res.message);
      render();
    };
  });
  $main.querySelectorAll("[data-comp]").forEach(btn => {
    btn.onclick = () => { ui.standingsView = btn.dataset.comp; render(); };
  });
  $main.querySelectorAll("[data-formation]").forEach(btn => {
    btn.onclick = () => {
      const team = state.teams[ui.myTeamId];
      team.tactics = team.tactics || {};
      team.tactics.formation = btn.dataset.formation;
      // Re-escala automaticamente para os slots da nova formação
      team.lineup = autoLineup(team);
      render();
    };
  });
  $main.querySelectorAll("[data-training]").forEach(btn => {
    btn.onclick = () => {
      const team = state.teams[ui.myTeamId];
      team.tactics = team.tactics || {};
      team.tactics.training = btn.dataset.training;
      render();
    };
  });
  wirePlayerClicks();

  $main.querySelectorAll("[data-news]").forEach(el => {
    el.onclick = () => {
      const id = el.dataset.news;
      const item = state.inbox?.find(n => n.id === id);
      if (item) item.read = true;
      render();
    };
  });
  $main.querySelector("#btn-mark-all")?.addEventListener("click", () => {
    (state.inbox || []).forEach(n => n.read = true);
    render();
  });

  $main.querySelectorAll("[data-cal-mode]").forEach(btn => {
    btn.onclick = () => { ui.calendarMode = btn.dataset.calMode; render(); };
  });
  $main.querySelectorAll("[data-cal-comp]").forEach(btn => {
    btn.onclick = () => { ui.calendarCompId = btn.dataset.calComp; render(); };
  });

  // Ações da aba Base
  $main.querySelectorAll("[data-academy]").forEach(btn => {
    btn.onclick = () => handleAcademyAction(btn.dataset.academy, btn.dataset.pid);
  });
  $main.querySelectorAll("[data-match]").forEach(el => {
    el.onclick = () => openMatchDetail(el.dataset.match, ui.calendarCompId || ui.myCompId);
  });

  // Scroll automático até a rodada atual quando entra no calendário
  const currentEl = $main.querySelector("#round-current");
  if (currentEl) {
    setTimeout(() => currentEl.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
  }
}

function handleRequestAction(action, reqId) {
  const req = state.transferRequests?.find(r => r.id === reqId);
  if (!req) return;
  const player = state.players[req.playerId];
  if (!player) return;

  if (action === "list") {
    if (!confirm(`Listar ${player.name} pra venda? A IA priorizará propostas por ele.`)) return;
  } else if (action === "promise") {
    if (!confirm(`Prometer mais espaço pra ${player.name}? Recupera moral, mas você precisa cumprir escalando.`)) return;
  } else if (action === "reject") {
    if (!confirm(`Recusar o pedido de ${player.name}? A moral dele vai cair forte.`)) return;
  }
  const res = resolveTransferRequest(state, reqId, action);
  log((res.ok ? "✅ " : "❌ ") + res.message);
  render();
}

function handleOfferAction(action, offerId) {
  const offer = state.transferOffers?.find(o => o.id === offerId);
  if (!offer) return;
  const fromTeam = state.teams[offer.fromTeamId];
  const player = state.players[offer.playerId];
  if (!fromTeam || !player) return;

  if (action === "accept") {
    if (!confirm(`Vender ${player.name} ao ${fromTeam.shortName} por R$ ${fmt(offer.fee)}?`)) return;
    const res = respondToOffer(state, offerId, "accept");
    log((res.accepted ? "✅ " : "❌ ") + res.message);
    render();
    return;
  }

  if (action === "reject") {
    if (!confirm(`Recusar a proposta do ${fromTeam.shortName} por ${player.name}?`)) return;
    const res = respondToOffer(state, offerId, "reject");
    log("❌ " + res.message);
    render();
    return;
  }

  if (action === "counter") {
    const suggestion = Math.round(offer.fee * 1.25);
    const counterStr = prompt(
      `Contrapor a proposta do ${fromTeam.shortName} por ${player.name}.\n` +
      `· Oferta atual: R$ ${fmt(offer.fee)}\n` +
      `· Valor de mercado: R$ ${fmt(player.marketValue)}\n\n` +
      `Sua contraproposta (deve ser maior que a oferta atual):`,
      String(suggestion)
    );
    if (!counterStr) return;
    const counterFee = Number(counterStr);
    const res = respondToOffer(state, offerId, "counter", counterFee);
    log((res.accepted ? "✅ " : "❌ ") + res.message);
    render();
  }
}

function handleAcademyAction(action, pid) {
  const p = state.players[pid];
  if (!p) return;
  let res;
  if (action === "promote") {
    res = promoteProspect(state, ui.myTeamId, pid);
  } else if (action === "sell") {
    if (!confirm(`Vender ${p.name} por R$ ${fmt(Math.max(50_000, Math.round(p.marketValue * 0.5)))}?`)) return;
    res = sellProspect(state, ui.myTeamId, pid);
  } else if (action === "release") {
    if (!confirm(`Liberar ${p.name} da base? Esta ação não tem retorno.`)) return;
    res = releaseProspect(state, ui.myTeamId, pid);
  }
  if (res) log((res.ok ? "🌱 " : "❌ ") + res.message);
  render();
}

function handleBid(kind, pid) {
  const p = state.players[pid];
  const expSal = Math.round(Math.pow(Math.max(p.overall - 50, 1), 1.9) * 800);

  if (kind === "renew") {
    const exp = getRenewalExpectation(p);
    const sal = prompt(
      `Novo salário mensal para ${p.name}:\n` +
      `· Salário atual: R$ ${fmt(p.contract.salary)}\n` +
      `· Esperado pelo jogador: ~R$ ${fmt(exp)}\n\n` +
      `Quanto oferece?`,
      String(exp)
    );
    if (!sal) return;
    const yearsStr = prompt(
      `Por quantos anos? (1-5)\n` +
      `· Idade: ${p.age} (${p.age < 25 ? "jovem, prefere contratos longos" : p.age >= 33 ? "veterano, prefere contratos curtos" : "fase prime"})`,
      p.age < 25 ? "4" : p.age >= 33 ? "2" : "3"
    );
    if (!yearsStr) return;
    const res = renewContract(state, {
      teamId: ui.myTeamId, playerId: pid,
      salaryOffer: Number(sal), years: Number(yearsStr),
    });
    log((res.accepted ? "✅ " : "❌ ") + res.message);
    render();
    return;
  }

  const round = getCurrentRound(state.competitions[ui.myCompId]) ?? 0;
  if (kind === "free") {
    const sal = prompt(`Salário mensal para ${p.name} (esperado ~R$ ${fmt(expSal)}):`, String(expSal));
    if (!sal) return;
    const res = signFreeAgent(state, { teamId: ui.myTeamId, playerId: pid, salaryOffer: Number(sal), currentRound: round });
    log((res.accepted ? "✅ " : "❌ ") + res.message);
  } else {
    const fee = prompt(`Proposta por ${p.name} (valor: R$ ${fmt(p.marketValue)}):`, String(p.marketValue));
    if (!fee) return;
    const sal = prompt(`Salário oferecido (esperado ~R$ ${fmt(expSal)}):`, String(expSal));
    if (!sal) return;
    const res = makeBid(state, {
      fromTeamId: ui.myTeamId, playerId: pid, fee: Number(fee), salaryOffer: Number(sal), currentRound: round,
    });
    log((res.accepted ? "✅ " : "❌ ") + res.message);
  }
  state.teams[ui.myTeamId].lineup = state.teams[ui.myTeamId].lineup
    .filter(id => state.teams[ui.myTeamId].squad.includes(id));
  render();
}

// -------------------- Pré-temporada: Estaduais --------------------
function getUserEstadual() {
  const team = state.teams[ui.myTeamId];
  if (!team || !state.estaduais) return null;
  return state.estaduais[team.state] || null;
}

function getMaxEstadualRound() {
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

// Aplica resultado de uma partida estadual (grupo ou mata-mata).
// estadualMeta: { uf, kind: "group"|"semi"|"final", compId? }
function applyEstadualMatchResult(match, result, estadualMeta) {
  if (estadualMeta.kind === "group") {
    const comp = state.competitions[estadualMeta.compId];
    if (comp) applyMatchResult(state, match, result, comp); // já seta tudo + standings
  } else {
    match.played = true;
    match.score = { ...result.score };
    match.events = result.events;
    match.date = state.currentDate;
    match.lineups = result.lineups;
    match.stats = result.stats;
    applyMatchEffects(state, result, "estadual");
    const est = state.estaduais[estadualMeta.uf];
    applyEstadualKnockoutResult(est, match, rng);
  }
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
    // Usuário não joga (bye, estadual já acabou, ou sem estadual) — simula tudo da rodada
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

  // Premia campeões estaduais
  for (const e of Object.values(state.estaduais || {})) {
    if (!e.champion) continue;
    const champ = state.teams[e.champion];
    champ.trophies.push({ competitionId: `estadual_${e.uf.toLowerCase()}`, season: state.season });
    champ.finances.balance += 3_000_000; // prêmio estadual
    state.inbox = state.inbox || [];
    state.inbox.push({
      id: `n_estadual_${e.uf}_${state.season}`,
      date: state.currentDate, type: "season",
      priority: e.champion === ui.myTeamId ? "high" : "normal",
      subject: `🏆 ${champ.name} é campeão do ${e.name} ${state.season}`,
      body: `${champ.name} conquistou o ${e.name}. Prêmio: R$ 3.000.000.`,
      read: false, teamFocus: e.champion,
    });
    log(`🏆 ${champ.shortName} campeão do ${e.name}!`);
  }

  // Transição pra temporada nacional
  state.seasonPhase = "national";
  state.estadualRound = 1;
  log(`Pré-temporada encerrada. Começa o Brasileirão ${state.season}!`);
}

// -------------------- Jogar Rodada --------------------
// Cada clique do usuário joga UMA partida ao vivo, mas TODAS as outras
// partidas da rodada (das duas séries e da copa) acontecem em paralelo,
// tickando minuto a minuto junto com a sua. Ao fim do jogo do usuário,
// todos os outros resultados já estão prontos. Se for o último compromisso
// do usuário na rodada, finanças/notícias/IA de mercado rodam aqui.
function playRound() {
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

    // Se foi partida de copa e o tie acabou com penalidades envolvendo o usuário,
    // mostra animação de shootout antes de seguir.
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
function findNextUserCommitment(round) {
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

function applyCupLegToState(leg, result) {
  leg.played = true;
  leg.score = { ...result.score };
  leg.events = result.events;
  leg.date = state.currentDate;
  leg.lineups = result.lineups;
  leg.stats = result.stats;
  applyMatchEffects(state, result, "copa_brasil");
  const cup = state.competitions.copa_brasil;
  applyCupLegResult(cup, leg, rng, { teamsById: state.teams, playersById: state.players });
}

// Velocidades disponíveis durante o jogo (ms por minuto simulado).
// "skip" pula direto pro final (0ms entre minutos).
const MATCH_SPEEDS = {
  "1x":   400,    // ~36s de partida → confortável de assistir
  "2x":   200,    // ~18s
  "4x":   90,     // ~8s
  "skip": 0,      // instantâneo
};
const DEFAULT_SPEED = "1x";
// Pausa extra quando algo importante acontece (gol/expulsão/lesão) — dá tempo de ler
const EVENT_PAUSE_BONUS = 800;

function playMatchOnScreen(match, sim, onContinue, parallels = []) {
  const home = state.teams[match.homeTeamId];
  const away = state.teams[match.awayTeamId];
  // Qual lado o usuário controla
  const userSide = match.homeTeamId === ui.myTeamId ? "home" : "away";

  // Cria simuladores das partidas paralelas (todas IA vs IA)
  const parallelSims = parallels.map(p => ({
    ...p,
    home: state.teams[p.match.homeTeamId],
    away: state.teams[p.match.awayTeamId],
    sim: createMatchSimulator({
      homeTeam: state.teams[p.match.homeTeamId],
      awayTeam: state.teams[p.match.awayTeamId],
      playersById: state.players, rng,
    }),
  }));
  let parallelsApplied = false;

  let speed = DEFAULT_SPEED;
  let timer = null;
  let paused = false;
  let aborted = false;
  let subPanel = { open: false, pendingOut: null, subsAtOpen: 0 };

  $overlay.classList.add("visible");

  const getDisplayStats = () => {
    // As stats só são atualizadas dentro de tickSide. Pra UI ficar viva,
    // mostro o que está no objeto (já vai crescendo a cada tick).
    return {
      home: { ...sim.stats.home, yellows: sim.stats.home.yellows },
      away: { ...sim.stats.away, yellows: sim.stats.away.yellows },
    };
  };

  const renderMatch = () => {
    document.getElementById("scoreboard").innerHTML = `
      <div class="team">
        <div style="display:flex;align-items:center;justify-content:center;gap:12px;margin-bottom:6px">
          ${teamLogo(home.id, 48)}
          <div class="name">${home.name}</div>
        </div>
        <div class="short">${home.shortName} · ${home.tactics?.formation || "4-3-3"}</div>
      </div>
      <div class="center">
        <div class="score">${sim.score.home} <span style="color:var(--muted);font-size:32px">×</span> ${sim.score.away}</div>
        <div class="minute">${sim.minute >= 90 ? "FIM DE JOGO" : sim.minute + "'"}</div>
      </div>
      <div class="team">
        <div style="display:flex;align-items:center;justify-content:center;gap:12px;margin-bottom:6px">
          <div class="name">${away.name}</div>
          ${teamLogo(away.id, 48)}
        </div>
        <div class="short">${away.shortName} · ${away.tactics?.formation || "4-3-3"}</div>
      </div>
    `;
    if (subPanel.open) {
      document.getElementById("match-events").innerHTML = renderSubPanelHTML();
      wireSubPanel();
    } else {
      document.getElementById("match-events").innerHTML = sim.events.length
        ? sim.events.slice().reverse().map(e => `
          <div class="event ${e.type}">
            <span class="min">${e.minute}'</span>
            <span>${e.description}</span>
          </div>`).join("")
        : `<p style="color:var(--muted)">Aguardando o apito inicial...</p>`;
    }
    const ds = getDisplayStats();
    document.getElementById("match-stats").innerHTML = renderMatchStats(ds.home, ds.away);
    renderParallelsPanel();
  };

  const renderParallelsPanel = () => {
    const el = document.getElementById("match-parallels");
    if (!el) return;
    if (!parallelSims.length) {
      el.innerHTML = `<h3>Outros Jogos</h3><p style="color:var(--muted);font-size:12px">Nenhum outro jogo nesta rodada.</p>`;
      return;
    }
    // Agrupa por tipo
    const groups = { copa_brasil: [], brasileirao_a: [], brasileirao_b: [] };
    for (const ps of parallelSims) {
      const key = ps.isCup ? "copa_brasil" : ps.compId;
      if (!groups[key]) groups[key] = [];
      groups[key].push(ps);
    }
    const groupTitle = { copa_brasil: "🏆 Copa", brasileirao_a: "📊 Série A", brasileirao_b: "📊 Série B" };

    let html = `<h3 style="font-size:13px;margin-bottom:10px">Outros Jogos · ${sim.minute}'</h3>`;
    for (const key of ["copa_brasil", "brasileirao_a", "brasileirao_b"]) {
      const list = groups[key];
      if (!list || !list.length) continue;
      html += `<div style="color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:0.6px;margin:10px 0 6px">${groupTitle[key]}</div>`;
      for (const ps of list) {
        const sc = ps.sim.score;
        const finished = ps.sim.isFinished();
        html += `
          <div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:6px;padding:4px 6px;border-radius:4px;font-size:11px;background:${finished ? "rgba(255,255,255,0.02)" : "var(--bg-2)"};margin-bottom:3px">
            <div style="text-align:right;color:${sc.home > sc.away ? "var(--accent)" : "var(--muted)"};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
              ${ps.home.shortName}
            </div>
            <div style="font-weight:700;min-width:32px;text-align:center;font-variant-numeric:tabular-nums">
              ${sc.home}–${sc.away}
            </div>
            <div style="color:${sc.away > sc.home ? "var(--accent)" : "var(--muted)"};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
              ${ps.away.shortName}
            </div>
          </div>`;
      }
    }
    el.innerHTML = html;
  };

  const renderControls = () => {
    const info = sim.canSubstitute(userSide);
    const subEnabled = !sim.isFinished() && info.subsLeft > 0 && info.windowsLeft > 0;

    document.getElementById("match-footer").innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:center">
        <span style="color:var(--muted);font-size:12px">Velocidade:</span>
        ${Object.keys(MATCH_SPEEDS).filter(k => k !== "skip").map(k => `
          <button class="btn-toggle ${speed === k ? "on" : ""}" data-speed="${k}" ${subPanel.open ? "disabled" : ""}>${k}</button>
        `).join("")}
        <button class="btn-toggle" data-speed="skip" ${subPanel.open ? "disabled" : ""}>⏭ Pular</button>
        <span style="border-left:1px solid var(--border);height:24px;margin:0 4px"></span>
        <button class="btn btn-sm" id="btn-sub" ${subEnabled ? "" : "disabled"}>
          🔄 Substituir (${info.subsLeft}/5 · ${info.windowsLeft} janelas)
        </button>
      </div>
    `;
    document.querySelectorAll("[data-speed]").forEach(btn => {
      btn.onclick = () => {
        speed = btn.dataset.speed;
        renderControls();
        if (speed === "skip") {
          clearTimeout(timer);
          fastForward();
        }
      };
    });
    document.getElementById("btn-sub")?.addEventListener("click", openSubPanel);
  };

  const openSubPanel = () => {
    if (sim.isFinished()) return;
    const info = sim.canSubstitute(userSide);
    paused = true;
    clearTimeout(timer);
    subPanel.open = true;
    subPanel.pendingOut = null;
    subPanel.subsAtOpen = info.subsUsed;
    renderMatch();
    renderControls();
  };

  const closeSubPanel = () => {
    const info = sim.canSubstitute(userSide);
    const didSub = info.subsUsed > subPanel.subsAtOpen;
    if (didSub) sim.closeWindow(userSide, true);
    subPanel.open = false;
    subPanel.pendingOut = null;
    paused = false;
    renderMatch();
    renderControls();
    if (!sim.isFinished()) {
      timer = setTimeout(tick, MATCH_SPEEDS[speed]);
    }
  };

  const renderSubPanelHTML = () => {
    const info = sim.canSubstitute(userSide);
    const onField = info.onField;
    const bench = info.bench;

    const fieldRow = p => {
      const isPending = subPanel.pendingOut === p.id;
      return `
        <div data-out="${p.id}" style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;border-radius:4px;cursor:pointer;background:${isPending ? "rgba(245,158,11,0.18)" : "transparent"};border:1px solid ${isPending ? "var(--warning)" : "transparent"}">
          <div><span class="badge badge-pos">${p.position}</span> <b style="font-size:12px">${p.name}</b></div>
          <span class="badge badge-ovr ${ovrClass(p.overall)}">${p.overall}</span>
        </div>
      `;
    };

    const benchRow = p => {
      const enabled = subPanel.pendingOut !== null;
      return `
        <div data-in="${p.id}" style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;border-radius:4px;cursor:${enabled ? "pointer" : "not-allowed"};opacity:${enabled ? 1 : 0.5}">
          <div><span class="badge badge-pos">${p.position}</span> <b style="font-size:12px">${p.name}</b></div>
          <span class="badge badge-ovr ${ovrClass(p.overall)}">${p.overall}</span>
        </div>
      `;
    };

    return `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <h3 style="margin:0">Substituições</h3>
        <div style="font-size:11px;color:var(--muted)">
          Restantes: <b style="color:var(--text)">${info.subsLeft}/5</b> ·
          Janelas: <b style="color:var(--text)">${info.windowsLeft}/3</b>
        </div>
      </div>
      <p style="font-size:11px;color:var(--muted);margin-bottom:10px">
        ${subPanel.pendingOut
          ? "Agora clique no jogador da reserva para entrar."
          : "Clique no titular que vai sair. (Cada confirmação conta 1 janela, mesmo com várias trocas)"}
      </p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:12px">
        <div>
          <div style="color:var(--muted);font-size:10px;text-transform:uppercase;margin-bottom:6px">Em campo (${onField.length})</div>
          ${onField.map(fieldRow).join("")}
        </div>
        <div>
          <div style="color:var(--muted);font-size:10px;text-transform:uppercase;margin-bottom:6px">Banco (${bench.length})</div>
          ${bench.map(benchRow).join("") || "<p style='color:var(--muted);font-size:11px'>Sem reservas disponíveis.</p>"}
        </div>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px;padding-top:10px;border-top:1px solid var(--border)">
        <button class="btn btn-sm btn-secondary" id="btn-sub-close">Fechar / Voltar ao Jogo</button>
      </div>
    `;
  };

  const wireSubPanel = () => {
    document.querySelectorAll("[data-out]").forEach(el => {
      el.onclick = () => {
        subPanel.pendingOut = el.dataset.out;
        renderMatch();
      };
    });
    document.querySelectorAll("[data-in]").forEach(el => {
      el.onclick = () => {
        if (!subPanel.pendingOut) return;
        const res = sim.substitute(userSide, subPanel.pendingOut, el.dataset.in);
        if (!res.ok) {
          alert(res.message);
          return;
        }
        subPanel.pendingOut = null;
        renderMatch();
        renderControls();
      };
    });
    document.getElementById("btn-sub-close")?.addEventListener("click", closeSubPanel);
  };

  const tickParallels = () => {
    for (const ps of parallelSims) {
      if (!ps.sim.isFinished()) {
        ps.sim.tick();
        if (ps.sim.minute === 60 || ps.sim.minute === 75) {
          aiAutoSubsInteractive(ps.sim, "home", state.players, rng);
          aiAutoSubsInteractive(ps.sim, "away", state.players, rng);
        }
      }
    }
  };

  const tick = () => {
    if (aborted || paused) return;
    sim.tick();
    tickParallels();
    // IA do adversário do usuário: subs em 60' e 75'
    if (sim.minute === 60 || sim.minute === 75) {
      const aiSide = userSide === "home" ? "away" : "home";
      aiAutoSubsInteractive(sim, aiSide, state.players, rng);
    }
    renderMatch();
    renderControls();

    if (sim.isFinished()) {
      finishMatch();
      return;
    }
    const lastMin = sim.minute;
    const importantEvent = sim.events.some(e =>
      e.minute === lastMin && (e.type === "goal" || e.type === "red" || e.type === "injury")
    );
    const base = MATCH_SPEEDS[speed];
    const delay = importantEvent ? base + EVENT_PAUSE_BONUS : base;
    timer = setTimeout(tick, delay);
  };

  const fastForward = () => {
    aborted = true;
    while (!sim.isFinished()) {
      sim.tick();
      tickParallels();
      if (sim.minute === 60 || sim.minute === 75) {
        const aiSide = userSide === "home" ? "away" : "home";
        aiAutoSubsInteractive(sim, aiSide, state.players, rng);
      }
    }
    // Garante que paralelos também terminem (caso já estivessem mais à frente)
    for (const ps of parallelSims) {
      while (!ps.sim.isFinished()) ps.sim.tick();
    }
    renderMatch();
    finishMatch();
  };

  // Aplica os resultados dos jogos paralelos ao estado.
  const applyParallels = () => {
    if (parallelsApplied) return;
    parallelsApplied = true;
    for (const ps of parallelSims) {
      const r = ps.sim.getResult();
      if (ps.isCup) {
        applyCupLegToState(ps.match, r);
      } else if (ps.estadual) {
        applyEstadualMatchResult(ps.match, r, { ...ps.estadual, compId: ps.compId });
      } else {
        applyMatchResult(state, ps.match, r, state.competitions[ps.compId]);
      }
    }
  };

  const finishMatch = () => {
    applyParallels();
    document.getElementById("match-footer").innerHTML = `
      <button class="btn" id="btn-continue">Continuar ▶</button>
    `;
    document.getElementById("btn-continue").onclick = () => {
      $overlay.classList.remove("visible");
      onContinue();
    };
  };

  renderControls();
  renderMatch();
  timer = setTimeout(tick, MATCH_SPEEDS[speed]);
}

// IA do adversário durante a partida do usuário (mesma heurística do match.js).
function aiAutoSubsInteractive(sim, side, playersById, rngRef) {
  const POS = { GOL:"GOL", ZAG:"DEF", LD:"DEF", LE:"DEF", VOL:"MID", MEI:"MID", PE:"ATA", PD:"ATA", ATA:"ATA" };
  const info = sim.canSubstitute(side);
  if (info.subsLeft <= 0 || info.windowsLeft <= 0) return;
  let didSub = false;
  for (let i = 0; i < Math.min(2, info.subsLeft); i++) {
    const fresh = sim.canSubstitute(side);
    if (fresh.subsLeft <= 0) break;
    let best = null;
    for (const b of fresh.bench) {
      const cand = fresh.onField.find(p =>
        POS[p.position] === POS[b.position] && b.overall > p.overall + 2
      );
      if (cand) {
        const gain = b.overall - cand.overall;
        if (!best || gain > best.gain) best = { out: cand, in: b, gain };
      }
    }
    if (best && rngRef.chance(0.6)) {
      sim.substitute(side, best.out.id, best.in.id);
      didSub = true;
    } else break;
  }
  if (didSub) sim.closeWindow(side, true);
}

function renderMatchStats(h, a) {
  const rows = [
    ["Chutes", h.shots, a.shots],
    ["No gol", h.shotsOnTarget, a.shotsOnTarget],
    ["Faltas", h.fouls, a.fouls],
    ["Amarelos", h.yellows, a.yellows],
  ];
  return `
    <h3>Estatísticas</h3>
    ${rows.map(([label, hv, av]) => {
      const total = hv + av || 1;
      return `
        <div class="stat-row">
          <div class="home">${hv}</div>
          <div>
            <div class="label">${label}</div>
            <div class="stat-bar">
              <div class="home-fill" style="width:${(hv/total)*100}%"></div>
              <div class="away-fill" style="width:${(av/total)*100}%"></div>
            </div>
          </div>
          <div class="away">${av}</div>
        </div>
      `;
    }).join("")}
  `;
}

// Resolução forçada: garante que todas as competições da temporada terminem,
// incluindo copa (sorteando fases pendentes), e dispara endSeason + cria a
// nova temporada. Usado como fallback quando a temporada trava por alguma
// pendência (ex.: fase da copa não foi sorteada no momento certo).
async function forceResolveSeason() {
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
    // Avança fases da Série C se aplicável
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

  // 2. Simula legs da Copa do Brasil agendados para esta rodada (que não são do usuário)
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
      // Manchete
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
    // Recria copa para nova temporada com Liberta da temporada anterior
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
    // (Importante: as subcomps brasileirao_c_ga/_gb/_final foram deletadas
    //  em endSeason — sem este reset, ui.myCompId pode ficar pendurado.)
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
    // Limpa as competições de grupo da temporada anterior.
    for (const cid of Object.keys(state.competitions)) {
      if (cid.startsWith("estadual_")) delete state.competitions[cid];
    }
    state.estaduais = createEstaduais(state, state.season, rng);
    state.seasonPhase = "estadual";
    state.estadualRound = 1;

    const myCompName = state.competitions[ui.myCompId]?.name ?? "—";
    alert(
      `Fim da temporada ${report.season}!\n\n` +
      `🏆 Série A: ${champA}\n🏆 Série B: ${champB}` +
      (champC ? `\n🏆 Série C: ${champC}` : "") + `\n\n` +
      `Série A → B (rebaixados): ${relegated}\n` +
      `Série B → A (promovidos): ${promoted}\n` +
      `Série B → C (rebaixados): ${relegatedToC}\n` +
      `Série C → B (promovidos): ${promotedFromC}\n\n` +
      `Você dirige o ${state.teams[ui.myTeamId]?.name ?? "?"} na temporada ${state.season} (${myCompName}).`
    );
  } catch (e) {
    console.error("Erro no showSeasonRecap:", e);
    // Mesmo se algo falhar, garante que ui.myCompId seja válido pra UI não travar
    const fallback = resolveUserCompetition();
    if (fallback) { ui.myCompId = fallback; ui.standingsView = ui.myCompId; }
  }
}

// Descobre em qual competição o time do usuário está participando agora.
// Retorna o ID da competição válida (ou null se nenhuma).
function resolveUserCompetition() {
  if (!ui.myTeamId) return null;
  const compsToCheck = ["brasileirao_a", "brasileirao_b", "brasileirao_c_p1"];
  for (const cid of compsToCheck) {
    const c = state.competitions[cid];
    if (c?.teams?.includes(ui.myTeamId)) return cid;
  }
  return null;
}

// applyMatchResult + recalcTopScorers vêm de season.js (caminho único compartilhado
// com runRound, sem duplicação e respeitando comp.rules.pointsWin/pointsDraw).



function log(msg) { state.log.push(`[R${getCurrentRound(state.competitions[ui.myCompId]) ?? "fim"}] ${msg}`); }
