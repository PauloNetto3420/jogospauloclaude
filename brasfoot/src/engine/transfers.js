// Mercado de transferências.
//
// API pública:
//   listFreeAgents(state)
//   listMarket(state, excludeTeamId)  -> jogadores de outros times "disponíveis"
//   makeBid(state, { fromTeamId, playerId, fee, salaryOffer })
//   signFreeAgent(state, { teamId, playerId, salaryOffer })
//   generateFreeAgents(state, rng, count) -> popula state.freeAgents
//
// Decisões da IA são determinísticas dado o RNG; sem RNG, usa Math.random.

import { createPlayer } from "../models/player.js";
import { recalcExpenses } from "../models/team.js";

// -------------------- Janelas de Transferência --------------------
// Brasileirão real tem 2 janelas: pré-temporada e meio do ano.
// Aqui mapeamos pra rodadas:
//   Pré-temporada: rodadas 1-5
//   Meio do ano:   rodadas 18-22
// Renovações de contrato e ações da base (academia) NÃO são afetadas.

const TRANSFER_WINDOWS = [
  { name: "Pré-temporada", start: 1,  end: 5  },
  { name: "Meio do Ano",   start: 18, end: 22 },
];

export function isTransferWindowOpen(round) {
  if (round == null) return false;
  return TRANSFER_WINDOWS.some(w => round >= w.start && round <= w.end);
}

export function getTransferWindowStatus(round) {
  if (round == null) return { open: false, label: "Janela fechada", icon: "🔴" };
  const inWindow = TRANSFER_WINDOWS.find(w => round >= w.start && round <= w.end);
  if (inWindow) {
    return {
      open: true,
      windowName: inWindow.name,
      icon: "🟢",
      label: `${inWindow.name} aberta · fecha após a rodada ${inWindow.end}`,
      closesAt: inWindow.end,
    };
  }
  const next = TRANSFER_WINDOWS.find(w => w.start > round);
  if (next) {
    return {
      open: false,
      icon: "🔴",
      label: `Janela fechada · próxima abre na rodada ${next.start} (${next.name})`,
      opensAt: next.start,
      nextName: next.name,
    };
  }
  return {
    open: false,
    icon: "🔴",
    label: "Janela fechada · próxima abre na temporada que vem",
    opensAt: null,
  };
}

// -------------------- Listagem --------------------
export function listFreeAgents(state) {
  return (state.freeAgents || [])
    .map(pid => state.players[pid])
    .filter(Boolean);
}

// Jogadores "negociáveis": exclui o próprio time e exclui os melhores 14 de cada elenco
// (titulares + reservas imediatos não saem facilmente). Os demais entram no mercado.
export function listMarket(state, excludeTeamId) {
  const out = [];
  for (const team of Object.values(state.teams)) {
    if (team.id === excludeTeamId) continue;
    const players = team.squad
      .map(pid => state.players[pid])
      .filter(Boolean)
      .sort((a, b) => b.overall - a.overall);
    // Disponíveis = do 15º em diante (sobra do elenco)
    for (const p of players.slice(14)) out.push(p);
  }
  return out;
}

// -------------------- Proposta por jogador de outro time --------------------
export function makeBid(state, { fromTeamId, playerId, fee, salaryOffer, currentRound }) {
  if (!isTransferWindowOpen(currentRound)) {
    return reject("Janela de transferências fechada — não dá pra fazer propostas agora.");
  }
  const buyer = state.teams[fromTeamId];
  const player = state.players[playerId];
  if (!buyer || !player) return reject("Jogador ou comprador inválido.");
  if (!player.teamId || player.teamId === fromTeamId) {
    return reject("Jogador não pertence a outro clube.");
  }
  if (buyer.finances.balance < fee) {
    return reject(`Caixa insuficiente. Disponível: R$ ${fmt(buyer.finances.balance)}.`);
  }

  const seller = state.teams[player.teamId];
  const decision = evaluateBid(player, fee, salaryOffer, seller);
  if (!decision.accepted) return decision;

  // Conclui a transferência
  buyer.finances.balance -= fee;
  seller.finances.balance += fee;

  // Remove do antigo, adiciona ao novo
  seller.squad = seller.squad.filter(pid => pid !== playerId);
  buyer.squad.push(playerId);
  player.teamId = fromTeamId;
  player.contract = {
    ...player.contract,
    salary: salaryOffer,
    until: `${new Date().getFullYear() + 3}-12-31`,
  };
  player.history.push({
    season: state.season,
    from: seller.id,
    to: buyer.id,
    fee,
  });

  recalcExpenses(buyer, state.players);
  recalcExpenses(seller, state.players);

  return {
    accepted: true,
    fee,
    message: `${player.name} contratado por R$ ${fmt(fee)}.`,
  };
}

