// View: Calendário — todas as rodadas do campeonato selecionado.
// Suporta filtro "meus jogos" e troca entre Séries A/B/C.
// Cliques em [data-match], [data-cal-mode] e [data-cal-comp] são tratados pelo wireView.

import { state, ui } from "../../core/store.js";
import { teamLogo } from "../format.js";
import { getCurrentRound } from "../../engine/season.js";
import { SERIE_C_STAGE_IDS } from "../../engine/serie-c.js";

const SERIE_C_DISPLAY_NAME = "Brasileirão Série C";

export function renderCalendar() {
  const compId = ui.calendarCompId || ui.myCompId;
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
    if (ui.calendarMode === "mine") {
      const filtered = matches.filter(m => m.homeTeamId === ui.myTeamId || m.awayTeamId === ui.myTeamId);
      return { round: Number(round), matches: filtered };
    }
    return { round: Number(round), matches };
  }).filter(r => r.matches.length > 0)
    .sort((a, b) => a.round - b.round);

  // Estatísticas resumidas (modo "mine")
  let mySummary = "";
  if (ui.calendarMode === "mine") {
    const myPlayed = fixtures.filter(m => m.played && (m.homeTeamId === ui.myTeamId || m.awayTeamId === ui.myTeamId));
    let w = 0, d = 0, l = 0, gf = 0, ga = 0;
    for (const m of myPlayed) {
      const isHome = m.homeTeamId === ui.myTeamId;
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
        <button class="btn-toggle ${ui.calendarMode === "mine" ? "on" : ""}" data-cal-mode="mine">Meus Jogos</button>
        <button class="btn-toggle ${ui.calendarMode === "all" ? "on" : ""}" data-cal-mode="all">Calendário Completo</button>
        <span style="border-left:1px solid var(--border);height:24px;margin:0 4px"></span>
        <button class="btn-toggle ${(ui.calendarCompId ?? ui.myCompId) === "brasileirao_a" ? "on" : ""}" data-cal-comp="brasileirao_a">Série A</button>
        <button class="btn-toggle ${(ui.calendarCompId ?? ui.myCompId) === "brasileirao_b" ? "on" : ""}" data-cal-comp="brasileirao_b">Série B</button>
        <button class="btn-toggle ${((ui.calendarCompId ?? ui.myCompId) || "").startsWith("brasileirao_c") ? "on" : ""}" data-cal-comp="brasileirao_c_p1">Série C</button>
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
  const isMine = m.homeTeamId === ui.myTeamId || m.awayTeamId === ui.myTeamId;
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
      <div style="text-align:right;font-weight:${isMine && m.homeTeamId === ui.myTeamId ? "700" : "500"};${m.played && m.score.home > m.score.away ? "" : "color:var(--muted)"}">
        ${home.name}
        <span style="margin-left:8px">${teamLogo(home.id, 20)}</span>
      </div>
      ${center}
      <div style="font-weight:${isMine && m.awayTeamId === ui.myTeamId ? "700" : "500"};${m.played && m.score.away > m.score.home ? "" : "color:var(--muted)"}">
        <span style="margin-right:8px">${teamLogo(away.id, 20)}</span>
        ${away.name}
      </div>
    </div>
  `;
}
