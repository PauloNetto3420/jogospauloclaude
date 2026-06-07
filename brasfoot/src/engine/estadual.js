// Campeonatos Estaduais (pré-temporada).
//
// MVP: 4 estados (SP, RJ, MG, RS). Cada estadual tem:
//   - Fase de grupos (turno único dentro de cada grupo)
//     · > 8 times → 2 grupos · ≤ 8 times → 1 grupo
//   - Mata-mata: classificados → semifinais (jogo único) → final (jogo único)
//     · 2 grupos → top 2 de cada (1A×2B, 1B×2A)
//     · 1 grupo  → top 4 (1×4, 2×3)
//
// Cada GRUPO é uma competição comum (createCompetition) guardada em
// state.competitions["estadual_<uf>_g<i>"] — assim reaproveita applyMatchResult
// e getMatchesOfRound. O mata-mata vive em state.estaduais[uf].knockout.
//
// O conjunto roda numa FASE de pré-temporada, antes do Brasileirão.

import { createCompetition } from "../models/competition.js";
import {
  createPaulistaPhase1, createPaulistaKnockout, advancePaulistaKnockout,
  applyPaulistaKnockoutResult, getPaulistaKnockoutLegs,
  getPaulistaQualified, getPaulistaRelegated,
  PAULISTA_POTS, PAULISTA_TEAM_IDS, PAULISTA_GROUP_ROUNDS, PAULISTA_TOTAL_ROUNDS,
  PAULISTA_QUARTERS_ROUND, PAULISTA_SEMIS_ROUND,
  PAULISTA_FINAL_LEG1_ROUND, PAULISTA_FINAL_LEG2_ROUND, PAULISTA_CHAMPION_PRIZE,
} from "./paulista.js";
import {
  createCariocaPhase1, createCariocaKnockout, advanceCariocaKnockout,
  applyCariocaKnockoutResult, getCariocaKnockoutLegs, getCariocaQualified,
  CARIOCA_GROUP_ROUNDS, CARIOCA_TOTAL_ROUNDS, CARIOCA_CHAMPION_PRIZE,
} from "./carioca.js";
import {
  createMineiroPhase1, createMineiroKnockout, advanceMineiroKnockout,
  applyMineiroKnockoutResult, getMineiroKnockoutLegs, getMineiroQualified,
  MINEIRO_TEAM_IDS, MINEIRO_GROUP_ROUNDS, MINEIRO_TOTAL_ROUNDS,
  MINEIRO_SEMI_LEG1_ROUND, MINEIRO_CHAMPION_PRIZE,
} from "./mineiro.js";
import {
  createGauchoPhase1, createGauchoKnockout, advanceGauchoKnockout,
  applyGauchoKnockoutResult, getGauchoKnockoutLegs, getGauchoQualified,
  GAUCHO_GROUP_ROUNDS, GAUCHO_TOTAL_ROUNDS, GAUCHO_CHAMPION_PRIZE,
} from "./gaucho.js";
import {
  createParanaensePhase1, createParanaenseKnockout, advanceParanaenseKnockout,
  applyParanaenseKnockoutResult, getParanaenseKnockoutLegs, getParanaenseQualified,
  PARANAENSE_GROUP_ROUNDS, PARANAENSE_TOTAL_ROUNDS, PARANAENSE_CHAMPION_PRIZE,
} from "./paranaense.js";
import {
  createBaianoPhase1, createBaianoKnockout, advanceBaianoKnockout,
  applyBaianoKnockoutResult, getBaianoKnockoutLegs, getBaianoQualified,
  BAIANO_PHASE1_ROUNDS, BAIANO_TOTAL_ROUNDS, BAIANO_CHAMPION_PRIZE,
} from "./baiano.js";
import {
  createCearensePhase1, createCearensePhase2, createCearenseKnockout,
  advanceCearenseKnockout, applyCearenseKnockoutResult, getCearenseKnockoutLegs,
  getCearenseQualified, getCearenseSemifinalists,
  CEARENSE_PHASE1_ROUNDS, CEARENSE_PHASE2_ROUND_START, CEARENSE_PHASE2_ROUNDS,
  CEARENSE_TOTAL_ROUNDS, CEARENSE_CHAMPION_PRIZE,
} from "./cearense.js";
import {
  createPernambucanoPhase1, createPernambucanoKnockout, advancePernambucanoKnockout,
  applyPernambucanoKnockoutResult, getPernambucanoKnockoutLegs, getPernambucanoQualified,
  PERNAMBUCANO_PHASE1_ROUNDS, PERNAMBUCANO_TOTAL_ROUNDS, PERNAMBUCANO_CHAMPION_PRIZE,
} from "./pernambucano.js";
import {
  createAlagoanoPhase1, createAlagoanoKnockout, advanceAlagoanoKnockout,
  applyAlagoanoKnockoutResult, getAlagoanoKnockoutLegs, getAlagoanoQualified,
  ALAGOANO_PHASE1_ROUNDS, ALAGOANO_TOTAL_ROUNDS, ALAGOANO_CHAMPION_PRIZE,
} from "./alagoano.js";
import {
  createGoianoPhase1, createGoianoKnockout, advanceGoianoKnockout,
  applyGoianoKnockoutResult, getGoianoKnockoutLegs, getGoianoQualified,
  GOIANO_PHASE1_ROUNDS, GOIANO_TOTAL_ROUNDS, GOIANO_CHAMPION_PRIZE,
} from "./goiano.js";
import {
  createCatarinensePhase1, createCatarinenseKnockout, advanceCatarinenseKnockout,
  applyCatarinenseKnockoutResult, getCatarinenseKnockoutLegs, getCatarinenseQualified,
  CATARINENSE_GROUP_ROUNDS, CATARINENSE_TOTAL_ROUNDS, CATARINENSE_CHAMPION_PRIZE,
} from "./catarinense.js";
import {
  createParaensePhase1, createParaenseKnockout, advanceParaenseKnockout,
  applyParaenseKnockoutResult, getParaenseKnockoutLegs, getParaenseQualified,
  PARAENSE_GROUP_ROUNDS, PARAENSE_TOTAL_ROUNDS, PARAENSE_CHAMPION_PRIZE,
} from "./paraense.js";
import {
  createAcreanoPhase1, createAcreanoKnockout, advanceAcreanoKnockout,
  applyAcreanoKnockoutResult, getAcreanoKnockoutLegs, getAcreanoQualified,
  ACREANO_PHASE1_ROUNDS, ACREANO_TOTAL_ROUNDS, ACREANO_CHAMPION_PRIZE,
} from "./acreano.js";
import {
  createAmazonenseT1Phase, createAmazonenseT2Phase, getAmazonenseQualified,
  createTurnoKnockout, advanceTurnoKnockout, applyAmazonenseKnockoutResult,
  getTurnoKnockoutLegs, makeGrandFinal,
  AMAZONENSE_T1_PHASE_ROUNDS, AMAZONENSE_T1_SEMI_ROUND, AMAZONENSE_T1_FINAL_ROUND,
  AMAZONENSE_T2_PHASE_START, AMAZONENSE_T2_PHASE_ROUNDS, AMAZONENSE_T2_SEMI_ROUND,
  AMAZONENSE_T2_FINAL_ROUND, AMAZONENSE_GRAND_FINAL_ROUND, AMAZONENSE_TOTAL_ROUNDS,
  AMAZONENSE_CHAMPION_PRIZE,
} from "./amazonense.js";
import {
  createAmapaensePhase1, createAmapaenseKnockout, advanceAmapaenseKnockout,
  applyAmapaenseKnockoutResult, getAmapaenseKnockoutLegs, getAmapaenseQualified,
  AMAPAENSE_PHASE1_ROUNDS, AMAPAENSE_TOTAL_ROUNDS, AMAPAENSE_CHAMPION_PRIZE,
} from "./amapaense.js";
import {
  createRondoniensePhase1, createRondonienseKnockout, advanceRondonienseKnockout,
  applyRondonienseKnockoutResult, getRondonienseKnockoutLegs, getRondonienseQualified,
  RONDONIENSE_PHASE1_ROUNDS, RONDONIENSE_TOTAL_ROUNDS, RONDONIENSE_CHAMPION_PRIZE,
} from "./rondoniense.js";
import {
  createRoraimensePhase1, createRoraimenseKnockout, advanceRoraimenseKnockout,
  applyRoraimenseKnockoutResult, getRoraimenseKnockoutLegs, getRoraimenseQualified,
  RORAIMENSE_PHASE1_ROUNDS, RORAIMENSE_TOTAL_ROUNDS, RORAIMENSE_CHAMPION_PRIZE,
} from "./roraimense.js";
import {
  createTocantinensePhase1, createTocantinenseKnockout, advanceTocantinenseKnockout,
  applyTocantinenseKnockoutResult, getTocantinenseKnockoutLegs, getTocantinenseQualified,
  TOCANTINENSE_PHASE1_ROUNDS, TOCANTINENSE_TOTAL_ROUNDS, TOCANTINENSE_CHAMPION_PRIZE,
} from "./tocantinense.js";
import {
  createMaranhensePhase1, createMaranhenseKnockout, advanceMaranhenseKnockout,
  applyMaranhenseKnockoutResult, getMaranhenseKnockoutLegs, getMaranhenseQualified,
  MARANHENSE_PHASE1_ROUNDS, MARANHENSE_TOTAL_ROUNDS, MARANHENSE_CHAMPION_PRIZE,
} from "./maranhense.js";
import {
  createParaibanoPhase1, createParaibanoKnockout, advanceParaibanoKnockout,
  applyParaibanoKnockoutResult, getParaibanoKnockoutLegs, getParaibanoQualified,
  PARAIBANO_PHASE1_ROUNDS, PARAIBANO_TOTAL_ROUNDS, PARAIBANO_CHAMPION_PRIZE,
} from "./paraibano.js";
import {
  createPiauiensePhase1, createPiauienseKnockout, advancePiauienseKnockout,
  applyPiauienseKnockoutResult, getPiauienseKnockoutLegs, getPiauienseQualified,
  PIAUIENSE_PHASE1_ROUNDS, PIAUIENSE_TOTAL_ROUNDS, PIAUIENSE_CHAMPION_PRIZE,
} from "./piauiense.js";
import {
  createPotiguarPhase1, createPotiguarKnockout, advancePotiguarKnockout,
  applyPotiguarKnockoutResult, getPotiguarKnockoutLegs, getPotiguarQualified,
  POTIGUAR_PHASE1_ROUNDS, POTIGUAR_TOTAL_ROUNDS, POTIGUAR_CHAMPION_PRIZE,
} from "./potiguar.js";
import {
  createSergipanoPhase1, createSergipanoKnockout, advanceSergipanoKnockout,
  applySergipanoKnockoutResult, getSergipanoKnockoutLegs, getSergipanoQualified,
  SERGIPANO_PHASE1_ROUNDS, SERGIPANO_TOTAL_ROUNDS, SERGIPANO_CHAMPION_PRIZE,
} from "./sergipano.js";
import {
  createMatogrossensePhase1, createMatogrossenseKnockout, advanceMatogrossenseKnockout,
  applyMatogrossenseKnockoutResult, getMatogrossenseKnockoutLegs, getMatogrossenseQualified,
  MATOGROSSENSE_PHASE1_ROUNDS, MATOGROSSENSE_TOTAL_ROUNDS, MATOGROSSENSE_CHAMPION_PRIZE,
} from "./matogrossense.js";
import {
  createSulmatogrossensePhase1, createSulmatogrossenseKnockout, advanceSulmatogrossenseKnockout,
  applySulmatogrossenseKnockoutResult, getSulmatogrossenseKnockoutLegs, getSulmatogrossenseQualified,
  SULMS_PHASE1_ROUNDS, SULMS_TOTAL_ROUNDS, SULMS_CHAMPION_PRIZE,
} from "./sulmatogrossense.js";

export const ESTADUAL_STATES = ["SP", "RJ", "MG", "RS", "PR", "BA", "CE", "PE", "AL", "GO", "SC", "PA", "AC", "AM", "AP", "RO", "RR", "TO", "MA", "PB", "PI", "RN", "SE", "MT", "MS"];

