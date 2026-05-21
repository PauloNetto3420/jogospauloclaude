// PRNG determinístico (mulberry32). Aceita seed para reproduzir times/jogadores.
export function createRng(seed = Date.now()) {
  let s = seed >>> 0;
  const rand = () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next: rand,
    int: (min, max) => Math.floor(rand() * (max - min + 1)) + min,
    pick: (arr) => arr[Math.floor(rand() * arr.length)],
    // distribuição aproximadamente normal (soma de 3 uniformes)
    gauss: (mean, stdev) => {
      const u = (rand() + rand() + rand()) / 3; // 0..1, centrado em 0.5
      return mean + (u - 0.5) * 2 * stdev * 1.732;
    },
    chance: (p) => rand() < p,
  };
}
