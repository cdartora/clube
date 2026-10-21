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

  // Fotos são reduzidas no navegador antes de subir: uma foto de celular (3 a 5 MB) vira algumas
  // centenas de KB, o que segura o R2 no plano gratuito. De quebra, sai o EXIF (com a localização).
  // GIF (pode ser animado), vídeo e o que o navegador não souber abrir sobem como estão.
  const SHRINKABLE = /^image\/(jpeg|png|webp)$/;
  const SMALL_ENOUGH = 300 * 1024;

  const encode = (canvas, type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));

  const shrinkImage = async (file, maxSide = 1600) => {
    if (!SHRINKABLE.test(file.type)) return file;
    let bitmap;
    try {
      bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      return file;
    }
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= SMALL_ENOUGH) {
      bitmap.close();
      return file;
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    // WebP é menor; o Safari antigo não gera WebP e devolve PNG, então ali vai JPEG (fundo branco
    // no lugar da transparência).
    let blob = await encode(canvas, "image/webp", 0.82);
    if (!blob || blob.type !== "image/webp") {
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      blob = await encode(canvas, "image/jpeg", 0.85);
    }
    bitmap.close();
    if (!blob || blob.size >= file.size) return file;
    const ext = blob.type === "image/webp" ? "webp" : "jpg";
    return new File([blob], file.name.replace(/\.[^.]*$/, "") + "." + ext, { type: blob.type });
  };

  // O editor (public/editor.js) usa a mesma função.
  window.Clube = { shrinkImage };

  // Foto de perfil: reduz assim que é escolhida. O envio espera a redução terminar.
  const shrinking = new WeakMap();
  document.addEventListener("change", (event) => {
    const input = event.target;
    if (!input.matches("input[type=file][data-shrink]") || !input.files[0]) return;
    const done = shrinkImage(input.files[0], Number(input.dataset.shrink)).then((file) => {
      const list = new DataTransfer();
      list.items.add(file);
      input.files = list.files;
    });
    shrinking.set(input.form, done);
    done.finally(() => shrinking.delete(input.form));
  });
  document.addEventListener(
    "submit",
    (event) => {
      const done = shrinking.get(event.target);
      if (!done) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      done.finally(() => event.target.requestSubmit());
    },
    true,
  );

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
