// Dashboard unificado — integra escalação, classificação, mercado, finanças
// e tela de jogo com playback minuto a minuto.

import { createRng } from "./utils/rng.js";
import { createTeam } from "./models/team.js";
import { generateSquad, syncPlayerIdCounter } from "./models/player.js";
import { createCompetition } from "./models/competition.js";
import { getCurrentRound } from "./engine/season.js";
import { FORMATIONS } from "./engine/match.js";
import {
  makeBid, signFreeAgent, generateFreeAgents,
  renewContract, getRenewalExpectation,
  respondToOffer, resolveTransferRequest, unlistPlayer,
} from "./engine/transfers.js";
import { createCupCompetition } from "./engine/cup.js";
import { createSerieCPhase1 } from "./engine/serie-c.js";
import { generateSeasonalYouth, promoteProspect, sellProspect, releaseProspect } from "./engine/academy.js";
import { pickAITrainingFocus } from "./engine/training.js";
import { createEstaduais, getEstadualMatchesForRound } from "./engine/estadual.js";
import { initManager } from "./engine/manager.js";
import { assignBoardObjective, computeConfidence } from "./engine/board.js";
import { seedInitialRanking } from "./engine/ranking.js";
import { saveGame, listSaves, deleteSave } from "./db.js";
import { SERIE_A_SEED, SERIE_B_SEED, SERIE_C_SEED, SERIE_D_SEED } from "../data/teams.seed.js";
import { state, rng, setState, setRng, ui } from "./core/store.js";
import { fmt, ovrClass, teamLogo } from "./ui/format.js";
import { applyTeamTheme } from "./ui/theme.js";
import { toast, toastResult, confirmDialog, promptDialog } from "./ui/toast.js";
import {
  openMatchDetail, wirePlayerClicks,
  showPenaltyShootoutModal, showEstadualDrawModal, showCupDrawModal,
  registerModalActions,
} from "./ui/modals.js";
import { renderFinance } from "./ui/views/finance.js";
import { renderInbox } from "./ui/views/inbox.js";
import { renderAcademy } from "./ui/views/academy.js";
import { renderHistory } from "./ui/views/history.js";
import { renderCalendar } from "./ui/views/calendar.js";
import { renderCup } from "./ui/views/cup.js";
import { renderLineup } from "./ui/views/lineup.js";
import { renderStandings } from "./ui/views/standings.js";
import { renderMarket } from "./ui/views/market.js";
import { autoLineup, findNextMatch } from "./engine/lineup-helpers.js";
import {
  playRound, forceResolveSeason, resolveUserCompetition,
  getUserEstadual, getMaxEstadualRound, findNextUserCommitment,
  registerSeasonFlowHooks, announceBoardObjective,
} from "./core/season-flow.js";

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
  { id: "history",   label: "Histórico",     icon: "🏛️" },
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
const $menuToggle = document.getElementById("menu-toggle");
const $sidebarScrim = document.getElementById("sidebar-scrim");

// -------------------- Drawer mobile --------------------
// No mobile a sidebar vira drawer. O hambúrguer abre, e qualquer um destes
// fecha: clicar no scrim, navegar (clique no nav) ou apertar Esc.
function openDrawer() {
  $sidebar.classList.add("open");
  $sidebarScrim.classList.add("visible");
  $menuToggle.setAttribute("aria-expanded", "true");
}
function closeDrawer() {
  $sidebar.classList.remove("open");
  $sidebarScrim.classList.remove("visible");
  $menuToggle.setAttribute("aria-expanded", "false");
}
function toggleDrawer() {
  if ($sidebar.classList.contains("open")) closeDrawer();
  else openDrawer();
}
$menuToggle.addEventListener("click", toggleDrawer);
$sidebarScrim.addEventListener("click", closeDrawer);
$sidebar.addEventListener("click", (e) => {
  // Fecha ao clicar num item de navegação (delegação)
  if (e.target.closest(".nav-btn")) closeDrawer();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && $sidebar.classList.contains("open")) closeDrawer();
});

// -------------------- Boot --------------------
bootstrap();

