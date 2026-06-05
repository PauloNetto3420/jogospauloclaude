// View: Classificação — comporta-se diferente em cada fase:
//   - Pré-temporada → tabelas e mata-mata dos estaduais
//   - Série C → fases (pontos corridos → quadrangulares → final)
//   - Séries A/B → tabela padrão + artilharia + próximos jogos do usuário

import { state, ui } from "../../core/store.js";
import { teamLogo } from "../format.js";
import { sortStandings, getCurrentRound } from "../../engine/season.js";
import { getEstadualGroupComps } from "../../engine/estadual.js";
import { getCariocaGroupStandings } from "../../engine/carioca.js";
import { getMineiroGroupStandings } from "../../engine/mineiro.js";
import { getGauchoGroupStandings } from "../../engine/gaucho.js";
import { getParanaenseGroupStandings } from "../../engine/paranaense.js";
import { getBaianoStandings } from "../../engine/baiano.js";
import { getCearenseGroupStandings, getCearensePhase2Standings } from "../../engine/cearense.js";
import { getPernambucanoStandings } from "../../engine/pernambucano.js";
import { getAlagoanoStandings } from "../../engine/alagoano.js";
import { getGoianoGroupStandings, getGoianoOverallStandings } from "../../engine/goiano.js";
import { getCatarinenseGroupStandings } from "../../engine/catarinense.js";
import { getParaenseGroupStandings, getParaenseOverallStandings } from "../../engine/paraense.js";
import { getAcreanoStandings } from "../../engine/acreano.js";
import { getAmazonenseStandings } from "../../engine/amazonense.js";
import { getAmapaenseStandings } from "../../engine/amapaense.js";
import { getRondonienseStandings } from "../../engine/rondoniense.js";
import { getRoraimenseStandings } from "../../engine/roraimense.js";

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
  if (e.format === "paulista") return renderPaulista(e, isMine);
  if (e.format === "carioca") return renderCarioca(e, isMine);
  if (e.format === "mineiro") return renderMineiro(e, isMine);
  if (e.format === "gaucho") return renderGaucho(e, isMine);
  if (e.format === "paranaense") return renderParanaense(e, isMine);
  if (e.format === "baiano") return renderBaiano(e, isMine);
  if (e.format === "cearense") return renderCearense(e, isMine);
  if (e.format === "pernambucano") return renderPernambucano(e, isMine);
  if (e.format === "alagoano") return renderAlagoano(e, isMine);
  if (e.format === "goiano") return renderGoiano(e, isMine);
  if (e.format === "catarinense") return renderCatarinense(e, isMine);
  if (e.format === "paraense") return renderParaense(e, isMine);
  if (e.format === "acreano") return renderAcreano(e, isMine);
  if (e.format === "amazonense") return renderAmazonense(e, isMine);
  if (e.format === "amapaense") return renderAmapaense(e, isMine);
  if (e.format === "rondoniense") return renderRondoniense(e, isMine);
  if (e.format === "roraimense") return renderRoraimense(e, isMine);

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
      ${isMine ? `<span class="badge" style="background:var(--accent);color:var(--accent-fg);margin-left:8px">SEU TIME</span>` : ""}
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

// Campeonato Paulista: tabela única (formato suíço) + chaveamento de 3 fases.
function renderPaulista(e, isMine) {
  const comp = state.competitions.estadual_sp;
  const phaseLabel = {
    groups: "1ª Fase", quarters: "Quartas de final", semis: "Semifinais",
    final: "Final", done: "Encerrado",
  }[e.phase] || "—";

  const header = `
    <div style="margin-bottom:8px;padding:8px 4px;border-left:3px solid ${isMine ? "var(--accent)" : "var(--border)"};padding-left:12px">
      <span style="font-weight:700;font-size:15px">${e.name}</span>
      <span style="color:var(--muted);font-size:12px;margin-left:8px">${phaseLabel}</span>
      ${isMine ? `<span class="badge" style="background:var(--accent);color:var(--accent-fg);margin-left:8px">SEU TIME</span>` : ""}
    </div>`;

  // Tabela única: top 8 (classificados) destacados, 2 últimos (rebaixados) em vermelho.
  const tableHtml = comp ? `
    <div class="card">
      <h3>${e.name} · Classificação Geral</h3>
      <p style="font-size:11px;color:var(--muted);margin-bottom:8px">
        16 times · cada um joga 8 jogos (próprio pote + sorteados). Top 8 ao mata-mata · 2 últimos rebaixados.
      </p>
      ${renderStandingsTable(comp, { highlightSlots: [8, 2] })}
    </div>` : "";

  // Bracket do mata-mata (aparece quando criado)
  const ko = e.knockout;
  const koHtml = ko ? `
    <div class="card">
      <h3>${e.name} · Mata-mata</h3>
      <div class="bracket" style="grid-template-columns:repeat(3,1fr);max-width:720px">
        <div class="bracket-col">
          <div class="bracket-col-title">Quartas</div>
          <div class="bracket-col-body">
            ${ko.quarters.map(t => renderPaulistaTie(t)).join("")}
          </div>
        </div>
        <div class="bracket-col">
          <div class="bracket-col-title">Semis</div>
          <div class="bracket-col-body">
            ${ko.semis.length ? ko.semis.map(t => renderPaulistaTie(t)).join("")
              : `<div class="bracket-tie pending">aguardando quartas</div>`}
          </div>
        </div>
        <div class="bracket-col">
          <div class="bracket-col-title">Final</div>
          <div class="bracket-col-body">
            ${ko.final ? renderPaulistaTie(ko.final) : `<div class="bracket-tie pending">aguardando semis</div>`}
          </div>
        </div>
      </div>
      ${e.champion ? `<div class="bracket-champion" style="margin-top:12px">🏆 Campeão: ${state.teams[e.champion].name}</div>` : ""}
    </div>` : "";

  return header + tableHtml + koHtml;
}

