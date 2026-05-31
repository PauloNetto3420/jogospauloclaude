// View: Inbox — notícias e eventos.
// Itens são marcados como lidos pelo wireView do main (data-news).

import { state } from "../../core/store.js";

export function renderInbox() {
  const inbox = (state.inbox || []).slice().reverse(); // mais recentes primeiro
  const unread = inbox.filter(n => !n.read).length;

  return `
    <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:16px">
      <div>
        <div class="view-title" style="margin-bottom:0">Inbox</div>
        <div class="view-sub" style="margin-bottom:0">
          ${inbox.length} ${inbox.length === 1 ? "notícia" : "notícias"} ·
          ${unread} ${unread === 1 ? "não lida" : "não lidas"}
        </div>
      </div>
      ${unread > 0 ? `<button class="btn btn-sm btn-secondary" id="btn-mark-all">Marcar tudo como lido</button>` : ""}
    </div>

    ${inbox.length === 0 ? `
      <div class="card" style="text-align:center;color:var(--muted);padding:40px">
        Sem notícias por enquanto. Jogue uma rodada e volte aqui.
      </div>
    ` : inbox.map(n => renderNewsItem(n)).join("")}
  `;
}

function renderNewsItem(n) {
  const dotColor = n.priority === "high" ? "var(--accent)" : "var(--accent-2)";
  const opacity = n.read ? "0.55" : "1";
  const fontWeight = n.read ? "400" : "600";
  return `
    <div class="card" data-news="${n.id}" style="cursor:pointer;padding:14px 18px;margin-bottom:8px;opacity:${opacity};border-left:3px solid ${n.read ? "var(--border)" : dotColor}">
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px">
        <div style="flex:1;min-width:0">
          <div style="font-weight:${fontWeight};font-size:14px">${n.subject}</div>
          <div style="color:var(--muted);font-size:12px;margin-top:4px">${n.body}</div>
        </div>
        <div style="color:var(--muted);font-size:11px;white-space:nowrap">${n.date}</div>
      </div>
    </div>
  `;
}