const ESTADUAL_NAMES = {
  SP: "Campeonato Paulista",
  RJ: "Campeonato Carioca",
  MG: "Campeonato Mineiro",
  RS: "Campeonato Gaúcho",
  PR: "Campeonato Paranaense",
  BA: "Campeonato Baiano",
  CE: "Campeonato Cearense",
  PE: "Campeonato Pernambucano",
  AL: "Campeonato Alagoano",
  GO: "Campeonato Goiano",
  SC: "Campeonato Catarinense",
  PA: "Campeonato Paraense",
  AC: "Campeonato Acreano",
  AM: "Campeonato Amazonense",
  AP: "Campeonato Amapaense",
  RO: "Campeonato Rondoniense",
  RR: "Campeonato Roraimense",
  TO: "Campeonato Tocantinense",
  MA: "Campeonato Maranhense",
  PB: "Campeonato Paraibano",
  PI: "Campeonato Piauiense",
  RN: "Campeonato Potiguar",
  SE: "Campeonato Sergipano",
  MT: "Campeonato Mato-grossense",
  MS: "Campeonato Sul-mato-grossense",
};

// Cria todos os estaduais. Retorna o objeto meta (state.estaduais).
// SP → formato Paulista (suíço); RJ → formato Carioca (grupos cruzados);
// MG/RS → formato de grupos clássico.
export function createEstaduais(state, season, rng) {
  const estaduais = {};
  for (const uf of ESTADUAL_STATES) {
    if (uf === "SP") { estaduais.SP = createPaulistaEstadual(state, season, rng); continue; }
    if (uf === "RJ") { estaduais.RJ = createCariocaEstadual(state, season, rng); continue; }
    if (uf === "MG") { estaduais.MG = createMineiroEstadual(state, season, rng); continue; }
    if (uf === "RS") { estaduais.RS = createGauchoEstadual(state, season, rng); continue; }
    if (uf === "PR") { estaduais.PR = createParanaenseEstadual(state, season, rng); continue; }
    if (uf === "BA") { estaduais.BA = createBaianoEstadual(state, season, rng); continue; }
    if (uf === "CE") { estaduais.CE = createCearenseEstadual(state, season, rng); continue; }
    if (uf === "PE") { estaduais.PE = createPernambucanoEstadual(state, season, rng); continue; }
    if (uf === "AL") { estaduais.AL = createAlagoanoEstadual(state, season, rng); continue; }
    if (uf === "GO") { estaduais.GO = createGoianoEstadual(state, season, rng); continue; }
    if (uf === "SC") { estaduais.SC = createCatarinenseEstadual(state, season, rng); continue; }
    if (uf === "PA") { estaduais.PA = createParaenseEstadual(state, season, rng); continue; }
    if (uf === "AC") { estaduais.AC = createAcreanoEstadual(state, season, rng); continue; }
    if (uf === "AM") { estaduais.AM = createAmazonenseEstadual(state, season, rng); continue; }
    if (uf === "AP") { estaduais.AP = createAmapaenseEstadual(state, season, rng); continue; }
    if (uf === "RO") { estaduais.RO = createRondonienseEstadual(state, season, rng); continue; }
    if (uf === "RR") { estaduais.RR = createRoraimenseEstadual(state, season, rng); continue; }
    if (uf === "TO") { estaduais.TO = createTocantinenseEstadual(state, season, rng); continue; }
    if (uf === "MA") { estaduais.MA = createMaranhenseEstadual(state, season, rng); continue; }
    if (uf === "PB") { estaduais.PB = createParaibanoEstadual(state, season, rng); continue; }
    if (uf === "PI") { estaduais.PI = createPiauienseEstadual(state, season, rng); continue; }
    if (uf === "RN") { estaduais.RN = createPotiguarEstadual(state, season, rng); continue; }
    if (uf === "SE") { estaduais.SE = createSergipanoEstadual(state, season, rng); continue; }
    if (uf === "MT") { estaduais.MT = createMatogrossenseEstadual(state, season, rng); continue; }
    if (uf === "MS") { estaduais.MS = createSulmatogrossenseEstadual(state, season, rng); continue; }
    const teamIds = Object.values(state.teams)
      .filter(t => t.state === uf)
      .map(t => t.id);
    if (teamIds.length < 4) continue;
    estaduais[uf] = createOneEstadual(state, uf, teamIds, season, rng);
  }
  return estaduais;
}

// Campeonato Carioca (Taça Guanabara). Monta a 1ª fase cruzada e registra a
// competição. Mata-mata criado quando a 1ª fase termina. format: "carioca".
function createCariocaEstadual(state, season, rng) {
  const phase1 = createCariocaPhase1({ season, rng });
  state.competitions.estadual_rj = phase1;
  return {
    uf: "RJ",
    name: ESTADUAL_NAMES.RJ,
    format: "carioca",
    teams: [...phase1.teams],
    phase: "groups",            // groups | quarters | semis | final | done
    knockout: null,
    champion: null,
    prize: CARIOCA_CHAMPION_PRIZE,
    schedule: {
      groupRounds: CARIOCA_GROUP_ROUNDS,    // 1..6
      finalRound: CARIOCA_TOTAL_ROUNDS,     // 10
    },
  };
}

// Campeonato Mineiro (3 grupos cruzados). 1ª fase 1..12, semi direta 13/14,
// final 15. Mata-mata criado ao fim da 1ª fase. format: "mineiro".
function createMineiroEstadual(state, season, rng) {
  const phase1 = createMineiroPhase1({ season, rng, teamIds: MINEIRO_TEAM_IDS });
  state.competitions.estadual_mg = phase1;
  return {
    uf: "MG",
    name: ESTADUAL_NAMES.MG,
    format: "mineiro",
    teams: [...phase1.teams],
    phase: "groups",            // groups | semis | final | done
    knockout: null,
    champion: null,
    prize: MINEIRO_CHAMPION_PRIZE,
    schedule: {
      groupRounds: MINEIRO_GROUP_ROUNDS,    // 1..12
      finalRound: MINEIRO_TOTAL_ROUNDS,     // 15
    },
  };
}

// Campeonato Gaúcho (2 grupos cruzados, final ida/volta). 1ª fase 1..6,
// quartas 7, semis 8/9, final 10/11. format: "gaucho".
function createGauchoEstadual(state, season, rng) {
  const phase1 = createGauchoPhase1({ season, rng });
  state.competitions.estadual_rs = phase1;
  return {
    uf: "RS",
    name: ESTADUAL_NAMES.RS,
    format: "gaucho",
    teams: [...phase1.teams],
    phase: "groups",            // groups | quarters | semis | final | done
    knockout: null,
    champion: null,
    prize: GAUCHO_CHAMPION_PRIZE,
    schedule: {
      groupRounds: GAUCHO_GROUP_ROUNDS,     // 1..6
      finalRound: GAUCHO_TOTAL_ROUNDS,      // 11
    },
  };
}

// Campeonato Paranaense (2 grupos cruzados, TUDO ida/volta). 1ª fase 1..6,
// quartas 7/8, semis 9/10, final 11/12. format: "paranaense".
function createParanaenseEstadual(state, season, rng) {
  const phase1 = createParanaensePhase1({ season, rng });
  state.competitions.estadual_pr = phase1;
  return {
    uf: "PR",
    name: ESTADUAL_NAMES.PR,
    format: "paranaense",
    teams: [...phase1.teams],
    phase: "groups",            // groups | quarters | semis | final | done
    knockout: null,
    champion: null,
    prize: PARANAENSE_CHAMPION_PRIZE,
    schedule: {
      groupRounds: PARANAENSE_GROUP_ROUNDS,   // 1..6
      finalRound: PARANAENSE_TOTAL_ROUNDS,    // 12
    },
  };
}

// Campeonato Baiano (pontos corridos turno único, sem grupos). 1ª fase 1..9,
// semis jogo único 10, final jogo único 11. format: "baiano".
function createBaianoEstadual(state, season, rng) {
  const phase1 = createBaianoPhase1({ season });
  state.competitions.estadual_ba = phase1;
  return {
    uf: "BA",
    name: ESTADUAL_NAMES.BA,
    format: "baiano",
    teams: [...phase1.teams],
    phase: "league",            // league | semis | final | done
    knockout: null,
    champion: null,
    prize: BAIANO_CHAMPION_PRIZE,
    schedule: {
      groupRounds: BAIANO_PHASE1_ROUNDS,    // 1..9
      finalRound: BAIANO_TOTAL_ROUNDS,      // 11
    },
  };
}

// Campeonato Cearense (2 fases de grupos + mata-mata). 1ª fase 1..5,
// 2ª fase 6..8, semis 9/10, final 11/12. format: "cearense".
function createCearenseEstadual(state, season, rng) {
  const phase1 = createCearensePhase1({ season, rng });
  state.competitions.estadual_ce = phase1;
  return {
    uf: "CE",
    name: ESTADUAL_NAMES.CE,
    format: "cearense",
    teams: [...phase1.teams],
    phase: "groups",            // groups | second | semis | final | done
    knockout: null,
    champion: null,
    prize: CEARENSE_CHAMPION_PRIZE,
    schedule: {
      groupRounds: CEARENSE_PHASE1_ROUNDS,   // 1..5
      finalRound: CEARENSE_TOTAL_ROUNDS,     // 12
    },
  };
}

// Campeonato Pernambucano (liga turno único + playoff 3-6 + semis/final).
// 1ª fase 1..7, playoff 8/9, semis 10/11, final 12/13. format: "pernambucano".
function createPernambucanoEstadual(state, season, rng) {
  const phase1 = createPernambucanoPhase1({ season });
  state.competitions.estadual_pe = phase1;
  return {
    uf: "PE",
    name: ESTADUAL_NAMES.PE,
    format: "pernambucano",
    teams: [...phase1.teams],
    phase: "league",            // league | playoffs | semis | final | done
    knockout: null,
    champion: null,
    prize: PERNAMBUCANO_CHAMPION_PRIZE,
    schedule: {
      groupRounds: PERNAMBUCANO_PHASE1_ROUNDS,   // 1..7
      finalRound: PERNAMBUCANO_TOTAL_ROUNDS,     // 13
    },
  };
}

// Campeonato Alagoano (liga turno único + semis/final ida/volta).
// 1ª fase 1..7, semis 8/9, final 10/11. format: "alagoano".
function createAlagoanoEstadual(state, season, rng) {
  const phase1 = createAlagoanoPhase1({ season });
  state.competitions.estadual_al = phase1;
  return {
    uf: "AL",
    name: ESTADUAL_NAMES.AL,
    format: "alagoano",
    teams: [...phase1.teams],
    phase: "league",            // league | semis | final | done
    knockout: null,
    champion: null,
    prize: ALAGOANO_CHAMPION_PRIZE,
    schedule: {
      groupRounds: ALAGOANO_PHASE1_ROUNDS,   // 1..7
      finalRound: ALAGOANO_TOTAL_ROUNDS,     // 11
    },
  };
}

// Campeonato Goiano (3 grupos cruzados em 8 rodadas + mata-mata top 8).
// 1ª fase 1..8, quartas 9/10, semis 11/12, final 13/14. format: "goiano".
function createGoianoEstadual(state, season, rng) {
  const phase1 = createGoianoPhase1({ season, rng });
  state.competitions.estadual_go = phase1;
  return {
    uf: "GO",
    name: ESTADUAL_NAMES.GO,
    format: "goiano",
    teams: [...phase1.teams],
    phase: "groups",            // groups | quarters | semis | final | done
    knockout: null,
    champion: null,
    prize: GOIANO_CHAMPION_PRIZE,
    schedule: {
      groupRounds: GOIANO_PHASE1_ROUNDS,   // 1..8
      finalRound: GOIANO_TOTAL_ROUNDS,     // 14
    },
  };
}

// Campeonato Catarinense (2 grupos cruzados, tudo ida/volta — como o
// Paranaense). 1ª fase 1..6, quartas 7/8, semis 9/10, final 11/12.
function createCatarinenseEstadual(state, season, rng) {
  const phase1 = createCatarinensePhase1({ season, rng });
  state.competitions.estadual_sc = phase1;
  return {
    uf: "SC",
    name: ESTADUAL_NAMES.SC,
    format: "catarinense",
    teams: [...phase1.teams],
    phase: "groups",            // groups | quarters | semis | final | done
    knockout: null,
    champion: null,
    prize: CATARINENSE_CHAMPION_PRIZE,
    schedule: {
      groupRounds: CATARINENSE_GROUP_ROUNDS,   // 1..6
      finalRound: CATARINENSE_TOTAL_ROUNDS,    // 12
    },
  };
}

