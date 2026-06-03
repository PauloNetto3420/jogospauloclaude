// Todos os modais da UI:
//   - Ficha do jogador (openPlayerDetail)
//   - Detalhe da partida (openMatchDetail)
//   - Disputa de pênaltis (showPenaltyShootoutModal)
//   - Sorteio dos grupos do estadual (showEstadualDrawModal)
//   - Sorteio das fases da Copa (showCupDrawModal)
//   - Resumo de fim de temporada (showSeasonRecapModal)
//
// Os modais leem `state` via core/store (live binding). O time gerenciado é
// obtido por `state.managedTeamId` (sempre sincronizado com MY_TEAM_ID).
// Ações de mercado disparadas dentro do modal de jogador são despachadas via
// `registerModalActions({ onBid })` — main.js registra o handleBid no boot.

import { state } from "../core/store.js";
import { fmt, ovrClass, teamLogo } from "./format.js";
import { CUP_PHASE_META } from "../engine/cup.js";
import { getEstadualGroupComps } from "../engine/estadual.js";
import { getRenewalExpectation } from "../engine/transfers.js";

// -------------------- Registry de ações (callbacks externos) --------------------
let _actions = { onBid: null };
export function registerModalActions(actions) {
  _actions = { ..._actions, ...actions };
}

// -------------------- Traits / atributos exibidos na ficha --------------------
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

// -------------------- Modal: Ficha do Jogador --------------------
export function openPlayerDetail(playerId) {
  const myTeamId = state.managedTeamId;
  const p = state.players[playerId];
  if (!p) return;
  const team = p.teamId ? state.teams[p.teamId] : null;

  const seasonStats = p.stats[state.season] || {};
  const totalGoals = Object.values(seasonStats).reduce((s, v) => s + (v.goals || 0), 0);
  const totalApps = Object.values(seasonStats).reduce((s, v) => s + (v.apps || 0), 0);
  const totalAssists = Object.values(seasonStats).reduce((s, v) => s + (v.assists || 0), 0);
  const yellowsTotal = Object.values(p.status.yellowCardsInCompetition || {}).reduce((s, v) => s + v, 0);

  const attrs = Object.entries(p.attributes)
    .filter(([k]) => k !== "goalkeeping" || p.position === "GOL");

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
          <div><span class="lbl">Contrato até</span><span class="val">${p.contract.until}</span></div>
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

      ${team && team.id === myTeamId ? `
        <div class="modal-section">
          <h4>Ações</h4>
          <button class="btn btn-sm" data-modal-action="renew" data-pid="${p.id}">
            Renovar Contrato · esperado ~R$ ${fmt(getRenewalExpectation(p))}/mês
          </button>
        </div>
      ` : ""}
      ${team && team.id !== myTeamId ? `
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
  document.getElementById("player-modal").addEventListener("click", playerBackdropClose);
  document.querySelectorAll("[data-modal-action]").forEach(btn => {
    btn.onclick = () => {
      closePlayerDetail();
      if (_actions.onBid) _actions.onBid(btn.dataset.modalAction, btn.dataset.pid);
    };
  });
}

function playerBackdropClose(e) {
  if (e.target.id === "player-modal") closePlayerDetail();
}

export function closePlayerDetail() {
  const el = document.getElementById("player-modal");
  el.classList.remove("visible");
  el.removeEventListener("click", playerBackdropClose);
}

export function getContractYearsLeft(player) {
  if (!player.contract?.until) return 99;
  const endYear = parseInt(player.contract.until.slice(0, 4), 10);
  return endYear - state.season;
}

export function contractWarning(player) {
  const left = getContractYearsLeft(player);
  if (player.teamId !== state.managedTeamId) return "";
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

// Helper: torna elementos [data-player] do conteúdo principal clicáveis
export function wirePlayerClicks() {
  const root = document.getElementById("main");
  if (!root) return;
  root.querySelectorAll("[data-player]").forEach(el => {
    el.classList.add("clickable-player");
    el.onclick = (ev) => {
      ev.stopPropagation();
      openPlayerDetail(el.dataset.player);
    };
  });
}

// -------------------- Modal: Detalhe da Partida --------------------
export function openMatchDetail(matchId, compId) {
  const comp = state.competitions[compId];
  const match = comp?.fixtures.find(m => m.id === matchId);
  if (!match || !match.played) return;

  const home = state.teams[match.homeTeamId];
  const away = state.teams[match.awayTeamId];
  const homeWon = match.score.home > match.score.away;
  const awayWon = match.score.away > match.score.home;

  const events = match.events || [];
  const lineups = match.lineups || { home: [], away: [] };
  const stats = match.stats || { home: blankStats(), away: blankStats() };

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

export function closeMatchDetail() {
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

function blankStats() {
  return { shots: 0, shotsOnTarget: 0, fouls: 0, yellows: 0, reds: 0 };
}

// -------------------- Modal: Disputa de Pênaltis --------------------
export function showPenaltyShootoutModal(tie, onContinue) {
  const myTeamId = state.managedTeamId;
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
          ${winnerId === myTeamId ? "🎉 " : "💔 "}${winnerName} venceu nos pênaltis!
        </div>`);
      kicksEl.scrollTop = kicksEl.scrollHeight;
      btn.textContent = "Continuar ▶";
      return;
    }
    const k = pen.kicks[i];
    const teamId = k.team === "A" ? teamA.id : teamB.id;
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

