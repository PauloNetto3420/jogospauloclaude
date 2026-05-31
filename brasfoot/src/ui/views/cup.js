// View: Copa do Brasil — exibe fases preliminares (lista) e mata-mata (bracket).
// Cliques em [data-match] são tratados pelo wireView no main.

import { state, ui } from "../../core/store.js";
import { fmt, teamLogo } from "../format.js";
import { CUP_PHASE_META, CUP_PHASE_ORDER } from "../../engine/cup.js";

export function renderCup() {
  const cup = state.competitions.copa_brasil;
  if (!cup) return `<div class="card">Copa não disponível.</div>`;

  const myParticipating = cup.teams.includes(ui.myTeamId);
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
            const isMe = id === ui.myTeamId;
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
  const isMine = tie.teamAId === ui.myTeamId || tie.teamBId === ui.myTeamId;
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
  const isMine = tie.teamAId === ui.myTeamId || tie.teamBId === ui.myTeamId;
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
      if ((tie.teamAId === ui.myTeamId || tie.teamBId === ui.myTeamId) && !tie.winnerId) {
        return tie;
      }
    }
  }
  return null;
}
