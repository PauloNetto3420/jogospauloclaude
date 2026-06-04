// Metas da Diretoria.
//
// A cada temporada a diretoria do clube gerenciado define um objetivo,
// calibrado pela "estatura" do clube (reputação) dentro da sua divisão.
// Durante a temporada a confiança é estimada pela posição atual vs. a meta;
// no fim, a meta é avaliada (cumprida / superada / fracassada) e o resultado
// alimenta o bônus financeiro, a reputação do treinador e a decisão de
// demissão (em manager.js).

import { sortStandings } from "./season.js";

// Competições nacionais onde um clube pode estar (na ordem de divisão).
const NATIONAL_COMPS = ["brasileirao_a", "brasileirao_b", "brasileirao_c_p1"];

export const OBJECTIVE_LABELS = {
  title:       "Brigar pelo título",
  libertadores:"Vaga na Libertadores",
  top_half:    "Primeira metade da tabela",
  survival_a:  "Permanência na Série A",
  promotion:   "Acesso à Série A",
  midtable_b:  "Meio de tabela",
  survival_b:  "Permanência na Série B",
  promotion_c: "Acesso à Série B",
  midtable_c:  "Campanha digna na Série C",
};

// Descobre a competição nacional do clube (A, B ou C-fase1).
export function findNationalCompId(state, teamId) {
  for (const cid of NATIONAL_COMPS) {
    const c = state.competitions[cid];
    if (c?.teams?.includes(teamId)) return cid;
  }
  return null;
}

// Percentil de reputação do clube dentro da sua divisão (0 = melhor, 1 = pior).
function reputationPercentile(state, compId, teamId) {
  const comp = state.competitions[compId];
  const reps = comp.teams
    .map(id => ({ id, rep: state.teams[id]?.reputation ?? 50 }))
    .sort((a, b) => b.rep - a.rep);
  const rank = reps.findIndex(r => r.id === teamId);
  return reps.length > 1 ? rank / (reps.length - 1) : 0;
}

// Define a meta da temporada para o clube e zera a confiança em 60.
// Guarda em team.board = { objective, confidence }.
export function assignBoardObjective(state, teamId) {
  const team = state.teams[teamId];
  if (!team) return null;
  const compId = findNationalCompId(state, teamId);
  const season = state.season;

  // Sem competição nacional encontrada (ex.: clube só de estadual): meta neutra.
  if (!compId) {
    team.board = { objective: { kind: "midtable_c", label: OBJECTIVE_LABELS.midtable_c, targetPos: null, compId: null, season }, confidence: 60 };
    return team.board;
  }

  const total = state.competitions[compId].teams.length;
  const pct = reputationPercentile(state, compId, teamId);
  let kind, targetPos;

  if (compId === "brasileirao_a") {
    if (pct <= 0.20)      { kind = "libertadores"; targetPos = 6; }
    else if (pct <= 0.65) { kind = "top_half";     targetPos = Math.ceil(total / 2); }
    else                  { kind = "survival_a";   targetPos = total - 4; }
  } else if (compId === "brasileirao_b") {
    if (pct <= 0.30)      { kind = "promotion";   targetPos = 4; }
    else if (pct <= 0.70) { kind = "midtable_b";  targetPos = Math.ceil(total / 2); }
    else                  { kind = "survival_b";  targetPos = total - 4; }
  } else { // Série C
    if (pct <= 0.40)      { kind = "promotion_c"; targetPos = 4; }
    else                  { kind = "midtable_c";  targetPos = Math.ceil(total / 2); }
  }

  team.board = {
    objective: { kind, label: OBJECTIVE_LABELS[kind], targetPos, compId, season },
    confidence: 60,
  };
  return team.board;
}

// Posição atual do clube na sua competição (1-based), ou null se sem jogos.
function currentPosition(state, compId, teamId) {
  const comp = state.competitions[compId];
  if (!comp) return null;
  const anyPlayed = comp.fixtures?.some(m => m.played);
  if (!anyPlayed) return null;
  const sorted = sortStandings(comp, state.teams);
  const idx = sorted.findIndex(s => s.teamId === teamId);
  return idx >= 0 ? idx + 1 : null;
}

// Estima a confiança da diretoria (0-100) pela posição atual vs. a meta.
// Acima da meta → alta; muito abaixo → baixa. Sem jogos → confiança inicial.
export function computeConfidence(state, teamId) {
  const board = state.teams[teamId]?.board;
  if (!board?.objective) return 60;
  const { compId, targetPos } = board.objective;
  if (!compId || targetPos == null) return board.confidence ?? 60;

  const pos = currentPosition(state, compId, teamId);
  if (pos == null) return board.confidence ?? 60;

  // delta > 0 = melhor que a meta (posição menor que o alvo)
  const delta = targetPos - pos;
  const conf = Math.round(62 + delta * 4.5);
  return Math.max(5, Math.min(99, conf));
}

// Avalia a meta no fim da temporada. Lê a posição final da competição
// (ANTES de as competições serem recriadas) e o report de fim de temporada.
//   { met, exceeded, failedBadly, champion, finalPos, total, label, kind }
export function evaluateObjective(state, teamId, report) {
  const board = state.teams[teamId]?.board;
  if (!board?.objective) return null;
  const obj = board.objective;

  // Série C (acesso via quadrangular): avaliada pelo serieCMeta.
  if (obj.compId === "brasileirao_c_p1" || obj.kind === "promotion_c" || obj.kind === "midtable_c") {
    const promoted = state.serieCMeta?.promoted || [];
    const champion = state.serieCMeta?.champion === teamId;
    const met = obj.kind === "promotion_c" ? promoted.includes(teamId) : true;
    return {
      met, exceeded: champion, failedBadly: false, champion,
      finalPos: null, total: null, label: obj.label, kind: obj.kind,
    };
  }

  const comp = state.competitions[obj.compId];
  const sorted = comp ? sortStandings(comp, state.teams) : [];
  const idx = sorted.findIndex(s => s.teamId === teamId);
  const finalPos = idx >= 0 ? idx + 1 : null;
  const total = comp?.teams?.length ?? null;

  const relegated = (report.relegated || []).includes(teamId)
    || (report.relegatedToC || []).includes(teamId);
  const champion = finalPos === 1;

  const target = obj.targetPos;
  const met = finalPos != null && target != null ? finalPos <= target : false;
  const exceeded = met && (champion || (target != null && finalPos <= Math.max(1, target - 4)));
  const failedBadly = relegated
    || (finalPos != null && target != null && finalPos >= target + 8);

  return { met, exceeded, failedBadly, champion, finalPos, total, label: obj.label, kind: obj.kind };
}