// Tie do Paulista: jogo único (quartas/semis) ou ida-e-volta (final).
function renderPaulistaTie(tie) {
  if (tie.legs) {
    // Final (2 legs): mostra agregado
    const a = state.teams[tie.teamAId], b = state.teams[tie.teamBId];
    if (!a || !b) return `<div class="bracket-tie pending">a definir</div>`;
    const isMine = tie.teamAId === ui.myTeamId || tie.teamBId === ui.myTeamId;
    const agg = tie.aggregate;
    const aWon = tie.winnerId === tie.teamAId, bWon = tie.winnerId === tie.teamBId;
    const sA = agg ? agg.teamA : "—", sB = agg ? agg.teamB : "—";
    return `
      <div class="bracket-tie ${isMine ? "mine" : ""}">
        <div class="bracket-row ${aWon ? "winner" : (bWon ? "loser" : "")}">
          ${teamLogo(a.id, 14)} <span class="name" title="${a.name}">${a.shortName}</span>
          <span class="score">${sA}</span>
        </div>
        <div class="bracket-row ${bWon ? "winner" : (aWon ? "loser" : "")}">
          ${teamLogo(b.id, 14)} <span class="name" title="${b.name}">${b.shortName}</span>
          <span class="score">${sB}</span>
        </div>
      </div>`;
  }
  // Jogo único
  const home = state.teams[tie.leg.homeTeamId], away = state.teams[tie.leg.awayTeamId];
  if (!home || !away) return `<div class="bracket-tie pending">a definir</div>`;
  const isMine = tie.leg.homeTeamId === ui.myTeamId || tie.leg.awayTeamId === ui.myTeamId;
  const played = tie.leg.played;
  const hWon = tie.winnerId === tie.leg.homeTeamId, aWon = tie.winnerId === tie.leg.awayTeamId;
  const sh = played ? tie.leg.score.home : "—", sa = played ? tie.leg.score.away : "—";
  return `
    <div class="bracket-tie ${isMine ? "mine" : ""}">
      <div class="bracket-row ${hWon ? "winner" : (aWon ? "loser" : "")}">
        ${teamLogo(home.id, 14)} <span class="name" title="${home.name}">${home.shortName}</span>
        <span class="score">${sh}</span>
      </div>
      <div class="bracket-row ${aWon ? "winner" : (hWon ? "loser" : "")}">
        ${teamLogo(away.id, 14)} <span class="name" title="${away.name}">${away.shortName}</span>
        <span class="score">${sa}</span>
      </div>
    </div>`;
}

// Campeonato Carioca: 2 grupos cruzados + chaveamento (quartas/semis/final).
function renderCarioca(e, isMine) {
  const comp = state.competitions.estadual_rj;
  const phaseLabel = {
    groups: "Taça Guanabara · Fase de Grupos", quarters: "Quartas de final",
    semis: "Semifinais", final: "Final", done: "Encerrado",
  }[e.phase] || "—";

  const header = `
    <div style="margin-bottom:8px;padding:8px 4px;border-left:3px solid ${isMine ? "var(--accent)" : "var(--border)"};padding-left:12px">
      <span style="font-weight:700;font-size:15px">${e.name}</span>
      <span style="color:var(--muted);font-size:12px;margin-left:8px">${phaseLabel}</span>
      ${isMine ? `<span class="badge" style="background:var(--accent);color:var(--accent-fg);margin-left:8px">SEU TIME</span>` : ""}
    </div>`;

  // Dois grupos lado a lado (cada um filtra os standings da comp). Top 4 destacado.
  const groupCard = (label) => {
    if (!comp) return "";
    const sorted = getCariocaGroupStandings(comp, label);
    // monta um "shim" de competição com só os times do grupo pra reusar a tabela
    const shim = { ...comp, standings: sorted };
    return `<div class="card"><h3>Grupo ${label}</h3>
      <p style="font-size:11px;color:var(--muted);margin-bottom:8px">Top 4 avançam ao mata-mata.</p>
      ${renderStandingsTable(shim, { highlightSlots: [4, 0] })}</div>`;
  };
  const groupsHtml = `<div class="grid-2">${groupCard("A")}${groupCard("B")}</div>`;

  // Bracket do mata-mata (quartas único, semis ida/volta, final único)
  const ko = e.knockout;
  const koHtml = ko ? `
    <div class="card">
      <h3>${e.name} · Mata-mata</h3>
      <div class="bracket" style="grid-template-columns:repeat(3,1fr);max-width:720px">
        <div class="bracket-col">
          <div class="bracket-col-title">Quartas</div>
          <div class="bracket-col-body">${ko.quarters.map(t => renderPaulistaTie(t)).join("")}</div>
        </div>
        <div class="bracket-col">
          <div class="bracket-col-title">Semis (ida/volta)</div>
          <div class="bracket-col-body">
            ${ko.semis.length ? ko.semis.map(t => renderPaulistaTie(t)).join("")
              : `<div class="bracket-tie pending">aguardando quartas</div>`}
          </div>
        </div>
        <div class="bracket-col">
          <div class="bracket-col-title">Final</div>
          <div class="bracket-col-body">
            ${ko.final ? renderPaulistaTie(ko.final) : `<div class="bracket-tie pending">aguardando semis</div>`}
          </div>
        </div>
      </div>
      ${e.champion ? `<div class="bracket-champion" style="margin-top:12px">🏆 Campeão: ${state.teams[e.champion].name}</div>` : ""}
    </div>` : "";

  return header + groupsHtml + koHtml;
}

// Campeonato Mineiro: 3 grupos cruzados + mata-mata (semi direta + final).
function renderMineiro(e, isMine) {
  const comp = state.competitions.estadual_mg;
  const phaseLabel = {
    groups: "1ª Fase (3 grupos)", semis: "Semifinais", final: "Final", done: "Encerrado",
  }[e.phase] || "—";

  const header = `
    <div style="margin-bottom:8px;padding:8px 4px;border-left:3px solid ${isMine ? "var(--accent)" : "var(--border)"};padding-left:12px">
      <span style="font-weight:700;font-size:15px">${e.name}</span>
      <span style="color:var(--muted);font-size:12px;margin-left:8px">${phaseLabel}</span>
      ${isMine ? `<span class="badge" style="background:var(--accent);color:var(--accent-fg);margin-left:8px">SEU TIME</span>` : ""}
    </div>`;

  // Três grupos lado a lado. Líder de cada um classifica; o melhor 2º também.
  const groupCard = (label) => {
    if (!comp) return "";
    const sorted = getMineiroGroupStandings(comp, label);
    const shim = { ...comp, standings: sorted };
    return `<div class="card"><h3>Grupo ${label}</h3>
      <p style="font-size:11px;color:var(--muted);margin-bottom:8px">Líder classifica · melhor 2º geral também.</p>
      ${renderStandingsTable(shim, { highlightSlots: [1, 0] })}</div>`;
  };
  const groupsHtml = `<div class="grid-3">${groupCard("A")}${groupCard("B")}${groupCard("C")}</div>`;

  // Bracket: só semis (ida/volta) e final (jogo único) — sem quartas.
  const ko = e.knockout;
  const koHtml = ko ? `
    <div class="card">
      <h3>${e.name} · Mata-mata</h3>
      <div class="bracket" style="grid-template-columns:repeat(2,1fr);max-width:560px">
        <div class="bracket-col">
          <div class="bracket-col-title">Semis (ida/volta)</div>
          <div class="bracket-col-body">${ko.semis.map(t => renderPaulistaTie(t)).join("")}</div>
        </div>
        <div class="bracket-col">
          <div class="bracket-col-title">Final</div>
          <div class="bracket-col-body">
            ${ko.final ? renderPaulistaTie(ko.final) : `<div class="bracket-tie pending">aguardando semis</div>`}
          </div>
        </div>
      </div>
      ${e.champion ? `<div class="bracket-champion" style="margin-top:12px">🏆 Campeão: ${state.teams[e.champion].name}</div>` : ""}
    </div>` : "";

  return header + groupsHtml + koHtml;
}

