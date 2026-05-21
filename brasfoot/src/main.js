// Dashboard unificado — integra escalação, classificação, mercado, finanças
// e tela de jogo com playback minuto a minuto.

import { createRng } from "./utils/rng.js";
import { createTeam } from "./models/team.js";
import { generateSquad, syncPlayerIdCounter } from "./models/player.js";
import { createCompetition } from "./models/competition.js";
import {
  sortStandings, getCurrentRound, decrementSuspensions, getMatchesOfRound,
  applyMatchResult, recalcTopScorers,
} from "./engine/season.js";
import { simulateMatch } from "./engine/match.js";
import { weeklyTick } from "./engine/finance.js";
import {
  listFreeAgents, listMarket, makeBid, signFreeAgent, generateFreeAgents,
  runAITransfers,
} from "./engine/transfers.js";
import { isSeasonOver, endSeason } from "./engine/season-end.js";
import { saveGame, loadGame, listSaves, deleteSave } from "./db.js";
import { SERIE_A_SEED, SERIE_B_SEED } from "../data/teams.seed.js";

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
  { id: "market",    label: "Mercado",       icon: "💼" },
  { id: "finance",   label: "Finanças",      icon: "💰" },
];

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

  $btnPlay.style.display = "";
  view = "lineup";
  render();
}