// Campeonato Paraense (grupos cruzados + tabela geral top 8 + mata-mata
// híbrido). 1ª fase 1..6, quartas 7, semis 8, final 9/10. format: "paraense".
function createParaenseEstadual(state, season, rng) {
  const phase1 = createParaensePhase1({ season, rng });
  state.competitions.estadual_pa = phase1;
  return {
    uf: "PA",
    name: ESTADUAL_NAMES.PA,
    format: "paraense",
    teams: [...phase1.teams],
    phase: "groups",            // groups | quarters | semis | final | done
    knockout: null,
    champion: null,
    prize: PARAENSE_CHAMPION_PRIZE,
    schedule: {
      groupRounds: PARAENSE_GROUP_ROUNDS,   // 1..6
      finalRound: PARAENSE_TOTAL_ROUNDS,    // 10
    },
  };
}

// Campeonato Acreano (liga turno único + semis ida/volta com vantagem +
// final jogo único). 1ª fase 1..7, semis 8/9, final 10. format: "acreano".
function createAcreanoEstadual(state, season, rng) {
  const phase1 = createAcreanoPhase1({ season });
  state.competitions.estadual_ac = phase1;
  return {
    uf: "AC",
    name: ESTADUAL_NAMES.AC,
    format: "acreano",
    teams: [...phase1.teams],
    phase: "league",            // league | semis | final | done
    knockout: null,
    champion: null,
    prize: ACREANO_CHAMPION_PRIZE,
    schedule: {
      groupRounds: ACREANO_PHASE1_ROUNDS,   // 1..7
      finalRound: ACREANO_TOTAL_ROUNDS,     // 10
    },
  };
}

// Campeonato Amazonense (dois turnos + grande final). 1º turno 1..6 (fase 1-4,
// semis 5, final 6); 2º turno 7..11 (fase 7-9, semis 10, final 11); grande
// final 12. format: "amazonense".
function createAmazonenseEstadual(state, season, rng) {
  const t1 = createAmazonenseT1Phase({ season, rng });
  state.competitions.estadual_am = t1;
  return {
    uf: "AM",
    name: ESTADUAL_NAMES.AM,
    format: "amazonense",
    teams: [...t1.teams],
    phase: "t1_groups",   // t1_groups | t1_ko | t2_groups | t2_ko | grand_final | done
    t1ko: null, t2ko: null, grandFinal: null,
    t1Champion: null, t2Champion: null,
    knockout: null,       // não usado (estrutura própria)
    champion: null,
    prize: AMAZONENSE_CHAMPION_PRIZE,
    schedule: {
      groupRounds: AMAZONENSE_T1_PHASE_ROUNDS,   // 1..4 (1º turno)
      finalRound: AMAZONENSE_TOTAL_ROUNDS,       // 12
    },
  };
}

// Campeonato Amapaense (liga turno único + semis/final ida/volta — como o
// Alagoano). 1ª fase 1..7, semis 8/9, final 10/11. format: "amapaense".
function createAmapaenseEstadual(state, season, rng) {
  const phase1 = createAmapaensePhase1({ season });
  state.competitions.estadual_ap = phase1;
  return {
    uf: "AP",
    name: ESTADUAL_NAMES.AP,
    format: "amapaense",
    teams: [...phase1.teams],
    phase: "league",            // league | semis | final | done
    knockout: null,
    champion: null,
    prize: AMAPAENSE_CHAMPION_PRIZE,
    schedule: {
      groupRounds: AMAPAENSE_PHASE1_ROUNDS,   // 1..7
      finalRound: AMAPAENSE_TOTAL_ROUNDS,     // 11
    },
  };
}

// Campeonato Rondoniense (pontos corridos turno e returno + semis/final
// ida/volta). 1ª fase 1..14, semis 15/16, final 17/18. format: "rondoniense".
function createRondonienseEstadual(state, season, rng) {
  const phase1 = createRondoniensePhase1({ season });
  state.competitions.estadual_ro = phase1;
  return {
    uf: "RO",
    name: ESTADUAL_NAMES.RO,
    format: "rondoniense",
    teams: [...phase1.teams],
    phase: "league",            // league | semis | final | done
    knockout: null,
    champion: null,
    prize: RONDONIENSE_CHAMPION_PRIZE,
    schedule: {
      groupRounds: RONDONIENSE_PHASE1_ROUNDS,   // 1..14
      finalRound: RONDONIENSE_TOTAL_ROUNDS,     // 18
    },
  };
}

// Campeonato Roraimense (liga turno único + semis/final jogo único — como o
// Baiano, com 9 times). 1ª fase 1..9, semis 10, final 11. format: "roraimense".
function createRoraimenseEstadual(state, season, rng) {
  const phase1 = createRoraimensePhase1({ season });
  state.competitions.estadual_rr = phase1;
  return {
    uf: "RR",
    name: ESTADUAL_NAMES.RR,
    format: "roraimense",
    teams: [...phase1.teams],
    phase: "league",            // league | semis | final | done
    knockout: null,
    champion: null,
    prize: RORAIMENSE_CHAMPION_PRIZE,
    schedule: {
      groupRounds: RORAIMENSE_PHASE1_ROUNDS,   // 1..9
      finalRound: RORAIMENSE_TOTAL_ROUNDS,     // 11
    },
  };
}

// Campeonato Tocantinense (liga turno único + semis/final ida/volta — como o
// Amapaense). 1ª fase 1..7, semis 8/9, final 10/11. format: "tocantinense".
function createTocantinenseEstadual(state, season, rng) {
  const phase1 = createTocantinensePhase1({ season });
  state.competitions.estadual_to = phase1;
  return {
    uf: "TO",
    name: ESTADUAL_NAMES.TO,
    format: "tocantinense",
    teams: [...phase1.teams],
    phase: "league",            // league | semis | final | done
    knockout: null,
    champion: null,
    prize: TOCANTINENSE_CHAMPION_PRIZE,
    schedule: {
      groupRounds: TOCANTINENSE_PHASE1_ROUNDS,   // 1..7
      finalRound: TOCANTINENSE_TOTAL_ROUNDS,     // 11
    },
  };
}

// Campeonato Maranhense (liga turno único + semis/final ida/volta — como o
// Tocantinense). 1ª fase 1..7, semis 8/9, final 10/11. format: "maranhense".
function createMaranhenseEstadual(state, season, rng) {
  const phase1 = createMaranhensePhase1({ season });
  state.competitions.estadual_ma = phase1;
  return {
    uf: "MA",
    name: ESTADUAL_NAMES.MA,
    format: "maranhense",
    teams: [...phase1.teams],
    phase: "league",            // league | semis | final | done
    knockout: null,
    champion: null,
    prize: MARANHENSE_CHAMPION_PRIZE,
    schedule: {
      groupRounds: MARANHENSE_PHASE1_ROUNDS,   // 1..7
      finalRound: MARANHENSE_TOTAL_ROUNDS,     // 11
    },
  };
}

// Campeonato Paraibano (liga turno único 10 times + semis/final ida/volta).
// 1ª fase 1..9, semis 10/11, final 12/13. format: "paraibano".
function createParaibanoEstadual(state, season, rng) {
  const phase1 = createParaibanoPhase1({ season });
  state.competitions.estadual_pb = phase1;
  return {
    uf: "PB",
    name: ESTADUAL_NAMES.PB,
    format: "paraibano",
    teams: [...phase1.teams],
    phase: "league",            // league | semis | final | done
    knockout: null,
    champion: null,
    prize: PARAIBANO_CHAMPION_PRIZE,
    schedule: {
      groupRounds: PARAIBANO_PHASE1_ROUNDS,   // 1..9
      finalRound: PARAIBANO_TOTAL_ROUNDS,     // 13
    },
  };
}

// Campeonato Piauiense (liga turno único + semis/final ida/volta — como o
// Maranhense). 1ª fase 1..7, semis 8/9, final 10/11. format: "piauiense".
function createPiauienseEstadual(state, season, rng) {
  const phase1 = createPiauiensePhase1({ season });
  state.competitions.estadual_pi = phase1;
  return {
    uf: "PI",
    name: ESTADUAL_NAMES.PI,
    format: "piauiense",
    teams: [...phase1.teams],
    phase: "league",            // league | semis | final | done
    knockout: null,
    champion: null,
    prize: PIAUIENSE_CHAMPION_PRIZE,
    schedule: {
      groupRounds: PIAUIENSE_PHASE1_ROUNDS,   // 1..7
      finalRound: PIAUIENSE_TOTAL_ROUNDS,     // 11
    },
  };
}

// Campeonato Potiguar (liga turno único + repescagem + semis/final ida/volta —
// como o Pernambucano). 1ª fase 1..7, repescagem 8/9, semis 10/11, final 12/13.
function createPotiguarEstadual(state, season, rng) {
  const phase1 = createPotiguarPhase1({ season });
  state.competitions.estadual_rn = phase1;
  return {
    uf: "RN",
    name: ESTADUAL_NAMES.RN,
    format: "potiguar",
    teams: [...phase1.teams],
    phase: "league",            // league | playoffs | semis | final | done
    knockout: null,
    champion: null,
    prize: POTIGUAR_CHAMPION_PRIZE,
    schedule: {
      groupRounds: POTIGUAR_PHASE1_ROUNDS,   // 1..7
      finalRound: POTIGUAR_TOTAL_ROUNDS,     // 13
    },
  };
}

// Campeonato Sergipano (liga turno único 10 times + repescagem 2º-7º +
// semis/final ida/volta — como o Potiguar, mas com só 1 vaga direta).
// 1ª fase 1..9, repescagem 10/11, semis 12/13, final 14/15. format: "sergipano".
function createSergipanoEstadual(state, season, rng) {
  const phase1 = createSergipanoPhase1({ season });
  state.competitions.estadual_se = phase1;
  return {
    uf: "SE",
    name: ESTADUAL_NAMES.SE,
    format: "sergipano",
    teams: [...phase1.teams],
    phase: "league",            // league | playoffs | semis | final | done
    knockout: null,
    champion: null,
    prize: SERGIPANO_CHAMPION_PRIZE,
    schedule: {
      groupRounds: SERGIPANO_PHASE1_ROUNDS,   // 1..9
      finalRound: SERGIPANO_TOTAL_ROUNDS,     // 15
    },
  };
}

// Campeonato Mato-grossense (liga turno único 10 times + quartas jogo único +
// semis/final ida/volta). 1ª fase 1..9, quartas 10, semis 11/12, final 13/14.
// format: "matogrossense".
function createMatogrossenseEstadual(state, season, rng) {
  const phase1 = createMatogrossensePhase1({ season });
  state.competitions.estadual_mt = phase1;
  return {
    uf: "MT",
    name: ESTADUAL_NAMES.MT,
    format: "matogrossense",
    teams: [...phase1.teams],
    phase: "league",            // league | quarters | semis | final | done
    knockout: null,
    champion: null,
    prize: MATOGROSSENSE_CHAMPION_PRIZE,
    schedule: {
      groupRounds: MATOGROSSENSE_PHASE1_ROUNDS,   // 1..9
      finalRound: MATOGROSSENSE_TOTAL_ROUNDS,     // 14
    },
  };
}

// Campeonato Sul-mato-grossense (liga turno único 10 times + quartas/semis/final
// ida/volta). 1ª fase 1..9, quartas 10/11, semis 12/13, final 14/15.
// format: "sulmatogrossense".
function createSulmatogrossenseEstadual(state, season, rng) {
  const phase1 = createSulmatogrossensePhase1({ season });
  state.competitions.estadual_ms = phase1;
  return {
    uf: "MS",
    name: ESTADUAL_NAMES.MS,
    format: "sulmatogrossense",
    teams: [...phase1.teams],
    phase: "league",            // league | quarters | semis | final | done
    knockout: null,
    champion: null,
    prize: SULMS_CHAMPION_PRIZE,
    schedule: {
      groupRounds: SULMS_PHASE1_ROUNDS,   // 1..9
      finalRound: SULMS_TOTAL_ROUNDS,     // 15
    },
  };
}