// Campeonato Gaúcho: 2 grupos cruzados + mata-mata (quartas/semis/final,
// todos ida/volta exceto quartas que é jogo único). Igual ao Carioca, mas
// a final é ida e volta.
function renderGaucho(e, isMine) {
  const comp = state.competitions.estadual_rs;
  const phaseLabel = {
    groups: "1ª Fase (grupos)", quarters: "Quartas de final",
    semis: "Semifinais", final: "Final", done: "Encerrado",
  }[e.phase] || "—";

  const header = `
    <div style="margin-bottom:8px;padding:8px 4px;border-left:3px solid ${isMine ? "var(--accent)" : "var(--border)"};padding-left:12px">
      <span style="font-weight:700;font-size:15px">${e.name}</span>
      <span style="color:var(--muted);font-size:12px;margin-left:8px">${phaseLabel}</span>
      ${isMine ? `<span class="badge" style="background:var(--accent);color:var(--accent-fg);margin-left:8px">SEU TIME</span>` : ""}
    </div>`;

  const groupCard = (label) => {
    if (!comp) return "";
    const sorted = getGauchoGroupStandings(comp, label);
    const shim = { ...comp, standings: sorted };
    return `<div class="card"><h3>Grupo ${label}</h3>
      <p style="font-size:11px;color:var(--muted);margin-bottom:8px">Top 4 avançam ao mata-mata.</p>
      ${renderStandingsTable(shim, { highlightSlots: [4, 0] })}</div>`;
  };
  const groupsHtml = `<div class="grid-2">${groupCard("A")}${groupCard("B")}</div>`;

  const ko = e.knockout;
  const koHtml = ko ? `
    <div class="card">
      <h3>${e.name} · Mata-mata</h3>
      <div class="bracket" style="grid-template-columns:repeat(3,1fr);max-width:720px">
        <div class="bracket-col">
          <div class="bracket-col-title">Quartas</div>
          <div class="bracket-col-body">${ko.quarters.map(t => renderPaulistaTie(t)).join("")}</div>
        </div>
        <div class="bracket-col">
          <div class="bracket-col-title">Semis (ida/volta)</div>
          <div class="bracket-col-body">
            ${ko.semis.length ? ko.semis.map(t => renderPaulistaTie(t)).join("")
              : `<div class="bracket-tie pending">aguardando quartas</div>`}
          </div>
        </div>
        <div class="bracket-col">
          <div class="bracket-col-title">Final (ida/volta)</div>
          <div class="bracket-col-body">
            ${ko.final ? renderPaulistaTie(ko.final) : `<div class="bracket-tie pending">aguardando semis</div>`}
          </div>
        </div>
      </div>
      ${e.champion ? `<div class="bracket-champion" style="margin-top:12px">🏆 Campeão: ${state.teams[e.champion].name}</div>` : ""}
    </div>` : "";

  return header + groupsHtml + koHtml;
}

function renderParanaense(e, isMine) {
  const comp = state.competitions.estadual_pr;
  const phaseLabel = {
    groups: "1ª Fase (grupos)", quarters: "Quartas de final",
    semis: "Semifinais", final: "Final", done: "Encerrado",
  }[e.phase] || "—";

  const header = `
    <div style="margin-bottom:8px;padding:8px 4px;border-left:3px solid ${isMine ? "var(--accent)" : "var(--border)"};padding-left:12px">
      <span style="font-weight:700;font-size:15px">${e.name}</span>
      <span style="color:var(--muted);font-size:12px;margin-left:8px">${phaseLabel}</span>
      ${isMine ? `<span class="badge" style="background:var(--accent);color:var(--accent-fg);margin-left:8px">SEU TIME</span>` : ""}
    </div>`;

  const groupCard = (label) => {
    if (!comp) return "";
    const sorted = getParanaenseGroupStandings(comp, label);
    const shim = { ...comp, standings: sorted };
    return `<div class="card"><h3>Grupo ${label}</h3>
      <p style="font-size:11px;color:var(--muted);margin-bottom:8px">Top 4 avançam ao mata-mata.</p>
      ${renderStandingsTable(shim, { highlightSlots: [4, 0] })}</div>`;
  };
  const groupsHtml = `<div class="grid-2">${groupCard("A")}${groupCard("B")}</div>`;

  const ko = e.knockout;
  const koHtml = ko ? `
    <div class="card">
      <h3>${e.name} · Mata-mata (tudo ida/volta)</h3>
      <div class="bracket" style="grid-template-columns:repeat(3,1fr);max-width:720px">
        <div class="bracket-col">
          <div class="bracket-col-title">Quartas (ida/volta)</div>
          <div class="bracket-col-body">${ko.quarters.map(t => renderPaulistaTie(t)).join("")}</div>
        </div>
        <div class="bracket-col">
          <div class="bracket-col-title">Semis (ida/volta)</div>
          <div class="bracket-col-body">
            ${ko.semis.length ? ko.semis.map(t => renderPaulistaTie(t)).join("")
              : `<div class="bracket-tie pending">aguardando quartas</div>`}
          </div>
        </div>
        <div class="bracket-col">
          <div class="bracket-col-title">Final (ida/volta)</div>
          <div class="bracket-col-body">
            ${ko.final ? renderPaulistaTie(ko.final) : `<div class="bracket-tie pending">aguardando semis</div>`}
          </div>
        </div>
      </div>
      ${e.champion ? `<div class="bracket-champion" style="margin-top:12px">🏆 Campeão: ${state.teams[e.champion].name}</div>` : ""}
    </div>` : "";

  return header + groupsHtml + koHtml;
}

