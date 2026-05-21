// Motor de simulação de partida.
//
// API pública:
//   simulateMatch({ homeTeam, awayTeam, playersById, rng })
//     -> { score, events, lineups, stats }
//
// Não muta os times nem os jogadores recebidos. O caller decide se aplica
// cartões/lesões/forma ao estado global depois (próximo módulo: temporada).

import { createRng } from "../utils/rng.js";

// -------------------- Configuração balanceável --------------------
const CONFIG = {
  homeAdvantage: 0.08,            // +8% em ataque e defesa do mandante
  baseAttackChancePerMin: 0.18,   // probabilidade base de uma "jogada perigosa" por minuto/time
  yellowChancePerMin: 0.012,      // ~1 amarelo a cada ~83 min → ~1 por time/partida
  redChancePerMin: 0.0008,        // raro
  injuryChancePerMin: 0.00015,    // ~1 lesão a cada ~7 partidas por time (estatística realista)
  fatigueLossPerMin: 0.4,         // fitness perdido por minuto em campo
};

// Formações disponíveis. Cada uma define:
//  - slots: quantos jogadores por grupo (GOL/DEF/MID/ATA) o auto-XI escala
//  - atk/def: multiplicadores aplicados à força do time (trade-off tático)
//
// O usuário pode trocar entre essas opções na tela de Escalação.
// Wingers (PE/PD) entram em ATA — fórmulas calibradas considerando isso.
export const FORMATIONS = {
  "4-3-3":   { slots: { GOL: 1, DEF: 4, MID: 3, ATA: 3 }, atk: 1.10, def: 0.95, label: "Ofensivo · 4-3-3" },
  "4-4-2":   { slots: { GOL: 1, DEF: 4, MID: 4, ATA: 2 }, atk: 1.00, def: 1.00, label: "Clássico · 4-4-2" },
  "3-5-2":   { slots: { GOL: 1, DEF: 3, MID: 5, ATA: 2 }, atk: 1.05, def: 0.92, label: "Posse · 3-5-2" },
  "4-2-3-1": { slots: { GOL: 1, DEF: 4, MID: 5, ATA: 1 }, atk: 0.95, def: 1.05, label: "Moderno · 4-2-3-1" },
  "5-3-2":   { slots: { GOL: 1, DEF: 5, MID: 3, ATA: 2 }, atk: 0.88, def: 1.18, label: "Retrancado · 5-3-2" },
  "4-5-1":   { slots: { GOL: 1, DEF: 4, MID: 5, ATA: 1 }, atk: 0.90, def: 1.12, label: "Cauteloso · 4-5-1" },
};

const DEFAULT_FORMATION = "4-3-3";

function getFormation(team) {
  return FORMATIONS[team?.tactics?.formation] || FORMATIONS[DEFAULT_FORMATION];
}

const POS_GROUP = {
  GOL: "GOL",
  ZAG: "DEF", LD: "DEF", LE: "DEF",
  VOL: "MID", MEI: "MID",
  PE: "ATA", PD: "ATA", ATA: "ATA",
};

// -------------------- Escalação --------------------
function pickStartingXI(team, playersById) {
  // Se o usuário definiu uma escalação manual, usa ela (filtrando aptos)
  if (Array.isArray(team.lineup) && team.lineup.length >= 7) {
    const manual = team.lineup
      .map(pid => playersById[pid])
      .filter(p => p && !p.status.injury && p.status.suspendedMatches === 0);
    if (manual.length >= 7) return manual.slice(0, 11);
  }

  const available = team.squad
    .map(pid => playersById[pid])
    .filter(p => p && !p.status.injury && p.status.suspendedMatches === 0);

  const buckets = { GOL: [], DEF: [], MID: [], ATA: [] };
  for (const p of available) {
    const group = POS_GROUP[p.position];
    if (group) buckets[group].push(p);
  }
  for (const g of Object.keys(buckets)) {
    buckets[g].sort((a, b) => b.overall - a.overall);
  }

  const slots = getFormation(team).slots;
  const xi = [];
  for (const [group, count] of Object.entries(slots)) {
    xi.push(...buckets[group].slice(0, count));
  }

  // Se faltou alguém (elenco curto na posição), completa com sobras
  if (xi.length < 11) {
    const used = new Set(xi.map(p => p.id));
    const rest = available.filter(p => !used.has(p.id))
      .sort((a, b) => b.overall - a.overall);
    while (xi.length < 11 && rest.length) xi.push(rest.shift());
  }

  return xi;
}

