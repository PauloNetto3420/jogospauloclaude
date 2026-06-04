// View: Histórico & Recordes.
//   - Galeria de Títulos do clube (de team.trophies, cumulativo)
//   - Mural de Campeões por temporada (de state.history)
//   - Chuteiras de Ouro ao longo das temporadas (de state.history)

import { state, ui } from "../../core/store.js";
import { teamLogo } from "../format.js";
import {
  getHistory, summarizeClubTitles, totalClubTitles,
  getGoldenBootRoll, getMostDecoratedTeams, competitionLabel,
} from "../../engine/history.js";
import { computeRanking, currentDivisionLabel } from "../../engine/ranking.js";

const TABS = [
  { id: "club", label: "🏆 Meus Títulos" },
  { id: "manager", label: "🧑‍💼 Treinador" },
  { id: "ranking", label: "📈 Ranking Nacional" },
  { id: "seasons", label: "📜 Mural de Campeões" },
  { id: "scorers", label: "👟 Chuteiras de Ouro" },
];

export function renderHistory() {
  const tab = ui.historyTab || "club";
  return `
    <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:16px;flex-wrap:wrap;gap:10px">
      <div>
        <div class="view-title" style="margin-bottom:0">Histórico & Recordes</div>
        <div class="view-sub" style="margin-bottom:0">Galeria de conquistas e memória das temporadas</div>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${TABS.map(t => `
          <button class="btn-toggle ${tab === t.id ? "on" : ""}" data-history-tab="${t.id}">${t.label}</button>
        `).join("")}
      </div>
    </div>
    ${tab === "club" ? renderClubGallery()
      : tab === "manager" ? renderManager()
      : tab === "ranking" ? renderRanking()
      : tab === "seasons" ? renderChampionsWall()
      : renderGoldenBoots()}
  `;
}

// -------------------- Ranking Nacional de Clubes --------------------
function renderRanking() {
  const ranking = computeRanking(state);
  if (!ranking.length) return emptyCard("Ranking ainda não calculado. Ele se forma ao longo das temporadas. 📈");

  const divColor = (lbl) => lbl === "Série A" ? "var(--accent)"
    : lbl === "Série B" ? "var(--accent-2)"
    : lbl === "Série C" ? "var(--warning)" : "var(--muted)";

  return `
    <div class="card">
      <h3>Ranking Nacional de Clubes · top 40</h3>
      <div style="font-size:12px;color:var(--muted);margin-bottom:10px">
        Pontos acumulados nas últimas temporadas (liga, Copa do Brasil e estaduais), com peso maior para as recentes. Clubes fora de A/B/C destacam-se como candidatos à Série D.
      </div>
      <table>
        <thead><tr><th>#</th><th>Clube</th><th>Divisão</th><th>Pontos</th></tr></thead>
        <tbody>
          ${ranking.slice(0, 40).map((r, i) => {
            const div = currentDivisionLabel(state, r.teamId);
            return `
              <tr class="${r.teamId === ui.myTeamId ? "highlight" : ""}">
                <td>${i + 1}</td>
                <td><span style="margin-right:8px">${teamLogo(r.teamId, 18)}</span>${state.teams[r.teamId]?.name ?? "?"}</td>
                <td style="color:${divColor(div)};font-size:12px;font-weight:600">${div}</td>
                <td><b style="color:var(--accent)">${r.points}</b></td>
              </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
}