// -------------------- Contratação de agente livre --------------------
export function signFreeAgent(state, { teamId, playerId, salaryOffer, currentRound }) {
  if (!isTransferWindowOpen(currentRound)) {
    return reject("Janela de transferências fechada — agentes livres só podem assinar durante a janela.");
  }
  const team = state.teams[teamId];
  const player = state.players[playerId];
  if (!team || !player) return reject("Jogador ou time inválido.");
  if (player.teamId) return reject("Jogador não está livre.");

  // Pequeno bônus de assinatura (3 meses de salário oferecido)
  const signingBonus = salaryOffer * 3;
  if (team.finances.balance < signingBonus) {
    return reject(`Caixa insuficiente para o bônus de assinatura (R$ ${fmt(signingBonus)}).`);
  }

  // Jogador aceita se salário ≥ 90% do "esperado" (baseado no overall)
  const expected = expectedSalary(player);
  if (salaryOffer < expected * 0.9) {
    return reject(`${player.name} recusou — esperava ~R$ ${fmt(Math.round(expected))}/mês.`);
  }

  team.finances.balance -= signingBonus;
  state.freeAgents = state.freeAgents.filter(pid => pid !== playerId);
  team.squad.push(playerId);
  player.teamId = teamId;
  player.contract = {
    salary: salaryOffer,
    bonusPerGoal: Math.round(salaryOffer * 0.05),
    until: `${new Date().getFullYear() + 2}-12-31`,
    releaseClause: player.marketValue * 2,
  };

  recalcExpenses(team, state.players);

  return {
    accepted: true,
    fee: 0,
    signingBonus,
    message: `${player.name} assinou contrato (bônus R$ ${fmt(signingBonus)}).`,
  };
}

// -------------------- Avaliação da IA --------------------
function evaluateBid(player, fee, salaryOffer, seller) {
  const mv = player.marketValue;
  const expectedSal = expectedSalary(player);

  // Cláusula de rescisão: aceita automático
  if (fee >= (player.contract.releaseClause ?? Infinity)) {
    return accept("Cláusula de rescisão atingida.");
  }

  // Salário oferecido ao jogador: tem que cobrir expectativa
  if (salaryOffer < expectedSal * 0.9) {
    return reject(`${player.name} recusou o salário (esperava ~R$ ${fmt(Math.round(expectedSal))}/mês).`);
  }

  // Lógica do clube vendedor
  // - Clube pobre (caixa baixo) vende por menos
  // - Jogador acima de 30 anos vende por menos
  const cashFactor = seller.finances.balance < 5_000_000 ? 0.85 : 1.0;
  const ageFactor = player.age > 30 ? 0.85 : 1.0;
  const minAcceptable = mv * cashFactor * ageFactor;

  if (fee >= mv * 1.4) return accept("Proposta excelente.");
  if (fee >= minAcceptable) return accept("Proposta aceita.");
  return reject(`Proposta baixa. ${seller.shortName} esperava ao menos R$ ${fmt(Math.round(minAcceptable))}.`);
}

function expectedSalary(player) {
  // Mesma curva do gerador: pow(ovr-50, 1.9) * 800 com leve ajuste por idade
  const base = Math.pow(Math.max(player.overall - 50, 1), 1.9) * 800;
  const ageMod = player.age > 30 ? 1.1 : 1.0;
  return base * ageMod;
}