function renderBaiano(e, isMine) {
  const comp = state.competitions.estadual_ba;
  const phaseLabel = {
    league: "1ª Fase (pontos corridos)", semis: "Semifinais",
    final: "Final", done: "Encerrado",
  }[e.phase] || "—";

  const header = `
    <div style="margin-bottom:8px;padding:8px 4px;border-left:3px solid ${isMine ? "var(--accent)" : "var(--border)"};padding-left:12px">
      <span style="font-weight:700;font-size:15px">${e.name}</span>
      <span style="color:var(--muted);font-size:12px;margin-left:8px">${phaseLabel}</span>
      ${isMine ? `<span class="badge" style="background:var(--accent);color:var(--accent-fg);margin-left:8px">SEU TIME</span>` : ""}
    </div>`;

  const tableHtml = comp ? `
    <div class="card">
      <h3>Classificação · turno único</h3>
      <p style="font-size:11px;color:var(--muted);margin-bottom:8px">Os 4 primeiros avançam às semifinais (jogo único, mando do melhor).</p>
      ${renderStandingsTable({ ...comp, standings: getBaianoStandings(comp, state.teams) }, { highlightSlots: [4, 0] })}
    </div>` : "";

  const ko = e.knockout;
  const koHtml = ko ? `
    <div class="card">
      <h3>${e.name} · Mata-mata (jogo único)</h3>
      <div class="bracket" style="grid-template-columns:repeat(2,1fr);max-width:520px">
        <div class="bracket-col">
          <div class="bracket-col-title">Semifinais</div>
          <div class="bracket-col-body">${ko.semis.map(t => renderPaulistaTie(t)).join("")}</div>
        </div>
        <div class="bracket-col">
          <div class="bracket-col-title">Final</div>
          <div class="bracket-col-body">
            ${ko.final ? renderPaulistaTie(ko.final) : `<div class="bracket-tie pending">aguardando semis</div>`}
          </div>
        </div>
      </div>
      ${e.champion ? `<div class="bracket-champion" style="margin-top:12px">🏆 Campeão: ${state.teams[e.champion].name}</div>` : ""}
    </div>` : "";

  return header + tableHtml + koHtml;
}

function renderCearense(e, isMine) {
  const p1 = state.competitions.estadual_ce;
  const p2 = state.competitions.estadual_ce_p2;
  const phaseLabel = {
    groups: "1ª Fase (grupos de 5)", second: "2ª Fase (grupos de 3)",
    semis: "Semifinais", final: "Final", done: "Encerrado",
  }[e.phase] || "—";

  const header = `
    <div style="margin-bottom:8px;padding:8px 4px;border-left:3px solid ${isMine ? "var(--accent)" : "var(--border)"};padding-left:12px">
      <span style="font-weight:700;font-size:15px">${e.name}</span>
      <span style="color:var(--muted);font-size:12px;margin-left:8px">${phaseLabel}</span>
      ${isMine ? `<span class="badge" style="background:var(--accent);color:var(--accent-fg);margin-left:8px">SEU TIME</span>` : ""}
    </div>`;

  // 1ª fase: grupos A/B (intra-grupo) — top 3 avançam.
  const g1Card = (label) => {
    if (!p1) return "";
    const sorted = getCearenseGroupStandings(p1, label);
    return `<div class="card"><h3>1ª Fase · Grupo ${label}</h3>
      <p style="font-size:11px;color:var(--muted);margin-bottom:8px">Top 3 avançam à 2ª fase.</p>
      ${renderStandingsTable({ ...p1, standings: sorted }, { highlightSlots: [3, 0] })}</div>`;
  };
  const phase1Html = `<div class="grid-2">${g1Card("A")}${g1Card("B")}</div>`;

  // 2ª fase: grupos C/D (cruzado) — top 2 às semis.
  const g2Card = (label) => {
    if (!p2) return "";
    const sorted = getCearensePhase2Standings(p2, label);
    return `<div class="card"><h3>2ª Fase · Grupo ${label}</h3>
      <p style="font-size:11px;color:var(--muted);margin-bottom:8px">Top 2 às semifinais.</p>
      ${renderStandingsTable({ ...p2, standings: sorted }, { highlightSlots: [2, 0] })}</div>`;
  };
  const phase2Html = p2 ? `<div class="grid-2" style="margin-top:16px">${g2Card("C")}${g2Card("D")}</div>` : "";

  const ko = e.knockout;
  const koHtml = ko ? `
    <div class="card" style="margin-top:16px">
      <h3>${e.name} · Mata-mata (ida/volta)</h3>
      <div class="bracket" style="grid-template-columns:repeat(2,1fr);max-width:520px">
        <div class="bracket-col">
          <div class="bracket-col-title">Semifinais</div>
          <div class="bracket-col-body">${ko.semis.map(t => renderPaulistaTie(t)).join("")}</div>
        </div>
        <div class="bracket-col">
          <div class="bracket-col-title">Final</div>
          <div class="bracket-col-body">
            ${ko.final ? renderPaulistaTie(ko.final) : `<div class="bracket-tie pending">aguardando semis</div>`}
          </div>
        </div>
      </div>
      ${e.champion ? `<div class="bracket-champion" style="margin-top:12px">🏆 Campeão: ${state.teams[e.champion].name}</div>` : ""}
    </div>` : "";

  return header + phase1Html + phase2Html + koHtml;
}

