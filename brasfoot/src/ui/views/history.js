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

const TABS = [
  { id: "club", label: "🏆 Meus Títulos" },
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
      : tab === "seasons" ? renderChampionsWall()
      : renderGoldenBoots()}
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
