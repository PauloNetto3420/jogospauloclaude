// Dashboard unificado — integra escalação, classificação, mercado, finanças
// e tela de jogo com playback minuto a minuto.

import { createRng } from "./utils/rng.js";
import { createTeam } from "./models/team.js";
import { generateSquad, syncPlayerIdCounter } from "./models/player.js";
import { createCompetition } from "./models/competition.js";
import {
  sortStandings, getCurrentRound, decrementSuspensions, getMatchesOfRound,
  applyMatchResult, recalcTopScorers, applyMatchEffects,
} from "./engine/season.js";
import { simulateMatch, createMatchSimulator, FORMATIONS } from "./engine/match.js";
import { weeklyTick } from "./engine/finance.js";
import {
  listFreeAgents, listMarket, makeBid, signFreeAgent, generateFreeAgents,
  runAITransfers, renewContract, getRenewalExpectation,
  generateIncomingOffers, listIncomingOffers, respondToOffer,
  generateTransferRequests, listTransferRequests, resolveTransferRequest, unlistPlayer,
  isTransferWindowOpen, getTransferWindowStatus,
} from "./engine/transfers.js";
import { isSeasonOver, endSeason } from "./engine/season-end.js";
import { generateNewsForRound, generateSeasonEndNews } from "./engine/news.js";
import {
  createCupCompetition, getCupLegsForRound, applyCupLegResult,
  maybeDrawNextPhase, drawPhase, payPhasePrizes,
  CUP_PHASE_ORDER, CUP_PHASE_META, CHAMPION_BONUS,
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
  applyTraining, pickAITrainingFocus, TRAINING_FOCI, DEFAULT_TRAINING, FOCUS_KEYS,
} from "./engine/training.js";
import { saveGame, loadGame, listSaves, deleteSave } from "./db.js";
import { SERIE_A_SEED, SERIE_B_SEED, SERIE_C_SEED } from "../data/teams.seed.js";
import { TEAM_LOGOS } from "../data/team-logos.js";

// -------------------- Constantes --------------------
const POS_GROUP = {
  GOL: "GOL", ZAG: "DEF", LD: "DEF", LE: "DEF",
  VOL: "MID", MEI: "MID", PE: "ATA", PD: "ATA", ATA: "ATA",
};

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
let calendarMode = "mine"; // "mine" | "all"
let calendarCompId = null;  // se null usa MY_COMP_ID

// -------------------- Estado global --------------------
let state = null;
let rng = null;
let view = "lineup";
let MY_TEAM_ID = null;
let MY_COMP_ID = null;          // qual campeonato o usuário disputa
let standingsView = null;       // qual tabela está aberta na aba Classificação

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
  state = save;
  MY_TEAM_ID = save.managedTeamId;
  MY_COMP_ID = SERIE_A_SEED.some(t => t.id === MY_TEAM_ID) ? "brasileirao_a" : "brasileirao_b";
  // Após mudança de divisão por rebaixamento/acesso, recalcula
  if (!state.competitions[MY_COMP_ID]?.teams.includes(MY_TEAM_ID)) {
    MY_COMP_ID = Object.keys(state.competitions)
      .find(cid => state.competitions[cid].teams.includes(MY_TEAM_ID)) ?? MY_COMP_ID;
  }
  standingsView = MY_COMP_ID;
  rng = createRng(state.settings?.seed ?? Date.now());
  syncPlayerIdCounter(state.players);

  applyTeamTheme(state.teams[MY_TEAM_ID].colors);

  $btnPlay.style.display = "";
  view = "lineup";
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
  MY_TEAM_ID = teamId;
  if (SERIE_A_SEED.some(t => t.id === teamId)) MY_COMP_ID = "brasileirao_a";
  else if (SERIE_B_SEED.some(t => t.id === teamId)) MY_COMP_ID = "brasileirao_b";
  else MY_COMP_ID = "brasileirao_c_p1"; // Série C começa na 1ª Fase
  standingsView = MY_COMP_ID;
  const seed = Date.now() & 0xffffffff;
  rng = createRng(seed);

  state = {
    saveId: `save_${Date.now()}`,
    season: 2026,
    currentDate: "2026-04-01",
    managedTeamId: MY_TEAM_ID,
    teams: {}, players: {}, freeAgents: [],
    competitions: {}, log: [],
    transferOffers: [],
    transferRequests: [],
    settings: { difficulty: "normal", language: "pt-BR", seed },
  };

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
    if (t.id !== MY_TEAM_ID) {
      t.tactics.formation = aiFormations[rng.int(0, aiFormations.length - 1)];
      t.tactics.training = pickAITrainingFocus(rng, t.tactics.formation);
    }
  }

  state.teams[MY_TEAM_ID].lineup = autoLineup(state.teams[MY_TEAM_ID]);

  applyTeamTheme(state.teams[MY_TEAM_ID].colors);

  try { await saveGame(state); } catch (e) { console.warn("Save inicial falhou:", e); }

  $btnPlay.style.display = "";
  view = "lineup";
  render();
}