// Registra callbacks que os modais precisam disparar de volta no main
registerModalActions({ onBid: handleBid });
registerSeasonFlowHooks({ render: () => render(), log: (msg) => log(msg) });

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
    const ok = await confirmDialog({
      title: "Novo jogo",
      message: "Apagar o save atual e começar um novo jogo?",
      confirmText: "Apagar e recomeçar",
      danger: true,
    });
    if (ok) {
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

  // Retrocompat: saves anteriores às Metas da Diretoria não têm treinador/meta.
  if (!state.manager) initManager(state, ui.myTeamId);
  if (!state.teams[ui.myTeamId].board) assignBoardObjective(state, ui.myTeamId);
  if (!state.rncLog) seedInitialRanking(state);

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
    serieD: null,                 // montada após os estaduais (sistema de vagas)
    serieDPendingRelegated: [],   // rebaixados da C aguardando a próxima D
    settings: { difficulty: "normal", language: "pt-BR", seed },
  });

  // Cria todos os times e seus elencos. A/B/C (60) disputam o nacional;
  // os 5 da Série D são paulistas que só entram no Campeonato Paulista.
  for (const seed of [...SERIE_A_SEED, ...SERIE_B_SEED, ...SERIE_C_SEED, ...SERIE_D_SEED]) {
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

  // Carreira do treinador + meta da diretoria para a 1ª temporada
  initManager(state, ui.myTeamId);
  assignBoardObjective(state, ui.myTeamId);
  announceBoardObjective(state);

  // Ranking Nacional de Clubes: semente inicial baseada na reputação
  seedInitialRanking(state);

  // A Série D é montada na transição pré-temporada→nacional (após os
  // estaduais), pelo sistema de vagas — ver finishEstadualPhase.

  try { await saveGame(state); } catch (e) { console.warn("Save inicial falhou:", e); }

  $btnPlay.style.display = "";
  ui.view = "lineup";
  render();
}

// -------------------- Render principal --------------------
function renderShell() {
  // Invariante: ui.myTeamId espelha state.managedTeamId (valor canônico e
  // persistido). Autocorrige qualquer divergência — ex.: após troca de clube
  // pela diretoria — para a UI nunca mostrar o clube errado.
  if (state.managedTeamId && ui.myTeamId !== state.managedTeamId) {
    ui.myTeamId = state.managedTeamId;
    if (state.teams[ui.myTeamId]) {
      const cid = resolveUserCompetition();
      if (cid) { ui.myCompId = cid; ui.standingsView = cid; }
      applyTeamTheme(state.teams[ui.myTeamId].colors);
    }
  }
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

  const board = my.board;
  let boardBlock = "";
  if (board?.objective) {
    const conf = computeConfidence(state, ui.myTeamId);
    const confColor = conf >= 60 ? "var(--accent)" : conf >= 35 ? "var(--warning)" : "var(--danger)";
    boardBlock = `
      <div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border)">
        <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">🎯 Meta da diretoria</div>
        <div style="font-size:12px;font-weight:600;margin:2px 0 5px">${board.objective.label}</div>
        <div style="display:flex;align-items:center;gap:6px">
          <div style="flex:1;height:6px;background:var(--bg-2);border-radius:3px;overflow:hidden">
            <div style="height:100%;width:${conf}%;background:${confColor}"></div>
          </div>
          <span style="font-size:11px;color:${confColor};font-weight:700">${conf}%</span>
        </div>
        <div style="font-size:10px;color:var(--muted);margin-top:2px">confiança da diretoria</div>
      </div>`;
  }
  $teamCard.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
      ${teamLogo(ui.myTeamId, 32)}
      <div class="name">${my.name}</div>
    </div>
    <div class="meta">Reputação ${my.reputation} · ${my.squad.length} jogadores</div>
    ${boardBlock}
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
    const ok = await confirmDialog({
      title: "Recomeçar",
      message: "Apagar progresso e voltar à seleção de time?",
      confirmText: "Apagar progresso",
      danger: true,
    });
    if (!ok) return;
    if (state?.saveId) await deleteSave(state.saveId);
    location.reload();
  };
  document.querySelector(".play-section").appendChild(btn);
}

let _lastRenderedView = null;