function renderTeamPicker() {
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
        <div style="width:32px;height:32px;border-radius:50%;background:${t.colors.primary};display:flex;align-items:center;justify-content:center;font-weight:700;color:${t.colors.secondary};font-size:11px">
          ${t.shortName}
        </div>
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
  state.teams[MY_TEAM_ID].lineup = autoLineup(state.teams[MY_TEAM_ID]);

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

  $topInfo.innerHTML = `
    <div>Temporada <b>${state.season}</b></div>
    <div>Rodada <b>${round ?? total}/${total}</b></div>
    <div>Caixa <b>R$ ${fmt(my.finances.balance)}</b></div>
  `;

  $teamCard.innerHTML = `
    <div class="name">${my.name}</div>
    <div class="meta">Reputação ${my.reputation} · ${my.squad.length} jogadores</div>
  `;

  $nav.innerHTML = VIEWS.map(v => `
    <button class="nav-btn ${view === v.id ? "active" : ""}" data-view="${v.id}">
      <span class="icon">${v.icon}</span>${v.label}
    </button>
  `).join("");
  $nav.querySelectorAll("[data-view]").forEach(btn => {
    btn.onclick = () => { view = btn.dataset.view; render(); };
  });

  $btnPlay.disabled = round == null;
  $btnPlay.textContent = round == null ? "✓ TEMPORADA ENCERRADA" : `▶  JOGAR RODADA ${round}`;
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
  if (view === "market")    $main.innerHTML = renderMarket();
  if (view === "finance")   $main.innerHTML = renderFinance();
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

  return `
    <div class="view-title">Escalação</div>
    <div class="view-sub">
      Clique para alternar titular/reserva. Lesionados e suspensos não jogam.
    </div>

    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <div class="formation-counter">
          Titulares: <span class="count ${counterClass}">${totalStarters}/11</span>
          · GOL <span class="count">${startersByGroup.GOL}</span>
          · DEF <span class="count">${startersByGroup.DEF}</span>
          · MID <span class="count">${startersByGroup.MID}</span>
          · ATA <span class="count">${startersByGroup.ATA}</span>
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
                <td><b>${p.name}</b></td>
                <td><span class="badge badge-pos">${p.position}</span></td>
                <td>${p.age}</td>
                <td><span class="badge badge-ovr ${ovrClass(p.overall)}">${p.overall}</span></td>
                <td>${p.status.form.toFixed(1)}</td>
                <td>R$ ${fmt(p.contract.salary)}</td>
                <td>${
                  inj ? `<span class="badge badge-injury">Lesão ${inj.weeksOut}sem</span>` :
                  sus ? `<span class="badge badge-suspended">Suspenso</span>` : ""
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
                <td><b>${state.teams[s.teamId].name}</b></td>
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
                  <td>${i + 1}</td><td>${s.playerName}</td>
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
            <td><b>${p.name}</b></td>
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
}

function handleBid(kind, pid) {
  const p = state.players[pid];
  const expSal = Math.round(Math.pow(Math.max(p.overall - 50, 1), 1.9) * 800);
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
function playRound() {
  const comp = state.competitions[MY_COMP_ID];
  const round = getCurrentRound(comp);
  if (round == null) return;

  const myMatch = getMatchesOfRound(comp, round)
    .find(m => m.homeTeamId === MY_TEAM_ID || m.awayTeamId === MY_TEAM_ID);

  const home = state.teams[myMatch.homeTeamId];
  const away = state.teams[myMatch.awayTeamId];
  const myResult = simulateMatch({ homeTeam: home, awayTeam: away, playersById: state.players, rng });

  playMatchOnScreen(myMatch, myResult, () => finalizeRound(round, myMatch, myResult));
}

function playMatchOnScreen(match, result, onContinue) {
  const home = state.teams[result.homeTeamId];
  const away = state.teams[result.awayTeamId];
  let currentMinute = 0;
  let homeScore = 0, awayScore = 0;
  let homeStats = { shots: 0, shotsOnTarget: 0, fouls: 0, yellows: 0 };
  let awayStats = { shots: 0, shotsOnTarget: 0, fouls: 0, yellows: 0 };
  const shown = [];

  $overlay.classList.add("visible");
  document.getElementById("match-footer").innerHTML = "";

  const renderMatch = () => {
    document.getElementById("scoreboard").innerHTML = `
      <div class="team">
        <div class="name">${home.name}</div>
        <div class="short">${home.shortName} · ${home.reputation}</div>
      </div>
      <div class="center">
        <div class="score">${homeScore} <span style="color:var(--muted);font-size:32px">×</span> ${awayScore}</div>
        <div class="minute">${currentMinute >= 90 ? "FIM DE JOGO" : currentMinute + "'"}</div>
      </div>
      <div class="team">
        <div class="name">${away.name}</div>
        <div class="short">${away.shortName} · ${away.reputation}</div>
      </div>
    `;
    document.getElementById("match-events").innerHTML = shown.length
      ? shown.slice().reverse().map(e => `
        <div class="event ${e.type}">
          <span class="min">${e.minute}'</span>
          <span>${e.description}</span>
        </div>`).join("")
      : `<p style="color:var(--muted)">Sem eventos ainda...</p>`;
    document.getElementById("match-stats").innerHTML = renderMatchStats(homeStats, awayStats);
  };

  renderMatch();

  const interval = setInterval(() => {
    currentMinute++;
    for (const ev of result.events.filter(e => e.minute === currentMinute)) {
      shown.push(ev);
      const target = ev.side === "home" ? homeStats : awayStats;
      if (ev.type === "goal") { if (ev.side === "home") homeScore++; else awayScore++; }
      else if (ev.type === "yellow") target.yellows++;
    }
    const t = currentMinute / 90;
    homeStats.shots = Math.round(result.stats.home.shots * t);
    homeStats.shotsOnTarget = Math.round(result.stats.home.shotsOnTarget * t);
    homeStats.fouls = Math.round(result.stats.home.fouls * t);
    awayStats.shots = Math.round(result.stats.away.shots * t);
    awayStats.shotsOnTarget = Math.round(result.stats.away.shotsOnTarget * t);
    awayStats.fouls = Math.round(result.stats.away.fouls * t);

    renderMatch();

    if (currentMinute >= 90) {
      clearInterval(interval);
      document.getElementById("match-footer").innerHTML = `<button class="btn" id="btn-continue">Continuar ▶</button>`;
      document.getElementById("btn-continue").onclick = () => {
        $overlay.classList.remove("visible");
        onContinue();
      };
    }
  }, 60);
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

async function finalizeRound(round, myMatch, myResult) {
  // 1. Aplica resultado do jogo do usuário (na sua competição)
  const myComp = state.competitions[MY_COMP_ID];
  applyMatchResult(state, myMatch, myResult, myComp);

  const allResults = [myResult];

  // 2. Simula o restante das duas competições nesta rodada
  for (const [, comp] of Object.entries(state.competitions)) {
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

  // 3. Finanças
  const tick = weeklyTick(state, allResults, MY_COMP_ID);
  const myRev = tick.revenues.find(r => r.teamId === MY_TEAM_ID);
  const myWages = tick.wages.find(w => w.teamId === MY_TEAM_ID);
  log(`Rodada ${round}: ${state.teams[myMatch.homeTeamId].shortName} ${myResult.score.home}×${myResult.score.away} ${state.teams[myMatch.awayTeamId].shortName}` +
    (myRev ? ` · bilheteria +R$ ${fmt(myRev.revenue)}` : "") +
    ` · folha -R$ ${fmt(myWages.wagesPaid)}.`);

  // 4. Suspensões + IA de mercado
  decrementSuspensions(state, allResults.flatMap(r => [r.homeTeamId, r.awayTeamId]));
  const aiMoves = runAITransfers(state, rng, { excludeTeamId: MY_TEAM_ID });
  for (const m of aiMoves) log(`🔁 ${m.message}`);

  validateLineup();

  // 5. Virada de temporada se ambas competições terminaram
  if (isSeasonOver(state)) {
    const report = endSeason(state, rng);
    showSeasonRecap(report);
  }

  // 6. Persiste
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
  const xi = [
    ...groups.GOL.slice(0, 1),
    ...groups.DEF.slice(0, 4),
    ...groups.MID.slice(0, 3),
    ...groups.ATA.slice(0, 3),
  ];
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
function log(msg) { state.log.push(`[R${getCurrentRound(state.competitions[MY_COMP_ID]) ?? "fim"}] ${msg}`); }