function renderPernambucano(e, isMine) {
  const comp = state.competitions.estadual_pe;
  const phaseLabel = {
    league: "1ª Fase (pontos corridos)", playoffs: "Playoff (3º-6º)",
    semis: "Semifinais", final: "Final", done: "Encerrado",
  }[e.phase] || "—";

  const header = `
    <div style="margin-bottom:8px;padding:8px 4px;border-left:3px solid ${isMine ? "var(--accent)" : "var(--border)"};padding-left:12px">
      <span style="font-weight:700;font-size:15px">${e.name}</span>
      <span style="color:var(--muted);font-size:12px;margin-left:8px">${phaseLabel}</span>
      ${isMine ? `<span class="badge" style="background:var(--accent);color:var(--accent-fg);margin-left:8px">SEU TIME</span>` : ""}
    </div>`;

  // Tabela: top 2 (verde, diretos à semi) e 3º-6º (azul, playoff).
  const tableHtml = comp ? `
    <div class="card">
      <h3>Classificação · turno único</h3>
      <p style="font-size:11px;color:var(--muted);margin-bottom:8px">
        <b style="color:var(--accent)">1º-2º</b> vão direto às semis · <b style="color:var(--accent-2)">3º-6º</b> disputam o playoff (ida/volta).
      </p>
      ${renderStandingsTable({ ...comp, standings: getPernambucanoStandings(comp, state.teams) }, { highlightSlots: [2, 6] })}
    </div>` : "";

  const ko = e.knockout;
  const directNames = ko ? ko.direct.map(id => `${teamLogo(id, 16)} ${state.teams[id]?.shortName ?? "?"}`).join(" · ") : "";
  const koHtml = ko ? `
    <div class="card" style="margin-top:16px">
      <h3>${e.name} · Mata-mata (ida/volta)</h3>
      <div style="font-size:12px;color:var(--muted);margin-bottom:10px">Classificados diretos à semifinal: <b style="color:var(--accent)">${directNames}</b></div>
      <div class="bracket" style="grid-template-columns:repeat(3,1fr);max-width:720px">
        <div class="bracket-col">
          <div class="bracket-col-title">Playoff (3º-6º)</div>
          <div class="bracket-col-body">${ko.playoffs.map(t => renderPaulistaTie(t)).join("")}</div>
        </div>
        <div class="bracket-col">
          <div class="bracket-col-title">Semifinais</div>
          <div class="bracket-col-body">
            ${ko.semis.length ? ko.semis.map(t => renderPaulistaTie(t)).join("")
              : `<div class="bracket-tie pending">aguardando playoff</div>`}
          </div>
        </div>
        <div class="bracket-col">
          <div class="bracket-col-title">Final</div>
          <div class="bracket-col-body">
            ${ko.final ? renderPaulistaTie(ko.final) : `<div class="bracket-tie pending">aguardando semis</div>`}
          </div>
        </div>
      </div>
      ${e.champion ? `<div class="bracket-champion" style="margin-top:12px">🏆 Campeão: ${state.teams[e.champion].name}</div>` : ""}
    </div>` : "";

  return header + tableHtml + koHtml;
}

function renderAlagoano(e, isMine) {
  const comp = state.competitions.estadual_al;
  const phaseLabel = {
    league: "1ª Fase (pontos corridos)", semis: "Semifinais",
    final: "Final", done: "Encerrado",
  }[e.phase] || "—";

  const header = `
    <div style="margin-bottom:8px;padding:8px 4px;border-left:3px solid ${isMine ? "var(--accent)" : "var(--border)"};padding-left:12px">
      <span style="font-weight:700;font-size:15px">${e.name}</span>
      <span style="color:var(--muted);font-size:12px;margin-left:8px">${phaseLabel}</span>
      ${isMine ? `<span class="badge" style="background:var(--accent);color:var(--accent-fg);margin-left:8px">SEU TIME</span>` : ""}
    </div>`;

  // Tabela: top 4 (verde, semis) e 8º (vermelho, rebaixado).
  const tableHtml = comp ? `
    <div class="card">
      <h3>Classificação · turno único</h3>
      <p style="font-size:11px;color:var(--muted);margin-bottom:8px">
        <b style="color:var(--accent)">Top 4</b> ao mata-mata (semi 1×4, 2×3, ida/volta) · <b style="color:var(--danger)">8º</b> rebaixado.
      </p>
      ${renderStandingsTable({ ...comp, standings: getAlagoanoStandings(comp, state.teams) }, { highlightSlots: [4, 8] })}
    </div>` : "";

  const ko = e.knockout;
  const koHtml = ko ? `
    <div class="card" style="margin-top:16px">
      <h3>${e.name} · Mata-mata (ida/volta)</h3>
      <div class="bracket" style="grid-template-columns:repeat(2,1fr);max-width:520px">
        <div class="bracket-col">
          <div class="bracket-col-title">Semifinais (1×4, 2×3)</div>
          <div class="bracket-col-body">${ko.semis.map(t => renderPaulistaTie(t)).join("")}</div>
        </div>
        <div class="bracket-col">
          <div class="bracket-col-title">Final</div>
          <div class="bracket-col-body">
            ${ko.final ? renderPaulistaTie(ko.final) : `<div class="bracket-tie pending">aguardando semis</div>`}
          </div>
        </div>
      </div>
      ${e.champion ? `<div class="bracket-champion" style="margin-top:12px">🏆 Campeão: ${state.teams[e.champion].name}</div>` : ""}
    </div>` : "";

  return header + tableHtml + koHtml;
}

function renderGoiano(e, isMine) {
  const comp = state.competitions.estadual_go;
  const phaseLabel = {
    groups: "1ª Fase (3 grupos cruzados)", quarters: "Quartas de final",
    semis: "Semifinais", final: "Final", done: "Encerrado",
  }[e.phase] || "—";

  const header = `
    <div style="margin-bottom:8px;padding:8px 4px;border-left:3px solid ${isMine ? "var(--accent)" : "var(--border)"};padding-left:12px">
      <span style="font-weight:700;font-size:15px">${e.name}</span>
      <span style="color:var(--muted);font-size:12px;margin-left:8px">${phaseLabel}</span>
      ${isMine ? `<span class="badge" style="background:var(--accent);color:var(--accent-fg);margin-left:8px">SEU TIME</span>` : ""}
    </div>`;

  // Grupos A/B/C (só posicionamento; classificação é geral).
  const groupCard = (label) => {
    if (!comp) return "";
    const sorted = getGoianoGroupStandings(comp, label);
    return `<div class="card"><h3>Grupo ${label}</h3>
      ${renderStandingsTable({ ...comp, standings: sorted }, {})}</div>`;
  };
  const groupsHtml = `<div class="grid-3">${groupCard("A")}${groupCard("B")}${groupCard("C")}</div>`;

  // Classificação GERAL — top 8 ao mata-mata.
  const overallHtml = comp ? `
    <div class="card" style="margin-top:16px">
      <h3>Classificação Geral</h3>
      <p style="font-size:11px;color:var(--muted);margin-bottom:8px">Os <b style="color:var(--accent)">8 melhores</b> da campanha geral avançam ao mata-mata.</p>
      ${renderStandingsTable({ ...comp, standings: getGoianoOverallStandings(comp, state.teams) }, { highlightSlots: [8, 0] })}
    </div>` : "";

  const ko = e.knockout;
  const koHtml = ko ? `
    <div class="card" style="margin-top:16px">
      <h3>${e.name} · Mata-mata (ida/volta)</h3>
      <div class="bracket" style="grid-template-columns:repeat(3,1fr);max-width:720px">
        <div class="bracket-col">
          <div class="bracket-col-title">Quartas</div>
          <div class="bracket-col-body">${ko.quarters.map(t => renderPaulistaTie(t)).join("")}</div>
        </div>
        <div class="bracket-col">
          <div class="bracket-col-title">Semis</div>
          <div class="bracket-col-body">
            ${ko.semis.length ? ko.semis.map(t => renderPaulistaTie(t)).join("")
              : `<div class="bracket-tie pending">aguardando quartas</div>`}
          </div>
        </div>
        <div class="bracket-col">
          <div class="bracket-col-title">Final</div>
          <div class="bracket-col-body">
            ${ko.final ? renderPaulistaTie(ko.final) : `<div class="bracket-tie pending">aguardando semis</div>`}
          </div>
        </div>
      </div>
      ${e.champion ? `<div class="bracket-champion" style="margin-top:12px">🏆 Campeão: ${state.teams[e.champion].name}</div>` : ""}
    </div>` : "";

  return header + groupsHtml + overallHtml + koHtml;
}