// -------------------- Renovação de contrato --------------------
// Negociação direta: clube oferece salário + duração; jogador aceita/recusa.
// Custo imediato: 2 meses do novo salário como luvas (signing bonus).
export function renewContract(state, { teamId, playerId, salaryOffer, years }) {
  const team = state.teams[teamId];
  const player = state.players[playerId];
  if (!team || !player) return reject("Jogador ou time inválido.");
  if (player.teamId !== teamId) return reject("Jogador não pertence ao seu clube.");
  if (!Number.isFinite(salaryOffer) || salaryOffer <= 0) return reject("Salário inválido.");
  if (!Number.isFinite(years) || years < 1 || years > 5) return reject("Contrato deve ter entre 1 e 5 anos.");

  const luvas = Math.round(salaryOffer * 2);
  if (team.finances.balance < luvas) {
    return reject(`Caixa insuficiente para luvas de R$ ${fmt(luvas)}.`);
  }

  const expected = expectedRenewalSalary(player);
  const decision = evaluateRenewal(player, salaryOffer, years, expected);
  if (!decision.accepted) return decision;

  // Aplica
  team.finances.balance -= luvas;
  const currentYear = parseInt((state.currentDate || `${state.season}-01-01`).slice(0, 4), 10);
  const newEndYear = currentYear + years;
  player.contract = {
    ...player.contract,
    salary: salaryOffer,
    bonusPerGoal: Math.round(salaryOffer * 0.05),
    until: `${newEndYear}-12-31`,
    releaseClause: Math.max(player.contract.releaseClause || 0, player.marketValue * 2),
  };
  recalcExpenses(team, state.players);

  return {
    accepted: true,
    luvas,
    message: `${player.name} renovou por ${years} ano${years > 1 ? "s" : ""} (R$ ${fmt(salaryOffer)}/mês · luvas R$ ${fmt(luvas)}).`,
  };
}

// Salário esperado na renovação: 15% acima do atual ou do "valor justo" pelo overall,
// o que for maior. Veteranos (32+) pedem aumento menor.
function expectedRenewalSalary(player) {
  const current = player.contract?.salary ?? 0;
  const fairBase = Math.pow(Math.max(player.overall - 50, 1), 1.9) * 800;
  const fair = (player.age > 30) ? fairBase * 1.05 : fairBase * 1.15;
  const raiseFromCurrent = current * (player.age > 32 ? 1.10 : 1.20);
  return Math.max(fair, raiseFromCurrent);
}

// Negociação flexível: cada proposta vira uma probabilidade contínua.
// Salário baixo NÃO trava — só reduz a chance. Moral, idade, lealdade
// e traits do jogador ajustam a aceitação.
function evaluateRenewal(player, salaryOffer, years, expected) {
  const ratio = salaryOffer / expected;

  // 1. Chance base puxada pelo salário relativo ao esperado
  let chance;
  if (ratio >= 1.10)      chance = 0.98;  // ofereceu acima do que pediria
  else if (ratio >= 1.00) chance = 0.92;
  else if (ratio >= 0.90) chance = 0.78;
  else if (ratio >= 0.80) chance = 0.55;
  else if (ratio >= 0.70) chance = 0.32;
  else if (ratio >= 0.55) chance = 0.15;
  else if (ratio >= 0.40) chance = 0.06;
  else                    chance = 0.02;  // simbólico, mas existe

  // 2. Moral do jogador: 100 = quase sempre topa, 40 = quase nunca
  const morale = player.status?.morale ?? 70;
  chance += (morale - 70) / 200;          // ±15% nos extremos

  // 3. Idade: veteranos têm menos leverage, aceitam mais
  if (player.age >= 33) chance += 0.12;
  if (player.age >= 36) chance += 0.10;
  // Jovens com OVR alto e potencial são exigentes
  if (player.age < 24 && player.potential >= 85) chance -= 0.10;

  // 4. Traits
  if (player.traits?.includes("lider_nato"))   chance += 0.08;  // "abro mão pelo clube"
  if (player.traits?.includes("inconsistente")) chance += 0.05;  // pouco poder de barganha
  if (player.traits?.includes("promessa"))      chance -= 0.05;  // quer "preço de promessa"

  // 5. Duração: penalidades suaves, não mais um veto
  if (player.age < 25 && years < 2)  chance -= 0.30;
  if (player.age >= 33 && years > 2) chance -= 0.25;
  if (years === 5 && player.age >= 30) chance -= 0.15;

  chance = Math.max(0.02, Math.min(0.98, chance));

  if (Math.random() < chance) {
    return accept(buildAcceptMessage(player, ratio, years));
  }
  return reject(buildRejectMessage(player, ratio, years, expected));
}

