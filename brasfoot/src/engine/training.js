// Treinamento Semanal.
//
// A cada rodada, o foco escolhido evolui atributos específicos do elenco.
// Jovens crescem mais rápido. Quem está perto do potencial cresce devagar.
// "Recuperação" não evolui atributos mas restaura fitness e forma.

import { recalcDerived } from "../models/player.js";

export const TRAINING_FOCI = {
  atk:         { label: "Ataque",      icon: "⚔️", attrs: ["finishing", "dribbling"], hint: "Finalização e drible." },
  def:         { label: "Defesa",      icon: "🛡️", attrs: ["defending", "physical"],  hint: "Marcação e físico." },
  fisico:      { label: "Físico",      icon: "💪", attrs: ["physical", "pace"],       hint: "Resistência e velocidade." },
  tecnica:     { label: "Técnica",     icon: "🎯", attrs: ["passing", "dribbling"],   hint: "Passe e drible." },
  goleiro:     { label: "Goleiro",     icon: "🧤", attrs: ["goalkeeping"], onlyGK: true, hint: "Treino exclusivo dos goleiros." },
  recuperacao: { label: "Recuperação", icon: "🧊", attrs: [],                          rest: true,
                 hint: "Sem treino tático — recupera condicionamento e moral.",
                 fitnessRecover: 8, formRecover: 0.3 },
};

export const DEFAULT_TRAINING = "tecnica";
export const FOCUS_KEYS = Object.keys(TRAINING_FOCI);

// Aplica treinamento a um time. Retorna resumo com ganhos.
//   { focusKey, totalGains, playerGains: Map<pid, attrs[]>, rested: number }
export function applyTraining(state, teamId, rng) {
  const team = state.teams[teamId];
  if (!team) return null;
  const focusKey = team.tactics?.training || DEFAULT_TRAINING;
  const focus = TRAINING_FOCI[focusKey];
  if (!focus) return null;

  let totalGains = 0;
  let rested = 0;
  const playerGains = new Map();

  for (const pid of team.squad) {
    const p = state.players[pid];
    if (!p) continue;

    // Foco "Recuperação": só recupera fitness/forma, sem evolução
    if (focus.rest) {
      const oldFit = p.status.fitness ?? 100;
      const oldForm = p.status.form ?? 6.5;
      p.status.fitness = Math.min(100, oldFit + focus.fitnessRecover);
      p.status.form    = Math.min(10,  oldForm + focus.formRecover);
      rested++;
      continue;
    }

    // Restrição de posição (treino só pra goleiros, por ex.)
    if (focus.onlyGK && p.position !== "GOL") continue;

    // Idade afeta velocidade de evolução
    const ageFactor =
      p.age < 22 ? 1.8 :
      p.age < 26 ? 1.3 :
      p.age < 30 ? 1.0 :
                   0.5;

    for (const attr of focus.attrs) {
      // Atributo de goleiro só evolui em GOL
      if (attr === "goalkeeping" && p.position !== "GOL") continue;

      const current = p.attributes[attr];
      if (current >= 99) continue;

      // Espaço até o potencial — perto do teto, evolução lenta
      const headroom = Math.max(0, p.potential - p.overall);
      const baseChance = 0.20 + (headroom / 30);
      const finalChance = Math.min(0.80, baseChance * ageFactor);

      if (rng.chance(finalChance)) {
        p.attributes[attr] = current + 1;
        const list = playerGains.get(pid) || [];
        list.push(attr);
        playerGains.set(pid, list);
        totalGains++;
      }
    }
  }

  // Recalcula overall + marketValue pra quem ganhou algum atributo
  for (const pid of playerGains.keys()) {
    const p = state.players[pid];
    if (p) recalcDerived(p);
  }

  return { focusKey, totalGains, playerGains, rested };
}

// Para a IA: sorteia um foco baseado vagamente no perfil tático do time.
// 4-3-3 ofensivo → ataque mais provável. Defensivo → defesa. Etc.
export function pickAITrainingFocus(rng, formation) {
  const formationBias = {
    "4-3-3":    [["atk", 35], ["tecnica", 25], ["fisico", 15], ["def", 15], ["goleiro", 10]],
    "4-4-2":    [["tecnica", 30], ["atk", 20], ["def", 20], ["fisico", 15], ["goleiro", 15]],
    "3-5-2":    [["atk", 30], ["tecnica", 30], ["fisico", 20], ["def", 10], ["goleiro", 10]],
    "4-2-3-1":  [["tecnica", 30], ["def", 25], ["atk", 20], ["fisico", 15], ["goleiro", 10]],
    "5-3-2":    [["def", 40], ["fisico", 25], ["tecnica", 15], ["atk", 10], ["goleiro", 10]],
    "4-5-1":    [["def", 35], ["tecnica", 25], ["fisico", 20], ["atk", 10], ["goleiro", 10]],
  };
  const weights = formationBias[formation] || formationBias["4-4-2"];
  const total = weights.reduce((s, [, w]) => s + w, 0);
  let pick = rng.next() * total;
  for (const [key, w] of weights) {
    pick -= w;
    if (pick <= 0) return key;
  }
  return DEFAULT_TRAINING;
}