// -------------------- Render principal --------------------
function renderShell() {
  const my = state.teams[MY_TEAM_ID];
  // Se a competição atual sumiu (ex.: subcomps da Série C após endSeason),
  // recoloca o usuário na sua nova divisão antes de seguir.
  if (!state.competitions[MY_COMP_ID]) {
    const resolved = resolveUserCompetition();
    if (resolved) { MY_COMP_ID = resolved; standingsView = MY_COMP_ID; }
  }
  const comp = state.competitions[MY_COMP_ID];
  if (!comp) {
    // Ainda nada — não trava a UI, apenas avisa
    console.warn("MY_COMP_ID inválido e nenhuma competição encontrada para", MY_TEAM_ID);
    return;
  }
  const round = getCurrentRound(comp);
  const total = Math.max(...comp.fixtures.map(m => m.round));

  const nextMatch = findNextMatch();
  const nextOpp = nextMatch ? state.teams[
    nextMatch.homeTeamId === MY_TEAM_ID ? nextMatch.awayTeamId : nextMatch.homeTeamId
  ] : null;
  const nextLocation = nextMatch
    ? (nextMatch.homeTeamId === MY_TEAM_ID ? "🏠" : "✈️")
    : "";

  $topInfo.innerHTML = `
    <div>Temporada <b>${state.season}</b></div>
    <div>Rodada <b>${round ?? total}/${total}</b></div>
    ${nextOpp ? `<div>Próx. <b>${nextLocation} vs ${nextOpp.shortName}</b></div>` : ""}
    <div>Caixa <b>R$ ${fmt(my.finances.balance)}</b></div>
  `;

  $teamCard.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
      ${teamLogo(MY_TEAM_ID, 32)}
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
      <button class="nav-btn ${view === v.id ? "active" : ""}" data-view="${v.id}" style="display:flex;align-items:center;gap:12px">
        <span class="icon">${v.icon}</span>${v.label}${badge}
      </button>
    `;
  }).join("");
  $nav.querySelectorAll("[data-view]").forEach(btn => {
    btn.onclick = () => { view = btn.dataset.view; render(); };
  });

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
      const oppId = next.match.homeTeamId === MY_TEAM_ID
        ? next.match.awayTeamId
        : next.match.homeTeamId;
      const oppShort = state.teams[oppId]?.shortName ?? "?";
      const local = next.match.homeTeamId === MY_TEAM_ID ? "🏠" : "✈️";
      const prefix = next.isCup ? "🏆 COPA" : `▶ RODADA ${round}`;
      $btnPlay.textContent = `${prefix} · ${local} vs ${oppShort}`;
    } else {
      // Sem partidas do usuário nesta rodada — simulação rápida da IA
      $btnPlay.textContent = `▶ PRÓXIMA RODADA (R${round})`;
    }
  }
  $btnPlay.onclick = playRound;

  // Botão de "novo jogo" injetado uma vez
  if (!document.getElementById("btn-reset-save")) {
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
}

function render() {
  renderShell();
  if (view === "lineup")    $main.innerHTML = renderLineup();
  if (view === "standings") $main.innerHTML = renderStandings();
  if (view === "cup")       $main.innerHTML = renderCup();
  if (view === "calendar")  $main.innerHTML = renderCalendar();
  if (view === "market")    $main.innerHTML = renderMarket();
  if (view === "academy")   $main.innerHTML = renderAcademy();
  if (view === "finance")   $main.innerHTML = renderFinance();
  if (view === "inbox")     $main.innerHTML = renderInbox();
  wireView();
}

// -------------------- View: Escalação --------------------
function renderLineup() {
  const team = state.teams[MY_TEAM_ID];
  const lineup = new Set(team.lineup);
  const squad = team.squad
    .map(pid => state.players[pid])
    .sort((a, b) => (lineup.has(b.id) - lineup.has(a.id)) || (b.overall - a.overall));

  const startersByGroup = groupCount(team.lineup.map(pid => state.players[pid]));
  const totalStarters = team.lineup.length;
  const counterClass = totalStarters === 11 ? "ok" : "warn";

  const currentFormation = team.tactics?.formation || "4-3-3";
  const fSlots = FORMATIONS[currentFormation].slots;

  return `
    <div class="view-title">Escalação</div>
    <div class="view-sub">
      Escolha a formação e os 11 titulares. Lesionados e suspensos não jogam.
    </div>

    ${renderNextMatchCard()}

    ${renderTrainingCard(team)}

    <div class="card">
      <h3>Tática</h3>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px">
        ${Object.entries(FORMATIONS).map(([key, f]) => `
          <button class="btn-toggle ${key === currentFormation ? "on" : ""}" data-formation="${key}">
            ${key}
          </button>
        `).join("")}
      </div>
      <div style="display:grid;grid-template-columns:1.2fr 1fr 1fr;gap:14px;font-size:12px">
        <div>
          <div style="color:var(--muted);margin-bottom:4px">Estilo</div>
          <div style="font-weight:600">${FORMATIONS[currentFormation].label}</div>
        </div>
        <div>
          <div style="color:var(--muted);margin-bottom:4px">Slots</div>
          <div style="font-weight:600">GOL ${fSlots.GOL} · DEF ${fSlots.DEF} · MID ${fSlots.MID} · ATA ${fSlots.ATA}</div>
        </div>
        <div>
          <div style="color:var(--muted);margin-bottom:4px">Modificadores</div>
          <div style="font-weight:600">
            Ataque <span style="color:${FORMATIONS[currentFormation].atk >= 1 ? "var(--accent)" : "var(--danger)"}">${pct(FORMATIONS[currentFormation].atk)}</span>
            · Defesa <span style="color:${FORMATIONS[currentFormation].def >= 1 ? "var(--accent)" : "var(--danger)"}">${pct(FORMATIONS[currentFormation].def)}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <div class="formation-counter">
          Titulares: <span class="count ${counterClass}">${totalStarters}/11</span>
          · GOL <span class="count ${startersByGroup.GOL === fSlots.GOL ? "ok" : "warn"}">${startersByGroup.GOL}/${fSlots.GOL}</span>
          · DEF <span class="count ${startersByGroup.DEF === fSlots.DEF ? "ok" : "warn"}">${startersByGroup.DEF}/${fSlots.DEF}</span>
          · MID <span class="count ${startersByGroup.MID === fSlots.MID ? "ok" : "warn"}">${startersByGroup.MID}/${fSlots.MID}</span>
          · ATA <span class="count ${startersByGroup.ATA === fSlots.ATA ? "ok" : "warn"}">${startersByGroup.ATA}/${fSlots.ATA}</span>
        </div>
        <button class="btn btn-sm btn-secondary" id="btn-auto">Auto-escalar</button>
      </div>
      <table>
        <thead>
          <tr>
            <th></th><th>Nome</th><th>Pos</th><th>Idade</th><th>OVR</th>
            <th>Forma</th><th>Salário</th><th>Status</th><th></th>
          </tr>
        </thead>
        <tbody>
          ${squad.map(p => {
            const isStarter = lineup.has(p.id);
            const inj = p.status.injury;
            const sus = p.status.suspendedMatches > 0;
            const blocked = inj || sus;
            return `
              <tr class="${isStarter ? "starter" : ""}">
                <td>${isStarter ? "⚽" : ""}</td>
                <td><b data-player="${p.id}">${p.name}</b></td>
                <td><span class="badge badge-pos">${p.position}</span></td>
                <td>${p.age}</td>
                <td><span class="badge badge-ovr ${ovrClass(p.overall)}">${p.overall}</span></td>
                <td>${p.status.form.toFixed(1)}</td>
                <td>R$ ${fmt(p.contract.salary)}</td>
                <td>${
                  inj ? `<span class="badge badge-injury">Lesão ${inj.weeksOut}sem</span>` :
                  sus ? `<span class="badge badge-suspended">Suspenso</span>` :
                  getContractYearsLeft(p) <= 0 ? `<span class="badge badge-injury">Contrato vencendo</span>` :
                  getContractYearsLeft(p) === 1 ? `<span class="badge badge-suspended">1 ano</span>` : ""
                }</td>
                <td>
                  <button class="btn-toggle ${isStarter ? "on" : ""}" data-toggle="${p.id}" ${blocked ? "disabled" : ""}>
                    ${isStarter ? "Titular" : "Escalar"}
                  </button>
                </td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
}

// -------------------- View: Classificação --------------------
function renderStandings() {
  // Branch especial pra Série C (multi-fase)
  if ((standingsView || "").startsWith("brasileirao_c")) {
    return renderStandingsSerieC();
  }
  const comp = state.competitions[standingsView];
  const sorted = sortStandings(comp, state.teams);
  const round = getCurrentRound(comp);
  const total = Math.max(...comp.fixtures.map(m => m.round));
  const isMy = standingsView === MY_COMP_ID;

  return `
    <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:16px">
      <div>
        <div class="view-title" style="margin-bottom:0">${comp.name}</div>
        <div class="view-sub" style="margin-bottom:0">Rodada ${round ?? total} de ${total}${isMy ? "" : " · acompanhando"}</div>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn-toggle ${standingsView === "brasileirao_a" ? "on" : ""}" data-comp="brasileirao_a">Série A</button>
        <button class="btn-toggle ${standingsView === "brasileirao_b" ? "on" : ""}" data-comp="brasileirao_b">Série B</button>
        <button class="btn-toggle ${(standingsView || "").startsWith("brasileirao_c") ? "on" : ""}" data-comp="brasileirao_c_p1">Série C</button>
      </div>
    </div>

    <div class="grid-2">
      <div class="card">
        <h3>Tabela${comp.tier === 1 ? " · Top 4 = Libertadores · 4 últimos = rebaixados" : " · Top 4 = sobem · 4 últimos = caem"}</h3>
        <table>
          <thead><tr><th>#</th><th>Time</th><th>P</th><th>J</th><th>V</th><th>E</th><th>D</th><th>GP</th><th>GC</th><th>SG</th></tr></thead>
          <tbody>
            ${sorted.map((s, i) => `
              <tr class="${s.teamId === MY_TEAM_ID ? "highlight" : ""}">
                <td>${i + 1}</td>
                <td><span style="margin-right:8px">${teamLogo(s.teamId, 20)}</span><b>${state.teams[s.teamId].name}</b></td>
                <td><b style="color:var(--accent)">${s.points}</b></td>
                <td>${s.played}</td><td>${s.wins}</td><td>${s.draws}</td><td>${s.losses}</td>
                <td>${s.goalsFor}</td><td>${s.goalsAgainst}</td><td>${s.goalsFor - s.goalsAgainst}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>

      <div class="card">
        <h3>Artilharia</h3>
        ${comp.topScorers.length ? `
          <table>
            <thead><tr><th>#</th><th>Jogador</th><th>Clube</th><th>Gols</th></tr></thead>
            <tbody>
              ${comp.topScorers.slice(0, 10).map((s, i) => `
                <tr>
                  <td>${i + 1}</td><td data-player="${s.playerId}">${s.playerName}</td>
                  <td>${state.teams[s.teamId]?.shortName ?? "-"}</td>
                  <td><b>${s.goals}</b></td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        ` : `<p style="color:var(--muted)">Sem gols ainda.</p>`}
      </div>
    </div>

    <div class="card">
      <h3>Próximos Jogos do ${state.teams[MY_TEAM_ID].shortName}</h3>
      ${renderUpcoming()}
    </div>
  `;
}

function renderStandingsSerieC() {
  const meta = state.serieCMeta || { currentPhase: "phase1" };
  const p1 = state.competitions.brasileirao_c_p1;
  const ga = state.competitions.brasileirao_c_ga;
  const gb = state.competitions.brasileirao_c_gb;
  const fn = state.competitions.brasileirao_c_final;

  const seriesCButtonsHTML = `
    <div style="display:flex;gap:6px;flex-wrap:wrap">
      <button class="btn-toggle ${standingsView === "brasileirao_a" ? "on" : ""}" data-comp="brasileirao_a">Série A</button>
      <button class="btn-toggle ${standingsView === "brasileirao_b" ? "on" : ""}" data-comp="brasileirao_b">Série B</button>
      <button class="btn-toggle on" data-comp="brasileirao_c_p1">Série C</button>
    </div>
  `;

  const phaseLabel = {
    phase1: "1ª Fase em andamento",
    groups: "Quadrangulares em andamento",
    final: "Final em andamento",
    done: meta.champion ? `🏆 Campeão: ${state.teams[meta.champion].name}` : "Temporada encerrada",
  }[meta.currentPhase] || "—";

  const phase1Table = p1 ? `
    <div class="card">
      <h3>1ª Fase · Pontos Corridos${meta.currentPhase === "phase1" ? " (em andamento)" : " (encerrada)"}</h3>
      <p style="font-size:11px;color:var(--muted);margin-bottom:8px">
        Os 8 primeiros avançam aos quadrangulares · 2 últimos rebaixados.
      </p>
      ${renderStandingsTable(p1, { highlightSlots: [8, 18] })}
    </div>
  ` : "";

  const groupsHTML = (ga && gb) ? `
    <div class="grid-2">
      <div class="card">
        <h3>Grupo A · ${meta.currentPhase === "groups" ? "em andamento" : "encerrado"}</h3>
        <p style="font-size:11px;color:var(--muted);margin-bottom:8px">
          1º + 2º sobem para a Série B. Líder vai à final.
        </p>
        ${renderStandingsTable(ga, { highlightSlots: [1, 2] })}
      </div>
      <div class="card">
        <h3>Grupo B · ${meta.currentPhase === "groups" ? "em andamento" : "encerrado"}</h3>
        <p style="font-size:11px;color:var(--muted);margin-bottom:8px">
          1º + 2º sobem para a Série B. Líder vai à final.
        </p>
        ${renderStandingsTable(gb, { highlightSlots: [1, 2] })}
      </div>
    </div>
  ` : "";

  const finalHTML = fn ? `
    <div class="card">
      <h3>Grande Final · ${meta.champion ? "encerrada" : "em andamento"}</h3>
      ${renderSerieCFinal(fn, meta)}
    </div>
  ` : "";

  return `
    <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:16px">
      <div>
        <div class="view-title" style="margin-bottom:0">Série C · ${state.season}</div>
        <div class="view-sub" style="margin-bottom:0">${phaseLabel}</div>
      </div>
      ${seriesCButtonsHTML}
    </div>
    ${phase1Table}
    ${groupsHTML}
    ${finalHTML}
  `;
}

function renderStandingsTable(comp, { highlightSlots = [] } = {}) {
  const sorted = sortStandings(comp, state.teams);
  return `
    <table>
      <thead><tr><th>#</th><th>Time</th><th>P</th><th>J</th><th>V</th><th>E</th><th>D</th><th>GP</th><th>GC</th><th>SG</th></tr></thead>
      <tbody>
        ${sorted.map((s, i) => {
          const pos = i + 1;
          let rowStyle = "";
          if (s.teamId === MY_TEAM_ID) rowStyle = ' class="highlight"';
          else if (highlightSlots[0] && pos <= highlightSlots[0]) rowStyle = ' style="background:rgba(var(--accent-rgb),0.04)"';
          else if (highlightSlots[1] && pos >= sorted.length - 1 && highlightSlots[1] >= sorted.length - 1) rowStyle = ' style="background:rgba(239,68,68,0.06)"';
          return `
            <tr${rowStyle}>
              <td>${pos}</td>
              <td><span style="margin-right:8px">${teamLogo(s.teamId, 20)}</span><b>${state.teams[s.teamId].name}</b></td>
              <td><b style="color:var(--accent)">${s.points}</b></td>
              <td>${s.played}</td><td>${s.wins}</td><td>${s.draws}</td><td>${s.losses}</td>
              <td>${s.goalsFor}</td><td>${s.goalsAgainst}</td><td>${s.goalsFor - s.goalsAgainst}</td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
  `;
}

function renderSerieCFinal(fn, meta) {
  const teamA = state.teams[fn.teamAId];
  const teamB = state.teams[fn.teamBId];
  const r26 = fn.fixtures.find(f => f.round === 26);
  const r27 = fn.fixtures.find(f => f.round === 27);
  const champLine = meta.champion
    ? `<div style="margin-top:10px;font-size:13px"><b style="color:var(--accent)">🏆 Campeão: ${state.teams[meta.champion].name}</b> · Agregado A ${fn.aggregate?.teamA ?? "?"} × B ${fn.aggregate?.teamB ?? "?"}</div>`
    : "";
  const legHTML = (leg) => {
    if (!leg) return "";
    if (leg.played) {
      return `<span style="font-weight:700">${leg.score.home} × ${leg.score.away}</span>`;
    }
    return `<span style="color:var(--muted)">a jogar</span>`;
  };
  return `
    <div style="font-size:13px">
      <div style="margin-bottom:6px">
        Ida (R26): ${teamLogo(r26?.homeTeamId ?? fn.teamBId, 18)} ${state.teams[r26?.homeTeamId ?? fn.teamBId].shortName}
        ${legHTML(r26)}
        ${state.teams[r26?.awayTeamId ?? fn.teamAId].shortName} ${teamLogo(r26?.awayTeamId ?? fn.teamAId, 18)}
      </div>
      <div>
        Volta (R27): ${teamLogo(r27?.homeTeamId ?? fn.teamAId, 18)} ${state.teams[r27?.homeTeamId ?? fn.teamAId].shortName}
        ${legHTML(r27)}
        ${state.teams[r27?.awayTeamId ?? fn.teamBId].shortName} ${teamLogo(r27?.awayTeamId ?? fn.teamBId, 18)}
      </div>
      ${champLine}
    </div>
  `;
}

function renderUpcoming() {
  const comp = state.competitions[MY_COMP_ID];
  const next = comp.fixtures.filter(m => !m.played &&
    (m.homeTeamId === MY_TEAM_ID || m.awayTeamId === MY_TEAM_ID)).slice(0, 3);
  if (!next.length) return `<p style="color:var(--muted)">—</p>`;
  return `
    <table>
      <thead><tr><th>Rodada</th><th>Mandante</th><th></th><th>Visitante</th><th></th></tr></thead>
      <tbody>
        ${next.map(m => `
          <tr>
            <td>${m.round}</td>
            <td>${state.teams[m.homeTeamId].name}</td>
            <td style="color:var(--muted)">vs</td>
            <td>${state.teams[m.awayTeamId].name}</td>
            <td style="color:var(--muted)">${m.homeTeamId === MY_TEAM_ID ? "🏠 Casa" : "✈️ Fora"}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

// -------------------- View: Mercado --------------------
function renderMarket() {
  const my = state.teams[MY_TEAM_ID];
  const free = listFreeAgents(state).sort((a, b) => b.overall - a.overall).slice(0, 12);
  const market = listMarket(state, MY_TEAM_ID).sort((a, b) => b.overall - a.overall).slice(0, 12);

  const pendingOffers = listIncomingOffers(state);
  const pendingRequests = listTransferRequests(state);
  const listedPlayers = my.squad
    .map(id => state.players[id])
    .filter(p => p?.status?.transferListed);
  const round = getCurrentRoundSafe();
  const windowStatus = getTransferWindowStatus(round);
  const isOpen = windowStatus.open;

  return `
    <div class="view-title">Mercado</div>
    <div class="view-sub">Caixa disponível: <b style="color:var(--accent)">R$ ${fmt(my.finances.balance)}</b></div>

    <div class="card" style="border-left:3px solid ${isOpen ? "var(--accent)" : "var(--danger)"};padding:12px 16px">
      <div style="display:flex;align-items:center;gap:10px">
        <span style="font-size:20px">${windowStatus.icon}</span>
        <div>
          <div style="font-weight:700;font-size:14px">${isOpen ? "Janela de transferências aberta" : "Janela de transferências fechada"}</div>
          <div style="color:var(--muted);font-size:12px;margin-top:2px">${windowStatus.label}</div>
        </div>
      </div>
    </div>

    ${pendingRequests.length ? renderTransferRequestsCard(pendingRequests) : ""}

    ${pendingOffers.length ? renderIncomingOffersCard(pendingOffers, isOpen) : ""}

    ${listedPlayers.length ? renderListedPlayersCard(listedPlayers) : ""}

    <div class="card" style="${isOpen ? "" : "opacity:0.55"}">
      <h3>Agentes Livres ${isOpen ? `<span style="color:var(--muted);font-weight:400;font-size:12px">(sem custo de transferência)</span>` : `<span style="color:var(--danger);font-size:11px">· bloqueado fora da janela</span>`}</h3>
      ${renderPlayerTable(free, "free", !isOpen)}
    </div>

    <div class="card" style="${isOpen ? "" : "opacity:0.55"}">
      <h3>Disponíveis em Outros Clubes ${isOpen ? "" : `<span style="color:var(--danger);font-size:11px">· bloqueado fora da janela</span>`}</h3>
      ${renderPlayerTable(market, "buy", !isOpen)}
    </div>
  `;
}

function renderTransferRequestsCard(requests) {
  return `
    <div class="card" style="border-left:3px solid var(--danger)">
      <h3>🔻 Pedidos de Transferência <span style="color:var(--muted);font-weight:400;font-size:12px">(${requests.length})</span></h3>
      <p style="font-size:11px;color:var(--muted);margin-bottom:8px">
        Jogador insatisfeito pediu pra sair. Você pode listá-lo (vira alvo da IA),
        prometer mais espaço (recupera moral) ou recusar (moral despenca).
      </p>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${requests.map(r => {
          const p = state.players[r.playerId];
          if (!p) return "";
          const reasonLabel = ({
            very_low_morale: "Moral muito baixa",
            low_morale: "Moral baixa",
            veteran_unhappy: "Veterano insatisfeito",
          })[r.reason] || r.reason;
          return `
            <div style="background:var(--bg-2);border:1px solid var(--border);border-radius:6px;padding:10px 12px;display:flex;justify-content:space-between;align-items:center;gap:12px">
              <div style="flex:1">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
                  <b data-player="${p.id}" class="clickable-player">${p.name}</b>
                  <span class="badge badge-pos">${p.position}</span>
                  <span class="badge badge-ovr ${ovrClass(p.overall)}">${p.overall}</span>
                </div>
                <div style="font-size:11px;color:var(--muted)">
                  Motivo: ${reasonLabel} (moral ${r.morale}) · Valor estimado: R$ ${fmt(p.marketValue)}
                </div>
              </div>
              <div style="display:flex;gap:6px;flex-wrap:wrap">
                <button class="btn btn-sm btn-secondary" data-req="list" data-rid="${r.id}">Listar p/ venda</button>
                <button class="btn btn-sm btn-secondary" data-req="promise" data-rid="${r.id}">Prometer espaço</button>
                <button class="btn btn-sm btn-secondary" data-req="reject" data-rid="${r.id}" style="color:var(--danger)">Recusar</button>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    </div>
  `;
}

function renderListedPlayersCard(players) {
  return `
    <div class="card" style="border-left:3px solid var(--warning)">
      <h3>⚠️ Listados para venda <span style="color:var(--muted);font-weight:400;font-size:12px">(${players.length})</span></h3>
      <p style="font-size:11px;color:var(--muted);margin-bottom:8px">
        Esses jogadores estão sinalizados pra sair. A IA vai priorizá-los nas propostas.
      </p>
      <div style="display:flex;flex-direction:column;gap:6px">
        ${players.map(p => `
          <div style="background:var(--bg-2);border:1px solid var(--border);border-radius:6px;padding:8px 12px;display:flex;justify-content:space-between;align-items:center">
            <div style="display:flex;align-items:center;gap:8px">
              <b data-player="${p.id}" class="clickable-player">${p.name}</b>
              <span class="badge badge-pos">${p.position}</span>
              <span class="badge badge-ovr ${ovrClass(p.overall)}">${p.overall}</span>
              <span style="font-size:11px;color:var(--muted)">· R$ ${fmt(p.marketValue)}</span>
            </div>
            <button class="btn btn-sm btn-secondary" data-unlist="${p.id}">Retirar da lista</button>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function renderIncomingOffersCard(offers) {
  return `
    <div class="card" style="border-left:3px solid var(--warning)">
      <h3>📩 Propostas Recebidas <span style="color:var(--muted);font-weight:400;font-size:12px">(${offers.length} pendente${offers.length > 1 ? "s" : ""})</span></h3>
      <div style="display:flex;flex-direction:column;gap:10px;margin-top:8px">
        ${offers.map(o => {
          const fromTeam = state.teams[o.fromTeamId];
          const player = state.players[o.playerId];
          if (!fromTeam || !player) return "";
          const expiresIn = Math.max(0, 4 - (getCurrentRoundSafe() - o.round));
          return `
            <div style="background:var(--bg-2);border:1px solid var(--border);border-radius:6px;padding:12px 14px">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:8px">
                <div style="flex:1">
                  <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
                    ${teamLogo(fromTeam.id, 24)}
                    <b style="font-size:14px">${fromTeam.name}</b>
                    <span style="color:var(--muted);font-size:11px">propõe por</span>
                    <b style="color:var(--accent-2)" data-player="${player.id}" class="clickable-player">${player.name}</b>
                    <span class="badge badge-pos">${player.position}</span>
                    <span class="badge badge-ovr ${ovrClass(player.overall)}">${player.overall}</span>
                  </div>
                  <div style="font-size:12px;color:var(--muted)">
                    Oferta: <b style="color:var(--accent)">R$ ${fmt(o.fee)}</b>
                    · Valor de mercado: R$ ${fmt(player.marketValue)}
                    · Salário: R$ ${fmt(o.salaryOffer)}/mês (atual R$ ${fmt(player.contract.salary)})
                  </div>
                  <div style="font-size:10px;color:var(--muted);margin-top:4px">
                    Expira em ${expiresIn} rodada${expiresIn !== 1 ? "s" : ""}
                    ${o.counterAttempts ? ` · ${o.counterAttempts} contraproposta${o.counterAttempts > 1 ? "s" : ""} já feita${o.counterAttempts > 1 ? "s" : ""}` : ""}
                  </div>
                </div>
                <div style="display:flex;gap:6px;flex-wrap:wrap">
                  <button class="btn btn-sm" data-offer="accept" data-oid="${o.id}">Aceitar</button>
                  <button class="btn btn-sm btn-secondary" data-offer="counter" data-oid="${o.id}">Contrapor</button>
                  <button class="btn btn-sm btn-secondary" data-offer="reject" data-oid="${o.id}" style="color:var(--danger)">Recusar</button>
                </div>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    </div>
  `;
}

function getCurrentRoundSafe() {
  return getCurrentRound(state.competitions[MY_COMP_ID]) ?? 0;
}

function renderPlayerTable(players, kind, disabled = false) {
  if (!players.length) return `<p style="color:var(--muted)">Nenhum jogador disponível.</p>`;
  return `
    <table>
      <thead><tr><th>Nome</th><th>Pos</th><th>Idade</th><th>OVR</th><th>POT</th><th>Clube</th><th>Salário</th><th>Valor</th><th></th></tr></thead>
      <tbody>
        ${players.map(p => `
          <tr>
            <td><b data-player="${p.id}">${p.name}</b></td>
            <td><span class="badge badge-pos">${p.position}</span></td>
            <td>${p.age}</td>
            <td><span class="badge badge-ovr ${ovrClass(p.overall)}">${p.overall}</span></td>
            <td style="color:var(--muted)">${p.potential}</td>
            <td>${p.teamId ? state.teams[p.teamId]?.shortName ?? "-" : "<i style='color:var(--accent)'>livre</i>"}</td>
            <td>R$ ${fmt(p.contract.salary)}</td>
            <td>R$ ${fmt(p.marketValue)}</td>
            <td><button class="btn btn-sm" data-action="${kind}" data-pid="${p.id}" ${disabled ? "disabled" : ""}>${kind === "free" ? "Contratar" : "Ofertar"}</button></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

// -------------------- View: Base (Academia) --------------------
function renderAcademy() {
  const team = state.teams[MY_TEAM_ID];
  const academy = ensureAcademy(team);
  const prospects = academy.prospects.map(pid => state.players[pid]).filter(Boolean)
    .sort((a, b) => b.potential - a.potential);

  // Faixa de geração esperada pela reputação do clube
  const rep = team.reputation;
  const expectedRange =
    rep >= 90 ? "4 a 5"  :
    rep >= 80 ? "3 a 4"  :
    rep >= 70 ? "2 a 3"  :
    rep >= 60 ? "1 a 3"  :
                "1 a 2";

  return `
    <div class="view-title">Categoria de Base</div>
    <div class="view-sub">
      Slots: <b>${prospects.length}/${MAX_ACADEMY_SLOTS}</b>
      · A cada temporada o ${team.shortName} (rep ${rep}) promove <b>${expectedRange}</b> jovens
      ${prospects.length >= MAX_ACADEMY_SLOTS ? " · ⚠️ Base cheia — prospectos novos serão perdidos sem vaga!" : ""}
    </div>

    <div class="card">
      <h3>Prospectos da Base do ${team.name}</h3>
      <p style="font-size:11px;color:var(--muted);margin-bottom:12px">
        Jogadores de 14-17 anos. Aos 19 são automaticamente liberados se não forem promovidos.
        Promova ao elenco, venda (50% do valor de mercado) ou libere.
      </p>
      ${prospects.length === 0 ? `
        <p style="color:var(--muted);font-size:13px;padding:14px 0">
          Nenhum prospecto no momento. A próxima leva chega no início da próxima temporada.
        </p>
      ` : `
        <table>
          <thead>
            <tr>
              <th>Nome</th><th>Pos</th><th>Idade</th><th>OVR</th><th>POT</th>
              <th>Traits</th><th>Valor (50%)</th><th>Ações</th>
            </tr>
          </thead>
          <tbody>
            ${prospects.map(p => {
              const sellPrice = Math.max(50_000, Math.round(p.marketValue * 0.5));
              const traitsHtml = (p.traits || []).slice(0, 2).map(t => `<span class="trait-chip ${
                t === "promessa" || t === "finalizador" || t === "lider_nato" || t === "tecnico" || t === "veloz" || t === "cabeceador" ? "positive" :
                t === "lesoes_frequentes" || t === "inconsistente" || t === "pe_de_obra" ? "negative" : ""
              }">${t}</span>`).join("") || "—";
              return `
                <tr>
                  <td><b data-player="${p.id}">${p.name}</b></td>
                  <td><span class="badge badge-pos">${p.position}</span></td>
                  <td>${p.age}</td>
                  <td><span class="badge badge-ovr ${ovrClass(p.overall)}">${p.overall}</span></td>
                  <td><b style="color:var(--accent-2)">${p.potential}</b></td>
                  <td style="font-size:11px">${traitsHtml}</td>
                  <td>R$ ${fmt(sellPrice)}</td>
                  <td>
                    <button class="btn btn-sm" data-academy="promote" data-pid="${p.id}">Promover</button>
                    <button class="btn btn-sm btn-secondary" data-academy="sell" data-pid="${p.id}">Vender</button>
                    <button class="btn btn-sm btn-secondary" data-academy="release" data-pid="${p.id}" style="color:var(--danger)">Liberar</button>
                  </td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      `}
    </div>
  `;
}

// -------------------- View: Finanças --------------------
function renderFinance() {
  const my = state.teams[MY_TEAM_ID];
  const monthlyWages = my.squad.reduce((s, pid) => s + (state.players[pid]?.contract.salary ?? 0), 0);
  const weeklyWages = Math.round(monthlyWages / 4);
  const weeklyIncome = Math.round(my.finances.monthlyIncome / 4);
  const net = weeklyIncome - weeklyWages - 120_000;

  return `
    <div class="view-title">Finanças</div>
    <div class="view-sub">${my.name}</div>

    <div class="grid-2">
      <div class="card">
        <h3>Resumo</h3>
        <table>
          <tbody>
            <tr><td>Caixa</td><td style="text-align:right"><b style="color:var(--accent)">R$ ${fmt(my.finances.balance)}</b></td></tr>
            <tr><td>Dívida</td><td style="text-align:right">${my.finances.debt > 0 ? `<b style="color:var(--danger)">R$ ${fmt(my.finances.debt)}</b>` : "R$ 0"}</td></tr>
            <tr><td>Receita semanal</td><td style="text-align:right;color:var(--accent)">+ R$ ${fmt(weeklyIncome)}</td></tr>
            <tr><td>Folha semanal</td><td style="text-align:right;color:var(--danger)">- R$ ${fmt(weeklyWages)}</td></tr>
            <tr><td>Estrutura semanal</td><td style="text-align:right;color:var(--danger)">- R$ 120.000</td></tr>
            <tr style="border-top:1px solid var(--border)">
              <td><b>Saldo líquido</b></td>
              <td style="text-align:right"><b style="color:${net >= 0 ? "var(--accent)" : "var(--danger)"}">${net >= 0 ? "+" : ""} R$ ${fmt(net)}</b></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="card">
        <h3>Histórico</h3>
        <div class="event-log">
          ${state.log.slice(-20).reverse().map(l => `<div>${l}</div>`).join("") || "<i>Sem eventos.</i>"}
        </div>
      </div>
    </div>
  `;
}

// -------------------- Modal: Disputa de Pênaltis --------------------
function showPenaltyShootoutModal(tie, onContinue) {
  const teamA = state.teams[tie.teamAId];
  const teamB = state.teams[tie.teamBId];
  const pen = tie.penalties;
  if (!pen) { onContinue(); return; }

  const container = document.createElement("div");
  container.className = "modal-backdrop visible";
  container.style.zIndex = "300";

  container.innerHTML = `
    <div class="modal" style="max-width:560px;max-height:88vh;display:flex;flex-direction:column">
      <div style="padding:16px 20px;border-bottom:1px solid var(--border);text-align:center">
        <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1px">Disputa de Pênaltis</div>
        <h2 style="font-size:22px;margin:6px 0 0">${teamA.shortName} × ${teamB.shortName}</h2>
      </div>

      <div style="padding:14px 20px;display:grid;grid-template-columns:1fr auto 1fr;gap:14px;align-items:center;border-bottom:1px solid var(--border)">
        <div style="text-align:right">
          ${teamLogo(teamA.id, 36)}
          <div style="font-weight:700;margin-top:6px">${teamA.name}</div>
        </div>
        <div style="font-size:32px;font-weight:800;text-align:center;min-width:90px">
          <span id="pen-score-a">0</span> × <span id="pen-score-b">0</span>
        </div>
        <div style="text-align:left">
          ${teamLogo(teamB.id, 36)}
          <div style="font-weight:700;margin-top:6px">${teamB.name}</div>
        </div>
      </div>

      <div id="pen-kicks" style="padding:14px 20px;overflow-y:auto;flex:1;min-height:120px;font-size:13px"></div>

      <div style="padding:12px 20px;border-top:1px solid var(--border);text-align:center">
        <button class="btn" id="pen-btn">Pular</button>
      </div>
    </div>
  `;

  document.body.appendChild(container);
  const kicksEl = container.querySelector("#pen-kicks");
  const scoreAEl = container.querySelector("#pen-score-a");
  const scoreBEl = container.querySelector("#pen-score-b");
  const btn = container.querySelector("#pen-btn");

  let i = 0;
  let scoreA = 0, scoreB = 0;
  let interval = null;
  let finished = false;

  const revealOne = () => {
    if (i >= pen.kicks.length) {
      finished = true;
      clearInterval(interval);
      const winnerId = pen.winnerId;
      const winnerName = state.teams[winnerId].name;
      kicksEl.insertAdjacentHTML("beforeend",
        `<div style="margin-top:10px;padding:10px;text-align:center;background:rgba(var(--accent-rgb),0.15);border:1px solid var(--accent);border-radius:6px;font-weight:700">
          ${winnerId === MY_TEAM_ID ? "🎉 " : "💔 "}${winnerName} venceu nos pênaltis!
        </div>`);
      kicksEl.scrollTop = kicksEl.scrollHeight;
      btn.textContent = "Continuar ▶";
      return;
    }
    const k = pen.kicks[i];
    const teamId = k.team === "A" ? teamA.id : teamB.id;
    const teamObj = k.team === "A" ? teamA : teamB;
    if (k.scored) {
      if (k.team === "A") { scoreA++; scoreAEl.textContent = scoreA; }
      else                { scoreB++; scoreBEl.textContent = scoreB; }
    }
    const icon = k.scored ? "⚽" : "❌";
    const color = k.scored ? "var(--accent)" : "var(--danger)";
    const align = k.team === "A" ? "left" : "right";
    const flex  = k.team === "A" ? "row" : "row-reverse";
    kicksEl.insertAdjacentHTML("beforeend",
      `<div style="display:flex;flex-direction:${flex};gap:10px;align-items:center;padding:5px 8px;margin-bottom:4px;border-radius:4px;background:var(--bg-2);animation:slideIn .3s ease">
        ${teamLogo(teamId, 18)}
        <div style="flex:1;text-align:${align};font-size:12px">
          <b>${k.takerName}</b> <span style="color:var(--muted)">· cobrança ${k.kick}</span>
        </div>
        <div style="font-size:18px;color:${color};font-weight:800">${icon}</div>
      </div>`);
    kicksEl.scrollTop = kicksEl.scrollHeight;
    i++;
  };

  revealOne();
  interval = setInterval(revealOne, 650);

  btn.onclick = () => {
    if (!finished) {
      clearInterval(interval);
      while (i < pen.kicks.length) revealOne();
      // call again to render winner banner
      revealOne();
    } else {
      container.remove();
      onContinue();
    }
  };

  container.addEventListener("click", (e) => {
    if (e.target === container && finished) {
      container.remove();
      onContinue();
    }
  });
}

// -------------------- Modal: Sorteio da Copa --------------------
function showCupDrawModal(cup, phaseKey, onContinue) {
  const phase = cup.phases[phaseKey];
  const meta = CUP_PHASE_META[phaseKey];
  if (!phase?.ties?.length) { onContinue(); return; }

  // Intervalo de revelação varia com qtd de ties (fases curtas = pausa maior)
  const n = phase.ties.length;
  const revealDelay = n <= 2 ? 800 : n <= 4 ? 600 : n <= 8 ? 380 : 180;

  const container = document.createElement("div");
  container.className = "modal-backdrop visible";
  container.style.zIndex = "300";

  const legNote = meta.legs === 2 ? "ida e volta" : "jogo único";

  container.innerHTML = `
    <div class="modal" style="max-width:680px;max-height:88vh;display:flex;flex-direction:column">
      <div style="padding:18px 24px;border-bottom:1px solid var(--border);text-align:center">
        <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1px">
          Copa do Brasil ${cup.season}
        </div>
        <h2 style="font-size:22px;margin:6px 0 0">🏆 Sorteio · ${meta.name}</h2>
        <div style="color:var(--muted);font-size:12px;margin-top:4px">
          ${n} confronto${n > 1 ? "s" : ""} · ${legNote} · prêmio R$ ${fmt(meta.prize)}
        </div>
      </div>
      <div id="cup-draw-ties" style="padding:18px 24px;overflow-y:auto;flex:1;min-height:120px">
        <p style="text-align:center;color:var(--muted);font-size:12px">Iniciando sorteio…</p>
      </div>
      <div style="padding:14px 24px;border-top:1px solid var(--border);text-align:center">
        <button class="btn" id="cup-draw-btn">Pular</button>
      </div>
    </div>
  `;

  document.body.appendChild(container);
  const tiesEl = container.querySelector("#cup-draw-ties");
  const btn = container.querySelector("#cup-draw-btn");
  tiesEl.innerHTML = "";

  let idx = 0;
  let interval = null;
  let finished = false;

  const revealOne = () => {
    if (idx >= n) {
      finished = true;
      clearInterval(interval);
      btn.textContent = "Aos jogos ▶";
      return;
    }
    const tie = phase.ties[idx];
    const teamA = state.teams[tie.teamAId];
    const teamB = state.teams[tie.teamBId];
    const isMine = tie.teamAId === MY_TEAM_ID || tie.teamBId === MY_TEAM_ID;
    const row = document.createElement("div");
    row.className = "draw-tie" + (isMine ? " mine" : "");
    row.innerHTML = `
      <div class="home" style="font-weight:${isMine && tie.teamAId === MY_TEAM_ID ? "800" : "500"}">
        ${teamLogo(teamA.id, 22)} <span style="margin-left:6px">${teamA.name}</span>
      </div>
      <div class="vs">×</div>
      <div class="away" style="font-weight:${isMine && tie.teamBId === MY_TEAM_ID ? "800" : "500"}">
        <span style="margin-right:6px">${teamB.name}</span> ${teamLogo(teamB.id, 22)}
      </div>
    `;
    tiesEl.appendChild(row);
    tiesEl.scrollTop = tiesEl.scrollHeight;
    idx++;
  };

  // Start animation
  revealOne();
  interval = setInterval(revealOne, revealDelay);

  // Botão: enquanto não revelou tudo, "Pular" mostra todos; depois "Aos jogos" continua
  btn.onclick = () => {
    if (!finished) {
      clearInterval(interval);
      while (idx < n) revealOne();
      finished = true;
      btn.textContent = "Aos jogos ▶";
    } else {
      container.remove();
      onContinue();
    }
  };

  // Fechar clicando no fundo SÓ se já terminou
  container.addEventListener("click", (e) => {
    if (e.target === container && finished) {
      container.remove();
      onContinue();
    }
  });
}

// -------------------- View: Copa do Brasil --------------------
function renderCup() {
  const cup = state.competitions.copa_brasil;
  if (!cup) return `<div class="card">Copa não disponível.</div>`;

  const myParticipating = cup.teams.includes(MY_TEAM_ID);
  const myTie = findMyCurrentTie(cup);

  return `
    <div class="view-title">🏆 ${cup.name} · ${cup.season}</div>
    <div class="view-sub">
      ${cup.champion
        ? `Campeão: <b style="color:var(--accent)">${state.teams[cup.champion].name}</b>`
        : myParticipating
          ? (myTie ? `Sua próxima fase: ${CUP_PHASE_META[myTie.phase].name}` : "Aguardando próximo sorteio")
          : "Você não está participando desta edição"}
    </div>

    ${cup.libertaEntrants?.length ? `
      <div class="card" style="padding:14px 18px;margin-bottom:14px">
        <div style="color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:6px">
          Cabeças (entram nas Oitavas)
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${cup.libertaEntrants.map(id => {
            const t = state.teams[id];
            const isMe = id === MY_TEAM_ID;
            return `<span style="background:${isMe ? "rgba(var(--accent-rgb),0.15)" : "var(--bg-2)"};border:1px solid ${isMe ? "var(--accent)" : "var(--border)"};padding:4px 10px;border-radius:6px;font-size:12px">
              <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${t.colors.primary};margin-right:6px;vertical-align:middle"></span>${t.name}
            </span>`;
          }).join("")}
        </div>
      </div>
    ` : ""}

    ${renderCupEarlyPhases(cup)}

    ${renderCupBracket(cup)}
  `;
}

// Fases preliminares (1ª, 2ª, 3ª) — formato compacto/lista
function renderCupEarlyPhases(cup) {
  const early = ["fase1", "fase2", "fase3"];
  return early.map(phaseKey => renderCupPhase(cup, phaseKey)).join("");
}

// Bracket das fases mata-mata (oitavas → final) em 4 colunas
function renderCupBracket(cup) {
  const knockoutPhases = ["oitavas", "quartas", "semi", "final"];
  return `
    <div class="card" style="padding:18px 22px">
      <h3>Chaveamento</h3>
      <div class="bracket">
        ${knockoutPhases.map(phaseKey => {
          const phase = cup.phases[phaseKey];
          const meta = CUP_PHASE_META[phaseKey];
          const targetSlots = meta.slotsOut * 2 / (phaseKey === "final" ? 2 : 1); // entrada
          const slots = [];
          for (let i = 0; i < (meta.slotsIn / 2); i++) {
            slots.push(phase?.ties?.[i] || null);
          }
          return `
            <div class="bracket-col">
              <div class="bracket-col-title">${meta.name}</div>
              <div class="bracket-col-body">
                ${slots.map(tie => tie ? renderBracketTie(tie, phaseKey) : `<div class="bracket-tie pending">aguardando</div>`).join("")}
              </div>
            </div>
          `;
        }).join("")}
      </div>
      ${cup.champion ? `
        <div class="bracket-champion">
          🏆 Campeão: ${state.teams[cup.champion].name}
        </div>
      ` : ""}
    </div>
  `;
}

function renderBracketTie(tie, phaseKey) {
  const teamA = state.teams[tie.teamAId];
  const teamB = state.teams[tie.teamBId];
  if (!teamA || !teamB) return `<div class="bracket-tie pending">a definir</div>`;
  const isMine = tie.teamAId === MY_TEAM_ID || tie.teamBId === MY_TEAM_ID;
  const aWon = tie.winnerId === tie.teamAId;
  const bWon = tie.winnerId === tie.teamBId;

  // Placar por jogo (mostra leg1·leg2 + agregado, ou só agregado se 1 leg)
  let scoreCellA = "—", scoreCellB = "—";

  if (tie.legs.length === 1) {
    const leg = tie.legs[0];
    if (leg.played) {
      const a = leg.homeTeamId === tie.teamAId ? leg.score.home : leg.score.away;
      const b = leg.homeTeamId === tie.teamBId ? leg.score.home : leg.score.away;
      scoreCellA = String(a);
      scoreCellB = String(b);
    }
  } else if (tie.legs.length === 2) {
    const [leg1, leg2] = tie.legs;
    const a1 = leg1.played ? (leg1.homeTeamId === tie.teamAId ? leg1.score.home : leg1.score.away) : "-";
    const b1 = leg1.played ? (leg1.homeTeamId === tie.teamBId ? leg1.score.home : leg1.score.away) : "-";
    const a2 = leg2.played ? (leg2.homeTeamId === tie.teamAId ? leg2.score.home : leg2.score.away) : "-";
    const b2 = leg2.played ? (leg2.homeTeamId === tie.teamBId ? leg2.score.home : leg2.score.away) : "-";
    const aggA = tie.aggregate?.teamA;
    const aggB = tie.aggregate?.teamB;
    scoreCellA = leg1.played || leg2.played
      ? `<span style="color:var(--muted);font-size:9px">${a1}·${a2}</span> <b>${aggA ?? "?"}</b>`
      : "—";
    scoreCellB = leg1.played || leg2.played
      ? `<span style="color:var(--muted);font-size:9px">${b1}·${b2}</span> <b>${aggB ?? "?"}</b>`
      : "—";
  }

  // Pênaltis (anexa "(Xp)")
  const pen = tie.penalties;
  const penA = pen ? ` <span style="color:var(--warning);font-weight:700;font-size:10px">(${pen.scoreA}p)</span>` : "";
  const penB = pen ? ` <span style="color:var(--warning);font-weight:700;font-size:10px">(${pen.scoreB}p)</span>` : "";

  return `
    <div class="bracket-tie ${isMine ? "mine" : ""}" data-match="${tie.legs[0]?.id || ""}">
      <div class="bracket-row ${aWon ? "winner" : (bWon ? "loser" : "")}">
        ${teamLogo(teamA.id, 14)}
        <span class="name" title="${teamA.name}">${teamA.shortName}</span>
        <span class="score">${scoreCellA}${penA}</span>
      </div>
      <div class="bracket-row ${bWon ? "winner" : (aWon ? "loser" : "")}">
        ${teamLogo(teamB.id, 14)}
        <span class="name" title="${teamB.name}">${teamB.shortName}</span>
        <span class="score">${scoreCellB}${penB}</span>
      </div>
    </div>
  `;
}

function renderCupPhase(cup, phaseKey) {
  const phase = cup.phases[phaseKey];
  const meta = CUP_PHASE_META[phaseKey];
  const isCurrent = !phase.complete && phase.ties.length > 0;
  const accent = phase.complete ? "var(--border)"
                : phase.ties.length > 0 ? "var(--accent)"
                : "var(--accent-2)";

  let body;
  if (!phase.ties.length) {
    body = `<p style="color:var(--muted);font-size:12px;margin-top:8px">Aguardando sorteio.</p>`;
  } else {
    body = `<div style="display:grid;grid-template-columns:1fr;gap:6px;margin-top:8px">
      ${phase.ties.map(tie => renderCupTie(tie, meta.legs)).join("")}
    </div>`;
  }

  const prizeNote = meta.prize
    ? `<span style="color:var(--muted);font-size:10px;margin-right:8px">💰 R$ ${fmt(meta.prize)}</span>`
    : "";

  return `
    <div class="card" style="padding:14px 18px;margin-bottom:10px;border-left:3px solid ${accent}">
      <div style="display:flex;justify-content:space-between;align-items:baseline">
        <h3 style="margin:0;font-size:13px">
          ${meta.name}
          ${meta.legs === 2 ? `<span style="color:var(--muted);font-size:11px;font-weight:400;margin-left:6px">ida e volta</span>` : ""}
          ${isCurrent ? ` <span style="color:var(--accent);font-size:11px;font-weight:600;margin-left:6px">EM ANDAMENTO</span>` : ""}
        </h3>
        <div>
          ${prizeNote}
          <span style="color:var(--muted);font-size:11px">Rodadas ${cup.schedule[phaseKey].join(" / ")}</span>
        </div>
      </div>
      ${body}
    </div>
  `;
}

function renderCupTie(tie, legs) {
  const teamA = state.teams[tie.teamAId];
  const teamB = state.teams[tie.teamBId];
  const isMine = tie.teamAId === MY_TEAM_ID || tie.teamBId === MY_TEAM_ID;
  const bg = isMine ? "rgba(var(--accent-rgb),0.06)" : "transparent";
  const border = isMine ? "1px solid rgba(var(--accent-rgb),0.3)" : "1px solid var(--border)";

  let bodyHtml;
  if (legs === 1) {
    const leg = tie.legs[0];
    bodyHtml = `
      <div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:12px;font-size:13px">
        <div style="text-align:right">
          <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${state.teams[leg.homeTeamId].colors.primary};margin-right:6px;vertical-align:middle"></span>
          ${state.teams[leg.homeTeamId].name}
        </div>
        <div style="font-weight:800;min-width:60px;text-align:center;${leg.played ? "" : "color:var(--muted)"}" ${leg.played ? `data-match="${leg.id}" data-cup-match="1"` : ""}>
          ${leg.played
            ? `${leg.score.home} × ${leg.score.away}`
            : `vs <div style="font-size:10px;color:var(--muted);font-weight:400">R${cupRoundOf(leg)}</div>`}
        </div>
        <div>
          ${state.teams[leg.awayTeamId].name}
          <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${state.teams[leg.awayTeamId].colors.primary};margin-left:6px;vertical-align:middle"></span>
        </div>
      </div>
    `;
  } else {
    const [leg1, leg2] = tie.legs;
    const aggregateText = tie.aggregate
      ? `Agregado: <b>${tie.aggregate.teamA ?? "?"}–${tie.aggregate.teamB ?? "?"}</b>`
      : "";
    bodyHtml = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:12px">
        ${[leg1, leg2].map((leg, i) => `
          <div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:8px" ${leg.played ? `data-match="${leg.id}" data-cup-match="1" style="cursor:pointer"` : ""}>
            <div style="text-align:right;font-size:11px;color:var(--muted)">
              <div>${state.teams[leg.homeTeamId].shortName}</div>
            </div>
            <div style="font-weight:700;text-align:center;min-width:50px;${leg.played ? "" : "color:var(--muted)"}">
              ${leg.played ? `${leg.score.home}×${leg.score.away}` : `Ida${i === 1 ? "/Volta" : ""}`}
            </div>
            <div style="font-size:11px;color:var(--muted)">${state.teams[leg.awayTeamId].shortName}</div>
          </div>
        `).join("")}
      </div>
      ${tie.winnerId ? `<div style="margin-top:6px;font-size:11px;color:var(--accent)">✓ ${aggregateText} · Avança: <b>${state.teams[tie.winnerId].name}</b></div>` : aggregateText ? `<div style="margin-top:6px;font-size:11px;color:var(--muted)">${aggregateText}</div>` : ""}
    `;
  }

  return `
    <div style="background:${bg};border:${border};border-radius:6px;padding:10px 12px">
      <div style="display:flex;justify-content:space-between;margin-bottom:6px">
        <b style="font-size:12px">${teamA.shortName} × ${teamB.shortName}</b>
        ${tie.winnerId
          ? `<span style="font-size:11px;color:var(--accent)">→ ${state.teams[tie.winnerId].shortName}</span>`
          : `<span style="font-size:11px;color:var(--muted)">pendente</span>`}
      </div>
      ${bodyHtml}
    </div>
  `;
}

function cupRoundOf(leg) {
  return leg.round ?? "?";
}

function findMyCurrentTie(cup) {
  for (const phaseKey of CUP_PHASE_ORDER) {
    const phase = cup.phases[phaseKey];
    for (const tie of phase.ties) {
      if ((tie.teamAId === MY_TEAM_ID || tie.teamBId === MY_TEAM_ID) && !tie.winnerId) {
        return tie;
      }
    }
  }
  return null;
}

// -------------------- View: Calendário --------------------
function renderCalendar() {
  const compId = calendarCompId || MY_COMP_ID;
  const isSerieC = (compId || "").startsWith("brasileirao_c");

  // Para Série C, agrega fixtures das 3 sub-comps em um só calendário
  let comp, fixtures, totalRounds, currentRound, compName;
  if (isSerieC) {
    fixtures = [];
    for (const subId of SERIE_C_STAGE_IDS) {
      const c = state.competitions[subId];
      if (c) fixtures.push(...c.fixtures);
    }
    totalRounds = fixtures.length ? Math.max(...fixtures.map(m => m.round)) : 27;
    // Próxima rodada não jogada
    const pending = fixtures.filter(m => !m.played).sort((a, b) => a.round - b.round)[0];
    currentRound = pending ? pending.round : null;
    compName = SERIE_C_DISPLAY_NAME;
    comp = { fixtures, name: compName }; // shim mínimo
  } else {
    comp = state.competitions[compId];
    fixtures = comp.fixtures;
    totalRounds = Math.max(...fixtures.map(m => m.round));
    currentRound = getCurrentRound(comp);
  }

  // Agrupa por rodada
  const byRound = {};
  for (const m of fixtures) {
    (byRound[m.round] = byRound[m.round] || []).push(m);
  }

  // Filtra se modo "mine"
  const visibleRounds = Object.entries(byRound).map(([round, matches]) => {
    if (calendarMode === "mine") {
      const filtered = matches.filter(m => m.homeTeamId === MY_TEAM_ID || m.awayTeamId === MY_TEAM_ID);
      return { round: Number(round), matches: filtered };
    }
    return { round: Number(round), matches };
  }).filter(r => r.matches.length > 0)
    .sort((a, b) => a.round - b.round);

  // Estatísticas resumidas (modo "mine")
  let mySummary = "";
  if (calendarMode === "mine") {
    const myPlayed = fixtures.filter(m => m.played && (m.homeTeamId === MY_TEAM_ID || m.awayTeamId === MY_TEAM_ID));
    let w = 0, d = 0, l = 0, gf = 0, ga = 0;
    for (const m of myPlayed) {
      const isHome = m.homeTeamId === MY_TEAM_ID;
      const my  = isHome ? m.score.home : m.score.away;
      const opp = isHome ? m.score.away : m.score.home;
      gf += my; ga += opp;
      if (my > opp) w++;
      else if (my < opp) l++;
      else d++;
    }
    mySummary = `
      <div style="display:flex;gap:18px;font-size:13px;color:var(--muted);margin-top:6px">
        <span>${myPlayed.length} jogos</span>
        <span style="color:var(--accent)">${w}V</span>
        <span style="color:var(--warning)">${d}E</span>
        <span style="color:var(--danger)">${l}D</span>
        <span>${gf} pró · ${ga} contra · saldo ${gf - ga >= 0 ? "+" : ""}${gf - ga}</span>
      </div>
    `;
  }

  return `
    <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:16px">
      <div>
        <div class="view-title" style="margin-bottom:0">Calendário · ${comp.name}</div>
        <div class="view-sub" style="margin-bottom:0">
          ${currentRound != null ? `Próxima rodada: ${currentRound}/${totalRounds}` : "Temporada encerrada"}
        </div>
        ${mySummary}
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn-toggle ${calendarMode === "mine" ? "on" : ""}" data-cal-mode="mine">Meus Jogos</button>
        <button class="btn-toggle ${calendarMode === "all" ? "on" : ""}" data-cal-mode="all">Calendário Completo</button>
        <span style="border-left:1px solid var(--border);height:24px;margin:0 4px"></span>
        <button class="btn-toggle ${(calendarCompId ?? MY_COMP_ID) === "brasileirao_a" ? "on" : ""}" data-cal-comp="brasileirao_a">Série A</button>
        <button class="btn-toggle ${(calendarCompId ?? MY_COMP_ID) === "brasileirao_b" ? "on" : ""}" data-cal-comp="brasileirao_b">Série B</button>
        <button class="btn-toggle ${((calendarCompId ?? MY_COMP_ID) || "").startsWith("brasileirao_c") ? "on" : ""}" data-cal-comp="brasileirao_c_p1">Série C</button>
      </div>
    </div>

    ${visibleRounds.map(({ round, matches }) => renderRoundBlock(round, matches, currentRound)).join("")}
  `;
}

function renderRoundBlock(round, matches, currentRound) {
  const isCurrent = round === currentRound;
  const isPast = matches.every(m => m.played);
  return `
    <div class="card" style="padding:14px 18px;margin-bottom:10px;border-left:3px solid ${isCurrent ? "var(--accent)" : isPast ? "var(--border)" : "var(--accent-2)"}" ${isCurrent ? `id="round-current"` : ""}>
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px">
        <h3 style="margin:0;font-size:13px">
          Rodada ${round}
          ${isCurrent ? ` <span style="color:var(--accent);font-size:11px;font-weight:600;margin-left:6px">← PRÓXIMA</span>` : ""}
        </h3>
        <span style="font-size:11px;color:var(--muted)">${matches[0].date || "—"}</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr;gap:4px">
        ${matches.map(m => renderMatchRow(m)).join("")}
      </div>
    </div>
  `;
}

function renderMatchRow(m) {
  const home = state.teams[m.homeTeamId];
  const away = state.teams[m.awayTeamId];
  const isMine = m.homeTeamId === MY_TEAM_ID || m.awayTeamId === MY_TEAM_ID;
  const bg = isMine ? "rgba(var(--accent-rgb),0.06)" : "transparent";
  const border = isMine ? "1px solid rgba(var(--accent-rgb),0.3)" : "1px solid transparent";
  const clickable = m.played;
  const cursor = clickable ? "pointer" : "default";
  const hover = clickable
    ? `onmouseover="this.style.background='${isMine ? "rgba(var(--accent-rgb),0.12)" : "rgba(255,255,255,0.04)"}'" onmouseout="this.style.background='${bg}'"`
    : "";

  let center;
  if (m.played) {
    const homeWon = m.score.home > m.score.away;
    const awayWon = m.score.away > m.score.home;
    center = `
      <div style="font-weight:800;font-size:15px;font-variant-numeric:tabular-nums;min-width:60px;text-align:center">
        <span style="color:${homeWon ? "var(--accent)" : awayWon ? "var(--muted)" : "var(--text)"}">${m.score.home}</span>
        <span style="color:var(--muted);margin:0 4px">×</span>
        <span style="color:${awayWon ? "var(--accent)" : homeWon ? "var(--muted)" : "var(--text)"}">${m.score.away}</span>
      </div>
    `;
  } else {
    center = `<div style="color:var(--muted);font-size:12px;min-width:60px;text-align:center">vs</div>`;
  }

  return `
    <div ${clickable ? `data-match="${m.id}"` : ""} style="display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:12px;padding:6px 10px;background:${bg};border:${border};border-radius:4px;font-size:13px;cursor:${cursor};transition:background .15s" ${hover}>
      <div style="text-align:right;font-weight:${isMine && m.homeTeamId === MY_TEAM_ID ? "700" : "500"};${m.played && m.score.home > m.score.away ? "" : "color:var(--muted)"}">
        ${home.name}
        <span style="margin-left:8px">${teamLogo(home.id, 20)}</span>
      </div>
      ${center}
      <div style="font-weight:${isMine && m.awayTeamId === MY_TEAM_ID ? "700" : "500"};${m.played && m.score.away > m.score.home ? "" : "color:var(--muted)"}">
        <span style="margin-right:8px">${teamLogo(away.id, 20)}</span>
        ${away.name}
      </div>
    </div>
  `;
}

// -------------------- View: Inbox --------------------
function renderInbox() {
  const inbox = (state.inbox || []).slice().reverse(); // mais recentes primeiro
  const unread = inbox.filter(n => !n.read).length;

  return `
    <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:16px">
      <div>
        <div class="view-title" style="margin-bottom:0">Inbox</div>
        <div class="view-sub" style="margin-bottom:0">
          ${inbox.length} ${inbox.length === 1 ? "notícia" : "notícias"} ·
          ${unread} ${unread === 1 ? "não lida" : "não lidas"}
        </div>
      </div>
      ${unread > 0 ? `<button class="btn btn-sm btn-secondary" id="btn-mark-all">Marcar tudo como lido</button>` : ""}
    </div>

    ${inbox.length === 0 ? `
      <div class="card" style="text-align:center;color:var(--muted);padding:40px">
        Sem notícias por enquanto. Jogue uma rodada e volte aqui.
      </div>
    ` : inbox.map(n => renderNewsItem(n)).join("")}
  `;
}

function renderNewsItem(n) {
  const dotColor = n.priority === "high" ? "var(--accent)" : "var(--accent-2)";
  const opacity = n.read ? "0.55" : "1";
  const fontWeight = n.read ? "400" : "600";
  return `
    <div class="card" data-news="${n.id}" style="cursor:pointer;padding:14px 18px;margin-bottom:8px;opacity:${opacity};border-left:3px solid ${n.read ? "var(--border)" : dotColor}">
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px">
        <div style="flex:1;min-width:0">
          <div style="font-weight:${fontWeight};font-size:14px">${n.subject}</div>
          <div style="color:var(--muted);font-size:12px;margin-top:4px">${n.body}</div>
        </div>
        <div style="color:var(--muted);font-size:11px;white-space:nowrap">${n.date}</div>
      </div>
    </div>
  `;
}

// -------------------- Wire interações --------------------
function wireView() {
  $main.querySelector("#btn-auto")?.addEventListener("click", () => {
    state.teams[MY_TEAM_ID].lineup = autoLineup(state.teams[MY_TEAM_ID]);
    render();
  });
  $main.querySelectorAll("[data-toggle]").forEach(btn => {
    btn.onclick = () => {
      const pid = btn.dataset.toggle;
      const team = state.teams[MY_TEAM_ID];
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
      const res = unlistPlayer(state, MY_TEAM_ID, btn.dataset.unlist);
      log((res.ok ? "✅ " : "❌ ") + res.message);
      render();
    };
  });
  $main.querySelectorAll("[data-comp]").forEach(btn => {
    btn.onclick = () => { standingsView = btn.dataset.comp; render(); };
  });
  $main.querySelectorAll("[data-formation]").forEach(btn => {
    btn.onclick = () => {
      const team = state.teams[MY_TEAM_ID];
      team.tactics = team.tactics || {};
      team.tactics.formation = btn.dataset.formation;
      // Re-escala automaticamente para os slots da nova formação
      team.lineup = autoLineup(team);
      render();
    };
  });
  $main.querySelectorAll("[data-training]").forEach(btn => {
    btn.onclick = () => {
      const team = state.teams[MY_TEAM_ID];
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
    btn.onclick = () => { calendarMode = btn.dataset.calMode; render(); };
  });
  $main.querySelectorAll("[data-cal-comp]").forEach(btn => {
    btn.onclick = () => { calendarCompId = btn.dataset.calComp; render(); };
  });

  // Ações da aba Base
  $main.querySelectorAll("[data-academy]").forEach(btn => {
    btn.onclick = () => handleAcademyAction(btn.dataset.academy, btn.dataset.pid);
  });
  $main.querySelectorAll("[data-match]").forEach(el => {
    el.onclick = () => openMatchDetail(el.dataset.match, calendarCompId || MY_COMP_ID);
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
    res = promoteProspect(state, MY_TEAM_ID, pid);
  } else if (action === "sell") {
    if (!confirm(`Vender ${p.name} por R$ ${fmt(Math.max(50_000, Math.round(p.marketValue * 0.5)))}?`)) return;
    res = sellProspect(state, MY_TEAM_ID, pid);
  } else if (action === "release") {
    if (!confirm(`Liberar ${p.name} da base? Esta ação não tem retorno.`)) return;
    res = releaseProspect(state, MY_TEAM_ID, pid);
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
      teamId: MY_TEAM_ID, playerId: pid,
      salaryOffer: Number(sal), years: Number(yearsStr),
    });
    log((res.accepted ? "✅ " : "❌ ") + res.message);
    render();
    return;
  }

  const round = getCurrentRoundSafe();
  if (kind === "free") {
    const sal = prompt(`Salário mensal para ${p.name} (esperado ~R$ ${fmt(expSal)}):`, String(expSal));
    if (!sal) return;
    const res = signFreeAgent(state, { teamId: MY_TEAM_ID, playerId: pid, salaryOffer: Number(sal), currentRound: round });
    log((res.accepted ? "✅ " : "❌ ") + res.message);
  } else {
    const fee = prompt(`Proposta por ${p.name} (valor: R$ ${fmt(p.marketValue)}):`, String(p.marketValue));
    if (!fee) return;
    const sal = prompt(`Salário oferecido (esperado ~R$ ${fmt(expSal)}):`, String(expSal));
    if (!sal) return;
    const res = makeBid(state, {
      fromTeamId: MY_TEAM_ID, playerId: pid, fee: Number(fee), salaryOffer: Number(sal), currentRound: round,
    });
    log((res.accepted ? "✅ " : "❌ ") + res.message);
  }
  state.teams[MY_TEAM_ID].lineup = state.teams[MY_TEAM_ID].lineup
    .filter(id => state.teams[MY_TEAM_ID].squad.includes(id));
  render();
}

// -------------------- Jogar Rodada --------------------
// Cada clique do usuário joga UMA partida ao vivo, mas TODAS as outras
// partidas da rodada (das duas séries e da copa) acontecem em paralelo,
// tickando minuto a minuto junto com a sua. Ao fim do jogo do usuário,
// todos os outros resultados já estão prontos. Se for o último compromisso
// do usuário na rodada, finanças/notícias/IA de mercado rodam aqui.
function playRound() {
  const comp = state.competitions[MY_COMP_ID];
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
      t.teamAId === MY_TEAM_ID || t.teamBId === MY_TEAM_ID
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
  const comp = state.competitions[MY_COMP_ID];
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
    const userInTie = tie && (tie.teamAId === MY_TEAM_ID || tie.teamBId === MY_TEAM_ID);
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
  const comp = state.competitions[MY_COMP_ID];
  if (!comp) return null;
  const cup = state.competitions.copa_brasil;

  if (cup) {
    const myCupLeg = getCupLegsForRound(cup, round)
      .find(l => !l.played && (l.homeTeamId === MY_TEAM_ID || l.awayTeamId === MY_TEAM_ID));
    if (myCupLeg) return { isCup: true, match: myCupLeg };
  }

  const myLeagueMatch = getMatchesOfRound(comp, round)
    .find(m => !m.played && (m.homeTeamId === MY_TEAM_ID || m.awayTeamId === MY_TEAM_ID));
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
  const userSide = match.homeTeamId === MY_TEAM_ID ? "home" : "away";

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
    if (teamId === MY_TEAM_ID && result) {
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
          read: false, teamFocus: MY_TEAM_ID,
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
        const myReceived = result.teams.includes(MY_TEAM_ID);
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
  const tick = weeklyTick(state, allResults, MY_COMP_ID);
  const myRev = tick.revenues.find(r => r.teamId === MY_TEAM_ID);
  const myWages = tick.wages.find(w => w.teamId === MY_TEAM_ID);
  log(`Rodada ${round} fechada · ${myRev ? `bilheteria +R$ ${fmt(myRev.revenue)} · ` : ""}folha -R$ ${fmt(myWages.wagesPaid)}.`);

  // Suspensões + IA de mercado (só durante janela)
  decrementSuspensions(state, allResults.flatMap(r => [r.homeTeamId, r.awayTeamId]));
  const aiMoves = runAITransfers(state, rng, { excludeTeamId: MY_TEAM_ID, currentRound: round });
  for (const m of aiMoves) log(`🔁 ${m.message}`);

  // Mercado em duas vias: IA propõe pelos jogadores do usuário (só na janela)
  const newOffers = generateIncomingOffers(state, rng, MY_TEAM_ID, round);
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
      read: false, teamFocus: MY_TEAM_ID,
    });
  }

  // Pedidos de transferência (jogadores insatisfeitos pedem pra sair)
  const newRequests = generateTransferRequests(state, rng, MY_TEAM_ID, round);
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
      read: false, teamFocus: MY_TEAM_ID,
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
  generateNewsForRound(state, round, allResults, MY_TEAM_ID);

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
// Também ajusta MY_COMP_ID se o usuário avançar de fase.
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

      // Se o usuário está na Série C e classificou, atualiza MY_COMP_ID
      if (MY_COMP_ID === "brasileirao_c_p1") {
        if (groupA.teams.includes(MY_TEAM_ID)) MY_COMP_ID = "brasileirao_c_ga";
        else if (groupB.teams.includes(MY_TEAM_ID)) MY_COMP_ID = "brasileirao_c_gb";
        // Senão: time eliminado, MY_COMP_ID permanece em p1 (sem mais jogos)
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

      if ([MY_COMP_ID, "brasileirao_c_ga", "brasileirao_c_gb"].includes(MY_COMP_ID)) {
        if (finalComp.teams.includes(MY_TEAM_ID)) MY_COMP_ID = "brasileirao_c_final";
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
  const tick = weeklyTick(state, allResults, MY_COMP_ID);
  const myRev = tick.revenues.find(r => r.teamId === MY_TEAM_ID);
  const myWages = tick.wages.find(w => w.teamId === MY_TEAM_ID);
  log(`Rodada ${round} fechada · ${myRev ? `bilheteria +R$ ${fmt(myRev.revenue)} · ` : ""}folha -R$ ${fmt(myWages.wagesPaid)}.`);

  // 4. Suspensões + IA de mercado
  decrementSuspensions(state, allResults.flatMap(r => [r.homeTeamId, r.awayTeamId]));
  const aiMoves = runAITransfers(state, rng, { excludeTeamId: MY_TEAM_ID });
  for (const m of aiMoves) log(`🔁 ${m.message}`);

  // 5. Manchetes
  generateNewsForRound(state, round, allResults, MY_TEAM_ID);

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

    // Atualiza MY_COMP_ID com base na nova divisão do usuário.
    // (Importante: as subcomps brasileirao_c_ga/_gb/_final foram deletadas
    //  em endSeason — sem este reset, MY_COMP_ID pode ficar pendurado.)
    const newMyComp = resolveUserCompetition();
    if (newMyComp) {
      MY_COMP_ID = newMyComp;
      standingsView = MY_COMP_ID;
    }

    // Reescala automaticamente para a próxima temporada
    if (state.teams[MY_TEAM_ID]) {
      state.teams[MY_TEAM_ID].lineup = autoLineup(state.teams[MY_TEAM_ID]);
    }

    const myCompName = state.competitions[MY_COMP_ID]?.name ?? "—";
    alert(
      `Fim da temporada ${report.season}!\n\n` +
      `🏆 Série A: ${champA}\n🏆 Série B: ${champB}` +
      (champC ? `\n🏆 Série C: ${champC}` : "") + `\n\n` +
      `Série A → B (rebaixados): ${relegated}\n` +
      `Série B → A (promovidos): ${promoted}\n` +
      `Série B → C (rebaixados): ${relegatedToC}\n` +
      `Série C → B (promovidos): ${promotedFromC}\n\n` +
      `Você dirige o ${state.teams[MY_TEAM_ID]?.name ?? "?"} na temporada ${state.season} (${myCompName}).`
    );
  } catch (e) {
    console.error("Erro no showSeasonRecap:", e);
    // Mesmo se algo falhar, garante que MY_COMP_ID seja válido pra UI não travar
    const fallback = resolveUserCompetition();
    if (fallback) { MY_COMP_ID = fallback; standingsView = MY_COMP_ID; }
  }
}

// Descobre em qual competição o time do usuário está participando agora.
// Retorna o ID da competição válida (ou null se nenhuma).
function resolveUserCompetition() {
  if (!MY_TEAM_ID) return null;
  const compsToCheck = ["brasileirao_a", "brasileirao_b", "brasileirao_c_p1"];
  for (const cid of compsToCheck) {
    const c = state.competitions[cid];
    if (c?.teams?.includes(MY_TEAM_ID)) return cid;
  }
  return null;
}

// applyMatchResult + recalcTopScorers vêm de season.js (caminho único compartilhado
// com runRound, sem duplicação e respeitando comp.rules.pointsWin/pointsDraw).

// -------------------- Modal: Ficha do Jogador --------------------
const POSITIVE_TRAITS = new Set(["finalizador", "lider_nato", "veloz", "tecnico", "cabeceador", "promessa"]);
const NEGATIVE_TRAITS = new Set(["lesoes_frequentes", "inconsistente", "pe_de_obra"]);

const TRAIT_LABEL = {
  finalizador: "Finalizador",
  lider_nato: "Líder Nato",
  veloz: "Veloz",
  tecnico: "Técnico",
  cabeceador: "Cabeceador",
  promessa: "Promessa",
  lesoes_frequentes: "Lesões Frequentes",
  inconsistente: "Inconsistente",
  pe_de_obra: "Pé-de-obra",
};

const ATTR_LABEL = {
  pace: "Velocidade",
  finishing: "Finalização",
  passing: "Passe",
  dribbling: "Drible",
  defending: "Defesa",
  physical: "Físico",
  goalkeeping: "Goleiro",
};

function openPlayerDetail(playerId) {
  const p = state.players[playerId];
  if (!p) return;
  const team = p.teamId ? state.teams[p.teamId] : null;
  const my = state.teams[MY_TEAM_ID];

  // Estatísticas da temporada atual em todas as competições
  const seasonStats = p.stats[state.season] || {};
  const totalGoals = Object.values(seasonStats).reduce((s, v) => s + (v.goals || 0), 0);
  const totalApps = Object.values(seasonStats).reduce((s, v) => s + (v.apps || 0), 0);
  const totalAssists = Object.values(seasonStats).reduce((s, v) => s + (v.assists || 0), 0);
  const yellowsTotal = Object.values(p.status.yellowCardsInCompetition || {}).reduce((s, v) => s + v, 0);

  // Atributos relevantes pra posição (some apenas os relevantes pra UI principal)
  const attrs = Object.entries(p.attributes)
    .filter(([k]) => k !== "goalkeeping" || p.position === "GOL");

  // Detecta se está na base do clube
  const inAcademy = team?.academy?.prospects?.includes(p.id);
  const status =
    inAcademy ? `<span class="badge" style="background:var(--accent-2);color:#fff">🌱 Da Base</span>` :
    p.status.injury ? `<span class="badge badge-injury">Lesão · ${p.status.injury.weeksOut} sem</span>` :
    p.status.suspendedMatches > 0 ? `<span class="badge badge-suspended">Suspenso · ${p.status.suspendedMatches}j</span>` :
    `<span class="badge" style="background:var(--accent);color:#000">Apto</span>`;

  const traitChips = (p.traits || []).map(t => {
    const cls = POSITIVE_TRAITS.has(t) ? "positive" : NEGATIVE_TRAITS.has(t) ? "negative" : "";
    return `<span class="trait-chip ${cls}">${TRAIT_LABEL[t] || t}</span>`;
  }).join("") || `<span style="color:var(--muted);font-size:12px">Sem características especiais</span>`;

  const history = (p.history || []).slice(-5).reverse();

  const avatarBg = team ? team.colors.primary : "var(--panel-2)";
  const avatarFg = team ? team.colors.secondary : "var(--text)";

  document.getElementById("player-modal-content").innerHTML = `
    <div class="modal-header">
      <div class="avatar" style="background:${avatarBg};color:${avatarFg}">${p.position}</div>
      <div>
        <h2>${p.name}</h2>
        <div class="sub">
          ${p.age} anos · ${p.nationality} ·
          ${team ? team.name : "<i style='color:var(--accent)'>Agente livre</i>"} ·
          ${status}
        </div>
      </div>
      <button class="close" id="modal-close">×</button>
    </div>

    <div class="modal-body">
      <div class="modal-section">
        <h4>Visão Geral</h4>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;text-align:center">
          <div>
            <div style="font-size:11px;color:var(--muted);text-transform:uppercase">Overall</div>
            <div style="font-size:28px;font-weight:800;color:var(--accent)">${p.overall}</div>
          </div>
          <div>
            <div style="font-size:11px;color:var(--muted);text-transform:uppercase">Potencial</div>
            <div style="font-size:28px;font-weight:800;color:var(--accent-2)">${p.potential}</div>
          </div>
          <div>
            <div style="font-size:11px;color:var(--muted);text-transform:uppercase">Forma</div>
            <div style="font-size:28px;font-weight:800">${(p.status.form ?? 6.5).toFixed(1)}</div>
          </div>
          <div>
            <div style="font-size:11px;color:var(--muted);text-transform:uppercase">Moral</div>
            <div style="font-size:28px;font-weight:800">${p.status.morale ?? 70}</div>
          </div>
        </div>
      </div>

      <div class="modal-section">
        <h4>Atributos</h4>
        <div class="attr-grid">
          ${attrs.map(([k, v]) => `
            <div class="attr-row">
              <span class="name">${ATTR_LABEL[k] || k}</span>
              <div class="bar"><div class="bar-fill" style="width:${v}%"></div></div>
              <span class="value">${v}</span>
            </div>
          `).join("")}
        </div>
      </div>

      <div class="modal-section">
        <h4>Características</h4>
        ${traitChips}
      </div>

      <div class="modal-section">
        <h4>Temporada ${state.season}</h4>
        <div class="info-grid">
          <div><span class="lbl">Jogos</span><span class="val">${totalApps}</span></div>
          <div><span class="lbl">Gols</span><span class="val" style="color:var(--accent)">${totalGoals}</span></div>
          <div><span class="lbl">Assistências</span><span class="val">${totalAssists}</span></div>
          <div><span class="lbl">Amarelos</span><span class="val">${yellowsTotal}</span></div>
        </div>
      </div>

      <div class="modal-section">
        <h4>Contrato e Mercado</h4>
        ${contractWarning(p)}
        <div class="info-grid">
          <div><span class="lbl">Salário mensal</span><span class="val">R$ ${fmt(p.contract.salary)}</span></div>
          <div><span class="lbl">Bônus por gol</span><span class="val">R$ ${fmt(p.contract.bonusPerGoal)}</span></div>
          <div><span class="lbl">Contrato até</span><span class="val ${expiringClass(p)}">${p.contract.until}</span></div>
          <div><span class="lbl">Cláusula de rescisão</span><span class="val">R$ ${fmt(p.contract.releaseClause)}</span></div>
          <div><span class="lbl">Valor de mercado</span><span class="val" style="color:var(--accent)">R$ ${fmt(p.marketValue)}</span></div>
          <div><span class="lbl">Aptidão</span><span class="val">${p.status.fitness}%</span></div>
        </div>
      </div>

      ${history.length ? `
        <div class="modal-section">
          <h4>Histórico de Transferências</h4>
          <table>
            <thead><tr><th>Temporada</th><th>De</th><th>Para</th><th>Valor</th></tr></thead>
            <tbody>
              ${history.map(h => `
                <tr>
                  <td>${h.season}</td>
                  <td>${state.teams[h.from]?.shortName ?? h.from}</td>
                  <td>${state.teams[h.to]?.shortName ?? h.to}</td>
                  <td>R$ ${fmt(h.fee)}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      ` : ""}

      ${team && team.id === MY_TEAM_ID ? `
        <div class="modal-section">
          <h4>Ações</h4>
          <button class="btn btn-sm" data-modal-action="renew" data-pid="${p.id}">
            Renovar Contrato · esperado ~R$ ${fmt(getRenewalExpectation(p))}/mês
          </button>
        </div>
      ` : ""}
      ${team && team.id !== MY_TEAM_ID ? `
        <div class="modal-section">
          <h4>Ações</h4>
          <button class="btn btn-sm" data-modal-action="bid" data-pid="${p.id}">Fazer Proposta</button>
        </div>
      ` : ""}
      ${!team ? `
        <div class="modal-section">
          <h4>Ações</h4>
          <button class="btn btn-sm" data-modal-action="free" data-pid="${p.id}">Contratar (Agente Livre)</button>
        </div>
      ` : ""}
    </div>
  `;

  document.getElementById("player-modal").classList.add("visible");
  document.getElementById("modal-close").onclick = closePlayerDetail;
  document.getElementById("player-modal").addEventListener("click", backdropClose);
  document.querySelectorAll("[data-modal-action]").forEach(btn => {
    btn.onclick = () => {
      closePlayerDetail();
      handleBid(btn.dataset.modalAction, btn.dataset.pid);
    };
  });
}

function backdropClose(e) {
  if (e.target.id === "player-modal") closePlayerDetail();
}

function getContractYearsLeft(player) {
  if (!player.contract?.until) return 99;
  const endYear = parseInt(player.contract.until.slice(0, 4), 10);
  return endYear - state.season;
}

function expiringClass(player) {
  const left = getContractYearsLeft(player);
  if (left <= 0) return "";  // fica como está (estilo neutro)
  if (left === 1) return "";
  return "";
}

function contractWarning(player) {
  const left = getContractYearsLeft(player);
  if (player.teamId !== MY_TEAM_ID) return "";
  if (left <= 0) {
    return `<div style="background:rgba(239,68,68,0.12);border:1px solid var(--danger);border-radius:6px;padding:10px;margin-bottom:10px;font-size:12px;color:var(--danger)">
      ⚠️ Contrato VENCE ao fim desta temporada. Ele sairá de graça se você não renovar agora.
    </div>`;
  }
  if (left === 1) {
    return `<div style="background:rgba(245,158,11,0.12);border:1px solid var(--warning);border-radius:6px;padding:10px;margin-bottom:10px;font-size:12px;color:var(--warning)">
      ⏳ Resta apenas 1 ano de contrato — vale considerar uma renovação.
    </div>`;
  }
  return "";
}

function closePlayerDetail() {
  const el = document.getElementById("player-modal");
  el.classList.remove("visible");
  el.removeEventListener("click", backdropClose);
}

// -------------------- Modal: Detalhe da Partida --------------------
function openMatchDetail(matchId, compId) {
  const comp = state.competitions[compId];
  const match = comp?.fixtures.find(m => m.id === matchId);
  if (!match || !match.played) return;

  const home = state.teams[match.homeTeamId];
  const away = state.teams[match.awayTeamId];
  const homeWon = match.score.home > match.score.away;
  const awayWon = match.score.away > match.score.home;

  const events = match.events || [];
  const lineups = match.lineups || { home: [], away: [] };
  const stats = match.stats || { home: blank(), away: blank() };

  document.getElementById("match-modal-content").innerHTML = `
    <div class="match-detail-header" style="border-top:3px solid ${home.colors.primary}">
      <div class="team-side home">
        <div style="display:flex;align-items:center;justify-content:flex-end;gap:10px">
          <div class="name" style="color:${homeWon ? "var(--accent)" : "var(--text)"}">${home.name}</div>
          ${teamLogo(home.id, 44)}
        </div>
        <div class="meta">${home.shortName} · ${home.tactics?.formation || "4-3-3"}</div>
      </div>
      <div style="text-align:center">
        <div class="score">
          <span style="color:${homeWon ? "var(--accent)" : awayWon ? "var(--muted)" : "var(--text)"}">${match.score.home}</span>
          <span style="color:var(--muted);font-size:30px;margin:0 6px">×</span>
          <span style="color:${awayWon ? "var(--accent)" : homeWon ? "var(--muted)" : "var(--text)"}">${match.score.away}</span>
        </div>
        <div class="meta-center">Rodada ${match.round} · ${match.date || "—"}${match.attendance ? ` · 👥 ${fmt(match.attendance)} pagantes` : ""}</div>
      </div>
      <div class="team-side away">
        <div style="display:flex;align-items:center;gap:10px">
          ${teamLogo(away.id, 44)}
          <div class="name" style="color:${awayWon ? "var(--accent)" : "var(--text)"}">${away.name}</div>
        </div>
        <div class="meta">${away.shortName} · ${away.tactics?.formation || "4-3-3"}</div>
      </div>
      <button class="close" id="match-modal-close" style="position:absolute;right:14px;top:14px;background:var(--panel-2);border:1px solid var(--border);color:var(--text);width:32px;height:32px;border-radius:6px;font-size:18px;cursor:pointer">×</button>
    </div>

    <div class="modal-body">
      ${renderMatchTimeline(events, match)}

      <div class="modal-section">
        <h4>Estatísticas</h4>
        ${renderMatchStatsTable(stats.home, stats.away)}
      </div>

      <div class="modal-section">
        <h4>Escalações</h4>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px">
          ${renderLineupColumn(home, lineups.home, "home")}
          ${renderLineupColumn(away, lineups.away, "away")}
        </div>
      </div>
    </div>
  `;

  document.getElementById("match-modal").classList.add("visible");
  document.getElementById("match-modal-close").onclick = closeMatchDetail;
  document.getElementById("match-modal").addEventListener("click", matchBackdropClose);

  // Permite clicar em jogador dentro do modal
  document.querySelectorAll("#match-modal-content [data-player]").forEach(el => {
    el.classList.add("clickable-player");
    el.onclick = (ev) => {
      ev.stopPropagation();
      closeMatchDetail();
      openPlayerDetail(el.dataset.player);
    };
  });
}

function matchBackdropClose(e) {
  if (e.target.id === "match-modal") closeMatchDetail();
}
function closeMatchDetail() {
  const el = document.getElementById("match-modal");
  el.classList.remove("visible");
  el.removeEventListener("click", matchBackdropClose);
}

function renderMatchTimeline(events, match) {
  if (!events.length) {
    return `<div class="modal-section"><h4>Eventos</h4>
      <p style="color:var(--muted);font-size:13px">Sem eventos relevantes registrados.</p></div>`;
  }
  const home = state.teams[match.homeTeamId];
  const away = state.teams[match.awayTeamId];
  const sorted = [...events].sort((a, b) => a.minute - b.minute);

  const icon = (t) => ({
    goal: "⚽", yellow: "🟨", red: "🟥", injury: "🤕", sub: "🔄", forfeit: "🚫",
  }[t] || "•");

  return `
    <div class="modal-section">
      <h4>Eventos da Partida</h4>
      <ul class="timeline">
        ${sorted.map(e => {
          const isHome = e.side === "home";
          const side = isHome ? home.shortName : away.shortName;
          return `
            <li>
              <span class="min">${e.minute}'</span>
              <span class="ev ${isHome ? "home" : "away"}">
                ${icon(e.type)} <b>${side}</b> · ${e.description.replace(/^[^a-zA-ZÀ-ÿ0-9]*\d+'\s*/, "")}
              </span>
            </li>
          `;
        }).join("")}
      </ul>
    </div>
  `;
}

function renderMatchStatsTable(h, a) {
  const rows = [
    ["Chutes", h.shots ?? 0, a.shots ?? 0],
    ["No gol", h.shotsOnTarget ?? 0, a.shotsOnTarget ?? 0],
    ["Faltas", h.fouls ?? 0, a.fouls ?? 0],
    ["🟨 Amarelos", h.yellows ?? 0, a.yellows ?? 0],
    ["🟥 Vermelhos", h.reds ?? 0, a.reds ?? 0],
  ];
  return `
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

function renderLineupColumn(team, lineup, side) {
  if (!lineup || !lineup.length) {
    return `<div>
      <div style="font-weight:700;margin-bottom:8px;font-size:13px">${team.name}</div>
      <p style="color:var(--muted);font-size:12px">Escalação não disponível.</p>
    </div>`;
  }
  return `
    <div>
      <div style="font-weight:700;margin-bottom:8px;font-size:13px;color:${team.colors.primary}">${team.name}</div>
      <div class="lineup-list">
        ${lineup.map(p => `
          <div class="row" data-player="${p.id}">
            <span class="badge badge-pos">${p.position}</span>
            <span>${p.name}</span>
            <span class="badge badge-ovr ${ovrClass(p.overall)}">${p.overall}</span>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function blank() {
  return { shots: 0, shotsOnTarget: 0, fouls: 0, yellows: 0, reds: 0 };
}

// Helper para tornar elementos clicáveis pelo player ID
function wirePlayerClicks() {
  $main.querySelectorAll("[data-player]").forEach(el => {
    el.classList.add("clickable-player");
    el.onclick = (ev) => {
      ev.stopPropagation();
      openPlayerDetail(el.dataset.player);
    };
  });
}

// -------------------- Card: Treinamento Semanal --------------------
function renderTrainingCard(team) {
  const currentKey = team.tactics?.training || DEFAULT_TRAINING;
  const current = TRAINING_FOCI[currentKey];

  return `
    <div class="card">
      <h3>🏋️ Treinamento Semanal</h3>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px">
        ${FOCUS_KEYS.map(key => {
          const f = TRAINING_FOCI[key];
          const on = key === currentKey;
          return `<button class="btn-toggle ${on ? "on" : ""}" data-training="${key}" title="${f.hint}">
            ${f.icon} ${f.label}
          </button>`;
        }).join("")}
      </div>
      <div style="display:grid;grid-template-columns:auto 1fr;gap:14px;font-size:12px;align-items:center;background:var(--bg-2);border:1px solid var(--border);border-radius:6px;padding:10px 14px">
        <div style="font-size:28px">${current.icon}</div>
        <div>
          <div style="font-weight:700;color:var(--accent);margin-bottom:2px">${current.label}</div>
          <div style="color:var(--muted);font-size:11px">${current.hint}</div>
          ${current.attrs?.length ? `
            <div style="color:var(--muted);font-size:11px;margin-top:4px">
              Atributos trabalhados: <b style="color:var(--text)">${current.attrs.join(", ")}</b>
            </div>` : ""}
          ${current.rest ? `
            <div style="color:var(--accent);font-size:11px;margin-top:4px">
              ⚡ Recupera +${current.fitnessRecover} fitness e +${current.formRecover} forma por semana.
            </div>` : ""}
        </div>
      </div>
    </div>
  `;
}

// -------------------- Próximo jogo --------------------
function findNextMatch() {
  const comp = state.competitions[MY_COMP_ID];
  if (!comp) return null;
  return comp.fixtures.find(m =>
    !m.played && (m.homeTeamId === MY_TEAM_ID || m.awayTeamId === MY_TEAM_ID)
  );
}

function renderNextMatchCard() {
  const match = findNextMatch();
  if (!match) {
    return `<div class="card"><h3>Próxima Partida</h3>
      <p style="color:var(--muted)">Não há partidas pendentes nesta competição.</p></div>`;
  }

  const isHome = match.homeTeamId === MY_TEAM_ID;
  const opp = state.teams[isHome ? match.awayTeamId : match.homeTeamId];
  const my = state.teams[MY_TEAM_ID];

  // Scout: força média do XI provável do adversário (top 11 por overall, descartando lesionados)
  const oppXI = scoutBestXI(opp);
  const oppAvg = oppXI.length
    ? Math.round(oppXI.reduce((s, p) => s + p.overall, 0) / oppXI.length)
    : 0;
  const myLineup = (my.lineup || []).map(pid => state.players[pid]).filter(Boolean);
  const myAvg = myLineup.length
    ? Math.round(myLineup.reduce((s, p) => s + p.overall, 0) / myLineup.length)
    : 0;
  const myForm = myLineup.length
    ? (myLineup.reduce((s, p) => s + (p.status?.form ?? 6.5), 0) / myLineup.length).toFixed(1)
    : "—";
  const myMorale = myLineup.length
    ? Math.round(myLineup.reduce((s, p) => s + (p.status?.morale ?? 70), 0) / myLineup.length)
    : "—";
  const oppForm = oppXI.length
    ? (oppXI.reduce((s, p) => s + (p.status?.form ?? 6.5), 0) / oppXI.length).toFixed(1)
    : "—";
  const oppMorale = oppXI.length
    ? Math.round(oppXI.reduce((s, p) => s + (p.status?.morale ?? 70), 0) / oppXI.length)
    : "—";

  const oppKeyPlayers = oppXI.slice(0, 3);
  const diff = myAvg - oppAvg;
  const diffColor = diff > 2 ? "var(--accent)" : diff < -2 ? "var(--danger)" : "var(--warning)";
  const diffLabel = diff > 2 ? "Favorito" : diff < -2 ? "Azarão" : "Equilibrado";

  return `
    <div class="card" style="border-top:3px solid ${opp.colors.primary}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <h3 style="margin:0">Próxima Partida · Rodada ${match.round}</h3>
        <span class="badge" style="background:${diffColor};color:#000;font-weight:700">${diffLabel}</span>
      </div>

      <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:24px;align-items:center;margin-bottom:16px">
        <div style="text-align:right">
          <div style="display:flex;align-items:center;justify-content:flex-end;gap:10px;margin-bottom:2px">
            <div style="font-weight:700;font-size:16px">${my.name}</div>
            ${teamLogo(MY_TEAM_ID, 40)}
          </div>
          <div style="font-size:12px;color:var(--muted)">você · ${my.tactics?.formation || "4-3-3"}</div>
          <div style="margin-top:6px;font-size:11px;color:var(--muted)">Força · Forma · Moral</div>
          <div style="font-size:18px;font-weight:800">
            <span style="color:var(--accent)">${myAvg || "—"}</span>
            <span style="color:var(--muted);font-size:14px"> · ${myForm} · ${myMorale}</span>
          </div>
        </div>

        <div style="text-align:center">
          <div style="font-size:24px">${isHome ? "🏠" : "✈️"}</div>
          <div style="color:var(--muted);font-size:11px;margin-top:4px">${isHome ? "EM CASA" : "FORA"}</div>
          <div style="margin-top:8px;font-size:18px;font-weight:700;color:var(--muted)">vs</div>
        </div>

        <div>
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:2px">
            ${teamLogo(opp.id, 40)}
            <div style="font-weight:700;font-size:16px">${opp.name}</div>
          </div>
          <div style="font-size:12px;color:var(--muted)">Rep ${opp.reputation} · ${opp.tactics?.formation || "4-3-3"}</div>
          <div style="margin-top:6px;font-size:11px;color:var(--muted)">Força · Forma · Moral</div>
          <div style="font-size:18px;font-weight:800">
            <span style="color:var(--accent-2)">${oppAvg}</span>
            <span style="color:var(--muted);font-size:14px"> · ${oppForm} · ${oppMorale}</span>
          </div>
        </div>
      </div>

      <div>
        <div style="color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">
          Atenção a estes jogadores do ${opp.shortName}
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${oppKeyPlayers.map(p => `
            <div data-player="${p.id}" style="background:var(--bg-2);border:1px solid var(--border);border-radius:6px;padding:8px 12px;display:flex;align-items:center;gap:8px;cursor:pointer">
              <span class="badge badge-pos">${p.position}</span>
              <span style="font-size:13px;font-weight:600">${p.name}</span>
              <span class="badge badge-ovr ${ovrClass(p.overall)}">${p.overall}</span>
            </div>
          `).join("")}
        </div>
      </div>
    </div>
  `;
}

function scoutBestXI(team) {
  if (!team) return [];
  const formation = FORMATIONS[team.tactics?.formation] || FORMATIONS["4-3-3"];
  const available = team.squad
    .map(pid => state.players[pid])
    .filter(p => p && !p.status.injury && p.status.suspendedMatches === 0);
  const groups = { GOL: [], DEF: [], MID: [], ATA: [] };
  for (const p of available) {
    const g = POS_GROUP[p.position];
    if (g) groups[g].push(p);
  }
  for (const k of Object.keys(groups)) groups[k].sort((a, b) => b.overall - a.overall);
  const xi = [
    ...groups.GOL.slice(0, formation.slots.GOL),
    ...groups.DEF.slice(0, formation.slots.DEF),
    ...groups.MID.slice(0, formation.slots.MID),
    ...groups.ATA.slice(0, formation.slots.ATA),
  ];
  return xi.sort((a, b) => b.overall - a.overall);
}

// -------------------- Helpers --------------------
function autoLineup(team) {
  const available = team.squad
    .map(pid => state.players[pid])
    .filter(p => p && !p.status.injury && p.status.suspendedMatches === 0);
  const groups = { GOL: [], DEF: [], MID: [], ATA: [] };
  for (const p of available) {
    const g = POS_GROUP[p.position];
    if (g) groups[g].push(p);
  }
  for (const k of Object.keys(groups)) groups[k].sort((a, b) => b.overall - a.overall);

  const formation = FORMATIONS[team.tactics?.formation] || FORMATIONS["4-3-3"];
  const xi = [
    ...groups.GOL.slice(0, formation.slots.GOL),
    ...groups.DEF.slice(0, formation.slots.DEF),
    ...groups.MID.slice(0, formation.slots.MID),
    ...groups.ATA.slice(0, formation.slots.ATA),
  ];
  // Completa com sobras se o elenco não tem o suficiente em alguma posição
  if (xi.length < 11) {
    const used = new Set(xi.map(p => p.id));
    const rest = available.filter(p => !used.has(p.id)).sort((a, b) => b.overall - a.overall);
    while (xi.length < 11 && rest.length) xi.push(rest.shift());
  }
  return xi.map(p => p.id);
}

function validateLineup() {
  const team = state.teams[MY_TEAM_ID];
  team.lineup = team.lineup.filter(pid => {
    const p = state.players[pid];
    return p && !p.status.injury && p.status.suspendedMatches === 0;
  });
  if (team.lineup.length < 11) team.lineup = autoLineup(team);
}

function groupCount(players) {
  const out = { GOL: 0, DEF: 0, MID: 0, ATA: 0 };
  for (const p of players) {
    if (!p) continue;
    const g = POS_GROUP[p.position];
    if (g) out[g]++;
  }
  return out;
}

function ovrClass(ovr) { return ovr >= 80 ? "" : ovr >= 70 ? "mid" : "low"; }
function fmt(n) { return Math.round(n).toLocaleString("pt-BR"); }

// -------------------- Tema dinâmico por time --------------------
// Substitui as variáveis CSS --accent e --accent-2 (e seus equivalentes RGB)
// pela cor primária/secundária do time gerenciado. Cores muito escuras são
// clareadas para garantir contraste com o texto preto dos botões.
function applyTeamTheme(teamColors) {
  const root = document.documentElement;
  if (!teamColors) {
    // Reset para padrão (verde)
    root.style.setProperty("--accent",       "#00d97e");
    root.style.setProperty("--accent-2",     "#0ea5e9");
    root.style.setProperty("--accent-rgb",   "0, 217, 126");
    root.style.setProperty("--accent-2-rgb", "14, 165, 233");
    return;
  }
  const accent  = ensureBright(teamColors.primary, 0.35);
  const accent2 = ensureBright(teamColors.secondary, 0.35);
  root.style.setProperty("--accent",       accent);
  root.style.setProperty("--accent-2",     accent2);
  root.style.setProperty("--accent-rgb",   hexToRgbStr(accent));
  root.style.setProperty("--accent-2-rgb", hexToRgbStr(accent2));
}

function luminance(hex) {
  const { r, g, b } = parseHex(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

function lighten(hex, amount) {
  let { r, g, b } = parseHex(hex);
  r = Math.round(r + (255 - r) * amount);
  g = Math.round(g + (255 - g) * amount);
  b = Math.round(b + (255 - b) * amount);
  return "#" + [r, g, b].map(x => x.toString(16).padStart(2, "0")).join("");
}

function parseHex(hex) {
  hex = (hex || "#888888").replace("#", "");
  return {
    r: parseInt(hex.substr(0, 2), 16),
    g: parseInt(hex.substr(2, 2), 16),
    b: parseInt(hex.substr(4, 2), 16),
  };
}

function hexToRgbStr(hex) {
  const { r, g, b } = parseHex(hex);
  return `${r}, ${g}, ${b}`;
}

// Clareia iterativamente até atingir luminância mínima (garante contraste).
function ensureBright(hex, minLum) {
  let cur = hex || "#888888";
  let lum = luminance(cur);
  let iterations = 0;
  while (lum < minLum && iterations < 8) {
    const next = lighten(cur, 0.3);
    const nextLum = luminance(next);
    if (nextLum <= lum) break;
    cur = next;
    lum = nextLum;
    iterations++;
  }
  return cur;
}

// Renderiza o escudo do time. Aceita seed (objeto com colors) ou usa state.teams.
// Se não há logo cadastrado, cai pra bolinha colorida.
function teamLogo(teamId, size = 24, teamObj = null) {
  const path = TEAM_LOGOS[teamId];
  const team = teamObj || state?.teams?.[teamId];
  const color = team?.colors?.primary ?? "#888";
  if (path) {
    return `<img src="${path}" alt="${team?.shortName ?? teamId}"
              style="width:${size}px;height:${size}px;object-fit:contain;vertical-align:middle;display:inline-block"
              onerror="this.outerHTML='<span style=\\'display:inline-block;width:${size}px;height:${size}px;border-radius:50%;background:${color};vertical-align:middle\\'></span>'" />`;
  }
  return `<span style="display:inline-block;width:${size}px;height:${size}px;border-radius:50%;background:${color};vertical-align:middle"></span>`;
}
function pct(mult) {
  const diff = Math.round((mult - 1) * 100);
  return diff === 0 ? "0%" : (diff > 0 ? "+" : "") + diff + "%";
}
function log(msg) { state.log.push(`[R${getCurrentRound(state.competitions[MY_COMP_ID]) ?? "fim"}] ${msg}`); }