// Campeonato Paulista (formato suíço). Monta a 1ª fase a partir dos potes
// oficiais e registra a competição. O mata-mata é criado quando a 1ª fase
// termina (advanceEstadualPhase). Marcado com format: "paulista" pra que os
// pontos de entrada (jogos da rodada, avanço de fase) saibam bifurcar.
function createPaulistaEstadual(state, season, rng) {
  const phase1 = createPaulistaPhase1({ season, pots: PAULISTA_POTS, rng });
  state.competitions.estadual_sp = phase1;

  return {
    uf: "SP",
    name: ESTADUAL_NAMES.SP,
    format: "paulista",
    teams: [...PAULISTA_TEAM_IDS],
    phase: "groups",            // groups | quarters | semis | final | done
    knockout: null,             // criado por advanceEstadualPhase ao fim da 1ª fase
    champion: null,
    prize: PAULISTA_CHAMPION_PRIZE,   // R$ 5M (lido por finishEstadualPhase)
    schedule: {
      groupRounds: PAULISTA_GROUP_ROUNDS,   // 1..8
      // mata-mata ocupa 9..12 (constantes em paulista.js)
      finalRound: PAULISTA_TOTAL_ROUNDS,    // 12 — usado por estadualTotalRounds
    },
  };
}

// Formato de grupos genérico (fallback). Exportado pra teste — os 4 UFs
// oficiais hoje usam formatos especiais, mas este caminho segue válido pra
// qualquer estado adicional futuro com 4+ times.
export function createOneEstadual(state, uf, teamIds, season, rng) {
  const ufName = ESTADUAL_NAMES[uf] || `Campeonato ${uf}`;
  const shuffled = shuffle([...teamIds], rng);
  const twoGroups = shuffled.length > 8;

  const groupDefs = [];
  if (twoGroups) {
    const half = Math.ceil(shuffled.length / 2);
    groupDefs.push({ name: "Grupo A", teamIds: shuffled.slice(0, half) });
    groupDefs.push({ name: "Grupo B", teamIds: shuffled.slice(half) });
  } else {
    groupDefs.push({ name: "Grupo Único", teamIds: shuffled });
  }

  // Cria competições de grupo (turno único)
  const groupIds = [];
  let maxGroupRounds = 0;
  groupDefs.forEach((g, i) => {
    const compId = `estadual_${uf.toLowerCase()}_g${i}`;
    const comp = createCompetition({
      id: compId,
      name: `${ufName} · ${g.name}`,
      tier: 0,
      season,
      teamIds: g.teamIds,
      legs: 1,
      rules: { format: "estadual_group" },
    });
    state.competitions[compId] = comp;
    groupIds.push(compId);
    const rounds = comp.fixtures.length ? Math.max(...comp.fixtures.map(m => m.round)) : 0;
    if (rounds > maxGroupRounds) maxGroupRounds = rounds;
  });

  return {
    uf,
    name: ufName,
    teams: shuffled,
    twoGroups,
    groupIds,
    phase: "groups",          // groups | semis | final | done
    knockout: { semis: [], final: null },
    champion: null,
    prize: 3_000_000,         // prêmio padrão dos estaduais menores
    schedule: {
      groupRounds: maxGroupRounds,    // grupos ocupam rodadas 1..maxGroupRounds
      semisRound: maxGroupRounds + 1,
      finalRound: maxGroupRounds + 2,
    },
  };
}

// Standings ordenadas de uma competição de grupo
function sortGroup(comp) {
  return [...comp.standings].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    const sgA = a.goalsFor - a.goalsAgainst;
    const sgB = b.goalsFor - b.goalsAgainst;
    if (sgB !== sgA) return sgB - sgA;
    return b.goalsFor - a.goalsFor;
  });
}

// Retorna as partidas do estadual nesta rodada (de pré-temporada).
// Inclui jogos de grupo (rodada ≤ groupRounds) e legs de mata-mata.
export function getEstadualMatchesForRound(state, estadual, round) {
  if (estadual.format === "paulista") return getPaulistaMatchesForRound(state, estadual, round);
  if (estadual.format === "carioca") return getCariocaMatchesForRound(state, estadual, round);
  if (estadual.format === "mineiro") return getMineiroMatchesForRound(state, estadual, round);
  if (estadual.format === "gaucho") return getGauchoMatchesForRound(state, estadual, round);
  if (estadual.format === "paranaense") return getParanaenseMatchesForRound(state, estadual, round);
  if (estadual.format === "baiano") return getBaianoMatchesForRound(state, estadual, round);
  if (estadual.format === "cearense") return getCearenseMatchesForRound(state, estadual, round);
  if (estadual.format === "pernambucano") return getPernambucanoMatchesForRound(state, estadual, round);
  if (estadual.format === "alagoano") return getAlagoanoMatchesForRound(state, estadual, round);
  if (estadual.format === "goiano") return getGoianoMatchesForRound(state, estadual, round);
  if (estadual.format === "catarinense") return getCatarinenseMatchesForRound(state, estadual, round);
  if (estadual.format === "paraense") return getParaenseMatchesForRound(state, estadual, round);
  if (estadual.format === "acreano") return getAcreanoMatchesForRound(state, estadual, round);
  if (estadual.format === "amazonense") return getAmazonenseMatchesForRound(state, estadual, round);
  if (estadual.format === "amapaense") return getAmapaenseMatchesForRound(state, estadual, round);
  if (estadual.format === "rondoniense") return getRondonienseMatchesForRound(state, estadual, round);
  if (estadual.format === "roraimense") return getRoraimenseMatchesForRound(state, estadual, round);
  if (estadual.format === "tocantinense") return getTocantinenseMatchesForRound(state, estadual, round);
  if (estadual.format === "maranhense") return getMaranhenseMatchesForRound(state, estadual, round);
  if (estadual.format === "paraibano") return getParaibanoMatchesForRound(state, estadual, round);
  if (estadual.format === "piauiense") return getPiauienseMatchesForRound(state, estadual, round);
  if (estadual.format === "potiguar") return getPotiguarMatchesForRound(state, estadual, round);
  if (estadual.format === "sergipano") return getSergipanoMatchesForRound(state, estadual, round);
  if (estadual.format === "matogrossense") return getMatogrossenseMatchesForRound(state, estadual, round);
  if (estadual.format === "sulmatogrossense") return getSulmatogrossenseMatchesForRound(state, estadual, round);

  const out = [];
  // Grupos
  if (round <= estadual.schedule.groupRounds) {
    for (const gid of estadual.groupIds) {
      const comp = state.competitions[gid];
      if (!comp) continue;
      for (const m of comp.fixtures) {
        if (m.round === round) out.push({ match: m, kind: "group", compId: gid });
      }
    }
  }
  // Semifinais
  if (round === estadual.schedule.semisRound) {
    for (const tie of estadual.knockout.semis) {
      if (tie?.leg && !tie.leg.played) out.push({ match: tie.leg, kind: "semi", tie });
    }
  }
  // Final
  if (round === estadual.schedule.finalRound) {
    const f = estadual.knockout.final;
    if (f?.leg && !f.leg.played) out.push({ match: f.leg, kind: "final", tie: f });
  }
  return out;
}

// Quantas rodadas o estadual inteiro tem
export function estadualTotalRounds(estadual) {
  return estadual.schedule.finalRound;
}

// Verifica se o estadual inteiro terminou
export function isEstadualDone(estadual) {
  return estadual.phase === "done";
}

// Avança fases quando a anterior termina. Chamar ao fim de cada rodada.
export function advanceEstadualPhase(state, estadual, season, rng) {
  if (estadual.format === "paulista") return advancePaulistaEstadual(state, estadual, season, rng);
  if (estadual.format === "carioca") return advanceCariocaEstadual(state, estadual, season, rng);
  if (estadual.format === "mineiro") return advanceMineiroEstadual(state, estadual, season, rng);
  if (estadual.format === "gaucho") return advanceGauchoEstadual(state, estadual, season, rng);
  if (estadual.format === "paranaense") return advanceParanaenseEstadual(state, estadual, season, rng);
  if (estadual.format === "baiano") return advanceBaianoEstadual(state, estadual, season, rng);
  if (estadual.format === "cearense") return advanceCearenseEstadual(state, estadual, season, rng);
  if (estadual.format === "pernambucano") return advancePernambucanoEstadual(state, estadual, season, rng);
  if (estadual.format === "alagoano") return advanceAlagoanoEstadual(state, estadual, season, rng);
  if (estadual.format === "goiano") return advanceGoianoEstadual(state, estadual, season, rng);
  if (estadual.format === "catarinense") return advanceCatarinenseEstadual(state, estadual, season, rng);
  if (estadual.format === "paraense") return advanceParaenseEstadual(state, estadual, season, rng);
  if (estadual.format === "acreano") return advanceAcreanoEstadual(state, estadual, season, rng);
  if (estadual.format === "amazonense") return advanceAmazonenseEstadual(state, estadual, season, rng);
  if (estadual.format === "amapaense") return advanceAmapaenseEstadual(state, estadual, season, rng);
  if (estadual.format === "rondoniense") return advanceRondonienseEstadual(state, estadual, season, rng);
  if (estadual.format === "roraimense") return advanceRoraimenseEstadual(state, estadual, season, rng);
  if (estadual.format === "tocantinense") return advanceTocantinenseEstadual(state, estadual, season, rng);
  if (estadual.format === "maranhense") return advanceMaranhenseEstadual(state, estadual, season, rng);
  if (estadual.format === "paraibano") return advanceParaibanoEstadual(state, estadual, season, rng);
  if (estadual.format === "piauiense") return advancePiauienseEstadual(state, estadual, season, rng);
  if (estadual.format === "potiguar") return advancePotiguarEstadual(state, estadual, season, rng);
  if (estadual.format === "sergipano") return advanceSergipanoEstadual(state, estadual, season, rng);
  if (estadual.format === "matogrossense") return advanceMatogrossenseEstadual(state, estadual, season, rng);
  if (estadual.format === "sulmatogrossense") return advanceSulmatogrossenseEstadual(state, estadual, season, rng);

  if (estadual.phase === "groups") {
    const groupsDone = estadual.groupIds.every(gid =>
      state.competitions[gid].fixtures.every(m => m.played)
    );
    if (groupsDone) {
      buildSemis(state, estadual, season);
      estadual.phase = "semis";
    }
  } else if (estadual.phase === "semis") {
    const semisDone = estadual.knockout.semis.every(t => t.winnerId);
    if (semisDone) {
      buildFinal(state, estadual, season, rng);
      estadual.phase = "final";
    }
  } else if (estadual.phase === "final") {
    const f = estadual.knockout.final;
    if (f && f.winnerId) {
      estadual.champion = f.winnerId;
      estadual.phase = "done";
    }
  }
}

// Monta as 2 semifinais com base nas classificações de grupo.
function buildSemis(state, estadual, season) {
  let qualified;
  if (estadual.twoGroups) {
    const [gaComp, gbComp] = estadual.groupIds.map(gid => state.competitions[gid]);
    const ga = sortGroup(gaComp);
    const gb = sortGroup(gbComp);
    // 1A × 2B  e  1B × 2A
    qualified = [
      [ga[0].teamId, gb[1].teamId],
      [gb[0].teamId, ga[1].teamId],
    ];
  } else {
    const g = sortGroup(state.competitions[estadual.groupIds[0]]);
    // 1 × 4  e  2 × 3
    qualified = [
      [g[0].teamId, g[3].teamId],
      [g[1].teamId, g[2].teamId],
    ];
  }

  estadual.knockout.semis = qualified.map(([homeId, awayId], idx) => ({
    id: `estadual_${estadual.uf.toLowerCase()}_semi${idx}`,
    homeTeamId: homeId,  // melhor campanha manda
    awayTeamId: awayId,
    leg: makeKnockoutLeg(estadual, `semi${idx}`, homeId, awayId, season, estadual.schedule.semisRound),
    winnerId: null,
  }));
}

// Monta a final com os vencedores das semis.
function buildFinal(state, estadual, season, rng) {
  const [s0, s1] = estadual.knockout.semis;
  const a = s0.winnerId;
  const b = s1.winnerId;
  // Mando da final: melhor campanha geral nos grupos (proxy: reputação)
  const teamA = state.teams[a], teamB = state.teams[b];
  const homeId = teamA.reputation >= teamB.reputation ? a : b;
  const awayId = homeId === a ? b : a;
  estadual.knockout.final = {
    id: `estadual_${estadual.uf.toLowerCase()}_final`,
    homeTeamId: homeId,
    awayTeamId: awayId,
    leg: makeKnockoutLeg(estadual, "final", homeId, awayId, season, estadual.schedule.finalRound),
    winnerId: null,
  };
}

