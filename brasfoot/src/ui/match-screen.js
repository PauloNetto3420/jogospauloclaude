// Tela de partida ao vivo (overlay #overlay).
// Roda o simulador minuto a minuto, mostra placar/eventos/stats,
// permite substituições do usuário e ticka jogos paralelos em paralelo.
// Ao terminar, aplica resultados dos paralelos no estado e dispara onContinue.

import { state, ui, rng } from "../core/store.js";
import { teamLogo, ovrClass } from "./format.js";
import { createMatchSimulator } from "../engine/match.js";
import { applyMatchResult } from "../engine/season.js";
import { applyCupLegToState, applyEstadualMatchResult } from "../core/match-apply.js";

// Velocidades disponíveis durante o jogo (ms por minuto simulado).
// "skip" pula direto pro final (0ms entre minutos).
const MATCH_SPEEDS = {
  "1x":   400,    // ~36s de partida → confortável de assistir
  "2x":   200,    // ~18s
  "4x":   90,     // ~8s
  "skip": 0,      // instantâneo
};
const DEFAULT_SPEED = "1x";
// Pausa extra quando algo importante acontece (gol/expulsão/lesão) — dá tempo de ler
const EVENT_PAUSE_BONUS = 800;

export function playMatchOnScreen(match, sim, onContinue, parallels = []) {
  const $overlay = document.getElementById("match-overlay");
  const home = state.teams[match.homeTeamId];
  const away = state.teams[match.awayTeamId];
  // Qual lado o usuário controla
  const userSide = match.homeTeamId === ui.myTeamId ? "home" : "away";

  // Cria simuladores das partidas paralelas (todas IA vs IA)
  const parallelSims = parallels.map(p => ({
    ...p,
    home: state.teams[p.match.homeTeamId],
    away: state.teams[p.match.awayTeamId],
    sim: createMatchSimulator({
      homeTeam: state.teams[p.match.homeTeamId],
      awayTeam: state.teams[p.match.awayTeamId],
      playersById: state.players, rng,
    }),
  }));
  let parallelsApplied = false;

  let speed = DEFAULT_SPEED;
  let timer = null;
  let paused = false;
  let aborted = false;
  let subPanel = { open: false, pendingOut: null, subsAtOpen: 0 };

  $overlay.classList.add("visible");

  const getDisplayStats = () => {
    return {
      home: { ...sim.stats.home, yellows: sim.stats.home.yellows },
      away: { ...sim.stats.away, yellows: sim.stats.away.yellows },
    };
  };

  // Estrutura ESTÁTICA do placar (escudos, nomes, formação). Renderizada
  // uma única vez por partida — não pode entrar no loop de tick, senão as
  // <img> dos escudos são recriadas a cada minuto e "piscam".
  const renderScoreboardShell = () => {
    document.getElementById("scoreboard").innerHTML = `
      <div class="team">
        <div style="display:flex;align-items:center;justify-content:center;gap:12px;margin-bottom:6px">
          ${teamLogo(home.id, 48)}
          <div class="name">${home.name}</div>
        </div>
        <div class="short">${home.shortName} · ${home.tactics?.formation || "4-3-3"}</div>
      </div>
      <div class="center">
        <div class="score"><span class="sc" id="sc-home">${sim.score.home}</span> <span style="color:var(--muted);font-size:32px">×</span> <span class="sc" id="sc-away">${sim.score.away}</span></div>
        <div class="minute" id="match-minute">${sim.minute >= 90 ? "FIM DE JOGO" : sim.minute + "'"}</div>
      </div>
      <div class="team">
        <div style="display:flex;align-items:center;justify-content:center;gap:12px;margin-bottom:6px">
          <div class="name">${away.name}</div>
          ${teamLogo(away.id, 48)}
        </div>
        <div class="short">${away.shortName} · ${away.tactics?.formation || "4-3-3"}</div>
      </div>
    `;
  };

  // Controle de re-render do feed: só reconstrói quando há evento novo ou
  // o painel de substituição abre/fecha (evita re-animar a lista todo tick).
  let lastEventCount = -1;
  let lastSubPanelOpen = null;

  const renderFeed = () => {
    if (subPanel.open) {
      document.getElementById("match-events").innerHTML = renderSubPanelHTML();
      wireSubPanel();
    } else {
      document.getElementById("match-events").innerHTML = sim.events.length
        ? sim.events.slice().reverse().map(e => `
          <div class="event ${e.type}">
            <span class="min">${e.minute}'</span>
            <span>${e.description}</span>
          </div>`).join("")
        : `<p style="color:var(--muted)">Aguardando o apito inicial...</p>`;
    }
  };

  const renderMatch = () => {
    // Garante o shell (auto-cura se o scoreboard estiver vazio/obsoleto)
    if (!document.getElementById("sc-home")) renderScoreboardShell();

    // Atualiza só os números (sem tocar nos escudos → sem flicker)
    document.getElementById("sc-home").textContent = sim.score.home;
    document.getElementById("sc-away").textContent = sim.score.away;
    const minEl = document.getElementById("match-minute");
    if (minEl) minEl.textContent = sim.minute >= 90 ? "FIM DE JOGO" : sim.minute + "'";

    // Feed: só re-renderiza quando muda de verdade
    if (sim.events.length !== lastEventCount || subPanel.open !== lastSubPanelOpen) {
      renderFeed();
      lastEventCount = sim.events.length;
      lastSubPanelOpen = subPanel.open;
    }

    const ds = getDisplayStats();
    document.getElementById("match-stats").innerHTML = renderMatchStats(ds.home, ds.away);
    renderParallelsPanel();
  };

  // Atualiza a barra de progresso do tempo (0→90'). CSS faz a transição suave.
  const updateProgress = () => {
    const fill = document.getElementById("match-progress-fill");
    if (fill) fill.style.width = `${Math.min(100, (sim.minute / 90) * 100)}%`;
  };

  // Dispara o feedback visual de gol: bump no número, flash no placar e banner.
  // side = "home" | "away". O usuário marcou se side === userSide.
  const celebrateGoal = (side) => {
    const pro = side === userSide;
    const overlay = $overlay;
    // Flash da scoreboard (verde = a favor, vermelho = contra)
    overlay.classList.remove("flash-pro", "flash-con");
    void overlay.offsetWidth; // reinicia a animação
    overlay.classList.add(pro ? "flash-pro" : "flash-con");
    setTimeout(() => overlay.classList.remove("flash-pro", "flash-con"), 950);

    // Bump no número que mudou
    const sc = document.getElementById(side === "home" ? "sc-home" : "sc-away");
    if (sc) { sc.classList.remove("bump"); void sc.offsetWidth; sc.classList.add("bump"); }

    // Banner "GOL!" sobreposto
    const banner = document.createElement("div");
    banner.className = "goal-banner" + (pro ? "" : " con");
    banner.textContent = pro ? "⚽ GOL!" : "GOL";
    overlay.appendChild(banner);
    setTimeout(() => banner.remove(), 1400);
  };

  const renderParallelsPanel = () => {
    const el = document.getElementById("match-parallels");
    if (!el) return;
    if (!parallelSims.length) {
      el.innerHTML = `<h3>Outros Jogos</h3><p style="color:var(--muted);font-size:12px">Nenhum outro jogo nesta rodada.</p>`;
      return;
    }
    // Agrupa por tipo
    const groups = { copa_brasil: [], brasileirao_a: [], brasileirao_b: [] };
    for (const ps of parallelSims) {
      const key = ps.isCup ? "copa_brasil" : ps.compId;
      if (!groups[key]) groups[key] = [];
      groups[key].push(ps);
    }
    const groupTitle = { copa_brasil: "🏆 Copa", brasileirao_a: "📊 Série A", brasileirao_b: "📊 Série B" };

    let html = `<h3 style="font-size:13px;margin-bottom:10px">Outros Jogos · ${sim.minute}'</h3>`;
    for (const key of ["copa_brasil", "brasileirao_a", "brasileirao_b"]) {
      const list = groups[key];
      if (!list || !list.length) continue;
      html += `<div style="color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:0.6px;margin:10px 0 6px">${groupTitle[key]}</div>`;
      for (const ps of list) {
        const sc = ps.sim.score;
        const finished = ps.sim.isFinished();
        html += `
          <div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:6px;padding:4px 6px;border-radius:4px;font-size:11px;background:${finished ? "rgba(255,255,255,0.02)" : "var(--bg-2)"};margin-bottom:3px">
            <div style="text-align:right;color:${sc.home > sc.away ? "var(--accent)" : "var(--muted)"};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
              ${ps.home.shortName}
            </div>
            <div style="font-weight:700;min-width:32px;text-align:center;font-variant-numeric:tabular-nums">
              ${sc.home}–${sc.away}
            </div>
            <div style="color:${sc.away > sc.home ? "var(--accent)" : "var(--muted)"};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
              ${ps.away.shortName}
            </div>
          </div>`;
      }
    }
    el.innerHTML = html;
  };

  const renderControls = () => {
    const info = sim.canSubstitute(userSide);
    const subEnabled = !sim.isFinished() && info.subsLeft > 0 && info.windowsLeft > 0;

    document.getElementById("match-footer").innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:center">
        <span style="color:var(--muted);font-size:12px">Velocidade:</span>
        ${Object.keys(MATCH_SPEEDS).filter(k => k !== "skip").map(k => `
          <button class="btn-toggle ${speed === k ? "on" : ""}" data-speed="${k}" ${subPanel.open ? "disabled" : ""}>${k}</button>
        `).join("")}
        <button class="btn-toggle" data-speed="skip" ${subPanel.open ? "disabled" : ""}>⏭ Pular</button>
        <span style="border-left:1px solid var(--border);height:24px;margin:0 4px"></span>
        <button class="btn btn-sm" id="btn-sub" ${subEnabled ? "" : "disabled"}>
          🔄 Substituir (${info.subsLeft}/5 · ${info.windowsLeft} janelas)
        </button>
      </div>
    `;
    document.querySelectorAll("[data-speed]").forEach(btn => {
      btn.onclick = () => {
        speed = btn.dataset.speed;
        renderControls();
        if (speed === "skip") {
          clearTimeout(timer);
          fastForward();
        }
      };
    });
    document.getElementById("btn-sub")?.addEventListener("click", openSubPanel);
  };

  const openSubPanel = () => {
    if (sim.isFinished()) return;
    const info = sim.canSubstitute(userSide);
    paused = true;
    clearTimeout(timer);
    subPanel.open = true;
    subPanel.pendingOut = null;
    subPanel.subsAtOpen = info.subsUsed;
    renderMatch();
    renderControls();
  };

  const closeSubPanel = () => {
    const info = sim.canSubstitute(userSide);
    const didSub = info.subsUsed > subPanel.subsAtOpen;
    if (didSub) sim.closeWindow(userSide, true);
    subPanel.open = false;
    subPanel.pendingOut = null;
    paused = false;
    renderMatch();
    renderControls();
    if (!sim.isFinished()) {
      timer = setTimeout(tick, MATCH_SPEEDS[speed]);
    }
  };

  const renderSubPanelHTML = () => {
    const info = sim.canSubstitute(userSide);
    const onField = info.onField;
    const bench = info.bench;

    const fieldRow = p => {
      const isPending = subPanel.pendingOut === p.id;
      return `
        <div data-out="${p.id}" style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;border-radius:4px;cursor:pointer;background:${isPending ? "rgba(245,158,11,0.18)" : "transparent"};border:1px solid ${isPending ? "var(--warning)" : "transparent"}">
          <div><span class="badge badge-pos">${p.position}</span> <b style="font-size:12px">${p.name}</b></div>
          <span class="badge badge-ovr ${ovrClass(p.overall)}">${p.overall}</span>
        </div>
      `;
    };

    const benchRow = p => {
      const enabled = subPanel.pendingOut !== null;
      return `
        <div data-in="${p.id}" style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;border-radius:4px;cursor:${enabled ? "pointer" : "not-allowed"};opacity:${enabled ? 1 : 0.5}">
          <div><span class="badge badge-pos">${p.position}</span> <b style="font-size:12px">${p.name}</b></div>
          <span class="badge badge-ovr ${ovrClass(p.overall)}">${p.overall}</span>
        </div>
      `;
    };

    return `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <h3 style="margin:0">Substituições</h3>
        <div style="font-size:11px;color:var(--muted)">
          Restantes: <b style="color:var(--text)">${info.subsLeft}/5</b> ·
          Janelas: <b style="color:var(--text)">${info.windowsLeft}/3</b>
        </div>
      </div>
      <p style="font-size:11px;color:var(--muted);margin-bottom:10px">
        ${subPanel.pendingOut
          ? "Agora clique no jogador da reserva para entrar."
          : "Clique no titular que vai sair. (Cada confirmação conta 1 janela, mesmo com várias trocas)"}
      </p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:12px">
        <div>
          <div style="color:var(--muted);font-size:10px;text-transform:uppercase;margin-bottom:6px">Em campo (${onField.length})</div>
          ${onField.map(fieldRow).join("")}
        </div>
        <div>
          <div style="color:var(--muted);font-size:10px;text-transform:uppercase;margin-bottom:6px">Banco (${bench.length})</div>
          ${bench.map(benchRow).join("") || "<p style='color:var(--muted);font-size:11px'>Sem reservas disponíveis.</p>"}
        </div>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px;padding-top:10px;border-top:1px solid var(--border)">
        <button class="btn btn-sm btn-secondary" id="btn-sub-close">Fechar / Voltar ao Jogo</button>
      </div>
    `;
  };

  const wireSubPanel = () => {
    document.querySelectorAll("[data-out]").forEach(el => {
      el.onclick = () => {
        subPanel.pendingOut = el.dataset.out;
        renderFeed(); // redesenha só o painel (destaca o selecionado), sem flicker
        wireSubPanel();
      };
    });
    document.querySelectorAll("[data-in]").forEach(el => {
      el.onclick = () => {
        if (!subPanel.pendingOut) return;
        const res = sim.substitute(userSide, subPanel.pendingOut, el.dataset.in);
        if (!res.ok) {
          alert(res.message);
          return;
        }
        subPanel.pendingOut = null;
        renderFeed();      // atualiza listas em campo/banco
        wireSubPanel();
        renderControls();  // atualiza contador de trocas/janelas
      };
    });
    document.getElementById("btn-sub-close")?.addEventListener("click", closeSubPanel);
  };

  const tickParallels = () => {
    for (const ps of parallelSims) {
      if (!ps.sim.isFinished()) {
        ps.sim.tick();
        if (ps.sim.minute === 60 || ps.sim.minute === 75) {
          aiAutoSubsInteractive(ps.sim, "home", state.players, rng);
          aiAutoSubsInteractive(ps.sim, "away", state.players, rng);
        }
      }
    }
  };

  const tick = () => {
    if (aborted || paused) return;
    const prevHome = sim.score.home;
    const prevAway = sim.score.away;
    sim.tick();
    tickParallels();
    // IA do adversário do usuário: subs em 60' e 75'
    if (sim.minute === 60 || sim.minute === 75) {
      const aiSide = userSide === "home" ? "away" : "home";
      aiAutoSubsInteractive(sim, aiSide, state.players, rng);
    }
    renderMatch();
    renderControls();
    updateProgress();
    // Detecta gol(s) deste minuto e celebra
    if (sim.score.home > prevHome) celebrateGoal("home");
    if (sim.score.away > prevAway) celebrateGoal("away");

    if (sim.isFinished()) {
      finishMatch();
      return;
    }
    const lastMin = sim.minute;
    const importantEvent = sim.events.some(e =>
      e.minute === lastMin && (e.type === "goal" || e.type === "red" || e.type === "injury")
    );
    const base = MATCH_SPEEDS[speed];
    const delay = importantEvent ? base + EVENT_PAUSE_BONUS : base;
    timer = setTimeout(tick, delay);
  };

  const fastForward = () => {
    aborted = true;
    while (!sim.isFinished()) {
      sim.tick();
      tickParallels();
      if (sim.minute === 60 || sim.minute === 75) {
        const aiSide = userSide === "home" ? "away" : "home";
        aiAutoSubsInteractive(sim, aiSide, state.players, rng);
      }
    }
    // Garante que paralelos também terminem (caso já estivessem mais à frente)
    for (const ps of parallelSims) {
      while (!ps.sim.isFinished()) ps.sim.tick();
    }
    renderMatch();
    updateProgress(); // pula direto pra barra cheia (90')
    finishMatch();
  };

  // Aplica os resultados dos jogos paralelos ao estado.
  const applyParallels = () => {
    if (parallelsApplied) return;
    parallelsApplied = true;
    for (const ps of parallelSims) {
      const r = ps.sim.getResult();
      if (ps.isCup) {
        applyCupLegToState(ps.match, r);
      } else if (ps.estadual) {
        applyEstadualMatchResult(ps.match, r, { ...ps.estadual, compId: ps.compId });
      } else {
        applyMatchResult(state, ps.match, r, state.competitions[ps.compId]);
      }
    }
  };

  const finishMatch = () => {
    applyParallels();
    // Limpa qualquer resíduo de animação de gol
    $overlay.classList.remove("flash-pro", "flash-con");
    $overlay.querySelectorAll(".goal-banner").forEach(b => b.remove());
    document.getElementById("match-footer").innerHTML = `
      <button class="btn" id="btn-continue">Continuar ▶</button>
    `;
    document.getElementById("btn-continue").onclick = () => {
      $overlay.classList.remove("visible");
      onContinue();
    };
  };

  renderScoreboardShell(); // escudos/nomes uma vez só (estáticos)
  renderControls();
  renderMatch();
  updateProgress(); // barra começa em 0'
  timer = setTimeout(tick, MATCH_SPEEDS[speed]);
}

// IA do adversário durante a partida do usuário (mesma heurística do match.js).
function aiAutoSubsInteractive(sim, side, playersById, rngRef) {
  const POS = { GOL:"GOL", ZAG:"DEF", LD:"DEF", LE:"DEF", VOL:"MID", MEI:"MID", PE:"ATA", PD:"ATA", ATA:"ATA" };
  const info = sim.canSubstitute(side);
  if (info.subsLeft <= 0 || info.windowsLeft <= 0) return;
  let didSub = false;
  for (let i = 0; i < Math.min(2, info.subsLeft); i++) {
    const fresh = sim.canSubstitute(side);
    if (fresh.subsLeft <= 0) break;
    let best = null;
    for (const b of fresh.bench) {
      const cand = fresh.onField.find(p =>
        POS[p.position] === POS[b.position] && b.overall > p.overall + 2
      );
      if (cand) {
        const gain = b.overall - cand.overall;
        if (!best || gain > best.gain) best = { out: cand, in: b, gain };
      }
    }
    if (best && rngRef.chance(0.6)) {
      sim.substitute(side, best.out.id, best.in.id);
      didSub = true;
    } else break;
  }
  if (didSub) sim.closeWindow(side, true);
}

function renderMatchStats(h, a) {
  const rows = [
    ["Chutes", h.shots, a.shots],
    ["No gol", h.shotsOnTarget, a.shotsOnTarget],
    ["Faltas", h.fouls, a.fouls],
    ["Amarelos", h.yellows, a.yellows],
  ];
  return `
    <h3>Estatísticas</h3>
    ${rows.map(([label, hv, av]) => {
      const total = hv + av || 1;
      return `
        <div class="stat-row">
          <div class="home">${hv}</div>
          <div>
            <div class="label">${label}</div>
            <div class="stat-bar">
              <div class="home-fill" style="width:${(hv/total)*100}%"></div>
              <div class="away-fill" style="width:${(av/total)*100}%"></div>
            </div>
          </div>
          <div class="away">${av}</div>
        </div>
      `;
    }).join("")}
  `;
}
