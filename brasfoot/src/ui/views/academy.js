// View: Categoria de Base — prospectos do clube gerenciado.
// Ações (promover / vender / liberar) são despachadas pelo wireView via [data-academy].

import { state, ui } from "../../core/store.js";
import { fmt, ovrClass } from "../format.js";
import { ensureAcademy, MAX_ACADEMY_SLOTS } from "../../engine/academy.js";

export function renderAcademy() {
  const team = state.teams[ui.myTeamId];
  const academy = ensureAcademy(team);
  const prospects = academy.prospects.map(pid => state.players[pid]).filter(Boolean)
    .sort((a, b) => b.potential - a.potential);

  // Faixa de geração esperada pela reputação do clube
  const rep = team.reputation;
  const expectedRange =
    rep >= 90 ? "4 a 5"  :
    rep >= 80 ? "3 a 4"  :
    rep >= 70 ? "2 a 3"  :
    rep >= 60 ? "1 a 3"  :
                "1 a 2";

  return `
    <div class="view-title">Categoria de Base</div>
    <div class="view-sub">
      Slots: <b>${prospects.length}/${MAX_ACADEMY_SLOTS}</b>
      · A cada temporada o ${team.shortName} (rep ${rep}) promove <b>${expectedRange}</b> jovens
      ${prospects.length >= MAX_ACADEMY_SLOTS ? " · ⚠️ Base cheia — prospectos novos serão perdidos sem vaga!" : ""}
    </div>

    <div class="card">
      <h3>Prospectos da Base do ${team.name}</h3>
      <p style="font-size:11px;color:var(--muted);margin-bottom:12px">
        Jogadores de 14-17 anos. Aos 19 são automaticamente liberados se não forem promovidos.
        Promova ao elenco, venda (50% do valor de mercado) ou libere.
      </p>
      ${prospects.length === 0 ? `
        <p style="color:var(--muted);font-size:13px;padding:14px 0">
          Nenhum prospecto no momento. A próxima leva chega no início da próxima temporada.
        </p>
      ` : `
        <table>
          <thead>
            <tr>
              <th>Nome</th><th>Pos</th><th>Idade</th><th>OVR</th><th>POT</th>
              <th>Traits</th><th>Valor (50%)</th><th>Ações</th>
            </tr>
          </thead>
          <tbody>
            ${prospects.map(p => {
              const sellPrice = Math.max(50_000, Math.round(p.marketValue * 0.5));
              const traitsHtml = (p.traits || []).slice(0, 2).map(t => `<span class="trait-chip ${
                t === "promessa" || t === "finalizador" || t === "lider_nato" || t === "tecnico" || t === "veloz" || t === "cabeceador" ? "positive" :
                t === "lesoes_frequentes" || t === "inconsistente" || t === "pe_de_obra" ? "negative" : ""
              }">${t}</span>`).join("") || "—";
              return `
                <tr>
                  <td><b data-player="${p.id}">${p.name}</b></td>
                  <td><span class="badge badge-pos">${p.position}</span></td>
                  <td>${p.age}</td>
                  <td><span class="badge badge-ovr ${ovrClass(p.overall)}">${p.overall}</span></td>
                  <td><b style="color:var(--accent-2)">${p.potential}</b></td>
                  <td style="font-size:11px">${traitsHtml}</td>
                  <td>R$ ${fmt(sellPrice)}</td>
                  <td>
                    <button class="btn btn-sm" data-academy="promote" data-pid="${p.id}">Promover</button>
                    <button class="btn btn-sm btn-secondary" data-academy="sell" data-pid="${p.id}">Vender</button>
                    <button class="btn btn-sm btn-secondary" data-academy="release" data-pid="${p.id}" style="color:var(--danger)">Liberar</button>
                  </td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      `}
    </div>
  `;
}