function makeKnockoutLeg(estadual, tag, homeId, awayId, season, round) {
  return {
    id: `m_estadual_${estadual.uf.toLowerCase()}_${tag}_${season}`,
    round,
    homeTeamId: homeId,
    awayTeamId: awayId,
    played: false,
    score: null,
    events: [],
    date: null,
    estadualUf: estadual.uf,
    estadualTag: tag,
  };
}

// Aplica resultado de um leg de mata-mata estadual (jogo único; empate → pênaltis simples).
export function applyEstadualKnockoutResult(estadual, leg, rng) {
  if (estadual.format === "paulista") {
    applyPaulistaKnockoutResult(estadual.knockout, leg, rng);
    return;
  }
  if (estadual.format === "carioca") {
    applyCariocaKnockoutResult(estadual.knockout, leg, rng);
    return;
  }
  if (estadual.format === "mineiro") {
    applyMineiroKnockoutResult(estadual.knockout, leg, rng);
    return;
  }
  if (estadual.format === "gaucho") {
    applyGauchoKnockoutResult(estadual.knockout, leg, rng);
    return;
  }
  if (estadual.format === "paranaense") {
    applyParanaenseKnockoutResult(estadual.knockout, leg, rng);
    return;
  }
  if (estadual.format === "baiano") {
    applyBaianoKnockoutResult(estadual.knockout, leg, rng);
    return;
  }
  if (estadual.format === "cearense") {
    applyCearenseKnockoutResult(estadual.knockout, leg, rng);
    return;
  }
  if (estadual.format === "pernambucano") {
    applyPernambucanoKnockoutResult(estadual.knockout, leg, rng);
    return;
  }
  if (estadual.format === "alagoano") {
    applyAlagoanoKnockoutResult(estadual.knockout, leg, rng);
    return;
  }
  if (estadual.format === "goiano") {
    applyGoianoKnockoutResult(estadual.knockout, leg, rng);
    return;
  }
  if (estadual.format === "catarinense") {
    applyCatarinenseKnockoutResult(estadual.knockout, leg, rng);
    return;
  }
  if (estadual.format === "paraense") {
    applyParaenseKnockoutResult(estadual.knockout, leg, rng);
    return;
  }
  if (estadual.format === "acreano") {
    applyAcreanoKnockoutResult(estadual.knockout, leg, rng);
    return;
  }
  if (estadual.format === "amazonense") {
    applyAmazonenseKnockoutResult(estadual, leg, rng); // recebe o estadual (t1ko/t2ko/grande final)
    return;
  }
  if (estadual.format === "amapaense") {
    applyAmapaenseKnockoutResult(estadual.knockout, leg, rng);
    return;
  }
  if (estadual.format === "rondoniense") {
    applyRondonienseKnockoutResult(estadual.knockout, leg, rng);
    return;
  }
  if (estadual.format === "roraimense") {
    applyRoraimenseKnockoutResult(estadual.knockout, leg, rng);
    return;
  }
  if (estadual.format === "tocantinense") {
    applyTocantinenseKnockoutResult(estadual.knockout, leg, rng);
    return;
  }
  if (estadual.format === "maranhense") {
    applyMaranhenseKnockoutResult(estadual.knockout, leg, rng);
    return;
  }
  if (estadual.format === "paraibano") {
    applyParaibanoKnockoutResult(estadual.knockout, leg, rng);
    return;
  }
  if (estadual.format === "piauiense") {
    applyPiauienseKnockoutResult(estadual.knockout, leg, rng);
    return;
  }
  if (estadual.format === "potiguar") {
    applyPotiguarKnockoutResult(estadual.knockout, leg, rng);
    return;
  }
  if (estadual.format === "sergipano") {
    applySergipanoKnockoutResult(estadual.knockout, leg, rng);
    return;
  }
  if (estadual.format === "matogrossense") {
    applyMatogrossenseKnockoutResult(estadual.knockout, leg, rng);
    return;
  }
  if (estadual.format === "sulmatogrossense") {
    applySulmatogrossenseKnockoutResult(estadual.knockout, leg, rng);
    return;
  }
  // Encontra o tie
  let tie = estadual.knockout.semis.find(t => t.leg.id === leg.id);
  if (!tie && estadual.knockout.final?.leg.id === leg.id) tie = estadual.knockout.final;
  if (!tie) return;

  const { home, away } = leg.score;
  if (home > away) tie.winnerId = leg.homeTeamId;
  else if (away > home) tie.winnerId = leg.awayTeamId;
  else tie.winnerId = rng.chance(0.55) ? leg.homeTeamId : leg.awayTeamId; // mandante leve favorito
}

// -------------------- Formato Paulista (bifurcações) --------------------

// Jogos do Paulista numa rodada: 1ª fase (1..8) via fixtures da comp; mata-mata
// (9..12) via knockout. kind compatível com o consumidor: "group" pra 1ª fase
// (usa applyMatchResult+standings) e "semi"/"final" pro mata-mata.
function getPaulistaMatchesForRound(state, estadual, round) {
  const out = [];
  if (round <= PAULISTA_GROUP_ROUNDS) {
    const comp = state.competitions.estadual_sp;
    if (comp) {
      for (const m of comp.fixtures) {
        if (m.round === round) out.push({ match: m, kind: "group", compId: "estadual_sp" });
      }
    }
    return out;
  }
  // Mata-mata
  if (!estadual.knockout) return out;
  for (const entry of getPaulistaKnockoutLegs(estadual.knockout, round)) {
    // kind "semi" reaproveita o caminho de mata-mata (jogo único / leg da final)
    const kind = entry.kind === "final" ? "final" : "semi";
    out.push({ match: entry.leg, kind, tie: entry.tie });
  }
  return out;
}

// Avança o Paulista: cria o mata-mata quando a 1ª fase acaba; depois delega
// ao advancePaulistaKnockout; ao terminar, premia o campeão.
function advancePaulistaEstadual(state, estadual, season, rng) {
  if (estadual.phase === "groups") {
    const comp = state.competitions.estadual_sp;
    if (comp && comp.fixtures.every(m => m.played)) {
      const qualified = getPaulistaQualified(comp);
      estadual.knockout = createPaulistaKnockout(qualified);
      estadual.relegated = getPaulistaRelegated(comp);   // sem efeito ainda
      estadual.phase = "quarters";
    }
    return;
  }
  // Fases de mata-mata: espelha estadual.phase no knockout.phase
  const ko = estadual.knockout;
  if (!ko) return;
  advancePaulistaKnockout(ko, season);
  estadual.phase = ko.phase;            // quarters | semis | final | done
  if (ko.phase === "done" && ko.champion && !estadual.champion) {
    estadual.champion = ko.champion;
    // Premiação (R$ 5M) é paga de forma centralizada em finishEstadualPhase,
    // que lê estadual.prize. Evita dupla premiação.
  }
}

// -------------------- Formato Carioca (bifurcações) --------------------

// Jogos do Carioca numa rodada: 1ª fase (1..6) via fixtures; mata-mata (7..10)
// via knockout. kind "group" pra 1ª fase (standings), "semi"/"final" pro KO.
function getCariocaMatchesForRound(state, estadual, round) {
  const out = [];
  if (round <= CARIOCA_GROUP_ROUNDS) {
    const comp = state.competitions.estadual_rj;
    if (comp) {
      for (const m of comp.fixtures) {
        if (m.round === round) out.push({ match: m, kind: "group", compId: "estadual_rj" });
      }
    }
    return out;
  }
  if (!estadual.knockout) return out;
  for (const entry of getCariocaKnockoutLegs(estadual.knockout, round)) {
    const kind = entry.kind === "final" ? "final" : "semi";
    out.push({ match: entry.leg, kind, tie: entry.tie });
  }
  return out;
}

// Avança o Carioca: cria o mata-mata ao fim da 1ª fase; depois delega ao
// advanceCariocaKnockout. Premiação centralizada em finishEstadualPhase.
function advanceCariocaEstadual(state, estadual, season, rng) {
  if (estadual.phase === "groups") {
    const comp = state.competitions.estadual_rj;
    if (comp && comp.fixtures.every(m => m.played)) {
      const qualified = getCariocaQualified(comp);
      estadual.knockout = createCariocaKnockout(qualified);
      estadual.phase = "quarters";
    }
    return;
  }
  const ko = estadual.knockout;
  if (!ko) return;
  advanceCariocaKnockout(ko);
  estadual.phase = ko.phase;
  if (ko.phase === "done" && ko.champion && !estadual.champion) {
    estadual.champion = ko.champion;
  }
}

// -------------------- Formato Mineiro (bifurcações) --------------------

// Jogos do Mineiro numa rodada: 1ª fase (1..12) via fixtures; mata-mata
// (13..15) via knockout. kind "group" pra 1ª fase, "semi"/"final" pro KO.
function getMineiroMatchesForRound(state, estadual, round) {
  const out = [];
  if (round <= MINEIRO_GROUP_ROUNDS) {
    const comp = state.competitions.estadual_mg;
    if (comp) {
      for (const m of comp.fixtures) {
        if (m.round === round) out.push({ match: m, kind: "group", compId: "estadual_mg" });
      }
    }
    return out;
  }
  if (!estadual.knockout) return out;
  for (const entry of getMineiroKnockoutLegs(estadual.knockout, round)) {
    const kind = entry.kind === "final" ? "final" : "semi";
    out.push({ match: entry.leg, kind, tie: entry.tie });
  }
  return out;
}

// Avança o Mineiro: cria o mata-mata (semi direta) ao fim da 1ª fase.
function advanceMineiroEstadual(state, estadual, season, rng) {
  if (estadual.phase === "groups") {
    const comp = state.competitions.estadual_mg;
    if (comp && comp.fixtures.every(m => m.played)) {
      const qualified = getMineiroQualified(comp);
      estadual.knockout = createMineiroKnockout(qualified);
      estadual.phase = "semis";
    }
    return;
  }
  const ko = estadual.knockout;
  if (!ko) return;
  advanceMineiroKnockout(ko);
  estadual.phase = ko.phase;
  if (ko.phase === "done" && ko.champion && !estadual.champion) {
    estadual.champion = ko.champion;
  }
}

// -------------------- Formato Gaúcho (bifurcações) --------------------

// Jogos do Gaúcho numa rodada: 1ª fase (1..6) via fixtures; mata-mata (7..11)
// via knockout. kind "group" pra 1ª fase, "semi"/"final" pro KO.
function getGauchoMatchesForRound(state, estadual, round) {
  const out = [];
  if (round <= GAUCHO_GROUP_ROUNDS) {
    const comp = state.competitions.estadual_rs;
    if (comp) {
      for (const m of comp.fixtures) {
        if (m.round === round) out.push({ match: m, kind: "group", compId: "estadual_rs" });
      }
    }
    return out;
  }
  if (!estadual.knockout) return out;
  for (const entry of getGauchoKnockoutLegs(estadual.knockout, round)) {
    const kind = entry.kind === "final" ? "final" : "semi";
    out.push({ match: entry.leg, kind, tie: entry.tie });
  }
  return out;
}

// Avança o Gaúcho: cria o mata-mata ao fim da 1ª fase; delega ao KO.
function advanceGauchoEstadual(state, estadual, season, rng) {
  if (estadual.phase === "groups") {
    const comp = state.competitions.estadual_rs;
    if (comp && comp.fixtures.every(m => m.played)) {
      const qualified = getGauchoQualified(comp);
      estadual.knockout = createGauchoKnockout(qualified);
      estadual.phase = "quarters";
    }
    return;
  }
  const ko = estadual.knockout;
  if (!ko) return;
  advanceGauchoKnockout(ko);
  estadual.phase = ko.phase;
  if (ko.phase === "done" && ko.champion && !estadual.champion) {
    estadual.champion = ko.champion;
  }
}

// -------------------- Formato Paranaense (bifurcações) --------------------

// Jogos do Paranaense numa rodada: 1ª fase (1..6) via fixtures; mata-mata
// (7..12, tudo ida/volta) via knockout. kind "group" pra 1ª fase, senão KO.
function getParanaenseMatchesForRound(state, estadual, round) {
  const out = [];
  if (round <= PARANAENSE_GROUP_ROUNDS) {
    const comp = state.competitions.estadual_pr;
    if (comp) {
      for (const m of comp.fixtures) {
        if (m.round === round) out.push({ match: m, kind: "group", compId: "estadual_pr" });
      }
    }
    return out;
  }
  if (!estadual.knockout) return out;
  for (const entry of getParanaenseKnockoutLegs(estadual.knockout, round)) {
    const kind = entry.kind === "final" ? "final" : "semi";
    out.push({ match: entry.leg, kind, tie: entry.tie });
  }
  return out;
}