// -------------------- Forças do time --------------------
function calcTeamStrength(xi) {
  const gk = xi.find(p => p.position === "GOL");
  const defenders = xi.filter(p => POS_GROUP[p.position] === "DEF");
  const mids      = xi.filter(p => POS_GROUP[p.position] === "MID");
  const attackers = xi.filter(p => POS_GROUP[p.position] === "ATA");

  const avg = (arr, attr) =>
    arr.length ? arr.reduce((s, p) => s + p.attributes[attr], 0) / arr.length : 30;

  // Ataque puxa de meio-campo e ataque (finalização + drible + passe + velocidade)
  const attackPool = [...mids, ...attackers];
  const attack =
    avg(attackPool, "finishing") * 0.40 +
    avg(attackPool, "dribbling") * 0.20 +
    avg(attackPool, "passing")   * 0.20 +
    avg(attackPool, "pace")      * 0.20;

  // Defesa puxa de zaga e volância
  const defensePool = [...defenders, ...mids];
  const defense =
    avg(defensePool, "defending") * 0.50 +
    avg(defensePool, "physical")  * 0.25 +
    avg(defensePool, "pace")      * 0.25;

  const goalkeeping = gk ? gk.attributes.goalkeeping : 30;

  // Multiplicador de forma e moral do XI
  const { formMult, moraleMult } = teamModifiers(xi);

  return {
    attack:      attack      * formMult * moraleMult,
    defense:     defense     * formMult * moraleMult,
    goalkeeping: goalkeeping * formMult * moraleMult,
  };
}

// Forma e moral médias do XI viram multiplicadores no entorno de 1.
// Forma: ±8% no extremo (1.0 a 10.0; média 6.5).
// Moral: ±5% no extremo (0 a 100; média 70).
function teamModifiers(xi) {
  if (!xi.length) return { formMult: 1, moraleMult: 1 };
  const avgForm   = xi.reduce((s, p) => s + (p.status?.form   ?? 6.5), 0) / xi.length;
  const avgMorale = xi.reduce((s, p) => s + (p.status?.morale ?? 70),  0) / xi.length;
  const formMult   = 1 + (avgForm   - 6.5) * 0.023;   // 10 → +8%, 1 → -12%
  const moraleMult = 1 + (avgMorale - 70)  * 0.0017;  // 100 → +5%, 0 → -12%
  return { formMult, moraleMult };
}

// -------------------- Sorteios de "quem fez" --------------------
function weightedPick(rng, items, weightFn) {
  const total = items.reduce((s, x) => s + weightFn(x), 0);
  if (total <= 0) return rng.pick(items);
  let r = rng.next() * total;
  for (const x of items) {
    r -= weightFn(x);
    if (r <= 0) return x;
  }
  return items[items.length - 1];
}

function pickScorer(rng, xi) {
  // Atacantes 5x mais prováveis, meias 2x, defensores 0.5x, GOL ~0
  const weight = (p) => {
    const g = POS_GROUP[p.position];
    if (g === "ATA") return p.attributes.finishing * 5;
    if (g === "MID") return p.attributes.finishing * 2;
    if (g === "DEF") return p.attributes.finishing * 0.5;
    return 0.1;
  };
  return weightedPick(rng, xi, weight);
}

function pickFouler(rng, xi) {
  // Defensores e volantes cometem mais faltas; físicos mais agressivos
  const weight = (p) => {
    const g = POS_GROUP[p.position];
    const base = (100 - p.attributes.defending) * 0.2 + p.attributes.physical * 0.5;
    if (g === "DEF") return base * 1.8;
    if (g === "MID") return base * 1.5;
    if (g === "ATA") return base * 0.7;
    return 0.1;
  };
  return weightedPick(rng, xi, weight);
}

function pickInjured(rng, xi) {
  // Qualquer um pode se machucar; trait "lesoes_frequentes" triplica
  const weight = (p) =>
    1 + (p.traits?.includes("lesoes_frequentes") ? 3 : 0);
  return weightedPick(rng, xi, weight);
}