function buildAcceptMessage(player, ratio, years) {
  if (ratio >= 1.0)      return `${player.name} fechou o acordo na hora.`;
  if (ratio >= 0.85)     return `${player.name} aceitou após hesitar um pouco.`;
  if (ratio >= 0.70)     return `${player.name} cedeu — vai topar por amor à camisa.`;
  return `${player.name} aceitou (apesar de não ter sido a melhor proposta financeira).`;
}

function buildRejectMessage(player, ratio, years, expected) {
  if (ratio < 0.55) {
    return `${player.name} recusou — proposta muito abaixo do esperado (~R$ ${fmt(Math.round(expected))}/mês).`;
  }
  if (player.age < 25 && years < 2) {
    return `${player.name} quer mais segurança — pediu contrato mais longo.`;
  }
  if (player.age >= 33 && years > 2) {
    return `${player.name} prefere um contrato mais curto nessa idade.`;
  }
  if (ratio < 0.80) {
    return `${player.name} achou a proposta apertada (~R$ ${fmt(Math.round(expected))}/mês esperado). Tente subir ou negociar de novo.`;
  }
  return `${player.name} pediu para pensar mais. Pode tentar de novo na próxima.`;
}

// Expõe o esperado pra UI mostrar antes do prompt
export function getRenewalExpectation(player) {
  return Math.round(expectedRenewalSalary(player));
}

// -------------------- IA: outros clubes também compram --------------------
//
// Roda uma "janela curta" a cada rodada. Para cada time controlado pela IA:
//   1) decide se vai ao mercado nesta rodada (probabilidade base)
//   2) identifica a posição mais fraca do elenco
//   3) procura upgrade: 1º entre agentes livres, 2º entre listados de rivais
//   4) faz oferta usando as mesmas funções signFreeAgent / makeBid

const POS_GROUP_AI = {
  GOL: "GOL",
  ZAG: "DEF", LD: "DEF", LE: "DEF",
  VOL: "MID", MEI: "MID",
  PE: "ATA", PD: "ATA", ATA: "ATA",
};

export function runAITransfers(state, rng, { excludeTeamId, currentRound } = {}) {
  if (!isTransferWindowOpen(currentRound)) return [];
  const moves = [];
  for (const team of Object.values(state.teams)) {
    if (team.id === excludeTeamId) continue;
    // Clubes maiores agem com mais frequência
    const actChance = 0.15 + (team.reputation - 50) * 0.005; // 15%–37%
    if (!rng.chance(actChance)) continue;

    const move = aiAttemptUpgrade(state, team, rng);
    if (move) moves.push(move);
  }
  return moves;
}

