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
} from "./engine/transfers.js";
import { isSeasonOver, endSeason } from "./engine/season-end.js";
import { generateNewsForRound, generateSeasonEndNews } from "./engine/news.js";
import {
  createCupCompetition, getCupLegsForRound, applyCupLegResult,
  maybeDrawNextPhase, drawPhase, CUP_PHASE_ORDER, CUP_PHASE_META,
} from "./engine/cup.js";
import { saveGame, loadGame, listSaves, deleteSave } from "./db.js";
import { SERIE_A_SEED, SERIE_B_SEED } from "../data/teams.seed.js";
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

const VIEWS = [
  { id: "lineup",    label: "Escalação",     icon: "⚽" },
  { id: "standings", label: "Classificação", icon: "📊" },
  { id: "cup",       label: "Copa do Brasil",icon: "🏆" },
  { id: "calendar",  label: "Calendário",    icon: "📅" },
  { id: "market",    label: "Mercado",       icon: "💼" },
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
    <div class="view-sub">40 clubes em 2 divisões disputam simultaneamente. Selecione o seu.</div>
    ${tierBlock("Série A", SERIE_A_SEED, "var(--accent)")}
    ${tierBlock("Série B", SERIE_B_SEED, "var(--accent-2)")}
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
  MY_COMP_ID = SERIE_A_SEED.some(t => t.id === teamId) ? "brasileirao_a" : "brasileirao_b";
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
    settings: { difficulty: "normal", language: "pt-BR", seed },
  };

  // Cria todos os 40 times e seus elencos
  for (const seed of [...SERIE_A_SEED, ...SERIE_B_SEED]) {
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

  // Cria Copa do Brasil para esta temporada
  state.competitions.copa_brasil = createCupCompetition({
    season: 2026,
    allTeams: state.teams,
    libertaQualifiers: null, // 1ª temporada — usará top 4 por reputação
    seriesATeamIds: SERIE_A_SEED.map(t => t.id),
  });

  // Diversifica formações da IA (usuário começa em 4-3-3 padrão)
  const aiFormations = Object.keys(FORMATIONS);
  for (const t of Object.values(state.teams)) {
    if (t.id !== MY_TEAM_ID) {
      t.tactics.formation = aiFormations[rng.int(0, aiFormations.length - 1)];
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
  const comp = state.competitions[MY_COMP_ID];
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

  $btnPlay.disabled = round == null;
  if (round == null) {
    $btnPlay.textContent = "✓ TEMPORADA ENCERRADA";
  } else {
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
      $btnPlay.textContent = `▶ AVANÇAR SEMANA (R${round})`;
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
      <div style="display:flex;gap:6px">
        <button class="btn-toggle ${standingsView === "brasileirao_a" ? "on" : ""}" data-comp="brasileirao_a">Série A</button>
        <button class="btn-toggle ${standingsView === "brasileirao_b" ? "on" : ""}" data-comp="brasileirao_b">Série B</button>
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

  return `
    <div class="view-title">Mercado</div>
    <div class="view-sub">Caixa disponível: <b style="color:var(--accent)">R$ ${fmt(my.finances.balance)}</b></div>

    <div class="card">
      <h3>Agentes Livres <span style="color:var(--muted);font-weight:400;font-size:12px">(sem custo de transferência)</span></h3>
      ${renderPlayerTable(free, "free")}
    </div>

    <div class="card">
      <h3>Disponíveis em Outros Clubes</h3>
      ${renderPlayerTable(market, "buy")}
    </div>
  `;
}

function renderPlayerTable(players, kind) {
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
            <td><button class="btn btn-sm" data-action="${kind}" data-pid="${p.id}">${kind === "free" ? "Contratar" : "Ofertar"}</button></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
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

    ${CUP_PHASE_ORDER.map(phaseKey => renderCupPhase(cup, phaseKey)).join("")}
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

  return `
    <div class="card" style="padding:14px 18px;margin-bottom:10px;border-left:3px solid ${accent}">
      <div style="display:flex;justify-content:space-between;align-items:baseline">
        <h3 style="margin:0;font-size:13px">
          ${meta.name}
          ${meta.legs === 2 ? `<span style="color:var(--muted);font-size:11px;font-weight:400;margin-left:6px">ida e volta</span>` : ""}
          ${isCurrent ? ` <span style="color:var(--accent);font-size:11px;font-weight:600;margin-left:6px">EM ANDAMENTO</span>` : ""}
        </h3>
        <span style="color:var(--muted);font-size:11px">Rodadas ${cup.schedule[phaseKey].join(" / ")}</span>
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
  const comp = state.competitions[compId];
  const fixtures = comp.fixtures;
  const totalRounds = Math.max(...fixtures.map(m => m.round));
  const currentRound = getCurrentRound(comp);

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
  $main.querySelectorAll("[data-match]").forEach(el => {
    el.onclick = () => openMatchDetail(el.dataset.match, calendarCompId || MY_COMP_ID);
  });

  // Scroll automático até a rodada atual quando entra no calendário
  const currentEl = $main.querySelector("#round-current");
  if (currentEl) {
    setTimeout(() => currentEl.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
  }
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

  if (kind === "free") {
    const sal = prompt(`Salário mensal para ${p.name} (esperado ~R$ ${fmt(expSal)}):`, String(expSal));
    if (!sal) return;
    const res = signFreeAgent(state, { teamId: MY_TEAM_ID, playerId: pid, salaryOffer: Number(sal) });
    log((res.accepted ? "✅ " : "❌ ") + res.message);
  } else {
    const fee = prompt(`Proposta por ${p.name} (valor: R$ ${fmt(p.marketValue)}):`, String(p.marketValue));
    if (!fee) return;
    const sal = prompt(`Salário oferecido (esperado ~R$ ${fmt(expSal)}):`, String(expSal));
    if (!sal) return;
    const res = makeBid(state, {
      fromTeamId: MY_TEAM_ID, playerId: pid, fee: Number(fee), salaryOffer: Number(sal),
    });
    log((res.accepted ? "✅ " : "❌ ") + res.message);
  }
  state.teams[MY_TEAM_ID].lineup = state.teams[MY_TEAM_ID].lineup
    .filter(id => state.teams[MY_TEAM_ID].squad.includes(id));
  render();
}

// -------------------- Jogar Rodada --------------------
// Cada clique processa UM compromisso por vez:
//   1) Se há partida pendente do usuário (copa primeiro, depois liga),
//      joga essa única partida e volta pro menu.
//   2) Quando não há mais partidas do usuário na rodada,
//      simula a IA, paga finanças, gera notícias e avança a semana.
function playRound() {
  const comp = state.competitions[MY_COMP_ID];
  const round = getCurrentRound(comp);
  if (round == null) return;

  const cup = state.competitions.copa_brasil;
  if (cup) maybeDrawNextPhase(cup, round - 1, rng, state.teams);

  const next = findNextUserCommitment(round);

  if (next) {
    // Joga UMA partida do usuário e retorna ao menu.
    const home = state.teams[next.match.homeTeamId];
    const away = state.teams[next.match.awayTeamId];
    const sim = createMatchSimulator({
      homeTeam: home, awayTeam: away, playersById: state.players, rng,
    });
    playMatchOnScreen(next.match, sim, async () => {
      const result = sim.getResult();
      if (next.isCup) {
        applyCupLegToState(next.match, result);
        log(`🏆 Copa: ${state.teams[next.match.homeTeamId].shortName} ${result.score.home}×${result.score.away} ${state.teams[next.match.awayTeamId].shortName}`);
      } else {
        applyMatchResult(state, next.match, result, comp);
      }
      try { await saveGame(state); } catch (e) { console.warn("Save falhou:", e); }
      render();
    });
  } else {
    // Não há mais partida do usuário nesta rodada — simula IA e fecha a semana.
    finalizeRound(round);
  }
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
  applyCupLegResult(cup, leg, rng);
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

function playMatchOnScreen(match, sim, onContinue) {
  const home = state.teams[match.homeTeamId];
  const away = state.teams[match.awayTeamId];
  // Qual lado o usuário controla
  const userSide = match.homeTeamId === MY_TEAM_ID ? "home" : "away";

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

  const tick = () => {
    if (aborted || paused) return;
    sim.tick();
    // IA do adversário: tenta substituir aos 60' e 75'
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
      if (sim.minute === 60 || sim.minute === 75) {
        const aiSide = userSide === "home" ? "away" : "home";
        aiAutoSubsInteractive(sim, aiSide, state.players, rng);
      }
    }
    renderMatch();
    finishMatch();
  };

  const finishMatch = () => {
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
  const champA = state.teams[report.champions.brasileirao_a]?.name ?? "?";
  const champB = state.teams[report.champions.brasileirao_b]?.name ?? "?";
  const relegated = report.relegated.map(id => state.teams[id]?.shortName).join(", ");
  const promoted = report.promoted.map(id => state.teams[id]?.shortName).join(", ");

  log(`🏆 Fim da temporada ${report.season}. Campeão A: ${champA}. Campeão B: ${champB}.`);
  log(`⬇️ Rebaixados: ${relegated}. ⬆️ Promovidos: ${promoted}.`);
  log(`👋 ${report.retired.length} jogadores se aposentaram. ${report.freeAgents.length} contratos vencidos.`);

  // Atualiza qual competição o usuário está
  if (state.competitions.brasileirao_a.teams.includes(MY_TEAM_ID)) MY_COMP_ID = "brasileirao_a";
  else if (state.competitions.brasileirao_b.teams.includes(MY_TEAM_ID)) MY_COMP_ID = "brasileirao_b";
  standingsView = MY_COMP_ID;

  // Reescala automaticamente para a próxima temporada
  state.teams[MY_TEAM_ID].lineup = autoLineup(state.teams[MY_TEAM_ID]);

  alert(
    `Fim da temporada ${report.season}!\n\n` +
    `🏆 Série A: ${champA}\n🏆 Série B: ${champB}\n\n` +
    `⬇️ Rebaixados da A: ${relegated}\n⬆️ Promovidos da B: ${promoted}\n\n` +
    `Você dirige o ${state.teams[MY_TEAM_ID].name} na temporada ${state.season} (${state.competitions[MY_COMP_ID].name}).`
  );
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

  const status =
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