// Avança o Paranaense: cria o mata-mata ao fim da 1ª fase; delega ao KO.
function advanceParanaenseEstadual(state, estadual, season, rng) {
  if (estadual.phase === "groups") {
    const comp = state.competitions.estadual_pr;
    if (comp && comp.fixtures.every(m => m.played)) {
      const qualified = getParanaenseQualified(comp);
      estadual.knockout = createParanaenseKnockout(qualified);
      estadual.phase = "quarters";
    }
    return;
  }
  const ko = estadual.knockout;
  if (!ko) return;
  advanceParanaenseKnockout(ko);
  estadual.phase = ko.phase;
  if (ko.phase === "done" && ko.champion && !estadual.champion) {
    estadual.champion = ko.champion;
  }
}

// -------------------- Formato Baiano (bifurcações) --------------------

// Jogos do Baiano numa rodada: 1ª fase (1..9, pontos corridos) via fixtures;
// mata-mata (10 semis, 11 final, jogo único) via knockout.
function getBaianoMatchesForRound(state, estadual, round) {
  const out = [];
  if (round <= BAIANO_PHASE1_ROUNDS) {
    const comp = state.competitions.estadual_ba;
    if (comp) {
      for (const m of comp.fixtures) {
        if (m.round === round) out.push({ match: m, kind: "group", compId: "estadual_ba" });
      }
    }
    return out;
  }
  if (!estadual.knockout) return out;
  for (const entry of getBaianoKnockoutLegs(estadual.knockout, round)) {
    const kind = entry.kind === "final" ? "final" : "semi";
    out.push({ match: entry.leg, kind, tie: entry.tie });
  }
  return out;
}

// Avança o Baiano: cria o mata-mata ao fim da 1ª fase; delega ao KO.
function advanceBaianoEstadual(state, estadual, season, rng) {
  if (estadual.phase === "league") {
    const comp = state.competitions.estadual_ba;
    if (comp && comp.fixtures.every(m => m.played)) {
      const qualified = getBaianoQualified(comp, state.teams);
      estadual.knockout = createBaianoKnockout(qualified);
      estadual.phase = "semis";
    }
    return;
  }
  const ko = estadual.knockout;
  if (!ko) return;
  advanceBaianoKnockout(ko);
  estadual.phase = ko.phase;
  if (ko.phase === "done" && ko.champion && !estadual.champion) {
    estadual.champion = ko.champion;
  }
}

// -------------------- Formato Cearense (bifurcações) --------------------

// Jogos do Cearense numa rodada: 1ª fase (1..5, grupos intra), 2ª fase
// (6..8, grupos cruzados), mata-mata (9..12, ida/volta).
function getCearenseMatchesForRound(state, estadual, round) {
  const out = [];
  if (round <= CEARENSE_PHASE1_ROUNDS) {
    const comp = state.competitions.estadual_ce;
    if (comp) for (const m of comp.fixtures) {
      if (m.round === round) out.push({ match: m, kind: "group", compId: "estadual_ce" });
    }
    return out;
  }
  if (round < CEARENSE_PHASE2_ROUND_START + CEARENSE_PHASE2_ROUNDS) {
    const comp = state.competitions.estadual_ce_p2;
    if (comp) for (const m of comp.fixtures) {
      if (m.round === round) out.push({ match: m, kind: "group", compId: "estadual_ce_p2" });
    }
    return out;
  }
  if (!estadual.knockout) return out;
  for (const entry of getCearenseKnockoutLegs(estadual.knockout, round)) {
    const kind = entry.kind === "final" ? "final" : "semi";
    out.push({ match: entry.leg, kind, tie: entry.tie });
  }
  return out;
}

// Avança o Cearense: 1ª fase → 2ª fase (novo grupo) → mata-mata.
function advanceCearenseEstadual(state, estadual, season, rng) {
  if (estadual.phase === "groups") {
    const comp = state.competitions.estadual_ce;
    if (comp && comp.fixtures.every(m => m.played)) {
      const qualified = getCearenseQualified(comp);
      state.competitions.estadual_ce_p2 = createCearensePhase2({ season, qualified });
      estadual.phase = "second";
    }
    return;
  }
  if (estadual.phase === "second") {
    const p2 = state.competitions.estadual_ce_p2;
    if (p2 && p2.fixtures.every(m => m.played)) {
      const semifinalists = getCearenseSemifinalists(p2);
      estadual.knockout = createCearenseKnockout(semifinalists);
      estadual.phase = "semis";
    }
    return;
  }
  const ko = estadual.knockout;
  if (!ko) return;
  advanceCearenseKnockout(ko);
  estadual.phase = ko.phase;
  if (ko.phase === "done" && ko.champion && !estadual.champion) {
    estadual.champion = ko.champion;
  }
}

// -------------------- Formato Pernambucano (bifurcações) --------------------

// Jogos do Pernambucano numa rodada: 1ª fase (1..7, pontos corridos);
// mata-mata (8..13: playoff, semis, final, tudo ida/volta) via knockout.
function getPernambucanoMatchesForRound(state, estadual, round) {
  const out = [];
  if (round <= PERNAMBUCANO_PHASE1_ROUNDS) {
    const comp = state.competitions.estadual_pe;
    if (comp) for (const m of comp.fixtures) {
      if (m.round === round) out.push({ match: m, kind: "group", compId: "estadual_pe" });
    }
    return out;
  }
  if (!estadual.knockout) return out;
  for (const entry of getPernambucanoKnockoutLegs(estadual.knockout, round)) {
    const kind = entry.kind === "final" ? "final" : "semi";
    out.push({ match: entry.leg, kind, tie: entry.tie });
  }
  return out;
}

// Avança o Pernambucano: cria o mata-mata (top 6) ao fim da 1ª fase; delega ao KO.
function advancePernambucanoEstadual(state, estadual, season, rng) {
  if (estadual.phase === "league") {
    const comp = state.competitions.estadual_pe;
    if (comp && comp.fixtures.every(m => m.played)) {
      const qualified = getPernambucanoQualified(comp, state.teams);
      estadual.knockout = createPernambucanoKnockout(qualified);
      estadual.phase = "playoffs";
    }
    return;
  }
  const ko = estadual.knockout;
  if (!ko) return;
  advancePernambucanoKnockout(ko);
  estadual.phase = ko.phase;
  if (ko.phase === "done" && ko.champion && !estadual.champion) {
    estadual.champion = ko.champion;
  }
}

// -------------------- Formato Alagoano (bifurcações) --------------------

// Jogos do Alagoano numa rodada: 1ª fase (1..7, pontos corridos); mata-mata
// (8..11: semis e final ida/volta) via knockout.
function getAlagoanoMatchesForRound(state, estadual, round) {
  const out = [];
  if (round <= ALAGOANO_PHASE1_ROUNDS) {
    const comp = state.competitions.estadual_al;
    if (comp) for (const m of comp.fixtures) {
      if (m.round === round) out.push({ match: m, kind: "group", compId: "estadual_al" });
    }
    return out;
  }
  if (!estadual.knockout) return out;
  for (const entry of getAlagoanoKnockoutLegs(estadual.knockout, round)) {
    const kind = entry.kind === "final" ? "final" : "semi";
    out.push({ match: entry.leg, kind, tie: entry.tie });
  }
  return out;
}

// Avança o Alagoano: cria o mata-mata (top 4) ao fim da 1ª fase; delega ao KO.
function advanceAlagoanoEstadual(state, estadual, season, rng) {
  if (estadual.phase === "league") {
    const comp = state.competitions.estadual_al;
    if (comp && comp.fixtures.every(m => m.played)) {
      const { semifinalists } = getAlagoanoQualified(comp, state.teams);
      estadual.knockout = createAlagoanoKnockout(semifinalists);
      estadual.phase = "semis";
    }
    return;
  }
  const ko = estadual.knockout;
  if (!ko) return;
  advanceAlagoanoKnockout(ko);
  estadual.phase = ko.phase;
  if (ko.phase === "done" && ko.champion && !estadual.champion) {
    estadual.champion = ko.champion;
  }
}

// -------------------- Formato Goiano (bifurcações) --------------------

// Jogos do Goiano numa rodada: 1ª fase (1..8, grupos cruzados); mata-mata
// (9..14: quartas/semis/final ida/volta) via knockout.
function getGoianoMatchesForRound(state, estadual, round) {
  const out = [];
  if (round <= GOIANO_PHASE1_ROUNDS) {
    const comp = state.competitions.estadual_go;
    if (comp) for (const m of comp.fixtures) {
      if (m.round === round) out.push({ match: m, kind: "group", compId: "estadual_go" });
    }
    return out;
  }
  if (!estadual.knockout) return out;
  for (const entry of getGoianoKnockoutLegs(estadual.knockout, round)) {
    const kind = entry.kind === "final" ? "final" : "semi";
    out.push({ match: entry.leg, kind, tie: entry.tie });
  }
  return out;
}

// Avança o Goiano: cria o mata-mata (top 8 geral) ao fim da 1ª fase.
function advanceGoianoEstadual(state, estadual, season, rng) {
  if (estadual.phase === "groups") {
    const comp = state.competitions.estadual_go;
    if (comp && comp.fixtures.every(m => m.played)) {
      const qualified = getGoianoQualified(comp, state.teams);
      estadual.knockout = createGoianoKnockout(qualified);
      estadual.phase = "quarters";
    }
    return;
  }
  const ko = estadual.knockout;
  if (!ko) return;
  advanceGoianoKnockout(ko);
  estadual.phase = ko.phase;
  if (ko.phase === "done" && ko.champion && !estadual.champion) {
    estadual.champion = ko.champion;
  }
}

// -------------------- Formato Catarinense (bifurcações) --------------------

// Jogos do Catarinense numa rodada: 1ª fase (1..6, grupos cruzados); mata-mata
// (7..12: quartas/semis/final ida/volta) via knockout.
function getCatarinenseMatchesForRound(state, estadual, round) {
  const out = [];
  if (round <= CATARINENSE_GROUP_ROUNDS) {
    const comp = state.competitions.estadual_sc;
    if (comp) for (const m of comp.fixtures) {
      if (m.round === round) out.push({ match: m, kind: "group", compId: "estadual_sc" });
    }
    return out;
  }
  if (!estadual.knockout) return out;
  for (const entry of getCatarinenseKnockoutLegs(estadual.knockout, round)) {
    const kind = entry.kind === "final" ? "final" : "semi";
    out.push({ match: entry.leg, kind, tie: entry.tie });
  }
  return out;
}

// Avança o Catarinense: cria o mata-mata ao fim da 1ª fase; delega ao KO.
function advanceCatarinenseEstadual(state, estadual, season, rng) {
  if (estadual.phase === "groups") {
    const comp = state.competitions.estadual_sc;
    if (comp && comp.fixtures.every(m => m.played)) {
      const qualified = getCatarinenseQualified(comp);
      estadual.knockout = createCatarinenseKnockout(qualified);
      estadual.phase = "quarters";
    }
    return;
  }
  const ko = estadual.knockout;
  if (!ko) return;
  advanceCatarinenseKnockout(ko);
  estadual.phase = ko.phase;
  if (ko.phase === "done" && ko.champion && !estadual.champion) {
    estadual.champion = ko.champion;
  }
}

// -------------------- Formato Paraense (bifurcações) --------------------

// Jogos do Paraense numa rodada: 1ª fase (1..6, grupos cruzados); mata-mata
// (7 quartas, 8 semis em jogo único; 9/10 final ida/volta) via knockout.
function getParaenseMatchesForRound(state, estadual, round) {
  const out = [];
  if (round <= PARAENSE_GROUP_ROUNDS) {
    const comp = state.competitions.estadual_pa;
    if (comp) for (const m of comp.fixtures) {
      if (m.round === round) out.push({ match: m, kind: "group", compId: "estadual_pa" });
    }
    return out;
  }
  if (!estadual.knockout) return out;
  for (const entry of getParaenseKnockoutLegs(estadual.knockout, round)) {
    const kind = entry.kind === "final" ? "final" : "semi";
    out.push({ match: entry.leg, kind, tie: entry.tie });
  }
  return out;
}