// -------------------- Simulador stateful (interativo) --------------------
// Permite substituições e qualquer outra mudança de XI durante o jogo.
// O caller chama .tick() a cada minuto, .substitute() entre minutos.
export function createMatchSimulator({ homeTeam, awayTeam, playersById, rng }) {
  rng = rng || createRng(Date.now());

  const homeXI = pickStartingXI(homeTeam, playersById);
  const awayXI = pickStartingXI(awayTeam, playersById);

  // Forfeit: time não consegue escalar minimamente
  if (homeXI.length < 7 || awayXI.length < 7) {
    const forfeitResult = forfeit(homeTeam, awayTeam, homeXI, awayXI);
    return {
      isForfeit: true, forfeitResult,
      minute: 90,
      isFinished: () => true,
      tick: () => [],
      substitute: () => ({ ok: false, message: "W.O." }),
      closeWindow: () => {},
      canSubstitute: () => ({ subsLeft: 0, windowsLeft: 0, onField: [], bench: [] }),
      getResult: () => forfeitResult,
    };
  }

  let homeStr = buildStrength(homeTeam, homeXI, true);
  let awayStr = buildStrength(awayTeam, awayXI, false);

  const homeOnField = [...homeXI];
  const awayOnField = [...awayXI];
  const carded = new Map();
  const events = [];
  const stats = {
    home: { shots: 0, shotsOnTarget: 0, fouls: 0, yellows: 0, reds: 0 },
    away: { shots: 0, shotsOnTarget: 0, fouls: 0, yellows: 0, reds: 0 },
  };
  const score = { home: 0, away: 0 };
  let minute = 0;

  // Conjunto de jogadores que já entraram no jogo (titular ou após sub)
  const seen = {
    home: new Set(homeXI.map(p => p.id)),
    away: new Set(awayXI.map(p => p.id)),
  };
  const subTrack = {
    home: { subsUsed: 0, windowsUsed: 0 },
    away: { subsUsed: 0, windowsUsed: 0 },
  };

  function teamOf(side)   { return side === "home" ? homeTeam : awayTeam; }
  function xiOf(side)     { return side === "home" ? homeOnField : awayOnField; }
  function isHomeSide(s)  { return s === "home"; }

  function benchOf(side) {
    const team = teamOf(side);
    const used = seen[side];
    return team.squad
      .map(pid => playersById[pid])
      .filter(p => p && !used.has(p.id) && !p.status.injury && p.status.suspendedMatches === 0);
  }

  function tick() {
    if (minute >= 90) return [];
    minute++;
    const before = events.length;
    tickSide({
      minute, rng, events, stats, score,
      side: "home",
      team: homeTeam, xi: homeOnField,
      attackStr: homeStr.attack,
      oppDefense: awayStr.defense,
      oppGK: awayStr.goalkeeping,
      carded,
    });
    tickSide({
      minute, rng, events, stats, score,
      side: "away",
      team: awayTeam, xi: awayOnField,
      attackStr: awayStr.attack,
      oppDefense: homeStr.defense,
      oppGK: homeStr.goalkeeping,
      carded,
    });
    return events.slice(before);
  }

  function substitute(side, outId, inId) {
    if (subTrack[side].subsUsed >= 5) {
      return { ok: false, message: "Limite de 5 substituições atingido." };
    }
    if (subTrack[side].windowsUsed >= 3) {
      return { ok: false, message: "Limite de 3 paradas para substituição atingido." };
    }
    const xi = xiOf(side);
    const outIdx = xi.findIndex(p => p.id === outId);
    if (outIdx < 0) return { ok: false, message: "Jogador não está em campo." };

    const inPlayer = benchOf(side).find(p => p.id === inId);
    if (!inPlayer) return { ok: false, message: "Reserva indisponível." };

    const outPlayer = xi[outIdx];
    xi.splice(outIdx, 1, inPlayer);
    seen[side].add(inId);
    subTrack[side].subsUsed += 1;

    events.push({
      minute: Math.max(1, minute), type: "sub", side,
      teamId: teamOf(side).id,
      playerOut: outPlayer.id, playerOutName: outPlayer.name,
      playerIn: inPlayer.id, playerInName: inPlayer.name,
      description: `🔄 ${Math.max(1, minute)}' ${outPlayer.name} → ${inPlayer.name}`,
    });

    // Recalcula força (entrou jogador novo)
    if (isHomeSide(side)) homeStr = buildStrength(homeTeam, homeOnField, true);
    else                  awayStr = buildStrength(awayTeam, awayOnField, false);

    return { ok: true };
  }

  // Fecha a "janela" — chamado quando o caller termina um pacote de subs.
  // Cada janela usada conta no limite de 3.
  function closeWindow(side, didSub) {
    if (didSub) subTrack[side].windowsUsed += 1;
  }

  function canSubstitute(side) {
    return {
      subsLeft: 5 - subTrack[side].subsUsed,
      windowsLeft: 3 - subTrack[side].windowsUsed,
      subsUsed: subTrack[side].subsUsed,
      windowsUsed: subTrack[side].windowsUsed,
      onField: xiOf(side),
      bench: benchOf(side),
    };
  }

  function getResult() {
    return {
      homeTeamId: homeTeam.id,
      awayTeamId: awayTeam.id,
      score: { ...score },
      events,
      stats,
      lineups: {
        home: homeXI.map(p => ({ id: p.id, name: p.name, position: p.position, overall: p.overall })),
        away: awayXI.map(p => ({ id: p.id, name: p.name, position: p.position, overall: p.overall })),
      },
      strengths: { home: homeStr, away: awayStr },
    };
  }

  return {
    isForfeit: false,
    get minute() { return minute; },
    get score()  { return score; },
    get events() { return events; },
    get stats()  { return stats; },
    tick, substitute, closeWindow, canSubstitute,
    isFinished: () => minute >= 90,
    getResult,
  };
}

