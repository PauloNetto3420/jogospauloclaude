// Testes do mercado: janelas, propostas por jogadores, agentes livres e a
// contabilidade (caixa, elencos). Mercado mexe direto no dinheiro do clube,
// então invariantes financeiras aqui evitam bugs caros.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  isTransferWindowOpen, getTransferWindowStatus,
  listFreeAgents, listMarket, makeBid, signFreeAgent,
  generateFreeAgents,
} from "../src/engine/transfers.js";
import { fakeSeeds, makeState } from "./helpers.js";

const OPEN_ROUND = 3;    // dentro da janela pré-temporada (1-5)
const CLOSED_ROUND = 10; // fora de qualquer janela

test("janela: aberta em 1-5 e 18-22, fechada no resto", () => {
  assert.equal(isTransferWindowOpen(1), true, "rodada 1 aberta");
  assert.equal(isTransferWindowOpen(5), true, "rodada 5 aberta");
  assert.equal(isTransferWindowOpen(6), false, "rodada 6 fechada");
  assert.equal(isTransferWindowOpen(18), true, "rodada 18 aberta");
  assert.equal(isTransferWindowOpen(22), true, "rodada 22 aberta");
  assert.equal(isTransferWindowOpen(23), false, "rodada 23 fechada");
  assert.equal(isTransferWindowOpen(null), false, "round null = fechada");
});

test("getTransferWindowStatus: descreve aberta e aponta próxima quando fechada", () => {
  const open = getTransferWindowStatus(3);
  assert.equal(open.open, true);
  assert.equal(open.closesAt, 5, "fecha após a 5");

  const closed = getTransferWindowStatus(10);
  assert.equal(closed.open, false);
  assert.equal(closed.opensAt, 18, "próxima abre na 18");
});

test("makeBid: bloqueado fora da janela", () => {
  const { state } = makeState({ teamSeeds: fakeSeeds(4) });
  const [buyer, seller] = Object.values(state.teams);
  const target = state.players[seller.squad[20]]; // jogador qualquer do vendedor

  const res = makeBid(state, {
    fromTeamId: buyer.id, playerId: target.id,
    fee: target.marketValue * 2, salaryOffer: target.contract.salary * 2,
    currentRound: CLOSED_ROUND,
  });
  assert.equal(res.accepted, false, "fora da janela deve recusar");
  assert.match(res.message, /[Jj]anela/, "mensagem menciona janela");
});

test("makeBid: proposta cheia move jogador, caixa e elencos", () => {
  const { state } = makeState({ teamSeeds: fakeSeeds(4) });
  const [buyer, seller] = Object.values(state.teams);
  // Garante caixa folgado pro comprador
  buyer.finances.balance = 500_000_000;
  const target = state.players[seller.squad[18]];

  const buyerCashBefore = buyer.finances.balance;
  const sellerCashBefore = seller.finances.balance;
  const fee = Math.round(target.marketValue * 1.5); // proposta excelente

  const res = makeBid(state, {
    fromTeamId: buyer.id, playerId: target.id,
    fee, salaryOffer: Math.max(target.contract.salary, 1) * 2,
    currentRound: OPEN_ROUND,
  });

  assert.equal(res.accepted, true, `deveria aceitar: ${res.message}`);
  assert.equal(target.teamId, buyer.id, "jogador agora é do comprador");
  assert.ok(buyer.squad.includes(target.id), "entrou no elenco do comprador");
  assert.ok(!seller.squad.includes(target.id), "saiu do elenco do vendedor");
  assert.equal(buyer.finances.balance, buyerCashBefore - fee, "comprador pagou a fee");
  assert.equal(seller.finances.balance, sellerCashBefore + fee, "vendedor recebeu a fee");
});

test("makeBid: caixa insuficiente recusa sem mover ninguém", () => {
  const { state } = makeState({ teamSeeds: fakeSeeds(4) });
  const [buyer, seller] = Object.values(state.teams);
  buyer.finances.balance = 1_000; // quase zero
  const target = state.players[seller.squad[18]];
  const sellerSquadBefore = [...seller.squad];

  const res = makeBid(state, {
    fromTeamId: buyer.id, playerId: target.id,
    fee: target.marketValue * 1.5, salaryOffer: target.contract.salary * 2,
    currentRound: OPEN_ROUND,
  });
  assert.equal(res.accepted, false, "sem caixa recusa");
  assert.equal(target.teamId, seller.id, "jogador continua no vendedor");
  assert.deepEqual(seller.squad, sellerSquadBefore, "elenco do vendedor intacto");
});