// Avança o Paraense: cria o mata-mata (top 8 geral) ao fim da 1ª fase.
function advanceParaenseEstadual(state, estadual, season, rng) {
  if (estadual.phase === "groups") {
    const comp = state.competitions.estadual_pa;
    if (comp && comp.fixtures.every(m => m.played)) {
      const qualified = getParaenseQualified(comp, state.teams);
      estadual.knockout = createParaenseKnockout(qualified);
      estadual.phase = "quarters";
    }
    return;
  }
  const ko = estadual.knockout;
  if (!ko) return;
  advanceParaenseKnockout(ko);
  estadual.phase = ko.phase;
  if (ko.phase === "done" && ko.champion && !estadual.champion) {
    estadual.champion = ko.champion;
  }
}

// -------------------- Formato Acreano (bifurcações) --------------------

// Jogos do Acreano numa rodada: 1ª fase (1..7, pontos corridos); mata-mata
// (8/9 semis ida/volta; 10 final jogo único) via knockout.
function getAcreanoMatchesForRound(state, estadual, round) {
  const out = [];
  if (round <= ACREANO_PHASE1_ROUNDS) {
    const comp = state.competitions.estadual_ac;
    if (comp) for (const m of comp.fixtures) {
      if (m.round === round) out.push({ match: m, kind: "group", compId: "estadual_ac" });
    }
    return out;
  }
  if (!estadual.knockout) return out;
  for (const entry of getAcreanoKnockoutLegs(estadual.knockout, round)) {
    const kind = entry.kind === "final" ? "final" : "semi";
    out.push({ match: entry.leg, kind, tie: entry.tie });
  }
  return out;
}

// Avança o Acreano: cria o mata-mata (top 4) ao fim da 1ª fase.
function advanceAcreanoEstadual(state, estadual, season, rng) {
  if (estadual.phase === "league") {
    const comp = state.competitions.estadual_ac;
    if (comp && comp.fixtures.every(m => m.played)) {
      const qualified = getAcreanoQualified(comp, state.teams);
      estadual.knockout = createAcreanoKnockout(qualified);
      estadual.phase = "semis";
    }
    return;
  }
  const ko = estadual.knockout;
  if (!ko) return;
  advanceAcreanoKnockout(ko);
  estadual.phase = ko.phase;
  if (ko.phase === "done" && ko.champion && !estadual.champion) {
    estadual.champion = ko.champion;
  }
}

// -------------------- Formato Amazonense (bifurcações) --------------------

// Jogos do Amazonense numa rodada: 1º turno (fase 1-4, semis 5, final 6),
// 2º turno (fase 7-9, semis 10, final 11), grande final (12).
function getAmazonenseMatchesForRound(state, estadual, round) {
  const out = [];
  if (round <= AMAZONENSE_T1_PHASE_ROUNDS) {
    const c = state.competitions.estadual_am;
    if (c) for (const m of c.fixtures) if (m.round === round) out.push({ match: m, kind: "group", compId: "estadual_am" });
    return out;
  }
  if (round === AMAZONENSE_T1_SEMI_ROUND || round === AMAZONENSE_T1_FINAL_ROUND) {
    for (const e of getTurnoKnockoutLegs(estadual.t1ko, round)) out.push({ match: e.leg, kind: e.kind === "final" ? "final" : "semi", tie: e.tie });
    return out;
  }
  if (round >= AMAZONENSE_T2_PHASE_START && round < AMAZONENSE_T2_PHASE_START + AMAZONENSE_T2_PHASE_ROUNDS) {
    const c = state.competitions.estadual_am_t2;
    if (c) for (const m of c.fixtures) if (m.round === round) out.push({ match: m, kind: "group", compId: "estadual_am_t2" });
    return out;
  }
  if (round === AMAZONENSE_T2_SEMI_ROUND || round === AMAZONENSE_T2_FINAL_ROUND) {
    for (const e of getTurnoKnockoutLegs(estadual.t2ko, round)) out.push({ match: e.leg, kind: e.kind === "final" ? "final" : "semi", tie: e.tie });
    return out;
  }
  if (round === AMAZONENSE_GRAND_FINAL_ROUND && estadual.grandFinal && !estadual.grandFinal.leg.played) {
    out.push({ match: estadual.grandFinal.leg, kind: "final", tie: estadual.grandFinal });
  }
  return out;
}

// Máquina de estados dos dois turnos + grande final.
function advanceAmazonenseEstadual(state, estadual, season, rng) {
  if (estadual.phase === "t1_groups") {
    const c = state.competitions.estadual_am;
    if (c && c.fixtures.every(m => m.played)) {
      estadual.t1ko = createTurnoKnockout(getAmazonenseQualified(c, state.teams), AMAZONENSE_T1_SEMI_ROUND, AMAZONENSE_T1_FINAL_ROUND, "t1");
      estadual.phase = "t1_ko";
    }
    return;
  }
  if (estadual.phase === "t1_ko") {
    advanceTurnoKnockout(estadual.t1ko);
    if (estadual.t1ko.champion) {
      estadual.t1Champion = estadual.t1ko.champion;
      state.competitions.estadual_am_t2 = createAmazonenseT2Phase({ season, t1comp: state.competitions.estadual_am });
      estadual.phase = "t2_groups";
    }
    return;
  }
  if (estadual.phase === "t2_groups") {
    const c = state.competitions.estadual_am_t2;
    if (c && c.fixtures.every(m => m.played)) {
      estadual.t2ko = createTurnoKnockout(getAmazonenseQualified(c, state.teams), AMAZONENSE_T2_SEMI_ROUND, AMAZONENSE_T2_FINAL_ROUND, "t2");
      estadual.phase = "t2_ko";
    }
    return;
  }
  if (estadual.phase === "t2_ko") {
    advanceTurnoKnockout(estadual.t2ko);
    if (estadual.t2ko.champion) {
      estadual.t2Champion = estadual.t2ko.champion;
      if (estadual.t1Champion === estadual.t2Champion) {
        // Mesmo time venceu os dois turnos → campeão automático.
        estadual.champion = estadual.t1Champion;
        estadual.phase = "done";
      } else {
        estadual.grandFinal = makeGrandFinal(estadual.t1Champion, estadual.t2Champion);
        estadual.phase = "grand_final";
      }
    }
    return;
  }
  if (estadual.phase === "grand_final") {
    if (estadual.grandFinal?.winnerId && !estadual.champion) {
      estadual.champion = estadual.grandFinal.winnerId;
      estadual.phase = "done";
    }
    return;
  }
}

// -------------------- Formato Amapaense (bifurcações) --------------------

// Jogos do Amapaense numa rodada: 1ª fase (1..7, pontos corridos); mata-mata
// (8/9 semis, 10/11 final, ida/volta) via knockout.
function getAmapaenseMatchesForRound(state, estadual, round) {
  const out = [];
  if (round <= AMAPAENSE_PHASE1_ROUNDS) {
    const comp = state.competitions.estadual_ap;
    if (comp) for (const m of comp.fixtures) {
      if (m.round === round) out.push({ match: m, kind: "group", compId: "estadual_ap" });
    }
    return out;
  }
  if (!estadual.knockout) return out;
  for (const entry of getAmapaenseKnockoutLegs(estadual.knockout, round)) {
    const kind = entry.kind === "final" ? "final" : "semi";
    out.push({ match: entry.leg, kind, tie: entry.tie });
  }
  return out;
}

// Avança o Amapaense: cria o mata-mata (top 4) ao fim da 1ª fase.
function advanceAmapaenseEstadual(state, estadual, season, rng) {
  if (estadual.phase === "league") {
    const comp = state.competitions.estadual_ap;
    if (comp && comp.fixtures.every(m => m.played)) {
      const qualified = getAmapaenseQualified(comp, state.teams);
      estadual.knockout = createAmapaenseKnockout(qualified);
      estadual.phase = "semis";
    }
    return;
  }
  const ko = estadual.knockout;
  if (!ko) return;
  advanceAmapaenseKnockout(ko);
  estadual.phase = ko.phase;
  if (ko.phase === "done" && ko.champion && !estadual.champion) {
    estadual.champion = ko.champion;
  }
}

// -------------------- Formato Rondoniense (bifurcações) --------------------

// Jogos do Rondoniense numa rodada: 1ª fase (1..14, pontos corridos ida/volta);
// mata-mata (15/16 semis, 17/18 final, ida/volta) via knockout.
function getRondonienseMatchesForRound(state, estadual, round) {
  const out = [];
  if (round <= RONDONIENSE_PHASE1_ROUNDS) {
    const comp = state.competitions.estadual_ro;
    if (comp) for (const m of comp.fixtures) {
      if (m.round === round) out.push({ match: m, kind: "group", compId: "estadual_ro" });
    }
    return out;
  }
  if (!estadual.knockout) return out;
  for (const entry of getRondonienseKnockoutLegs(estadual.knockout, round)) {
    const kind = entry.kind === "final" ? "final" : "semi";
    out.push({ match: entry.leg, kind, tie: entry.tie });
  }
  return out;
}

// Avança o Rondoniense: cria o mata-mata (top 4) ao fim da 1ª fase.
function advanceRondonienseEstadual(state, estadual, season, rng) {
  if (estadual.phase === "league") {
    const comp = state.competitions.estadual_ro;
    if (comp && comp.fixtures.every(m => m.played)) {
      const qualified = getRondonienseQualified(comp, state.teams);
      estadual.knockout = createRondonienseKnockout(qualified);
      estadual.phase = "semis";
    }
    return;
  }
  const ko = estadual.knockout;
  if (!ko) return;
  advanceRondonienseKnockout(ko);
  estadual.phase = ko.phase;
  if (ko.phase === "done" && ko.champion && !estadual.champion) {
    estadual.champion = ko.champion;
  }
}

// -------------------- Formato Roraimense (bifurcações) --------------------

// Jogos do Roraimense numa rodada: 1ª fase (1..9, pontos corridos); mata-mata
// (10 semis, 11 final, jogo único) via knockout.
function getRoraimenseMatchesForRound(state, estadual, round) {
  const out = [];
  if (round <= RORAIMENSE_PHASE1_ROUNDS) {
    const comp = state.competitions.estadual_rr;
    if (comp) for (const m of comp.fixtures) {
      if (m.round === round) out.push({ match: m, kind: "group", compId: "estadual_rr" });
    }
    return out;
  }
  if (!estadual.knockout) return out;
  for (const entry of getRoraimenseKnockoutLegs(estadual.knockout, round)) {
    const kind = entry.kind === "final" ? "final" : "semi";
    out.push({ match: entry.leg, kind, tie: entry.tie });
  }
  return out;
}

// Avança o Roraimense: cria o mata-mata (top 4) ao fim da 1ª fase.
function advanceRoraimenseEstadual(state, estadual, season, rng) {
  if (estadual.phase === "league") {
    const comp = state.competitions.estadual_rr;
    if (comp && comp.fixtures.every(m => m.played)) {
      const qualified = getRoraimenseQualified(comp, state.teams);
      estadual.knockout = createRoraimenseKnockout(qualified);
      estadual.phase = "semis";
    }
    return;
  }
  const ko = estadual.knockout;
  if (!ko) return;
  advanceRoraimenseKnockout(ko);
  estadual.phase = ko.phase;
  if (ko.phase === "done" && ko.champion && !estadual.champion) {
    estadual.champion = ko.champion;
  }
}

// -------------------- Formato Tocantinense (bifurcações) --------------------

// Jogos do Tocantinense numa rodada: 1ª fase (1..7, pontos corridos); mata-mata
// (8/9 semis, 10/11 final, ida/volta) via knockout.
function getTocantinenseMatchesForRound(state, estadual, round) {
  const out = [];
  if (round <= TOCANTINENSE_PHASE1_ROUNDS) {
    const comp = state.competitions.estadual_to;
    if (comp) for (const m of comp.fixtures) {
      if (m.round === round) out.push({ match: m, kind: "group", compId: "estadual_to" });
    }
    return out;
  }
  if (!estadual.knockout) return out;
  for (const entry of getTocantinenseKnockoutLegs(estadual.knockout, round)) {
    const kind = entry.kind === "final" ? "final" : "semi";
    out.push({ match: entry.leg, kind, tie: entry.tie });
  }
  return out;
}

