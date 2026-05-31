// View: Finanças — resumo financeiro semanal + log de eventos.

import { state, ui } from "../../core/store.js";
import { fmt } from "../format.js";

export function renderFinance() {
  const my = state.teams[ui.myTeamId];
  const monthlyWages = my.squad.reduce((s, pid) => s + (state.players[pid]?.contract.salary ?? 0), 0);
  const weeklyWages = Math.round(monthlyWages / 4);
  const weeklyIncome = Math.round(my.finances.monthlyIncome / 4);
  const net = weeklyIncome - weeklyWages - 120_000;

  return `
    <div class="view-title">Finanças</div>
    <div class="view-sub">${my.name}</div>

    <div class="grid-2">
      <div class="card">
        <h3>Resumo</h3>
        <table>
          <tbody>
            <tr><td>Caixa</td><td style="text-align:right"><b style="color:var(--accent)">R$ ${fmt(my.finances.balance)}</b></td></tr>
            <tr><td>Dívida</td><td style="text-align:right">${my.finances.debt > 0 ? `<b style="color:var(--danger)">R$ ${fmt(my.finances.debt)}</b>` : "R$ 0"}</td></tr>
            <tr><td>Receita semanal</td><td style="text-align:right;color:var(--accent)">+ R$ ${fmt(weeklyIncome)}</td></tr>
            <tr><td>Folha semanal</td><td style="text-align:right;color:var(--danger)">- R$ ${fmt(weeklyWages)}</td></tr>
            <tr><td>Estrutura semanal</td><td style="text-align:right;color:var(--danger)">- R$ 120.000</td></tr>
            <tr style="border-top:1px solid var(--border)">
              <td><b>Saldo líquido</b></td>
              <td style="text-align:right"><b style="color:${net >= 0 ? "var(--accent)" : "var(--danger)"}">${net >= 0 ? "+" : ""} R$ ${fmt(net)}</b></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="card">
        <h3>Histórico</h3>
        <div class="event-log">
          ${state.log.slice(-20).reverse().map(l => `<div>${l}</div>`).join("") || "<i>Sem eventos.</i>"}
        </div>
      </div>
    </div>
  `;
}