// Constrói força final do time: atributos → formação → mando.
function buildStrength(team, xi, isHome) {
  let str = calcTeamStrength(xi);
  str = applyFormation(str, getFormation(team));
  str = applyHomeAdvantage(str, isHome ? CONFIG.homeAdvantage : 0);
  return str;
}

// -------------------- Simulação one-shot (wrapper) --------------------
// Usado para todas as partidas da IA — roda o simulador até o fim.
// A IA também substitui automaticamente em 2 momentos (60' e 75').
export function simulateMatch(opts) {
  const sim = createMatchSimulator(opts);
  if (sim.isForfeit) return sim.forfeitResult;

  const subMoments = [60, 75];
  while (!sim.isFinished()) {
    sim.tick();
    if (subMoments.includes(sim.minute)) {
      aiAutoSubs(sim, "home", opts.playersById, opts.rng);
      aiAutoSubs(sim, "away", opts.playersById, opts.rng);
    }
  }
  return sim.getResult();
}

// Heurística simples: se há reserva com overall maior que algum titular
// (mesma posição), troca. Limita a 1-2 subs por janela.
function aiAutoSubs(sim, side, playersById, rng) {
  const info = sim.canSubstitute(side);
  if (info.subsLeft <= 0 || info.windowsLeft <= 0) return;

  let didSub = false;
  const maxThisWindow = Math.min(2, info.subsLeft);

  for (let i = 0; i < maxThisWindow; i++) {
    const fresh = sim.canSubstitute(side);
    if (fresh.subsLeft <= 0) break;

    // Pra cada reserva, vê se substitui alguém da mesma posição com OVR menor
    let bestSwap = null;
    for (const benchPlayer of fresh.bench) {
      const candidate = fresh.onField.find(p =>
        POS_GROUP[p.position] === POS_GROUP[benchPlayer.position] &&
        benchPlayer.overall > p.overall + 2
      );
      if (candidate) {
        const gain = benchPlayer.overall - candidate.overall;
        if (!bestSwap || gain > bestSwap.gain) {
          bestSwap = { out: candidate, in: benchPlayer, gain };
        }
      }
    }

    if (bestSwap && rng.chance(0.6)) {
      sim.substitute(side, bestSwap.out.id, bestSwap.in.id);
      didSub = true;
    } else {
      break;
    }
  }
  if (didSub) sim.closeWindow(side, true);
}

function applyHomeAdvantage(str, boost) {
  return {
    attack: str.attack * (1 + boost),
    defense: str.defense * (1 + boost),
    goalkeeping: str.goalkeeping * (1 + boost * 0.5),
  };
}

function applyFormation(str, formation) {
  return {
    attack: str.attack * formation.atk,
    defense: str.defense * formation.def,
    goalkeeping: str.goalkeeping,
  };
}