// Avança o Tocantinense: cria o mata-mata (top 4) ao fim da 1ª fase.
function advanceTocantinenseEstadual(state, estadual, season, rng) {
  if (estadual.phase === "league") {
    const comp = state.competitions.estadual_to;
    if (comp && comp.fixtures.every(m => m.played)) {
      const qualified = getTocantinenseQualified(comp, state.teams);
      estadual.knockout = createTocantinenseKnockout(qualified);
      estadual.phase = "semis";
    }
    return;
  }
  const ko = estadual.knockout;
  if (!ko) return;
  advanceTocantinenseKnockout(ko);
  estadual.phase = ko.phase;
  if (ko.phase === "done" && ko.champion && !estadual.champion) {
    estadual.champion = ko.champion;
  }
}

// -------------------- Formato Maranhense (bifurcações) --------------------

// Jogos do Maranhense numa rodada: 1ª fase (1..7, pontos corridos); mata-mata
// (8/9 semis, 10/11 final, ida/volta) via knockout.
function getMaranhenseMatchesForRound(state, estadual, round) {
  const out = [];
  if (round <= MARANHENSE_PHASE1_ROUNDS) {
    const comp = state.competitions.estadual_ma;
    if (comp) for (const m of comp.fixtures) {
      if (m.round === round) out.push({ match: m, kind: "group", compId: "estadual_ma" });
    }
    return out;
  }
  if (!estadual.knockout) return out;
  for (const entry of getMaranhenseKnockoutLegs(estadual.knockout, round)) {
    const kind = entry.kind === "final" ? "final" : "semi";
    out.push({ match: entry.leg, kind, tie: entry.tie });
  }
  return out;
}

// Avança o Maranhense: cria o mata-mata (top 4) ao fim da 1ª fase.
function advanceMaranhenseEstadual(state, estadual, season, rng) {
  if (estadual.phase === "league") {
    const comp = state.competitions.estadual_ma;
    if (comp && comp.fixtures.every(m => m.played)) {
      const qualified = getMaranhenseQualified(comp, state.teams);
      estadual.knockout = createMaranhenseKnockout(qualified);
      estadual.phase = "semis";
    }
    return;
  }
  const ko = estadual.knockout;
  if (!ko) return;
  advanceMaranhenseKnockout(ko);
  estadual.phase = ko.phase;
  if (ko.phase === "done" && ko.champion && !estadual.champion) {
    estadual.champion = ko.champion;
  }
}

// -------------------- Formato Paraibano (bifurcações) --------------------

// Jogos do Paraibano numa rodada: 1ª fase (1..9, pontos corridos); mata-mata
// (10/11 semis, 12/13 final, ida/volta) via knockout.
function getParaibanoMatchesForRound(state, estadual, round) {
  const out = [];
  if (round <= PARAIBANO_PHASE1_ROUNDS) {
    const comp = state.competitions.estadual_pb;
    if (comp) for (const m of comp.fixtures) {
      if (m.round === round) out.push({ match: m, kind: "group", compId: "estadual_pb" });
    }
    return out;
  }
  if (!estadual.knockout) return out;
  for (const entry of getParaibanoKnockoutLegs(estadual.knockout, round)) {
    const kind = entry.kind === "final" ? "final" : "semi";
    out.push({ match: entry.leg, kind, tie: entry.tie });
  }
  return out;
}

// Avança o Paraibano: cria o mata-mata (top 4) ao fim da 1ª fase.
function advanceParaibanoEstadual(state, estadual, season, rng) {
  if (estadual.phase === "league") {
    const comp = state.competitions.estadual_pb;
    if (comp && comp.fixtures.every(m => m.played)) {
      const qualified = getParaibanoQualified(comp, state.teams);
      estadual.knockout = createParaibanoKnockout(qualified);
      estadual.phase = "semis";
    }
    return;
  }
  const ko = estadual.knockout;
  if (!ko) return;
  advanceParaibanoKnockout(ko);
  estadual.phase = ko.phase;
  if (ko.phase === "done" && ko.champion && !estadual.champion) {
    estadual.champion = ko.champion;
  }
}

// -------------------- Formato Piauiense (bifurcações) --------------------

// Jogos do Piauiense numa rodada: 1ª fase (1..7, pontos corridos); mata-mata
// (8/9 semis, 10/11 final, ida/volta) via knockout.
function getPiauienseMatchesForRound(state, estadual, round) {
  const out = [];
  if (round <= PIAUIENSE_PHASE1_ROUNDS) {
    const comp = state.competitions.estadual_pi;
    if (comp) for (const m of comp.fixtures) {
      if (m.round === round) out.push({ match: m, kind: "group", compId: "estadual_pi" });
    }
    return out;
  }
  if (!estadual.knockout) return out;
  for (const entry of getPiauienseKnockoutLegs(estadual.knockout, round)) {
    const kind = entry.kind === "final" ? "final" : "semi";
    out.push({ match: entry.leg, kind, tie: entry.tie });
  }
  return out;
}

// Avança o Piauiense: cria o mata-mata (top 4) ao fim da 1ª fase.
function advancePiauienseEstadual(state, estadual, season, rng) {
  if (estadual.phase === "league") {
    const comp = state.competitions.estadual_pi;
    if (comp && comp.fixtures.every(m => m.played)) {
      const qualified = getPiauienseQualified(comp, state.teams);
      estadual.knockout = createPiauienseKnockout(qualified);
      estadual.phase = "semis";
    }
    return;
  }
  const ko = estadual.knockout;
  if (!ko) return;
  advancePiauienseKnockout(ko);
  estadual.phase = ko.phase;
  if (ko.phase === "done" && ko.champion && !estadual.champion) {
    estadual.champion = ko.champion;
  }
}

// -------------------- Formato Potiguar (bifurcações) --------------------

// Jogos do Potiguar numa rodada: 1ª fase (1..7, pontos corridos); mata-mata
// (8/9 repescagem, 10/11 semis, 12/13 final, ida/volta) via knockout.
function getPotiguarMatchesForRound(state, estadual, round) {
  const out = [];
  if (round <= POTIGUAR_PHASE1_ROUNDS) {
    const comp = state.competitions.estadual_rn;
    if (comp) for (const m of comp.fixtures) {
      if (m.round === round) out.push({ match: m, kind: "group", compId: "estadual_rn" });
    }
    return out;
  }
  if (!estadual.knockout) return out;
  for (const entry of getPotiguarKnockoutLegs(estadual.knockout, round)) {
    const kind = entry.kind === "final" ? "final" : "semi";
    out.push({ match: entry.leg, kind, tie: entry.tie });
  }
  return out;
}

// Avança o Potiguar: cria o mata-mata (top 6) ao fim da 1ª fase.
function advancePotiguarEstadual(state, estadual, season, rng) {
  if (estadual.phase === "league") {
    const comp = state.competitions.estadual_rn;
    if (comp && comp.fixtures.every(m => m.played)) {
      const qualified = getPotiguarQualified(comp, state.teams);
      estadual.knockout = createPotiguarKnockout(qualified);
      estadual.phase = "playoffs";
    }
    return;
  }
  const ko = estadual.knockout;
  if (!ko) return;
  advancePotiguarKnockout(ko);
  estadual.phase = ko.phase;
  if (ko.phase === "done" && ko.champion && !estadual.champion) {
    estadual.champion = ko.champion;
  }
}

// -------------------- Formato Sergipano (bifurcações) --------------------

// Jogos do Sergipano numa rodada: 1ª fase (1..9, pontos corridos); mata-mata
// (10/11 repescagem, 12/13 semis, 14/15 final, ida/volta) via knockout.
function getSergipanoMatchesForRound(state, estadual, round) {
  const out = [];
  if (round <= SERGIPANO_PHASE1_ROUNDS) {
    const comp = state.competitions.estadual_se;
    if (comp) for (const m of comp.fixtures) {
      if (m.round === round) out.push({ match: m, kind: "group", compId: "estadual_se" });
    }
    return out;
  }
  if (!estadual.knockout) return out;
  for (const entry of getSergipanoKnockoutLegs(estadual.knockout, round)) {
    const kind = entry.kind === "final" ? "final" : "semi";
    out.push({ match: entry.leg, kind, tie: entry.tie });
  }
  return out;
}

// Avança o Sergipano: cria o mata-mata (top 7) ao fim da 1ª fase.
function advanceSergipanoEstadual(state, estadual, season, rng) {
  if (estadual.phase === "league") {
    const comp = state.competitions.estadual_se;
    if (comp && comp.fixtures.every(m => m.played)) {
      const qualified = getSergipanoQualified(comp, state.teams);
      estadual.knockout = createSergipanoKnockout(qualified);
      estadual.phase = "playoffs";
    }
    return;
  }
  const ko = estadual.knockout;
  if (!ko) return;
  advanceSergipanoKnockout(ko);
  estadual.phase = ko.phase;
  if (ko.phase === "done" && ko.champion && !estadual.champion) {
    estadual.champion = ko.champion;
  }
}

// -------------------- Formato Mato-grossense (bifurcações) --------------------

// Jogos do Mato-grossense numa rodada: 1ª fase (1..9, pontos corridos); mata-mata
// (10 quartas jogo único, 11/12 semis, 13/14 final ida/volta) via knockout.
function getMatogrossenseMatchesForRound(state, estadual, round) {
  const out = [];
  if (round <= MATOGROSSENSE_PHASE1_ROUNDS) {
    const comp = state.competitions.estadual_mt;
    if (comp) for (const m of comp.fixtures) {
      if (m.round === round) out.push({ match: m, kind: "group", compId: "estadual_mt" });
    }
    return out;
  }
  if (!estadual.knockout) return out;
  for (const entry of getMatogrossenseKnockoutLegs(estadual.knockout, round)) {
    const kind = entry.kind === "final" ? "final" : "semi";
    out.push({ match: entry.leg, kind, tie: entry.tie });
  }
  return out;
}

// Avança o Mato-grossense: cria o mata-mata (top 6) ao fim da 1ª fase.
function advanceMatogrossenseEstadual(state, estadual, season, rng) {
  if (estadual.phase === "league") {
    const comp = state.competitions.estadual_mt;
    if (comp && comp.fixtures.every(m => m.played)) {
      const qualified = getMatogrossenseQualified(comp, state.teams);
      estadual.knockout = createMatogrossenseKnockout(qualified);
      estadual.phase = "quarters";
    }
    return;
  }
  const ko = estadual.knockout;
  if (!ko) return;
  advanceMatogrossenseKnockout(ko);
  estadual.phase = ko.phase;
  if (ko.phase === "done" && ko.champion && !estadual.champion) {
    estadual.champion = ko.champion;
  }
}

// -------------------- Formato Sul-mato-grossense (bifurcações) --------------------

// Jogos do Sul-mato-grossense numa rodada: 1ª fase (1..9, pontos corridos);
// mata-mata (10/11 quartas, 12/13 semis, 14/15 final, tudo ida/volta) via knockout.
function getSulmatogrossenseMatchesForRound(state, estadual, round) {
  const out = [];
  if (round <= SULMS_PHASE1_ROUNDS) {
    const comp = state.competitions.estadual_ms;
    if (comp) for (const m of comp.fixtures) {
      if (m.round === round) out.push({ match: m, kind: "group", compId: "estadual_ms" });
    }
    return out;
  }
  if (!estadual.knockout) return out;
  for (const entry of getSulmatogrossenseKnockoutLegs(estadual.knockout, round)) {
    const kind = entry.kind === "final" ? "final" : "semi";
    out.push({ match: entry.leg, kind, tie: entry.tie });
  }
  return out;
}

// Avança o Sul-mato-grossense: cria o mata-mata (top 6) ao fim da 1ª fase.
function advanceSulmatogrossenseEstadual(state, estadual, season, rng) {
  if (estadual.phase === "league") {
    const comp = state.competitions.estadual_ms;
    if (comp && comp.fixtures.every(m => m.played)) {
      const qualified = getSulmatogrossenseQualified(comp, state.teams);
      estadual.knockout = createSulmatogrossenseKnockout(qualified);
      estadual.phase = "quarters";
    }
    return;
  }
  const ko = estadual.knockout;
  if (!ko) return;
  advanceSulmatogrossenseKnockout(ko);
  estadual.phase = ko.phase;
  if (ko.phase === "done" && ko.champion && !estadual.champion) {
    estadual.champion = ko.champion;
  }
}

// Helpers de UI: lista IDs de competições de grupo de um estadual
export function getEstadualGroupComps(state, estadual) {
  return estadual.groupIds.map(gid => state.competitions[gid]).filter(Boolean);
}

function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
