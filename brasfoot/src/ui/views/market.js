// View: Mercado — agentes livres, jogadores em outros clubes, propostas
// recebidas, pedidos de transferência e listados pra venda.
// Janela fechada apenas desabilita os botões; os cards continuam visíveis
// pra dar transparência sobre o que está em curso.

import { state, ui } from "../../core/store.js";
import { fmt, ovrClass, teamLogo } from "../format.js";
import { getCurrentRound } from "../../engine/season.js";
import {
  listFreeAgents, listMarket, listIncomingOffers, listTransferRequests,
  getTransferWindowStatus,
} from "../../engine/transfers.js";

export function renderMarket() {
  const my = state.teams[ui.myTeamId];
  const free = listFreeAgents(state).sort((a, b) => b.overall - a.overall).slice(0, 12);
  const market = listMarket(state, ui.myTeamId).sort((a, b) => b.overall - a.overall).slice(0, 12);

  const pendingOffers = listIncomingOffers(state);
  const pendingRequests = listTransferRequests(state);
  const listedPlayers = my.squad
    .map(id => state.players[id])
    .filter(p => p?.status?.transferListed);
  const round = getCurrentRoundSafe();
  const windowStatus = getTransferWindowStatus(round);
  const isOpen = windowStatus.open;

  return `
    <div class="view-title">Mercado</div>
    <div class="view-sub">Caixa disponível: <b style="color:var(--accent)">R$ ${fmt(my.finances.balance)}</b></div>

    <div class="card" style="border-left:3px solid ${isOpen ? "var(--accent)" : "var(--danger)"};padding:12px 16px">
      <div style="display:flex;align-items:center;gap:10px">
        <span style="font-size:20px">${windowStatus.icon}</span>
        <div>
          <div style="font-weight:700;font-size:14px">${isOpen ? "Janela de transferências aberta" : "Janela de transferências fechada"}</div>
          <div style="color:var(--muted);font-size:12px;margin-top:2px">${windowStatus.label}</div>
        </div>
      </div>
    </div>

    ${pendingRequests.length ? renderTransferRequestsCard(pendingRequests) : ""}

    ${pendingOffers.length ? renderIncomingOffersCard(pendingOffers, isOpen) : ""}

    ${listedPlayers.length ? renderListedPlayersCard(listedPlayers) : ""}

    <div class="card" style="${isOpen ? "" : "opacity:0.55"}">
      <h3>Agentes Livres ${isOpen ? `<span style="color:var(--muted);font-weight:400;font-size:12px">(sem custo de transferência)</span>` : `<span style="color:var(--danger);font-size:11px">· bloqueado fora da janela</span>`}</h3>
      ${renderPlayerTable(free, "free", !isOpen)}
    </div>

    <div class="card" style="${isOpen ? "" : "opacity:0.55"}">
      <h3>Disponíveis em Outros Clubes ${isOpen ? "" : `<span style="color:var(--danger);font-size:11px">· bloqueado fora da janela</span>`}</h3>
      ${renderPlayerTable(market, "buy", !isOpen)}
    </div>
  `;
}