function aiAttemptUpgrade(state, team, rng) {
  // Não compra se caixa < 2M
  if (team.finances.balance < 2_000_000) return null;
  // Não compra se elenco já passa de 30
  if (team.squad.length >= 30) return null;

  const weakestPos = findWeakestPosition(state, team);
  if (!weakestPos) return null;

  const currentBenchmark = squadStrengthAtPosition(state, team, weakestPos);

  // Pool de candidatos: agentes livres + listados de outros clubes
  const free = listFreeAgents(state)
    .filter(p => POS_GROUP_AI[p.position] === weakestPos);
  const market = listMarket(state, team.id)
    .filter(p => POS_GROUP_AI[p.position] === weakestPos);

  // Critério: jogador tem que ser melhor que a média atual da posição
  const candidates = [
    ...free.map(p => ({ player: p, free: true })),
    ...market.map(p => ({ player: p, free: false })),
  ].filter(c => c.player.overall > currentBenchmark + 2);

  if (!candidates.length) return null;

  // Ordena por (potencial + overall) e escolhe entre os 3 melhores que cabem no bolso
  candidates.sort((a, b) =>
    (b.player.overall + b.player.potential) - (a.player.overall + a.player.potential));

  for (const c of candidates.slice(0, 5)) {
    const move = tryBuy(state, team, c.player, c.free, rng);
    if (move) return move;
  }
  return null;
}

function tryBuy(state, team, player, isFree, rng) {
  const expectedSal = expectedSalary(player);
  // IA oferece 5-15% acima do esperado para fechar (ou de leve abaixo se sovina)
  const salaryOffer = Math.round(expectedSal * (0.95 + rng.next() * 0.20));

  if (isFree) {
    const signingBonus = salaryOffer * 3;
    if (team.finances.balance < signingBonus * 1.5) return null;
    const res = signFreeAgent(state, {
      teamId: team.id, playerId: player.id, salaryOffer,
    });
    if (!res.accepted) return null;
    return {
      teamId: team.id, playerId: player.id, playerName: player.name,
      type: "free", fee: 0, salary: salaryOffer,
      message: `${team.shortName} contratou ${player.name} (livre, R$ ${fmt(salaryOffer)}/mês).`,
    };
  } else {
    // IA oferta entre 1.0x e 1.3x o valor de mercado
    const fee = Math.round(player.marketValue * (1.0 + rng.next() * 0.30));
    // Não compromete mais que 40% do caixa em uma única transferência
    if (fee > team.finances.balance * 0.4) return null;
    const res = makeBid(state, {
      fromTeamId: team.id, playerId: player.id, fee, salaryOffer,
    });
    if (!res.accepted) return null;
    const sellerName = state.teams[player.history[player.history.length - 1].from].shortName;
    return {
      teamId: team.id, playerId: player.id, playerName: player.name,
      type: "buy", fee, salary: salaryOffer,
      message: `${team.shortName} comprou ${player.name} do ${sellerName} por R$ ${fmt(fee)}.`,
    };
  }
}

// "Força" atual do time em um grupo posicional = média dos 2 melhores
function squadStrengthAtPosition(state, team, group) {
  const players = team.squad
    .map(pid => state.players[pid])
    .filter(p => p && POS_GROUP_AI[p.position] === group)
    .sort((a, b) => b.overall - a.overall);
  if (!players.length) return 0;
  const top = players.slice(0, 2);
  return top.reduce((s, p) => s + p.overall, 0) / top.length;
}

function findWeakestPosition(state, team) {
  const groups = ["GOL", "DEF", "MID", "ATA"];
  let weakest = null, weakestScore = Infinity;
  for (const g of groups) {
    const s = squadStrengthAtPosition(state, team, g);
    if (s < weakestScore) { weakestScore = s; weakest = g; }
  }
  return weakest;
}

// -------------------- Gerador de pool de agentes livres --------------------
export function generateFreeAgents(state, rng, count = 30) {
  const positions = ["GOL", "ZAG", "LD", "LE", "VOL", "MEI", "PE", "PD", "ATA"];
  state.freeAgents = state.freeAgents || [];
  for (let i = 0; i < count; i++) {
    const pos = rng.pick(positions);
    // Reputação simulada do "clube anterior" baixa-média -> jogadores médios
    const player = createPlayer({
      rng,
      teamId: null,
      position: pos,
      teamReputation: rng.int(45, 70),
    });
    state.players[player.id] = player;
    state.freeAgents.push(player.id);
  }
}

// -------------------- IA propõe pelos jogadores do USUÁRIO --------------------
// A cada rodada, IA pode tentar uma proposta por um jogador interessante seu.
// Limita: no máximo 1 proposta ATIVA por clube comprador.
// Ofertas expiram após N rodadas se não respondidas.

