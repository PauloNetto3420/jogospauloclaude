// View: Escalação — formação, titulares, próximo jogo e treinamento.
// Inclui dois cards auxiliares (próxima partida com scout + treinamento semanal)
// porque são exibidos no topo da tela de escalação.

import { state, ui } from "../../core/store.js";
import { fmt, ovrClass, pct, teamLogo } from "../format.js";
import { getContractYearsLeft } from "../modals.js";
import { FORMATIONS } from "../../engine/match.js";
import { TRAINING_FOCI, DEFAULT_TRAINING, FOCUS_KEYS } from "../../engine/training.js";
import { findNextMatch, scoutBestXI, groupCount } from "../../engine/lineup-helpers.js";

export function renderLineup() {
  const team = state.teams[ui.myTeamId];
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

// -------------------- Card: Treinamento semanal --------------------
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

// -------------------- Card: Próxima partida --------------------
function renderNextMatchCard() {
  const match = findNextMatch();
  if (!match) {
    return `<div class="card"><h3>Próxima Partida</h3>
      <p style="color:var(--muted)">Não há partidas pendentes nesta competição.</p></div>`;
  }

  const isHome = match.homeTeamId === ui.myTeamId;
  const opp = state.teams[isHome ? match.awayTeamId : match.homeTeamId];
  const my = state.teams[ui.myTeamId];

  // Scout: força média do XI provável do adversário
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
            ${teamLogo(ui.myTeamId, 40)}
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