// -------------------- Modal: Sorteio dos Grupos do Estadual --------------------
export function showEstadualDrawModal(estadual, onContinue) {
  const myTeamId = state.managedTeamId;
  const groupComps = getEstadualGroupComps(state, estadual);
  if (!groupComps.length) { onContinue(); return; }

  const container = document.createElement("div");
  container.className = "modal-backdrop visible";
  container.style.zIndex = "300";

  container.innerHTML = `
    <div class="modal" style="max-width:680px;max-height:88vh;display:flex;flex-direction:column">
      <div style="padding:18px 24px;border-bottom:1px solid var(--border);text-align:center">
        <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1px">Pré-temporada ${state.season}</div>
        <h2 style="font-size:22px;margin:6px 0 0">🏟️ Sorteio · ${estadual.name}</h2>
        <div style="color:var(--muted);font-size:12px;margin-top:4px">
          ${groupComps.length === 1 ? "Grupo único · top 4 às semifinais" : `${groupComps.length} grupos · top 2 de cada às semifinais`}
        </div>
      </div>
      <div id="est-draw-body" style="padding:18px 24px;overflow-y:auto;flex:1;min-height:140px;display:grid;grid-template-columns:repeat(${Math.min(groupComps.length, 2)},1fr);gap:16px"></div>
      <div style="padding:14px 24px;border-top:1px solid var(--border);text-align:center">
        <button class="btn" id="est-draw-btn">Pular</button>
      </div>
    </div>
  `;
  document.body.appendChild(container);
  const body = container.querySelector("#est-draw-body");
  const btn = container.querySelector("#est-draw-btn");

  const cols = groupComps.map(c => {
    const col = document.createElement("div");
    col.innerHTML = `<div style="text-align:center;font-weight:700;font-size:13px;color:var(--accent);margin-bottom:8px">${c.name.split("·").pop().trim()}</div>`;
    body.appendChild(col);
    return { comp: c, el: col, teamIds: [...c.teams] };
  });

  const sequence = [];
  const maxLen = Math.max(...cols.map(c => c.teamIds.length));
  for (let i = 0; i < maxLen; i++) {
    for (const col of cols) {
      if (col.teamIds[i]) sequence.push({ col, teamId: col.teamIds[i] });
    }
  }

  let idx = 0, finished = false, interval = null;
  const revealOne = () => {
    if (idx >= sequence.length) {
      finished = true;
      clearInterval(interval);
      btn.textContent = "Aos jogos ▶";
      return;
    }
    const { col, teamId } = sequence[idx];
    const team = state.teams[teamId];
    const isMine = teamId === myTeamId;
    const row = document.createElement("div");
    row.className = "draw-tie" + (isMine ? " mine" : "");
    row.style.cssText = "display:flex;align-items:center;gap:8px;padding:7px 10px;margin-bottom:5px;font-size:12px";
    row.innerHTML = `${teamLogo(team.id, 20)} <span style="font-weight:${isMine ? "800" : "500"}">${team.name}</span>`;
    col.el.appendChild(row);
    idx++;
  };

  revealOne();
  interval = setInterval(revealOne, 280);

  btn.onclick = () => {
    if (!finished) { clearInterval(interval); while (idx < sequence.length) revealOne(); finished = true; btn.textContent = "Aos jogos ▶"; }
    else { container.remove(); onContinue(); }
  };
  container.addEventListener("click", (e) => {
    if (e.target === container && finished) { container.remove(); onContinue(); }
  });
}

// -------------------- Modal: Sorteio da Copa --------------------
export function showCupDrawModal(cup, phaseKey, onContinue) {
  const myTeamId = state.managedTeamId;
  const phase = cup.phases[phaseKey];
  const meta = CUP_PHASE_META[phaseKey];
  if (!phase?.ties?.length) { onContinue(); return; }

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
    const isMine = tie.teamAId === myTeamId || tie.teamBId === myTeamId;
    const row = document.createElement("div");
    row.className = "draw-tie" + (isMine ? " mine" : "");
    row.innerHTML = `
      <div class="home" style="font-weight:${isMine && tie.teamAId === myTeamId ? "800" : "500"}">
        ${teamLogo(teamA.id, 22)} <span style="margin-left:6px">${teamA.name}</span>
      </div>
      <div class="vs">×</div>
      <div class="away" style="font-weight:${isMine && tie.teamBId === myTeamId ? "800" : "500"}">
        <span style="margin-right:6px">${teamB.name}</span> ${teamLogo(teamB.id, 22)}
      </div>
    `;
    tiesEl.appendChild(row);
    tiesEl.scrollTop = tiesEl.scrollHeight;
    idx++;
  };

  revealOne();
  interval = setInterval(revealOne, revealDelay);

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

  container.addEventListener("click", (e) => {
    if (e.target === container && finished) {
      container.remove();
      onContinue();
    }
  });
}