function renderTransferRequestsCard(requests) {
  return `
    <div class="card" style="border-left:3px solid var(--danger)">
      <h3>🔻 Pedidos de Transferência <span style="color:var(--muted);font-weight:400;font-size:12px">(${requests.length})</span></h3>
      <p style="font-size:11px;color:var(--muted);margin-bottom:8px">
        Jogador insatisfeito pediu pra sair. Você pode listá-lo (vira alvo da IA),
        prometer mais espaço (recupera moral) ou recusar (moral despenca).
      </p>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${requests.map(r => {
          const p = state.players[r.playerId];
          if (!p) return "";
          const reasonLabel = ({
            very_low_morale: "Moral muito baixa",
            low_morale: "Moral baixa",
            veteran_unhappy: "Veterano insatisfeito",
          })[r.reason] || r.reason;
          return `
            <div style="background:var(--bg-2);border:1px solid var(--border);border-radius:6px;padding:10px 12px;display:flex;justify-content:space-between;align-items:center;gap:12px">
              <div style="flex:1">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
                  <b data-player="${p.id}" class="clickable-player">${p.name}</b>
                  <span class="badge badge-pos">${p.position}</span>
                  <span class="badge badge-ovr ${ovrClass(p.overall)}">${p.overall}</span>
                </div>
                <div style="font-size:11px;color:var(--muted)">
                  Motivo: ${reasonLabel} (moral ${r.morale}) · Valor estimado: R$ ${fmt(p.marketValue)}
                </div>
              </div>
              <div style="display:flex;gap:6px;flex-wrap:wrap">
                <button class="btn btn-sm btn-secondary" data-req="list" data-rid="${r.id}">Listar p/ venda</button>
                <button class="btn btn-sm btn-secondary" data-req="promise" data-rid="${r.id}">Prometer espaço</button>
                <button class="btn btn-sm btn-secondary" data-req="reject" data-rid="${r.id}" style="color:var(--danger)">Recusar</button>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    </div>
  `;
}

function renderListedPlayersCard(players) {
  return `
    <div class="card" style="border-left:3px solid var(--warning)">
      <h3>⚠️ Listados para venda <span style="color:var(--muted);font-weight:400;font-size:12px">(${players.length})</span></h3>
      <p style="font-size:11px;color:var(--muted);margin-bottom:8px">
        Esses jogadores estão sinalizados pra sair. A IA vai priorizá-los nas propostas.
      </p>
      <div style="display:flex;flex-direction:column;gap:6px">
        ${players.map(p => `
          <div style="background:var(--bg-2);border:1px solid var(--border);border-radius:6px;padding:8px 12px;display:flex;justify-content:space-between;align-items:center">
            <div style="display:flex;align-items:center;gap:8px">
              <b data-player="${p.id}" class="clickable-player">${p.name}</b>
              <span class="badge badge-pos">${p.position}</span>
              <span class="badge badge-ovr ${ovrClass(p.overall)}">${p.overall}</span>
              <span style="font-size:11px;color:var(--muted)">· R$ ${fmt(p.marketValue)}</span>
            </div>
            <button class="btn btn-sm btn-secondary" data-unlist="${p.id}">Retirar da lista</button>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function renderIncomingOffersCard(offers) {
  return `
    <div class="card" style="border-left:3px solid var(--warning)">
      <h3>📩 Propostas Recebidas <span style="color:var(--muted);font-weight:400;font-size:12px">(${offers.length} pendente${offers.length > 1 ? "s" : ""})</span></h3>
      <div style="display:flex;flex-direction:column;gap:10px;margin-top:8px">
        ${offers.map(o => {
          const fromTeam = state.teams[o.fromTeamId];
          const player = state.players[o.playerId];
          if (!fromTeam || !player) return "";
          const expiresIn = Math.max(0, 4 - (getCurrentRoundSafe() - o.round));
          return `
            <div style="background:var(--bg-2);border:1px solid var(--border);border-radius:6px;padding:12px 14px">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:8px">
                <div style="flex:1">
                  <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
                    ${teamLogo(fromTeam.id, 24)}
                    <b style="font-size:14px">${fromTeam.name}</b>
                    <span style="color:var(--muted);font-size:11px">propõe por</span>
                    <b style="color:var(--accent-2)" data-player="${player.id}" class="clickable-player">${player.name}</b>
                    <span class="badge badge-pos">${player.position}</span>
                    <span class="badge badge-ovr ${ovrClass(player.overall)}">${player.overall}</span>
                  </div>
                  <div style="font-size:12px;color:var(--muted)">
                    Oferta: <b style="color:var(--accent)">R$ ${fmt(o.fee)}</b>
                    · Valor de mercado: R$ ${fmt(player.marketValue)}
                    · Salário: R$ ${fmt(o.salaryOffer)}/mês (atual R$ ${fmt(player.contract.salary)})
                  </div>
                  <div style="font-size:10px;color:var(--muted);margin-top:4px">
                    Expira em ${expiresIn} rodada${expiresIn !== 1 ? "s" : ""}
                    ${o.counterAttempts ? ` · ${o.counterAttempts} contraproposta${o.counterAttempts > 1 ? "s" : ""} já feita${o.counterAttempts > 1 ? "s" : ""}` : ""}
                  </div>
                </div>
                <div style="display:flex;gap:6px;flex-wrap:wrap">
                  <button class="btn btn-sm" data-offer="accept" data-oid="${o.id}">Aceitar</button>
                  <button class="btn btn-sm btn-secondary" data-offer="counter" data-oid="${o.id}">Contrapor</button>
                  <button class="btn btn-sm btn-secondary" data-offer="reject" data-oid="${o.id}" style="color:var(--danger)">Recusar</button>
                </div>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    </div>
  `;
}

// Local pra não precisar passar de fora — view não conhece game-loop
function getCurrentRoundSafe() {
  return getCurrentRound(state.competitions[ui.myCompId]) ?? 0;
}

function renderPlayerTable(players, kind, disabled = false) {
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
            <td><button class="btn btn-sm" data-action="${kind}" data-pid="${p.id}" ${disabled ? "disabled" : ""}>${kind === "free" ? "Contratar" : "Ofertar"}</button></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}
