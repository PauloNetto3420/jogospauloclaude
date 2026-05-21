// Fábrica + gerador procedural de jogadores.

export const POSITIONS = ["GOL", "ZAG", "LD", "LE", "VOL", "MEI", "PE", "PD", "ATA"];

// Pesos por posição para cálculo do overall (soma = 1)
const WEIGHTS = {
  GOL: { goalkeeping: 0.70, physical: 0.15, defending: 0.10, pace: 0.05, finishing: 0, passing: 0, dribbling: 0 },
  ZAG: { defending: 0.45, physical: 0.25, pace: 0.10, passing: 0.10, finishing: 0.02, dribbling: 0.03, goalkeeping: 0.05 },
  LD:  { defending: 0.30, pace: 0.20, physical: 0.15, passing: 0.15, dribbling: 0.15, finishing: 0.05, goalkeeping: 0 },
  LE:  { defending: 0.30, pace: 0.20, physical: 0.15, passing: 0.15, dribbling: 0.15, finishing: 0.05, goalkeeping: 0 },
  VOL: { defending: 0.30, passing: 0.25, physical: 0.20, dribbling: 0.10, pace: 0.05, finishing: 0.10, goalkeeping: 0 },
  MEI: { passing: 0.35, dribbling: 0.25, finishing: 0.15, pace: 0.10, defending: 0.05, physical: 0.10, goalkeeping: 0 },
  PE:  { pace: 0.25, dribbling: 0.25, passing: 0.15, finishing: 0.20, physical: 0.10, defending: 0.05, goalkeeping: 0 },
  PD:  { pace: 0.25, dribbling: 0.25, passing: 0.15, finishing: 0.20, physical: 0.10, defending: 0.05, goalkeeping: 0 },
  ATA: { finishing: 0.40, pace: 0.20, dribbling: 0.15, physical: 0.15, passing: 0.05, defending: 0.02, goalkeeping: 0.03 },
};

const TRAITS_POOL = [
  "finalizador", "lider_nato", "veloz", "tecnico", "cabeceador",
  "lesoes_frequentes", "inconsistente", "promessa", "pe_de_obra",
];

// Distribuição típica de um elenco profissional brasileiro (25 jogadores)
const SQUAD_TEMPLATE = [
  "GOL", "GOL", "GOL",
  "ZAG", "ZAG", "ZAG", "ZAG",
  "LD", "LD", "LE", "LE",
  "VOL", "VOL", "VOL",
  "MEI", "MEI", "MEI",
  "PE", "PE", "PD", "PD",
  "ATA", "ATA", "ATA", "ATA",
];

const FIRST_NAMES = [
  "Lucas", "Pedro", "Gabriel", "João", "Matheus", "Bruno", "Rafael", "Felipe",
  "Diego", "Thiago", "Vinícius", "Eduardo", "Carlos", "Rodrigo", "Marcelo",
  "André", "Igor", "Yuri", "Caio", "Fernando", "Henrique", "Ricardo", "Daniel",
  "Leandro", "Marcos", "Paulo", "Júnior", "Vitor", "Wesley", "Robson",
];

const LAST_NAMES = [
  "Silva", "Santos", "Oliveira", "Souza", "Lima", "Pereira", "Ferreira",
  "Costa", "Rodrigues", "Almeida", "Nascimento", "Carvalho", "Gomes", "Martins",
  "Araújo", "Ribeiro", "Alves", "Barbosa", "Cardoso", "Teixeira", "Moreira",
  "Cavalcante", "Dias", "Rocha", "Mendes", "Freitas", "Vieira", "Pinto",
];

let _pidCounter = 1;
function nextPlayerId() {
  return "p_" + String(_pidCounter++).padStart(5, "0");
}

// Após um load, varre os IDs existentes e reposiciona o contador para
// evitar colisões quando novos agentes livres forem gerados.
export function syncPlayerIdCounter(playersById) {
  let max = 0;
  for (const id of Object.keys(playersById)) {
    const n = parseInt(id.slice(2), 10);
    if (!isNaN(n) && n > max) max = n;
  }
  _pidCounter = max + 1;
}

function calcOverall(attrs, position) {
  const w = WEIGHTS[position];
  let total = 0;
  for (const k of Object.keys(w)) total += attrs[k] * w[k];
  return Math.round(total);
}

function calcMarketValue(overall, age, potential) {
  // curva simples: pico aos 26, jovem com potencial vale mais
  const ageFactor = age < 24 ? 1.3 : age < 28 ? 1.0 : age < 32 ? 0.7 : 0.35;
  const potBonus = Math.max(0, potential - overall) * 0.05;
  const base = Math.pow(Math.max(overall - 50, 1), 2.2) * 25_000;
  return Math.round(base * ageFactor * (1 + potBonus));
}