function render() {
  renderShell();
  if (ui.view === "lineup")    $main.innerHTML = renderLineup();
  if (ui.view === "standings") $main.innerHTML = renderStandings();
  if (ui.view === "cup")       $main.innerHTML = renderCup();
  if (ui.view === "calendar")  $main.innerHTML = renderCalendar();
  if (ui.view === "market")    $main.innerHTML = renderMarket();
  if (ui.view === "academy")   $main.innerHTML = renderAcademy();
  if (ui.view === "finance")   $main.innerHTML = renderFinance();
  if (ui.view === "history")   $main.innerHTML = renderHistory();
  if (ui.view === "inbox")     $main.innerHTML = renderInbox();

  // Fade de entrada só quando a aba MUDA (não a cada ação dentro da view,
  // senão a tela piscaria a cada clique de escalar/ofertar/etc.).
  if (ui.view !== _lastRenderedView) {
    _lastRenderedView = ui.view;
    $main.classList.remove("view-enter");
    void $main.offsetWidth; // reinicia a animação
    $main.classList.add("view-enter");
  }

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
      toastResult(res);
      render();
    };
  });
  $main.querySelectorAll("[data-comp]").forEach(btn => {
    btn.onclick = () => { ui.standingsView = btn.dataset.comp; render(); };
  });
  $main.querySelectorAll("[data-history-tab]").forEach(btn => {
    btn.onclick = () => { ui.historyTab = btn.dataset.historyTab; render(); };
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

async function handleRequestAction(action, reqId) {
  const req = state.transferRequests?.find(r => r.id === reqId);
  if (!req) return;
  const player = state.players[req.playerId];
  if (!player) return;

  let ok = true;
  if (action === "list") {
    ok = await confirmDialog({ title: "Listar para venda", message: `Listar ${player.name} pra venda? A IA priorizará propostas por ele.`, confirmText: "Listar" });
  } else if (action === "promise") {
    ok = await confirmDialog({ title: "Prometer espaço", message: `Prometer mais espaço pra ${player.name}? Recupera moral, mas você precisa cumprir escalando.`, confirmText: "Prometer" });
  } else if (action === "reject") {
    ok = await confirmDialog({ title: "Recusar pedido", message: `Recusar o pedido de ${player.name}? A moral dele vai cair forte.`, confirmText: "Recusar", danger: true });
  }
  if (!ok) return;
  const res = resolveTransferRequest(state, reqId, action);
  log((res.ok ? "✅ " : "❌ ") + res.message);
  toastResult(res);
  render();
}

async function handleOfferAction(action, offerId) {
  const offer = state.transferOffers?.find(o => o.id === offerId);
  if (!offer) return;
  const fromTeam = state.teams[offer.fromTeamId];
  const player = state.players[offer.playerId];
  if (!fromTeam || !player) return;

  if (action === "accept") {
    const ok = await confirmDialog({
      title: "Aceitar proposta",
      message: `Vender ${player.name} ao ${fromTeam.shortName} por R$ ${fmt(offer.fee)}?`,
      confirmText: "Vender",
    });
    if (!ok) return;
    const res = respondToOffer(state, offerId, "accept");
    log((res.accepted ? "✅ " : "❌ ") + res.message);
    toastResult(res);
    render();
    return;
  }

  if (action === "reject") {
    const ok = await confirmDialog({
      title: "Recusar proposta",
      message: `Recusar a proposta do ${fromTeam.shortName} por ${player.name}?`,
      confirmText: "Recusar", danger: true,
    });
    if (!ok) return;
    const res = respondToOffer(state, offerId, "reject");
    log("❌ " + res.message);
    toast(res.message, "info");
    render();
    return;
  }

  if (action === "counter") {
    const suggestion = Math.round(offer.fee * 1.25);
    const counterStr = await promptDialog({
      title: `Contraproposta · ${player.name}`,
      message: `${fromTeam.shortName} ofereceu R$ ${fmt(offer.fee)} · Valor de mercado: R$ ${fmt(player.marketValue)}.\nSua contraproposta (deve ser maior que a oferta atual):`,
      defaultValue: String(suggestion),
      type: "number",
      confirmText: "Contrapor",
    });
    if (!counterStr) return;
    const counterFee = Number(counterStr);
    const res = respondToOffer(state, offerId, "counter", counterFee);
    log((res.accepted ? "✅ " : "❌ ") + res.message);
    toastResult(res);
    render();
  }
}

async function handleAcademyAction(action, pid) {
  const p = state.players[pid];
  if (!p) return;
  let res;
  if (action === "promote") {
    res = promoteProspect(state, ui.myTeamId, pid);
  } else if (action === "sell") {
    const price = Math.max(50_000, Math.round(p.marketValue * 0.5));
    const ok = await confirmDialog({ title: "Vender prospecto", message: `Vender ${p.name} por R$ ${fmt(price)}?`, confirmText: "Vender" });
    if (!ok) return;
    res = sellProspect(state, ui.myTeamId, pid);
  } else if (action === "release") {
    const ok = await confirmDialog({ title: "Liberar prospecto", message: `Liberar ${p.name} da base? Esta ação não tem retorno.`, confirmText: "Liberar", danger: true });
    if (!ok) return;
    res = releaseProspect(state, ui.myTeamId, pid);
  }
  if (res) { log((res.ok ? "🌱 " : "❌ ") + res.message); toastResult(res, { okPrefix: "🌱 " }); }
  render();
}

async function handleBid(kind, pid) {
  const p = state.players[pid];
  const expSal = Math.round(Math.pow(Math.max(p.overall - 50, 1), 1.9) * 800);

  if (kind === "renew") {
    const exp = getRenewalExpectation(p);
    const sal = await promptDialog({
      title: `Renovar · ${p.name}`,
      message: `Salário atual: R$ ${fmt(p.contract.salary)} · Esperado: ~R$ ${fmt(exp)}.\nQuanto oferece por mês?`,
      defaultValue: String(exp), type: "number", confirmText: "Avançar",
    });
    if (!sal) return;
    const yearsStr = await promptDialog({
      title: `Duração do contrato`,
      message: `Idade ${p.age} (${p.age < 25 ? "jovem, prefere contratos longos" : p.age >= 33 ? "veterano, prefere contratos curtos" : "fase prime"}). Por quantos anos? (1-5)`,
      defaultValue: p.age < 25 ? "4" : p.age >= 33 ? "2" : "3", type: "number", confirmText: "Renovar",
    });
    if (!yearsStr) return;
    const res = renewContract(state, {
      teamId: ui.myTeamId, playerId: pid,
      salaryOffer: Number(sal), years: Number(yearsStr),
    });
    log((res.accepted ? "✅ " : "❌ ") + res.message);
    toastResult(res);
    render();
    return;
  }

  const round = getCurrentRound(state.competitions[ui.myCompId]) ?? 0;
  if (kind === "free") {
    const sal = await promptDialog({
      title: `Contratar · ${p.name}`,
      message: `Agente livre. Salário mensal (esperado ~R$ ${fmt(expSal)}):`,
      defaultValue: String(expSal), type: "number", confirmText: "Contratar",
    });
    if (!sal) return;
    const res = signFreeAgent(state, { teamId: ui.myTeamId, playerId: pid, salaryOffer: Number(sal), currentRound: round });
    log((res.accepted ? "✅ " : "❌ ") + res.message);
    toastResult(res);
  } else {
    const fee = await promptDialog({
      title: `Proposta · ${p.name}`,
      message: `Valor de mercado: R$ ${fmt(p.marketValue)}. Quanto oferece pela compra?`,
      defaultValue: String(p.marketValue), type: "number", confirmText: "Avançar",
    });
    if (!fee) return;
    const sal = await promptDialog({
      title: `Salário · ${p.name}`,
      message: `Salário mensal oferecido (esperado ~R$ ${fmt(expSal)}):`,
      defaultValue: String(expSal), type: "number", confirmText: "Ofertar",
    });
    if (!sal) return;
    const res = makeBid(state, {
      fromTeamId: ui.myTeamId, playerId: pid, fee: Number(fee), salaryOffer: Number(sal), currentRound: round,
    });
    log((res.accepted ? "✅ " : "❌ ") + res.message);
    toastResult(res);
  }
  state.teams[ui.myTeamId].lineup = state.teams[ui.myTeamId].lineup
    .filter(id => state.teams[ui.myTeamId].squad.includes(id));
  render();
}

function log(msg) { state.log.push(`[R${getCurrentRound(state.competitions[ui.myCompId]) ?? "fim"}] ${msg}`); }