// -------------------- Modal: Fim de Temporada --------------------
// Substitui o alert() cru por um resumo visual: campeões com escudo,
// fluxo de promoção/rebaixamento e destaque pro time do usuário.
// `info` traz dados já resolvidos pelo season-flow (campeões A/B/C, listas
// de IDs, nova competição do usuário).
export function showSeasonRecapModal(info, onContinue) {
  const myTeamId = state.managedTeamId;

  // Linha de um campeão com escudo
  const champRow = (label, teamId) => {
    if (!teamId) return "";
    const t = state.teams[teamId];
    if (!t) return "";
    const mine = teamId === myTeamId;
    return `
      <div style="display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:8px;
                  background:${mine ? "rgba(var(--accent-rgb),0.10)" : "var(--bg-2)"};
                  border:1px solid ${mine ? "var(--accent)" : "var(--border)"};margin-bottom:8px">
        <span style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.6px;width:54px;flex-shrink:0">${label}</span>
        <span style="font-size:22px">🏆</span>
        ${teamLogo(teamId, 30)}
        <span style="font-weight:700;font-size:15px">${t.name}</span>
        ${mine ? `<span class="badge" style="background:var(--accent);color:#000;margin-left:auto">VOCÊ</span>` : ""}
      </div>`;
  };

  // Lista de times (sobe/desce) como chips com escudo
  const teamChips = (ids) => {
    if (!ids || !ids.length) return `<span style="color:var(--muted);font-size:12px">—</span>`;
    return ids.map(id => {
      const t = state.teams[id];
      if (!t) return "";
      const mine = id === myTeamId;
      return `<span style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:14px;
                  background:${mine ? "rgba(var(--accent-rgb),0.12)" : "var(--bg-2)"};
                  border:1px solid ${mine ? "var(--accent)" : "var(--border)"};
                  font-size:12px;font-weight:${mine ? "700" : "500"};margin:0 4px 4px 0">
                ${teamLogo(id, 16)} ${t.shortName}</span>`;
    }).join("");
  };

  // Bloco de movimentação (título + seta + chips)
  const flowBlock = (title, arrow, ids, arrowColor) => `
    <div style="margin-bottom:12px">
      <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.6px;margin-bottom:6px">
        <span style="color:${arrowColor};font-weight:700">${arrow}</span> ${title}
      </div>
      <div>${teamChips(ids)}</div>
    </div>`;

  const myTeam = state.teams[myTeamId];
  const myFinishLine = myTeam
    ? `Você dirige o <b style="color:var(--accent)">${myTeam.name}</b> na temporada ${info.nextSeason} · <b>${info.myCompName}</b>.`
    : "";

  const container = document.createElement("div");
  container.className = "modal-backdrop visible";
  container.style.zIndex = "300";
  container.innerHTML = `
    <div class="modal season-recap" style="max-width:560px;max-height:90vh;display:flex;flex-direction:column">
      <div style="padding:22px 24px 16px;border-bottom:1px solid var(--border);text-align:center">
        <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1.5px">Fim da Temporada</div>
        <h2 style="font-size:26px;margin:6px 0 0">⭐ ${info.season}</h2>
      </div>
      <div style="padding:20px 24px;overflow-y:auto;flex:1">
        <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:10px">Campeões</div>
        ${champRow("Série A", info.champA)}
        ${champRow("Série B", info.champB)}
        ${info.champC ? champRow("Série C", info.champC) : ""}

        <div style="height:1px;background:var(--border);margin:18px 0"></div>

        ${flowBlock("Série B → A · promovidos", "⬆️", info.promoted, "var(--accent)")}
        ${flowBlock("Série A → B · rebaixados", "⬇️", info.relegated, "var(--danger)")}
        ${flowBlock("Série C → B · promovidos", "⬆️", info.promotedFromC, "var(--accent)")}
        ${flowBlock("Série B → C · rebaixados", "⬇️", info.relegatedToC, "var(--danger)")}

        <div style="display:flex;gap:16px;justify-content:center;margin-top:8px;padding-top:14px;border-top:1px solid var(--border);font-size:12px;color:var(--muted)">
          <span>👋 ${info.retiredCount} aposentadorias</span>
          <span>📄 ${info.freeAgentsCount} contratos vencidos</span>
        </div>
      </div>
      <div style="padding:16px 24px;border-top:1px solid var(--border)">
        ${myFinishLine ? `<div style="font-size:13px;text-align:center;margin-bottom:12px">${myFinishLine}</div>` : ""}
        <button class="btn" id="recap-btn" style="width:100%;padding:13px">Próxima temporada ▶</button>
      </div>
    </div>
  `;
  document.body.appendChild(container);

  const close = () => {
    document.removeEventListener("keydown", onKey);
    container.remove();
    onContinue && onContinue();
  };
  function onKey(e) {
    if (e.key === "Escape" || e.key === "Enter") close();
  }
  container.querySelector("#recap-btn").onclick = close;
  container.addEventListener("click", (e) => { if (e.target === container) close(); });
  document.addEventListener("keydown", onKey);
}
