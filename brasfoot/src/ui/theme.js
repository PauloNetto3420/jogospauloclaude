// Tema dinâmico por time — troca as variáveis CSS --accent / --accent-2
// (e versões RGB) pelas cores do clube gerenciado. Cores escuras são
// clareadas para manter contraste com o texto preto dos botões.

export function applyTeamTheme(teamColors) {
  const root = document.documentElement;
  if (!teamColors) {
    root.style.setProperty("--accent",       "#00d97e");
    root.style.setProperty("--accent-2",     "#0ea5e9");
    root.style.setProperty("--accent-rgb",   "0, 217, 126");
    root.style.setProperty("--accent-2-rgb", "14, 165, 233");
    return;
  }
  const accent  = ensureBright(teamColors.primary, 0.35);
  const accent2 = ensureBright(teamColors.secondary, 0.35);
  root.style.setProperty("--accent",       accent);
  root.style.setProperty("--accent-2",     accent2);
  root.style.setProperty("--accent-rgb",   hexToRgbStr(accent));
  root.style.setProperty("--accent-2-rgb", hexToRgbStr(accent2));
}

export function luminance(hex) {
  const { r, g, b } = parseHex(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

export function lighten(hex, amount) {
  let { r, g, b } = parseHex(hex);
  r = Math.round(r + (255 - r) * amount);
  g = Math.round(g + (255 - g) * amount);
  b = Math.round(b + (255 - b) * amount);
  return "#" + [r, g, b].map(x => x.toString(16).padStart(2, "0")).join("");
}

export function parseHex(hex) {
  hex = (hex || "#888888").replace("#", "");
  return {
    r: parseInt(hex.substr(0, 2), 16),
    g: parseInt(hex.substr(2, 2), 16),
    b: parseInt(hex.substr(4, 2), 16),
  };
}

export function hexToRgbStr(hex) {
  const { r, g, b } = parseHex(hex);
  return `${r}, ${g}, ${b}`;
}

// Clareia iterativamente até atingir luminância mínima (garante contraste)
export function ensureBright(hex, minLum) {
  let cur = hex || "#888888";
  let lum = luminance(cur);
  let iterations = 0;
  while (lum < minLum && iterations < 8) {
    const next = lighten(cur, 0.3);
    const nextLum = luminance(next);
    if (nextLum <= lum) break;
    cur = next;
    lum = nextLum;
    iterations++;
  }
  return cur;
}