const OFFER_EXPIRATION_ROUNDS = 4;
const POS_GROUP_OFFERS = {
  GOL: "GOL", ZAG: "DEF", LD: "DEF", LE: "DEF",
  VOL: "MID", MEI: "MID", PE: "ATA", PD: "ATA", ATA: "ATA",
};

export function listIncomingOffers(state) {
  return (state.transferOffers || []).filter(o => o.status === "pending");
}

// Gera propostas da IA por jogadores do user team.
export function generateIncomingOffers(state, rng, myTeamId, currentRound) {
  state.transferOffers = state.transferOffers || [];
  const myTeam = state.teams[myTeamId];
  if (!myTeam) return [];

  // Expira ofertas antigas
  for (const o of state.transferOffers) {
    if (o.status === "pending" && currentRound - (o.round || 0) >= OFFER_EXPIRATION_ROUNDS) {
      o.status = "expired";
    }
  }

  // IA só propõe durante a janela
  if (!isTransferWindowOpen(currentRound)) return [];

  const newOffers = [];
  for (const team of Object.values(state.teams)) {
    if (team.id === myTeamId) continue;
    // Já tem oferta pendente desse clube? pula
    const active = state.transferOffers.some(o =>
      o.fromTeamId === team.id && o.status === "pending"
    );
    if (active) continue;
    if (team.finances.balance < 5_000_000) continue;

    // Chance baseada em saldo e reputação (clubes ricos tentam mais)
    let chance = 0.02;
    if (team.finances.balance > 30_000_000) chance = 0.08;
    if (team.finances.balance > 60_000_000) chance = 0.12;
    if (team.reputation >= 90) chance += 0.03;
    if (!rng.chance(chance)) continue;

    const target = pickTargetFromUserSquad(team, myTeam, state.players, rng);
    if (!target) continue;

    // Calcula oferta — 75% a 130% do valor de mercado
    const mv = target.marketValue;
    const fee = Math.round(mv * (0.75 + rng.next() * 0.55));
    // Salário oferecido — 10-35% acima do atual
    const salaryOffer = Math.round(target.contract.salary * (1.10 + rng.next() * 0.25));

    // IA precisa ter o caixa
    if (team.finances.balance < fee * 1.2) continue;

    const offer = {
      id: `offer_${currentRound}_${team.id}_${target.id}`,
      type: "incoming_offer",
      date: state.currentDate,
      round: currentRound,
      fromTeamId: team.id,
      playerId: target.id,
      playerName: target.name,
      fee,
      salaryOffer,
      status: "pending",
      counterAttempts: 0,
    };
    state.transferOffers.push(offer);
    newOffers.push(offer);
  }

  return newOffers;
}

// Critério da IA pra escolher quem propor: alvo na posição mais fraca da IA,
// com OVR maior que a média da posição do comprador. Prioriza jovens.
function pickTargetFromUserSquad(buyerTeam, sellerTeam, players, rng) {
  const sellerSquad = sellerTeam.squad.map(id => players[id]).filter(Boolean);
  if (!sellerSquad.length) return null;

  // Prioridade: jogadores LISTADOS pelo clube (pediram pra sair)
  const listed = sellerSquad.filter(p => p.status?.transferListed);
  if (listed.length) {
    listed.sort((a, b) => (b.overall + b.potential) - (a.overall + a.potential));
    // Sorteia entre top 3 listados
    return listed[rng.int(0, Math.min(2, listed.length - 1))];
  }

  const buyerSquad = buyerTeam.squad.map(id => players[id]).filter(Boolean);
  const groupCount = { GOL: 0, DEF: 0, MID: 0, ATA: 0 };
  const groupSum = { GOL: 0, DEF: 0, MID: 0, ATA: 0 };
  for (const p of buyerSquad) {
    const g = POS_GROUP_OFFERS[p.position];
    if (g) { groupCount[g]++; groupSum[g] += p.overall; }
  }
  let weakest = "MID", weakestAvg = Infinity;
  for (const g of Object.keys(groupCount)) {
    const avg = groupCount[g] ? groupSum[g] / groupCount[g] : 0;
    if (avg < weakestAvg) { weakestAvg = avg; weakest = g; }
  }

  // Candidatos: jogadores do user time da posição mais fraca da IA, OVR > média + 3
  const candidates = sellerSquad.filter(p =>
    POS_GROUP_OFFERS[p.position] === weakest && p.overall > weakestAvg + 3
  );
  if (!candidates.length) return null;

  // Prioriza por (overall + potencial) — quer talento
  candidates.sort((a, b) => (b.overall + b.potential) - (a.overall + a.potential));
  // Pega top 3 e sorteia
  const pool = candidates.slice(0, 3);
  return pool[rng.int(0, pool.length - 1)];
}