function tickSide({ minute, rng, events, stats, score, side, team, xi, attackStr, oppDefense, oppGK, carded }) {
  if (xi.length < 7) return; // time abandonado por expulsões

  // 1) Jogada perigosa?
  const dangerProb =
    CONFIG.baseAttackChancePerMin *
    (attackStr / (attackStr + oppDefense)) *
    (xi.length / 11); // menos jogadores = menos chances

  if (rng.chance(dangerProb)) {
    stats[side].shots++;
    const shooter = pickScorer(rng, xi);

    // Chance de ir ao gol: finalização do batedor vs goleiro
    const onTargetProb = shooter.attributes.finishing / (shooter.attributes.finishing + 40);
    if (rng.chance(onTargetProb)) {
      stats[side].shotsOnTarget++;

      // Chance de defesa do GK
      const saveProb = oppGK / (oppGK + shooter.attributes.finishing * 1.1);
      if (!rng.chance(saveProb)) {
        score[side]++;
        events.push({
          minute, type: "goal", side,
          teamId: team.id,
          playerId: shooter.id,
          playerName: shooter.name,
          description: `⚽ ${minute}' GOL de ${shooter.name} (${team.shortName})`,
        });
      }
    }
  }

  // 2) Cartão amarelo?
  if (rng.chance(CONFIG.yellowChancePerMin)) {
    const fouler = pickFouler(rng, xi);
    stats[side].fouls++;
    const prev = carded.get(fouler.id);
    if (prev === "yellow") {
      // segundo amarelo = vermelho
      carded.set(fouler.id, "red");
      removeFromField(xi, fouler.id);
      stats[side].reds++;
      events.push({
        minute, type: "red", side,
        teamId: team.id, playerId: fouler.id, playerName: fouler.name,
        description: `🟥 ${minute}' ${fouler.name} expulso (2º amarelo)`,
      });
    } else if (!prev) {
      carded.set(fouler.id, "yellow");
      stats[side].yellows++;
      events.push({
        minute, type: "yellow", side,
        teamId: team.id, playerId: fouler.id, playerName: fouler.name,
        description: `🟨 ${minute}' Amarelo para ${fouler.name}`,
      });
    }
  }

  // 3) Vermelho direto?
  if (rng.chance(CONFIG.redChancePerMin)) {
    const fouler = pickFouler(rng, xi);
    if (!carded.get(fouler.id) || carded.get(fouler.id) === "yellow") {
      carded.set(fouler.id, "red");
      removeFromField(xi, fouler.id);
      stats[side].reds++;
      events.push({
        minute, type: "red", side,
        teamId: team.id, playerId: fouler.id, playerName: fouler.name,
        description: `🟥 ${minute}' ${fouler.name} expulso (direto)`,
      });
    }
  }

  // 4) Lesão?
  if (rng.chance(CONFIG.injuryChancePerMin * xi.length)) {
    const injured = pickInjured(rng, xi);
    const weeks = rollInjuryWeeks(rng);
    removeFromField(xi, injured.id);
    events.push({
      minute, type: "injury", side,
      teamId: team.id, playerId: injured.id, playerName: injured.name,
      weeksOut: weeks,
      description: `🤕 ${minute}' ${injured.name} sai lesionado (${weeks} semana${weeks > 1 ? "s" : ""})`,
    });
  }
}

function removeFromField(xi, playerId) {
  const idx = xi.findIndex(p => p.id === playerId);
  if (idx >= 0) xi.splice(idx, 1);
}

// Distribuição de gravidade da lesão. Maioria leve, poucas longas.
//   60% → 1-2 sem (entorse, pancada)
//   30% → 3-5 sem (muscular)
//   10% → 6-12 sem (ruptura, fratura)
function rollInjuryWeeks(rng) {
  const r = rng.next();
  if (r < 0.60) return rng.int(1, 2);
  if (r < 0.90) return rng.int(3, 5);
  return rng.int(6, 12);
}

// W.O. quando algum time não consegue escalar minimamente
function forfeit(homeTeam, awayTeam, homeXI, awayXI) {
  const homeOk = homeXI.length >= 7;
  return {
    homeTeamId: homeTeam.id,
    awayTeamId: awayTeam.id,
    score: { home: homeOk ? 3 : 0, away: homeOk ? 0 : 3 },
    events: [{
      minute: 0, type: "forfeit",
      description: `W.O.: ${homeOk ? awayTeam.name : homeTeam.name} não conseguiu escalar 7 jogadores`,
    }],
    stats: { home: blankStats(), away: blankStats() },
    lineups: { home: homeXI, away: awayXI },
    strengths: null,
  };
}

function blankStats() {
  return { shots: 0, shotsOnTarget: 0, fouls: 0, yellows: 0, reds: 0 };
}