function renderCatarinense(e, isMine) {
  const comp = state.competitions.estadual_sc;
  const phaseLabel = {
    groups: "1ª Fase (grupos)", quarters: "Quartas de final",
    semis: "Semifinais", final: "Final", done: "Encerrado",
  }[e.phase] || "—";

  const header = `
    <div style="margin-bottom:8px;padding:8px 4px;border-left:3px solid ${isMine ? "var(--accent)" : "var(--border)"};padding-left:12px">
      <span style="font-weight:700;font-size:15px">${e.name}</span>
      <span style="color:var(--muted);font-size:12px;margin-left:8px">${phaseLabel}</span>
      ${isMine ? `<span class="badge" style="background:var(--accent);color:var(--accent-fg);margin-left:8px">SEU TIME</span>` : ""}
    </div>`;

  const groupCard = (label) => {
    if (!comp) return "";
    const sorted = getCatarinenseGroupStandings(comp, label);
    const shim = { ...comp, standings: sorted };
    return `<div class="card"><h3>Grupo ${label}</h3>
      <p style="font-size:11px;color:var(--muted);margin-bottom:8px">Top 4 avançam ao mata-mata.</p>
      ${renderStandingsTable(shim, { highlightSlots: [4, 0] })}</div>`;
  };
  const groupsHtml = `<div class="grid-2">${groupCard("A")}${groupCard("B")}</div>`;

  const ko = e.knockout;
  const koHtml = ko ? `
    <div class="card">
      <h3>${e.name} · Mata-mata (tudo ida/volta)</h3>
      <div class="bracket" style="grid-template-columns:repeat(3,1fr);max-width:720px">
        <div class="bracket-col">
          <div class="bracket-col-title">Quartas (intra-grupo)</div>
          <div class="bracket-col-body">${ko.quarters.map(t => renderPaulistaTie(t)).join("")}</div>
        </div>
        <div class="bracket-col">
          <div class="bracket-col-title">Semis (ida/volta)</div>
          <div class="bracket-col-body">
            ${ko.semis.length ? ko.semis.map(t => renderPaulistaTie(t)).join("")
              : `<div class="bracket-tie pending">aguardando quartas</div>`}
          </div>
        </div>
        <div class="bracket-col">
          <div class="bracket-col-title">Final (ida/volta)</div>
          <div class="bracket-col-body">
            ${ko.final ? renderPaulistaTie(ko.final) : `<div class="bracket-tie pending">aguardando semis</div>`}
          </div>
        </div>
      </div>
      ${e.champion ? `<div class="bracket-champion" style="margin-top:12px">🏆 Campeão: ${state.teams[e.champion].name}</div>` : ""}
    </div>` : "";

  return header + groupsHtml + koHtml;
}

function renderParaense(e, isMine) {
  const comp = state.competitions.estadual_pa;
  const phaseLabel = {
    groups: "1ª Fase (grupos cruzados)", quarters: "Quartas de final",
    semis: "Semifinais", final: "Final", done: "Encerrado",
  }[e.phase] || "—";

  const header = `
    <div style="margin-bottom:8px;padding:8px 4px;border-left:3px solid ${isMine ? "var(--accent)" : "var(--border)"};padding-left:12px">
      <span style="font-weight:700;font-size:15px">${e.name}</span>
      <span style="color:var(--muted);font-size:12px;margin-left:8px">${phaseLabel}</span>
      ${isMine ? `<span class="badge" style="background:var(--accent);color:var(--accent-fg);margin-left:8px">SEU TIME</span>` : ""}
    </div>`;

  const groupCard = (label) => {
    if (!comp) return "";
    const sorted = getParaenseGroupStandings(comp, label);
    return `<div class="card"><h3>Grupo ${label}</h3>
      ${renderStandingsTable({ ...comp, standings: sorted }, {})}</div>`;
  };
  const groupsHtml = `<div class="grid-2">${groupCard("A")}${groupCard("B")}</div>`;

  const overallHtml = comp ? `
    <div class="card" style="margin-top:16px">
      <h3>Classificação Geral</h3>
      <p style="font-size:11px;color:var(--muted);margin-bottom:8px">Os <b style="color:var(--accent)">8 melhores</b> da tabela geral avançam ao mata-mata (quartas e semis em jogo único).</p>
      ${renderStandingsTable({ ...comp, standings: getParaenseOverallStandings(comp, state.teams) }, { highlightSlots: [8, 0] })}
    </div>` : "";

  const ko = e.knockout;
  const koHtml = ko ? `
    <div class="card" style="margin-top:16px">
      <h3>${e.name} · Mata-mata</h3>
      <div class="bracket" style="grid-template-columns:repeat(3,1fr);max-width:720px">
        <div class="bracket-col">
          <div class="bracket-col-title">Quartas (jogo único)</div>
          <div class="bracket-col-body">${ko.quarters.map(t => renderPaulistaTie(t)).join("")}</div>
        </div>
        <div class="bracket-col">
          <div class="bracket-col-title">Semis (jogo único)</div>
          <div class="bracket-col-body">
            ${ko.semis.length ? ko.semis.map(t => renderPaulistaTie(t)).join("")
              : `<div class="bracket-tie pending">aguardando quartas</div>`}
          </div>
        </div>
        <div class="bracket-col">
          <div class="bracket-col-title">Final (ida/volta)</div>
          <div class="bracket-col-body">
            ${ko.final ? renderPaulistaTie(ko.final) : `<div class="bracket-tie pending">aguardando semis</div>`}
          </div>
        </div>
      </div>
      ${e.champion ? `<div class="bracket-champion" style="margin-top:12px">🏆 Campeão: ${state.teams[e.champion].name}</div>` : ""}
    </div>` : "";

  return header + groupsHtml + overallHtml + koHtml;
}