// Resposta do usuário: "accept" | "reject" | "counter" (com counterFee)
// Para counter: IA recalcula se cabe (até 1.5x do fee original).
export function respondToOffer(state, offerId, response, counterFee = null) {
  const offer = (state.transferOffers || []).find(o => o.id === offerId);
  if (!offer) return reject("Proposta não encontrada.");
  if (offer.status !== "pending") return reject("Proposta não está mais ativa.");

  const buyer = state.teams[offer.fromTeamId];
  const player = state.players[offer.playerId];
  if (!buyer || !player) {
    offer.status = "cancelled";
    return reject("Comprador ou jogador inválido.");
  }
  const seller = state.teams[player.teamId];
  if (!seller) {
    offer.status = "cancelled";
    return reject("Vendedor inválido.");
  }

  if (response === "reject") {
    offer.status = "rejected";
    return { accepted: false, message: `Proposta do ${buyer.shortName} recusada.` };
  }

  if (response === "accept") {
    return executeOfferTransfer(state, offer, offer.fee, buyer, seller, player);
  }

  if (response === "counter") {
    if (!Number.isFinite(counterFee) || counterFee <= offer.fee) {
      return reject("Contraproposta precisa ser maior que a oferta atual.");
    }
    offer.counterAttempts = (offer.counterAttempts || 0) + 1;
    // IA aceita até 50% acima da oferta original
    const ceiling = offer.fee * 1.5;
    const canAfford = buyer.finances.balance >= counterFee * 1.1;
    if (counterFee <= ceiling && canAfford) {
      const res = executeOfferTransfer(state, offer, counterFee, buyer, seller, player);
      if (res.accepted) {
        res.message = `${buyer.shortName} aceitou a contraproposta. ${res.message}`;
      }
      return res;
    }
    // Recusa contraproposta — encerra negociação
    offer.status = "counter_rejected";
    return {
      accepted: false,
      message: `${buyer.shortName} recusou sua contraproposta de R$ ${fmt(counterFee)} e desistiu do negócio.`,
    };
  }

  return reject("Resposta inválida.");
}

function executeOfferTransfer(state, offer, finalFee, buyer, seller, player) {
  if (buyer.finances.balance < finalFee) {
    offer.status = "cancelled";
    return reject(`${buyer.shortName} não tem mais caixa para fechar a R$ ${fmt(finalFee)}.`);
  }

  buyer.finances.balance -= finalFee;
  seller.finances.balance += finalFee;

  seller.squad = seller.squad.filter(id => id !== player.id);
  seller.lineup = (seller.lineup || []).filter(id => id !== player.id);
  buyer.squad.push(player.id);
  player.teamId = buyer.id;
  // Limpa flag de listagem ao trocar de clube
  if (player.status) {
    delete player.status.transferListed;
    delete player.status.lastRequestRound;
  }
  player.contract = {
    ...player.contract,
    salary: offer.salaryOffer,
    bonusPerGoal: Math.round(offer.salaryOffer * 0.05),
    until: `${parseInt((state.currentDate || `${state.season}-01-01`).slice(0, 4), 10) + 3}-12-31`,
    releaseClause: player.marketValue * 2,
  };
  player.history.push({
    season: state.season,
    from: seller.id,
    to: buyer.id,
    fee: finalFee,
  });

  recalcExpenses(buyer, state.players);
  recalcExpenses(seller, state.players);

  offer.status = "accepted";
  offer.finalFee = finalFee;
  return {
    accepted: true,
    finalFee,
    message: `${player.name} vendido ao ${buyer.shortName} por R$ ${fmt(finalFee)}.`,
  };
}

