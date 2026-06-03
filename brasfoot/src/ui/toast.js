// Notificações e diálogos no tema do jogo, substituindo os nativos
// (alert/confirm/prompt — feios e bloqueantes).
//
//   toast(msg, type)        → notificação transiente (some sozinha)
//   confirmDialog(opts)     → Promise<boolean> (modal de confirmação)
//   promptDialog(opts)      → Promise<string|null> (modal de input)
//
// confirmDialog/promptDialog são async: o chamador usa `await`.

// -------------------- Toast --------------------
const TOAST_ICON = { success: "✅", error: "❌", info: "ℹ️", warning: "⚠️" };

export function toast(message, type = "info", { duration = 3200 } = {}) {
  const stack = document.getElementById("toast-stack");
  if (!stack) return;

  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.innerHTML = `<span class="toast-icon">${TOAST_ICON[type] || "•"}</span><span class="toast-msg">${message}</span>`;
  stack.appendChild(el);

  // força reflow pra animação de entrada disparar
  void el.offsetWidth;
  el.classList.add("show");

  const remove = () => {
    el.classList.remove("show");
    el.classList.add("hide");
    setTimeout(() => el.remove(), 250);
  };
  const timer = setTimeout(remove, duration);
  // clicar fecha na hora
  el.addEventListener("click", () => { clearTimeout(timer); remove(); });
  return el;
}

// Atalho: lê um resultado { ok|accepted, message } e mostra o toast certo.
export function toastResult(res, { okPrefix = "", errPrefix = "" } = {}) {
  if (!res) return;
  const ok = res.ok ?? res.accepted ?? false;
  toast((ok ? okPrefix : errPrefix) + (res.message || ""), ok ? "success" : "error");
}

// -------------------- Modal de confirmação --------------------
// opts: { title, message, confirmText, cancelText, danger }
export function confirmDialog({
  title = "Confirmar",
  message = "",
  confirmText = "Confirmar",
  cancelText = "Cancelar",
  danger = false,
} = {}) {
  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop visible";
    backdrop.style.zIndex = "400";
    backdrop.innerHTML = `
      <div class="modal dialog" style="max-width:420px">
        <div class="dialog-body">
          <h3 class="dialog-title">${title}</h3>
          <p class="dialog-msg">${message}</p>
        </div>
        <div class="dialog-actions">
          <button class="btn btn-secondary" data-act="cancel">${cancelText}</button>
          <button class="btn ${danger ? "btn-danger" : ""}" data-act="ok">${confirmText}</button>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);

    const done = (val) => {
      document.removeEventListener("keydown", onKey);
      backdrop.remove();
      resolve(val);
    };
    function onKey(e) {
      if (e.key === "Escape") done(false);
      if (e.key === "Enter") done(true);
    }
    backdrop.querySelector('[data-act="ok"]').onclick = () => done(true);
    backdrop.querySelector('[data-act="cancel"]').onclick = () => done(false);
    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) done(false); });
    document.addEventListener("keydown", onKey);
    // foco no botão principal pra Enter funcionar e dar feedback de teclado
    setTimeout(() => backdrop.querySelector('[data-act="ok"]').focus(), 30);
  });
}

// -------------------- Modal de input --------------------
// opts: { title, message, defaultValue, placeholder, confirmText, type }
// Resolve com a string digitada, ou null se cancelado.
export function promptDialog({
  title = "",
  message = "",
  defaultValue = "",
  placeholder = "",
  confirmText = "Confirmar",
  cancelText = "Cancelar",
  type = "text",
} = {}) {
  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop visible";
    backdrop.style.zIndex = "400";
    backdrop.innerHTML = `
      <div class="modal dialog" style="max-width:440px">
        <div class="dialog-body">
          ${title ? `<h3 class="dialog-title">${title}</h3>` : ""}
          ${message ? `<p class="dialog-msg">${message}</p>` : ""}
          <input class="dialog-input" type="${type}" value="${defaultValue}" placeholder="${placeholder}" />
        </div>
        <div class="dialog-actions">
          <button class="btn btn-secondary" data-act="cancel">${cancelText}</button>
          <button class="btn" data-act="ok">${confirmText}</button>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);
    const input = backdrop.querySelector(".dialog-input");

    const done = (val) => {
      document.removeEventListener("keydown", onKey);
      backdrop.remove();
      resolve(val);
    };
    function onKey(e) {
      if (e.key === "Escape") done(null);
      if (e.key === "Enter") done(input.value);
    }
    backdrop.querySelector('[data-act="ok"]').onclick = () => done(input.value);
    backdrop.querySelector('[data-act="cancel"]').onclick = () => done(null);
    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) done(null); });
    document.addEventListener("keydown", onKey);
    setTimeout(() => { input.focus(); input.select(); }, 30);
  });
}
