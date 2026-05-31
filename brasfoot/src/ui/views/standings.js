// View: Classificação — comporta-se diferente em cada fase:
//   - Pré-temporada → tabelas e mata-mata dos estaduais
//   - Série C → fases (pontos corridos → quadrangulares → final)
//   - Séries A/B → tabela padrão + artilharia + próximos jogos do usuário

import { state, ui } from "../../core/store.js";
import { teamLogo } from "../format.js";
import { sortStandings, getCurrentRound } from "../../engine/season.js";
import { getEstadualGroupComps } from "../../engine/estadual.js";

export function renderStandings() {
  // Durante a pré-temporada, a aba mostra os estaduais
  if (state.seasonPhase === "estadual") {
    return renderEstaduais();
  }
  // Branch especial pra Série C (multi-fase)
  if ((ui.standingsView || "").startsWith("brasileirao_c")) {
    return renderStandingsSerieC();
  }
  const comp = state.competitions[ui.standingsView];
  const sorted = sortStandings(comp, state.teams);
  const round = getCurrentRound(comp);
  const total = Math.max(...comp.fixtures.map(m => m.round));
  const isMy = ui.standingsView === ui.myCompId;

  return `
    <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:16px">
      <div>
        <div class="view-title" style="margin-bottom:0">${comp.name}</div>
        <div class="view-sub" style="margin-bottom:0">Rodada ${round ?? total} de ${total}${isMy ? "" : " · acompanhando"}</div>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn-toggle ${ui.standingsView === "brasileirao_a" ? "on" : ""}" data-comp="brasileirao_a">Série A</button>
        <button class="btn-toggle ${ui.standingsView === "brasileirao_b" ? "on" : ""}" data-comp="brasileirao_b">Série B</button>
        <button class="btn-toggle ${(ui.standingsView || "").startsWith("brasileirao_c") ? "on" : ""}" data-comp="brasileirao_c_p1">Série C</button>
      </div>
    </div>

    <div class="grid-2">
      <div class="card">
        <h3>Tabela${comp.tier === 1 ? " · Top 4 = Libertadores · 4 últimos = rebaixados" : " · Top 4 = sobem · 4 últimos = caem"}</h3>
        <table>
          <thead><tr><th>#</th><th>Time</th><th>P</th><th>J</th><th>V</th><th>E</th><th>D</th><th>GP</th><th>GC</th><th>SG</th></tr></thead>
          <tbody>
            ${sorted.map((s, i) => `
              <tr class="${s.teamId === ui.myTeamId ? "highlight" : ""}">
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
      <h3>Próximos Jogos do ${state.teams[ui.myTeamId].shortName}</h3>
      ${renderUpcoming()}
    </div>
  `;
}

function renderEstaduais() {
  const estaduais = state.estaduais || {};
  const userTeam = state.teams[ui.myTeamId];
  const userUf = userTeam?.state;
  // Ordena: estadual do usuário primeiro
  const ufs = Object.keys(estaduais).sort((a, b) =>
    (b === userUf) - (a === userUf) || a.localeCompare(b)
  );

  if (!ufs.length) {
    return `<div class="view-title">Pré-temporada</div>
      <div class="card"><p style="color:var(--muted)">Nenhum estadual nesta temporada.</p></div>`;
  }

  return `
    <div class="view-title">Pré-temporada · Estaduais ${state.season}</div>
    <div class="view-sub">
      ${estaduais[userUf]
        ? `Seu time disputa o <b>${estaduais[userUf].name}</b>.`
        : `Seu time (${userUf}) não tem estadual neste MVP — você acompanha os outros.`}
    </div>
    ${ufs.map(uf => renderOneEstadual(estaduais[uf], uf === userUf)).join("")}
  `;
}

function renderOneEstadual(e, isMine) {
  const groupComps = getEstadualGroupComps(state, e);
  const phaseLabel = {
    groups: "Fase de grupos", semis: "Semifinais", final: "Final", done: "Encerrado",
  }[e.phase] || "—";

  const groupsHtml = groupComps.length === 1
    ? `<div class="card"><h3>${e.name} · Classificação</h3>
        <p style="font-size:11px;color:var(--muted);margin-bottom:8px">Top 4 avançam às semifinais.</p>
        ${renderStandingsTable(groupComps[0], { highlightSlots: [4, 0] })}</div>`
    : `<div class="grid-2">
        ${groupComps.map(c => `
          <div class="card"><h3>${c.name.split("·").pop().trim()}</h3>
            <p style="font-size:11px;color:var(--muted);margin-bottom:8px">Top 2 avançam.</p>
            ${renderStandingsTable(c, { highlightSlots: [2, 0] })}</div>
        `).join("")}
      </div>`;

  const koHtml = (e.knockout.semis.length || e.knockout.final)
    ? `<div class="card">
        <h3>${e.name} · Mata-mata</h3>
        <div class="bracket" style="grid-template-columns:repeat(2,1fr);max-width:560px">
          <div class="bracket-col">
            <div class="bracket-col-title">Semifinais</div>
            <div class="bracket-col-body">
              ${e.knockout.semis.length
                ? e.knockout.semis.map(s => renderEstadualBracketTie(s)).join("")
                : `<div class="bracket-tie pending">aguardando grupos</div>`}
            </div>
          </div>
          <div class="bracket-col">
            <div class="bracket-col-title">Final</div>
            <div class="bracket-col-body">
              ${e.knockout.final
                ? renderEstadualBracketTie(e.knockout.final)
                : `<div class="bracket-tie pending">aguardando semis</div>`}
            </div>
          </div>
        </div>
        ${e.champion ? `<div class="bracket-champion" style="margin-top:12px">🏆 Campeão: ${state.teams[e.champion].name}</div>` : ""}
      </div>`
    : "";

  return `
    <div style="margin-bottom:8px;padding:8px 4px;border-left:3px solid ${isMine ? "var(--accent)" : "var(--border)"};padding-left:12px">
      <span style="font-weight:700;font-size:15px">${e.name}</span>
      <span style="color:var(--muted);font-size:12px;margin-left:8px">${phaseLabel}</span>
      ${isMine ? `<span class="badge" style="background:var(--accent);color:#000;margin-left:8px">SEU TIME</span>` : ""}
    </div>
    ${groupsHtml}
    ${koHtml}
  `;
}

function renderEstadualBracketTie(tie) {
  const home = state.teams[tie.homeTeamId];
  const away = state.teams[tie.awayTeamId];
  if (!home || !away) return `<div class="bracket-tie pending">a definir</div>`;
  const isMine = tie.homeTeamId === ui.myTeamId || tie.awayTeamId === ui.myTeamId;
  const played = tie.leg?.played;
  const hWon = tie.winnerId === tie.homeTeamId;
  const aWon = tie.winnerId === tie.awayTeamId;
  const sh = played ? tie.leg.score.home : "—";
  const sa = played ? tie.leg.score.away : "—";
  return `
    <div class="bracket-tie ${isMine ? "mine" : ""}">
      <div class="bracket-row ${hWon ? "winner" : (aWon ? "loser" : "")}">
        ${teamLogo(home.id, 14)}
        <span class="name" title="${home.name}">${home.shortName}</span>
        <span class="score">${sh}</span>
      </div>
      <div class="bracket-row ${aWon ? "winner" : (hWon ? "loser" : "")}">
        ${teamLogo(away.id, 14)}
        <span class="name" title="${away.name}">${away.shortName}</span>
        <span class="score">${sa}</span>
      </div>
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
      <button class="btn-toggle ${ui.standingsView === "brasileirao_a" ? "on" : ""}" data-comp="brasileirao_a">Série A</button>
      <button class="btn-toggle ${ui.standingsView === "brasileirao_b" ? "on" : ""}" data-comp="brasileirao_b">Série B</button>
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
          if (s.teamId === ui.myTeamId) rowStyle = ' class="highlight"';
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
  const comp = state.competitions[ui.myCompId];
  const next = comp.fixtures.filter(m => !m.played &&
    (m.homeTeamId === ui.myTeamId || m.awayTeamId === ui.myTeamId)).slice(0, 3);
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
            <td style="color:var(--muted)">${m.homeTeamId === ui.myTeamId ? "🏠 Casa" : "✈️ Fora"}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}