// -------------------- Pedidos de Transferência (jogador → clube) --------------------
// Jogador com moral baixa pode pedir pra sair. Se aceito (listado), vira alvo
// prioritário pra IA propor. Se "promessa de minutos", recupera moral.
// Se ignorado, perde mais moral.

const REQUEST_COOLDOWN_ROUNDS = 6; // depois de pedir, espera 6 rodadas pra pedir de novo

export function listTransferRequests(state) {
  return (state.transferRequests || []).filter(r => r.status === "pending");
}

export function generateTransferRequests(state, rng, myTeamId, currentRound) {
  state.transferRequests = state.transferRequests || [];
  const team = state.teams[myTeamId];
  if (!team) return [];

  const newReqs = [];
  for (const pid of team.squad) {
    const p = state.players[pid];
    if (!p) continue;
    if (p.status?.transferListed) continue;
    if (p.status?.lastRequestRound && currentRound - p.status.lastRequestRound < REQUEST_COOLDOWN_ROUNDS) continue;

    const morale = p.status?.morale ?? 70;
    let chance = 0;
    let reason = null;

    if (morale < 25)      { chance = 0.30; reason = "very_low_morale"; }
    else if (morale < 40) { chance = 0.15; reason = "low_morale"; }
    else if (morale < 55 && p.age >= 30) { chance = 0.08; reason = "veteran_unhappy"; }

    if (!chance || !rng.chance(chance)) continue;

    p.status.lastRequestRound = currentRound;
    const req = {
      id: `req_${currentRound}_${pid}`,
      playerId: pid,
      playerName: p.name,
      reason,
      morale,
      round: currentRound,
      status: "pending",
    };
    state.transferRequests.push(req);
    newReqs.push(req);
  }
  return newReqs;
}

// Resposta: "list" (lista pra vender) | "promise" (acalmar) | "reject" (recusar e bravo)
export function resolveTransferRequest(state, requestId, response) {
  const req = (state.transferRequests || []).find(r => r.id === requestId);
  if (!req || req.status !== "pending") return reject("Solicitação inválida.");
  const player = state.players[req.playerId];
  if (!player) return reject("Jogador não encontrado.");

  if (response === "list") {
    player.status.transferListed = true;
    req.status = "listed";
    return {
      ok: true,
      message: `${player.name} foi listado pra venda. Clubes interessados podem fazer propostas.`,
    };
  }

  if (response === "promise") {
    // Tenta acalmar — recupera moral
    player.status.morale = Math.min(100, (player.status.morale ?? 70) + 22);
    req.status = "kept";
    return {
      ok: true,
      message: `Você conversou com ${player.name} e prometeu mais espaço. Moral recuperada.`,
    };
  }

  if (response === "reject") {
    // Recusa frontalmente — jogador fica mais bravo
    player.status.morale = Math.max(0, (player.status.morale ?? 70) - 18);
    req.status = "rejected_by_club";
    return {
      ok: true,
      message: `Você recusou o pedido de ${player.name}. A moral despencou.`,
    };
  }

  return reject("Resposta inválida.");
}

// Remove um jogador da lista (mudou de ideia)
export function unlistPlayer(state, teamId, playerId) {
  const player = state.players[playerId];
  if (!player) return reject("Jogador não encontrado.");
  if (player.teamId !== teamId) return reject("Jogador não pertence ao seu clube.");
  delete player.status.transferListed;
  return { ok: true, message: `${player.name} retirado da lista de transferência.` };
}

// -------------------- Helpers --------------------
function accept(message) { return { accepted: true, message }; }
function reject(message) { return { accepted: false, message }; }
function fmt(n) { return n.toLocaleString("pt-BR"); }
