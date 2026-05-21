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
export function makeBid(state, { fromTeamId, playerId, fee, salaryOffer }) {
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
export function signFreeAgent(state, { teamId, playerId, salaryOffer }) {
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

export function runAITransfers(state, rng, { excludeTeamId } = {}) {
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

// -------------------- Helpers --------------------
function accept(message) { return { accepted: true, message }; }
function reject(message) { return { accepted: false, message }; }
function fmt(n) { return n.toLocaleString("pt-BR"); }
