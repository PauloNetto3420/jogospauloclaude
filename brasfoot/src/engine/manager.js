// Carreira do Treinador.
//
// O treinador (você) tem uma reputação própria (0-100, mesma escala da
// "estatura" dos clubes). Ela cresce com títulos e metas cumpridas e cai com
// fracassos. A reputação governa o mercado de trabalho: ao ser demitido, os
// clubes que te oferecem o cargo são filtrados pela sua reputação — quanto
// mais títulos, mais clubes (e mais fortes) se interessam. Clubes grandes
// também podem te "roubar" (poaching) após uma temporada brilhante.

import { findNationalCompId } from "./board.js";

const NATIONAL_COMPS = ["brasileirao_a", "brasileirao_b", "brasileirao_c_p1"];

// Ganho de reputação por título conquistado, por tipo de competição.
const TITLE_REP = {
  brasileirao_a: 9,
  brasileirao_b: 6,
  brasileirao_c: 4,
  copa_brasil: 7,
  estadual: 2, // qualquer estadual_*
};

function titleRep(competitionId) {
  if (TITLE_REP[competitionId] != null) return TITLE_REP[competitionId];
  if (competitionId.startsWith("estadual_")) return TITLE_REP.estadual;
  return 1;
}

const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(v)));

// Inicializa o perfil do treinador no começo de um save.
export function initManager(state, teamId, name = "Você") {
  const team = state.teams[teamId];
  const baseRep = clamp(40 + ((team?.reputation ?? 50) - 40) * 0.4);
  state.manager = {
    name,
    reputation: baseRep,
    titles: [],                                   // [{competitionId, season, teamId}]
    jobs: [{ teamId, fromSeason: state.season, toSeason: null }],
    seasonsManaged: 0,
  };
  return state.manager;
}

// Títulos que o clube gerenciado conquistou NESTA temporada (de team.trophies).
export function titlesWonThisSeason(state, season) {
  const team = state.teams[state.managedTeamId];
  return (team?.trophies || []).filter(t => t.season === season);
}

// Atualiza a reputação do treinador no fim da temporada, a partir da avaliação
// da meta e dos títulos conquistados. Retorna o detalhamento.
export function updateManagerAfterSeason(state, evalResult, season) {
  const mgr = state.manager;
  if (!mgr) return null;

  const titles = titlesWonThisSeason(state, season);
  let delta = 0;
  for (const t of titles) {
    delta += titleRep(t.competitionId);
    if (!mgr.titles.some(x => x.competitionId === t.competitionId && x.season === t.season)) {
      mgr.titles.push({ ...t, teamId: state.managedTeamId });
    }
  }

  if (evalResult) {
    if (evalResult.exceeded) delta += 5;
    else if (evalResult.met) delta += 3;
    else if (evalResult.failedBadly) delta -= 8;
    else delta -= 3; // não cumpriu, mas sem desastre
  }

  const before = mgr.reputation;
  mgr.reputation = clamp(mgr.reputation + delta);
  mgr.seasonsManaged += 1;
  return { repDelta: mgr.reputation - before, titlesThisSeason: titles, reputation: mgr.reputation };
}

// Decide se o treinador é demitido. Só demite em fracasso retumbante
// (rebaixamento ou colapso bem abaixo da meta) — não punir por não alcançar
// uma meta ambiciosa em si.
export function decideDismissal(evalResult) {
  if (!evalResult) return { fired: false, reason: null };
  if (evalResult.failedBadly) {
    return {
      fired: true,
      reason: evalResult.finalPos && evalResult.total && evalResult.finalPos > evalResult.total - 5
        ? "rebaixamento"
        : "campanha muito abaixo do esperado",
    };
  }
  return { fired: false, reason: null };
}

// Lista os clubes nacionais (exceto o excluído) com reputação.
function candidatePool(state, excludeTeamId) {
  const seen = new Set();
  const pool = [];
  for (const cid of NATIONAL_COMPS) {
    const comp = state.competitions[cid];
    if (!comp) continue;
    for (const id of comp.teams) {
      if (id === excludeTeamId || seen.has(id)) continue;
      seen.add(id);
      pool.push({ teamId: id, compId: cid, reputation: state.teams[id]?.reputation ?? 50 });
    }
  }
  return pool;
}

// Gera propostas de emprego após a demissão. Clubes se interessam se sua
// reputação >= reputação_do_clube - 6 (clubes mais fortes só com treinador
// renomado). Sempre garante ao menos 1 proposta (o menor clube disponível).
export function generateJobOffers(state, rng, { excludeTeamId, max = 3 } = {}) {
  const mgr = state.manager;
  const repCap = (mgr?.reputation ?? 40) + 6;
  const pool = candidatePool(state, excludeTeamId);

  let interested = pool.filter(c => c.reputation <= repCap);
  if (!interested.length && pool.length) {
    // Garante um recomeço: o clube de menor reputação topa te contratar.
    interested = [pool.slice().sort((a, b) => a.reputation - b.reputation)[0]];
  }

  // Mais prestigiados primeiro; desempate determinístico por rng.
  interested.sort((a, b) => (b.reputation - a.reputation) || (rng.next() - 0.5));
  return interested.slice(0, max).map(c => labelOffer(state, c, false));
}

// Propostas de "assédio" (poaching): após uma grande temporada, clubes
// MAIORES que o atual podem te convidar. Pode vir vazio.
export function generatePoachOffers(state, rng, { currentTeamId, max = 2 } = {}) {
  const mgr = state.manager;
  const currentRep = state.teams[currentTeamId]?.reputation ?? 50;
  const repCap = (mgr?.reputation ?? 40) + 10;
  const pool = candidatePool(state, currentTeamId)
    .filter(c => c.reputation > currentRep + 6 && c.reputation <= repCap);
  pool.sort((a, b) => (b.reputation - a.reputation) || (rng.next() - 0.5));
  return pool.slice(0, max).map(c => labelOffer(state, c, true));
}

function labelOffer(state, c, voluntary) {
  const compName = ({
    brasileirao_a: "Série A", brasileirao_b: "Série B", brasileirao_c_p1: "Série C",
  })[c.compId] || "—";
  return {
    teamId: c.teamId,
    name: state.teams[c.teamId]?.name ?? c.teamId,
    compId: c.compId,
    division: compName,
    reputation: c.reputation,
    voluntary,
  };
}

// Efetiva a troca de clube: fecha o vínculo atual e abre um novo.
export function acceptJob(state, teamId, season) {
  const mgr = state.manager;
  if (mgr) {
    const last = mgr.jobs[mgr.jobs.length - 1];
    if (last && last.toSeason == null) last.toSeason = season;
    mgr.jobs.push({ teamId, fromSeason: season, toSeason: null });
  }
  state.managedTeamId = teamId;
  return teamId;
}
