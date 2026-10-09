// JavaScript do Clube: aplausos e pequenos comportamentos de página (o editor fica em
// client/editor.js). Tudo por delegação de eventos, então funciona também no HTML que
// o htmx injeta depois do carregamento.
(() => {
  // O editor (public/editor.js, ~140 KB) só é baixado em páginas que têm um, inclusive quando
  // o formulário de resposta chega depois pelo htmx. Ele mesmo monta os editores ao carregar.
  let editorRequested = false;
  const loadEditor = (root) => {
    if (editorRequested || !(root.matches?.(".editor") || root.querySelector?.(".editor"))) return;
    editorRequested = true;
    const script = document.createElement("script");
    script.src = "/editor.js";
    document.head.append(script);
  };
  loadEditor(document);
  document.addEventListener("htmx:load", (event) => loadEditor(event.target));

  // "Cancelar" num formulário de resposta aberto no meio da árvore.
  document.addEventListener("click", (event) => {
    const cancel = event.target.closest("[data-cancel-reply]");
    if (cancel) cancel.closest(".reply-slot").replaceChildren();
  });

  // Aplausos: cada clique soma na hora na tela; depois de uma pausa, os cliques
  // acumulados vão num único pedido ("+5") e o bloco volta atualizado do servidor.
  const CLAP_DELAY_MS = 700;
  const pendingClaps = new WeakMap();

  const flushClaps = async (form) => {
    const pending = pendingClaps.get(form);
    pendingClaps.delete(form);
    if (!pending) return;
    const body = new URLSearchParams(new FormData(form));
    body.set("count", String(pending.count));
    const reactions = form.closest(".reactions");
    try {
      const res = await fetch(form.action, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "HX-Request": "true" },
        body,
      });
      if (!res.ok) throw new Error(res.statusText);
      const template = document.createElement("template");
      template.innerHTML = (await res.text()).trim();
      const fresh = template.content.firstElementChild;
      reactions.replaceWith(fresh);
      if (window.htmx) window.htmx.process(fresh);
    } catch {
      window.alert("Não foi possível registrar os aplausos. Tente de novo.");
      window.location.reload();
    }
  };

  document.addEventListener("submit", (event) => {
    const form = event.target;
    if (!form.matches("[data-clap-form]")) return;
    event.preventDefault();

    const pending = pendingClaps.get(form) ?? { count: 0, timer: 0 };
    const left = Number(form.dataset.clapsLeft) - pending.count;
    if (left <= 0) return;

    pending.count += 1;
    clearTimeout(pending.timer);
    pending.timer = setTimeout(() => flushClaps(form), CLAP_DELAY_MS);
    pendingClaps.set(form, pending);

    const counter = form.querySelector(".clap-count");
    counter.textContent = String(Number(counter.textContent) + 1);
    const button = form.querySelector(".clap-button");
    button.classList.add("clapped");
    button.classList.remove("bump");
    void button.offsetWidth; // reinicia a animação
    button.classList.add("bump");
    if (left - 1 <= 0) button.disabled = true;
  });

  // Botão "Copiar link".
  document.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-copy]");
    if (!button) return;
    try {
      await navigator.clipboard.writeText(button.dataset.copy);
      const label = button.textContent;
      button.textContent = "Copiado!";
      setTimeout(() => (button.textContent = label), 2000);
    } catch {
      button.previousElementSibling?.select?.();
    }
  });

  // Confirmação antes de apagar.
  document.addEventListener("submit", (event) => {
    const message = event.target.dataset.confirm;
    if (message && !window.confirm(message)) event.preventDefault();
  });

  // Envio duplo: enquanto a próxima página não chega, novos cliques em
  // "Responder" (ou em qualquer botão de envio) são ignorados. Os botões não
  // são desativados porque botão desativado não manda o próprio name/value.
  document.addEventListener("submit", (event) => {
    const form = event.target;
    if (event.defaultPrevented || form.matches("[data-clap-form], [hx-post]")) return;
    if (form.classList.contains("submitting")) return event.preventDefault();
    form.classList.add("submitting");
    form.setAttribute("aria-busy", "true");
  });

  // Voltar com o botão do navegador traz a página da memória: libera os formulários.
  window.addEventListener("pageshow", (event) => {
    if (!event.persisted) return;
    document.querySelectorAll("form.submitting").forEach((form) => {
      form.classList.remove("submitting");
      form.removeAttribute("aria-busy");
    });
  });
})();