test("makeBid: salário baixo é recusado pelo jogador", () => {
  const { state } = makeState({ teamSeeds: fakeSeeds(4) });
  const [buyer, seller] = Object.values(state.teams);
  buyer.finances.balance = 500_000_000;
  const target = state.players[seller.squad[18]];

  // Fee suficiente pro clube, mas ABAIXO da cláusula de rescisão (que aceitaria
  // automático e pularia a checagem de salário). Salário irrisório → o jogador recusa.
  const clause = target.contract.releaseClause ?? Infinity;
  const fee = Math.min(target.marketValue * 1.5, clause - 1);

  const res = makeBid(state, {
    fromTeamId: buyer.id, playerId: target.id,
    fee, salaryOffer: 1, // salário irrisório
    currentRound: OPEN_ROUND,
  });
  assert.equal(res.accepted, false, "salário baixo recusa");
  assert.match(res.message, /sal[áa]rio/i, "mensagem cita salário");
});

test("generateFreeAgents + listFreeAgents: popula e lista agentes livres", () => {
  const { state, rng } = makeState({ teamSeeds: fakeSeeds(4) });
  assert.equal(listFreeAgents(state).length, 0, "começa sem agentes livres");
  generateFreeAgents(state, rng, 15);
  const free = listFreeAgents(state);
  assert.equal(free.length, 15, "15 agentes livres gerados");
  for (const p of free) assert.equal(p.teamId, null, "agente livre não tem time");
});

test("signFreeAgent: contrata, tira da lista e cobra bônus de assinatura", () => {
  const { state, rng } = makeState({ teamSeeds: fakeSeeds(4) });
  generateFreeAgents(state, rng, 20);
  const team = Object.values(state.teams)[0];
  team.finances.balance = 500_000_000;

  // Escolhe um agente e oferece salário generoso pra garantir aceite
  const fa = listFreeAgents(state).sort((a, b) => b.overall - a.overall)[0];
  const cashBefore = team.finances.balance;
  const squadBefore = team.squad.length;

  const res = signFreeAgent(state, {
    teamId: team.id, playerId: fa.id,
    salaryOffer: Math.max(fa.contract?.salary || 0, 1) * 5 + 100_000,
    currentRound: OPEN_ROUND,
  });

  assert.equal(res.accepted, true, `deveria assinar: ${res.message}`);
  assert.equal(fa.teamId, team.id, "agora pertence ao time");
  assert.equal(team.squad.length, squadBefore + 1, "elenco cresceu 1");
  assert.ok(!state.freeAgents.includes(fa.id), "saiu da lista de livres");
  assert.ok(team.finances.balance < cashBefore, "pagou bônus de assinatura");
});

test("signFreeAgent: bloqueado fora da janela", () => {
  const { state, rng } = makeState({ teamSeeds: fakeSeeds(4) });
  generateFreeAgents(state, rng, 10);
  const team = Object.values(state.teams)[0];
  team.finances.balance = 500_000_000;
  const fa = listFreeAgents(state)[0];

  const res = signFreeAgent(state, {
    teamId: team.id, playerId: fa.id, salaryOffer: 1_000_000,
    currentRound: CLOSED_ROUND,
  });
  assert.equal(res.accepted, false, "fora da janela recusa");
  assert.equal(fa.teamId, null, "agente continua livre");
});

test("listMarket: não inclui jogadores do próprio time", () => {
  const { state } = makeState({ teamSeeds: fakeSeeds(6) });
  const me = Object.values(state.teams)[0];
  const market = listMarket(state, me.id);
  for (const p of market) {
    assert.notEqual(p.teamId, me.id, "nenhum jogador do meu time no mercado");
  }
  assert.ok(market.length > 0, "mercado não está vazio");
});