function renderAcreano(e, isMine) {
  const comp = state.competitions.estadual_ac;
  const phaseLabel = {
    league: "1ª Fase (pontos corridos)", semis: "Semifinais",
    final: "Final", done: "Encerrado",
  }[e.phase] || "—";

  const header = `
    <div style="margin-bottom:8px;padding:8px 4px;border-left:3px solid ${isMine ? "var(--accent)" : "var(--border)"};padding-left:12px">
      <span style="font-weight:700;font-size:15px">${e.name}</span>
      <span style="color:var(--muted);font-size:12px;margin-left:8px">${phaseLabel}</span>
      ${isMine ? `<span class="badge" style="background:var(--accent);color:var(--accent-fg);margin-left:8px">SEU TIME</span>` : ""}
    </div>`;

  const tableHtml = comp ? `
    <div class="card">
      <h3>Classificação · turno único</h3>
      <p style="font-size:11px;color:var(--muted);margin-bottom:8px">Os <b style="color:var(--accent)">4 primeiros</b> avançam: semis ida/volta (vantagem do empate à melhor campanha), final em jogo único.</p>
      ${renderStandingsTable({ ...comp, standings: getAcreanoStandings(comp, state.teams) }, { highlightSlots: [4, 0] })}
    </div>` : "";

  const ko = e.knockout;
  const koHtml = ko ? `
    <div class="card" style="margin-top:16px">
      <h3>${e.name} · Mata-mata</h3>
      <div class="bracket" style="grid-template-columns:repeat(2,1fr);max-width:520px">
        <div class="bracket-col">
          <div class="bracket-col-title">Semis (ida/volta)</div>
          <div class="bracket-col-body">${ko.semis.map(t => renderPaulistaTie(t)).join("")}</div>
        </div>
        <div class="bracket-col">
          <div class="bracket-col-title">Final (jogo único)</div>
          <div class="bracket-col-body">
            ${ko.final ? renderPaulistaTie(ko.final) : `<div class="bracket-tie pending">aguardando semis</div>`}
          </div>
        </div>
      </div>
      ${e.champion ? `<div class="bracket-champion" style="margin-top:12px">🏆 Campeão: ${state.teams[e.champion].name}</div>` : ""}
    </div>` : "";

  return header + tableHtml + koHtml;
}

function renderAmazonense(e, isMine) {
  const c1 = state.competitions.estadual_am;
  const c2 = state.competitions.estadual_am_t2;
  const phaseLabel = {
    t1_groups: "1º Turno (fase)", t1_ko: "1º Turno (mata-mata)",
    t2_groups: "2º Turno (fase)", t2_ko: "2º Turno (mata-mata)",
    grand_final: "Grande Final", done: "Encerrado",
  }[e.phase] || "—";

  const header = `
    <div style="margin-bottom:8px;padding:8px 4px;border-left:3px solid ${isMine ? "var(--accent)" : "var(--border)"};padding-left:12px">
      <span style="font-weight:700;font-size:15px">${e.name}</span>
      <span style="color:var(--muted);font-size:12px;margin-left:8px">${phaseLabel}</span>
      ${isMine ? `<span class="badge" style="background:var(--accent);color:var(--accent-fg);margin-left:8px">SEU TIME</span>` : ""}
    </div>`;

  const turnoBlock = (comp, ko, title, champion) => {
    if (!comp) return "";
    const table = `<div class="card"><h3>${title} · classificação</h3>
      <p style="font-size:11px;color:var(--muted);margin-bottom:8px">Top 4 ao mata-mata (semis 1×4/2×3 e final, jogo único).${champion ? ` 🏆 Campeão do turno: <b>${state.teams[champion].name}</b>` : ""}</p>
      ${renderStandingsTable({ ...comp, standings: getAmazonenseStandings(comp, state.teams) }, { highlightSlots: [4, 0] })}</div>`;
    const bracket = ko ? `<div class="card" style="margin-top:10px"><h3>${title} · mata-mata</h3>
      <div class="bracket" style="grid-template-columns:repeat(2,1fr);max-width:520px">
        <div class="bracket-col"><div class="bracket-col-title">Semis</div><div class="bracket-col-body">${ko.semis.map(t => renderPaulistaTie(t)).join("")}</div></div>
        <div class="bracket-col"><div class="bracket-col-title">Final do turno</div><div class="bracket-col-body">${ko.final ? renderPaulistaTie(ko.final) : `<div class="bracket-tie pending">aguardando semis</div>`}</div></div>
      </div></div>` : "";
    return table + bracket;
  };

  const t1Html = turnoBlock(c1, e.t1ko, "1º Turno", e.t1Champion);
  const t2Html = c2 ? `<div style="margin-top:16px">${turnoBlock(c2, e.t2ko, "2º Turno", e.t2Champion)}</div>` : "";

  let gfHtml = "";
  if (e.t1Champion && e.t2Champion && e.t1Champion === e.t2Champion) {
    gfHtml = `<div class="card bracket-champion" style="margin-top:16px">🏆 ${state.teams[e.champion || e.t1Champion].name} venceu os dois turnos — campeão automático!</div>`;
  } else if (e.grandFinal) {
    gfHtml = `<div class="card" style="margin-top:16px">
      <h3>Grande Final · ${state.teams[e.t1Champion].shortName} (1º turno) × ${state.teams[e.t2Champion].shortName} (2º turno)</h3>
      <div class="bracket" style="grid-template-columns:1fr;max-width:280px"><div class="bracket-col"><div class="bracket-col-body">${renderPaulistaTie(e.grandFinal)}</div></div></div>
      ${e.champion ? `<div class="bracket-champion" style="margin-top:12px">🏆 Campeão: ${state.teams[e.champion].name}</div>` : ""}
    </div>`;
  }

  return header + t1Html + t2Html + gfHtml;
}