function calcSalary(overall, age) {
  const base = Math.pow(Math.max(overall - 50, 1), 1.9) * 800;
  const ageMod = age > 30 ? 1.1 : 1.0;
  return Math.round(base * ageMod / 1000) * 1000;
}

export function createPlayer({ rng, teamId, position, teamReputation }) {
  const age = rng.int(17, 36);
  // Atributos calibrados pela reputação do clube (clubes grandes têm jogadores melhores)
  const baseMean = 45 + teamReputation * 0.35; // ~58 para rep 40, ~80 para rep 95
  const stdev = 8;

  const attrs = {
    pace: clamp(rng.gauss(baseMean, stdev)),
    finishing: clamp(rng.gauss(baseMean, stdev)),
    passing: clamp(rng.gauss(baseMean, stdev)),
    dribbling: clamp(rng.gauss(baseMean, stdev)),
    defending: clamp(rng.gauss(baseMean, stdev)),
    physical: clamp(rng.gauss(baseMean, stdev)),
    goalkeeping: position === "GOL"
      ? clamp(rng.gauss(baseMean + 10, stdev))
      : clamp(rng.gauss(20, 8)),
  };

  // Reforça o atributo principal da posição
  const w = WEIGHTS[position];
  for (const k of Object.keys(w)) {
    if (w[k] >= 0.25) attrs[k] = clamp(attrs[k] + rng.int(5, 12));
  }

  const overall = calcOverall(attrs, position);
  const potential = age < 23
    ? clamp(overall + rng.int(3, 15))
    : clamp(overall + rng.int(0, 3));

  const traits = [];
  if (rng.chance(0.25)) traits.push(rng.pick(TRAITS_POOL));
  if (rng.chance(0.10)) traits.push(rng.pick(TRAITS_POOL));

  return {
    id: nextPlayerId(),
    name: `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`,
    age,
    nationality: "BRA",
    position,
    altPositions: [],
    teamId,
    attributes: attrs,
    overall,
    potential,
    traits: [...new Set(traits)],
    contract: {
      salary: calcSalary(overall, age),
      bonusPerGoal: Math.round(calcSalary(overall, age) * 0.05),
      until: `${2026 + rng.int(1, 4)}-12-31`,
      releaseClause: calcMarketValue(overall, age, potential) * 2,
    },
    marketValue: calcMarketValue(overall, age, potential),
    status: {
      fitness: 100,
      morale: 70,
      form: 6.5,
      injury: null,
      suspendedMatches: 0,
      yellowCardsInCompetition: {},
    },
    stats: {},
    history: [],
  };
}

function clamp(v) { return Math.max(1, Math.min(99, Math.round(v))); }

// Recalcula overall + valor de mercado depois de mudar atributos/idade.
export function recalcDerived(player) {
  player.overall = calcOverall(player.attributes, player.position);
  player.marketValue = calcMarketValue(player.overall, player.age, player.potential);
}

// Avança 1 ano de carreira do jogador.
// Retorna true se ele se aposentou (não joga mais).
export function evolvePlayer(player, rng) {
  player.age += 1;

  // Aposentadoria: 38+ com overall caindo, ou 40+ sempre
  if (player.age >= 40 || (player.age >= 38 && player.overall < 70)) {
    return true; // retired
  }

  // Evolução / declínio dos atributos
  const drift = ageDrift(player.age);
  for (const k of Object.keys(player.attributes)) {
    if (k === "goalkeeping" && player.position !== "GOL") continue;
    const noise = rng.int(-1, 1);
    let change = drift + noise;
    // Jovens com potencial alto crescem mais rápido
    if (player.age < 24 && player.overall < player.potential) {
      change += rng.int(0, 2);
    }
    player.attributes[k] = clamp(player.attributes[k] + change);
  }

  recalcDerived(player);
  // Forma e fitness resetam entre temporadas
  player.status.form = 6.5;
  player.status.fitness = 100;
  // Cartões amarelos por competição zeram
  player.status.yellowCardsInCompetition = {};

  return false;
}

function ageDrift(age) {
  if (age < 22) return 2;     // forte crescimento
  if (age < 26) return 1;     // crescimento moderado
  if (age < 30) return 0;     // estável
  if (age < 33) return -1;    // declínio leve
  return -2;                  // declínio acelerado
}

// Gera um elenco completo (~25 jogadores) para um time
export function generateSquad(rng, team) {
  return SQUAD_TEMPLATE.map(pos => createPlayer({
    rng,
    teamId: team.id,
    position: pos,
    teamReputation: team.reputation,
  }));
}