// -------------------- Carreira do Treinador --------------------
function renderManager() {
  const mgr = state.manager;
  if (!mgr) return emptyCard("Perfil de treinador indisponível neste save.");

  const repColor = mgr.reputation >= 70 ? "var(--accent)" : mgr.reputation >= 45 ? "var(--warning)" : "var(--danger)";
  const titles = [...(mgr.titles || [])].sort((a, b) => b.season - a.season);
  const jobs = [...(mgr.jobs || [])].slice().reverse();

  return `
    <div class="card" style="text-align:center;margin-bottom:16px">
      <div style="font-size:13px;color:var(--muted);letter-spacing:.5px;text-transform:uppercase">Reputação como treinador</div>
      <div style="font-size:42px;font-weight:800;color:${repColor};line-height:1.1;margin-top:4px">${mgr.reputation}</div>
      <div style="font-size:12px;color:var(--muted)">${mgr.seasonsManaged} temporada${mgr.seasonsManaged === 1 ? "" : "s"} na carreira · ${(mgr.titles || []).length} título${(mgr.titles || []).length === 1 ? "" : "s"}</div>
    </div>
    <div class="grid-2">
      <div class="card">
        <h3>Clubes que você dirigiu</h3>
        <table>
          <thead><tr><th>Clube</th><th>De</th><th>Até</th></tr></thead>
          <tbody>
            ${jobs.map(j => `
              <tr class="${j.toSeason == null ? "highlight" : ""}">
                <td><span style="margin-right:6px">${teamLogo(j.teamId, 16)}</span>${state.teams[j.teamId]?.name ?? "?"}</td>
                <td>${j.fromSeason}</td>
                <td>${j.toSeason ?? "atual"}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
      <div class="card">
        <h3>Galeria de títulos do treinador</h3>
        ${titles.length ? `
          <table>
            <thead><tr><th>Temp.</th><th>Competição</th><th>Clube</th></tr></thead>
            <tbody>
              ${titles.map(t => `
                <tr>
                  <td><b>${t.season}</b></td>
                  <td>${competitionLabel(t.competitionId)}</td>
                  <td><span style="margin-right:6px">${teamLogo(t.teamId, 16)}</span>${state.teams[t.teamId]?.shortName ?? "—"}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        ` : `<div style="color:var(--muted);font-size:13px">Nenhum título ainda. Cumpra as metas e levante taças para crescer — clubes maiores começam a te procurar conforme sua reputação sobe.</div>`}
      </div>
    </div>
  `;
}

// -------------------- Galeria de Títulos do clube --------------------
function renderClubGallery() {
  const team = state.teams[ui.myTeamId];
  const summary = summarizeClubTitles(team);
  const total = totalClubTitles(team);

  if (!total) {
    return emptyCard("Seu clube ainda não conquistou títulos. A glória começa nesta temporada. ⚽");
  }

  return `
    <div class="card" style="text-align:center;margin-bottom:16px">
      <div style="font-size:13px;color:var(--muted);letter-spacing:.5px;text-transform:uppercase">Sala de Troféus · ${team.name}</div>
      <div style="font-size:42px;font-weight:800;color:var(--accent);line-height:1.1;margin-top:4px">${total}</div>
      <div style="font-size:13px;color:var(--muted)">título${total > 1 ? "s" : ""} na história do clube</div>
    </div>
    <div class="grid-2">
      ${summary.map(s => `
        <div class="card">
          <h3>${s.label}</h3>
          <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:8px">
            <span style="font-size:28px;font-weight:800;color:var(--accent)">${s.count}×</span>
            <span style="color:var(--muted);font-size:12px">campeão</span>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:6px">
            ${s.seasons.map(yr => `<span class="badge" style="background:var(--panel-2,#1c2230);padding:2px 8px;border-radius:8px;font-size:12px;font-weight:600">${yr}</span>`).join("")}
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

// -------------------- Mural de Campeões por temporada --------------------
function renderChampionsWall() {
  const history = [...getHistory(state)].sort((a, b) => b.season - a.season);
  if (!history.length) {
    return emptyCard("Nenhuma temporada concluída ainda. Ao virar o ano, os campeões aparecem aqui. 📜");
  }

  const champRow = (label, teamId) => {
    if (!teamId) return "";
    const t = state.teams[teamId];
    return `
      <tr>
        <td style="color:var(--muted);white-space:nowrap">${label}</td>
        <td><span style="margin-right:8px">${teamLogo(teamId, 18)}</span><b>${t?.name ?? "?"}</b></td>
      </tr>`;
  };

  return `
    <div class="grid-2">
      ${history.map(h => {
        const est = h.champions.estaduais || {};
        const estRows = Object.entries(est)
          .map(([uf, teamId]) => champRow(competitionLabel(`estadual_${uf.toLowerCase()}`), teamId))
          .join("");
        return `
          <div class="card">
            <h3>Temporada ${h.season}</h3>
            <table>
              <tbody>
                ${champRow("🥇 Série A", h.champions.brasileirao_a)}
                ${champRow("Série B", h.champions.brasileirao_b)}
                ${champRow("Série C", h.champions.brasileirao_c)}
                ${champRow("🏆 Copa do Brasil", h.champions.copa_brasil)}
                ${estRows}
              </tbody>
            </table>
          </div>
        `;
      }).join("")}
    </div>
    ${renderHonorBoard()}
  `;
}

// Quadro de honra: clubes mais decorados no histórico registrado.
function renderHonorBoard() {
  const ranked = getMostDecoratedTeams(state).slice(0, 10);
  if (ranked.length < 2) return "";
  return `
    <div class="card" style="margin-top:16px">
      <h3>Quadro de Honra · clubes mais decorados</h3>
      <table>
        <thead><tr><th>#</th><th>Clube</th><th>Títulos</th></tr></thead>
        <tbody>
          ${ranked.map((r, i) => `
            <tr class="${r.teamId === ui.myTeamId ? "highlight" : ""}">
              <td>${i + 1}</td>
              <td><span style="margin-right:8px">${teamLogo(r.teamId, 18)}</span>${state.teams[r.teamId]?.name ?? "?"}</td>
              <td><b style="color:var(--accent)">${r.titles}</b></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
      <div style="font-size:11px;color:var(--muted);margin-top:8px">Conta campeões nacionais, Copa e estaduais desde o início do save.</div>
    </div>
  `;
}

// -------------------- Chuteiras de Ouro --------------------
function renderGoldenBoots() {
  const roll = getGoldenBootRoll(state);
  if (!roll.length) {
    return emptyCard("Ainda não há artilheiros registrados. Eles surgem ao fim de cada temporada. 👟");
  }
  return `
    <div class="card">
      <h3>Chuteiras de Ouro</h3>
      <table>
        <thead><tr><th>Temporada</th><th>Competição</th><th>Artilheiro</th><th>Clube</th><th>Gols</th></tr></thead>
        <tbody>
          ${roll.map(r => `
            <tr>
              <td><b>${r.season}</b></td>
              <td style="color:var(--muted)">${r.label}</td>
              <td data-player="${r.playerId}">${r.playerName}</td>
              <td><span style="margin-right:6px">${teamLogo(r.teamId, 16)}</span>${state.teams[r.teamId]?.shortName ?? "—"}</td>
              <td><b style="color:var(--accent)">${r.goals}</b></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function emptyCard(msg) {
  return `<div class="card" style="text-align:center;color:var(--muted);padding:40px 20px">${msg}</div>`;
}