function renderAmapaense(e, isMine) {
  const comp = state.competitions.estadual_ap;
  const phaseLabel = {
    league: "1ª Fase (pontos corridos)", semis: "Semifinais",
    final: "Final", done: "Encerrado",
  }[e.phase] || "—";

  const header = `
    <div style="margin-bottom:8px;padding:8px 4px;border-left:3px solid ${isMine ? "var(--accent)" : "var(--border)"};padding-left:12px">
      <span style="font-weight:700;font-size:15px">${e.name}</span>
      <span style="color:var(--muted);font-size:12px;margin-left:8px">${phaseLabel}</span>
      ${isMine ? `<span class="badge" style="background:var(--accent);color:var(--accent-fg);margin-left:8px">SEU TIME</span>` : ""}
    </div>`;

  const tableHtml = comp ? `
    <div class="card">
      <h3>Classificação · turno único</h3>
      <p style="font-size:11px;color:var(--muted);margin-bottom:8px">Os <b style="color:var(--accent)">4 primeiros</b> avançam: semis (1×4, 2×3) e final, ida e volta. Campeão → vaga na Copa do Brasil e Série D.</p>
      ${renderStandingsTable({ ...comp, standings: getAmapaenseStandings(comp, state.teams) }, { highlightSlots: [4, 0] })}
    </div>` : "";

  const ko = e.knockout;
  const koHtml = ko ? `
    <div class="card" style="margin-top:16px">
      <h3>${e.name} · Mata-mata (ida/volta)</h3>
      <div class="bracket" style="grid-template-columns:repeat(2,1fr);max-width:520px">
        <div class="bracket-col">
          <div class="bracket-col-title">Semis (1×4, 2×3)</div>
          <div class="bracket-col-body">${ko.semis.map(t => renderPaulistaTie(t)).join("")}</div>
        </div>
        <div class="bracket-col">
          <div class="bracket-col-title">Final</div>
          <div class="bracket-col-body">
            ${ko.final ? renderPaulistaTie(ko.final) : `<div class="bracket-tie pending">aguardando semis</div>`}
          </div>
        </div>
      </div>
      ${e.champion ? `<div class="bracket-champion" style="margin-top:12px">🏆 Campeão: ${state.teams[e.champion].name}</div>` : ""}
    </div>` : "";

  return header + tableHtml + koHtml;
}

function renderRondoniense(e, isMine) {
  const comp = state.competitions.estadual_ro;
  const phaseLabel = {
    league: "1ª Fase (turno e returno)", semis: "Semifinais",
    final: "Final", done: "Encerrado",
  }[e.phase] || "—";

  const header = `
    <div style="margin-bottom:8px;padding:8px 4px;border-left:3px solid ${isMine ? "var(--accent)" : "var(--border)"};padding-left:12px">
      <span style="font-weight:700;font-size:15px">${e.name}</span>
      <span style="color:var(--muted);font-size:12px;margin-left:8px">${phaseLabel}</span>
      ${isMine ? `<span class="badge" style="background:var(--accent);color:var(--accent-fg);margin-left:8px">SEU TIME</span>` : ""}
    </div>`;

  const tableHtml = comp ? `
    <div class="card">
      <h3>Classificação · turno e returno</h3>
      <p style="font-size:11px;color:var(--muted);margin-bottom:8px">Os <b style="color:var(--accent)">4 primeiros</b> avançam: semis (1×4, 2×3) e final, ida e volta.</p>
      ${renderStandingsTable({ ...comp, standings: getRondonienseStandings(comp, state.teams) }, { highlightSlots: [4, 0] })}
    </div>` : "";

  const ko = e.knockout;
  const koHtml = ko ? `
    <div class="card" style="margin-top:16px">
      <h3>${e.name} · Mata-mata (ida/volta)</h3>
      <div class="bracket" style="grid-template-columns:repeat(2,1fr);max-width:520px">
        <div class="bracket-col">
          <div class="bracket-col-title">Semis (1×4, 2×3)</div>
          <div class="bracket-col-body">${ko.semis.map(t => renderPaulistaTie(t)).join("")}</div>
        </div>
        <div class="bracket-col">
          <div class="bracket-col-title">Final</div>
          <div class="bracket-col-body">
            ${ko.final ? renderPaulistaTie(ko.final) : `<div class="bracket-tie pending">aguardando semis</div>`}
          </div>
        </div>
      </div>
      ${e.champion ? `<div class="bracket-champion" style="margin-top:12px">🏆 Campeão: ${state.teams[e.champion].name}</div>` : ""}
    </div>` : "";

  return header + tableHtml + koHtml;
}

function renderRoraimense(e, isMine) {
  const comp = state.competitions.estadual_rr;
  const phaseLabel = {
    league: "1ª Fase (pontos corridos)", semis: "Semifinais",
    final: "Final", done: "Encerrado",
  }[e.phase] || "—";

  const header = `
    <div style="margin-bottom:8px;padding:8px 4px;border-left:3px solid ${isMine ? "var(--accent)" : "var(--border)"};padding-left:12px">
      <span style="font-weight:700;font-size:15px">${e.name}</span>
      <span style="color:var(--muted);font-size:12px;margin-left:8px">${phaseLabel}</span>
      ${isMine ? `<span class="badge" style="background:var(--accent);color:var(--accent-fg);margin-left:8px">SEU TIME</span>` : ""}
    </div>`;

  const tableHtml = comp ? `
    <div class="card">
      <h3>Classificação · turno único</h3>
      <p style="font-size:11px;color:var(--muted);margin-bottom:8px">Os <b style="color:var(--accent)">4 primeiros</b> avançam: semis e final em jogo único (mando do melhor, pênaltis no empate).</p>
      ${renderStandingsTable({ ...comp, standings: getRoraimenseStandings(comp, state.teams) }, { highlightSlots: [4, 0] })}
    </div>` : "";

  const ko = e.knockout;
  const koHtml = ko ? `
    <div class="card" style="margin-top:16px">
      <h3>${e.name} · Mata-mata (jogo único)</h3>
      <div class="bracket" style="grid-template-columns:repeat(2,1fr);max-width:520px">
        <div class="bracket-col">
          <div class="bracket-col-title">Semifinais</div>
          <div class="bracket-col-body">${ko.semis.map(t => renderPaulistaTie(t)).join("")}</div>
        </div>
        <div class="bracket-col">
          <div class="bracket-col-title">Final</div>
          <div class="bracket-col-body">
            ${ko.final ? renderPaulistaTie(ko.final) : `<div class="bracket-tie pending">aguardando semis</div>`}
          </div>
        </div>
      </div>
      ${e.champion ? `<div class="bracket-champion" style="margin-top:12px">🏆 Campeão: ${state.teams[e.champion].name}</div>` : ""}
    </div>` : "";

  return header + tableHtml + koHtml;
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
