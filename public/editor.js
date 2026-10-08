// Editor do Clube: barra de botões, atalhos, prévia e pequenos comportamentos de
// página. Tudo por delegação de eventos, então funciona também em formulários que
// o htmx injeta depois do carregamento.
(() => {
  const editorOf = (el) => el.closest(".editor");
  const inputOf = (editor) => editor.querySelector(".editor-input");

  // Envolve a seleção (ou um texto de exemplo) com `before` e `after`.
  const wrap = (input, before, after, placeholder) => {
    const { selectionStart: start, selectionEnd: end, value } = input;
    const selected = value.slice(start, end) || placeholder;
    input.setRangeText(before + selected + after, start, end, "end");
    input.setSelectionRange(start + before.length, start + before.length + selected.length);
  };

  // Coloca `prefix` no começo de cada linha da seleção. Numa linha vazia, só
  // insere o prefixo e deixa o cursor pronto para digitar.
  const prefixLines = (input, prefix) => {
    const { value } = input;
    const start = value.lastIndexOf("\n", input.selectionStart - 1) + 1;
    let end = value.indexOf("\n", input.selectionEnd);
    if (end === -1) end = value.length;
    const result = value
      .slice(start, end)
      .split("\n")
      .map((line) => prefix + line)
      .join("\n");
    input.setRangeText(result, start, end, "end");
  };

  const actions = {
    bold: (input) => wrap(input, "**", "**", "texto em negrito"),
    italic: (input) => wrap(input, "_", "_", "texto em itálico"),
    link: (input) => {
      const url = window.prompt("Endereço do link (https://…):", "https://");
      if (!url || url === "https://") return;
      wrap(input, "[", `](${url})`, "texto do link");
    },
    quote: (input) => prefixLines(input, "> "),
    list: (input) => prefixLines(input, "- "),
  };

  const runAction = (editor, name) => {
    const input = inputOf(editor);
    if (editor.classList.contains("previewing")) showTab(editor, "write");
    input.focus();
    actions[name](input);
  };

  const showTab = async (editor, tab) => {
    const input = inputOf(editor);
    const preview = editor.querySelector(".editor-preview");
    editor.querySelectorAll("[data-editor-tab]").forEach((b) => {
      b.classList.toggle("active", b.dataset.editorTab === tab);
    });
    editor.classList.toggle("previewing", tab === "preview");

    if (tab === "write") {
      preview.hidden = true;
      input.hidden = false;
      input.focus();
      return;
    }

    // Se a altura ficar como está, a página não "pula" ao trocar de aba.
    preview.style.minHeight = `${input.offsetHeight}px`;
    preview.innerHTML = '<p class="muted">Carregando…</p>';
    preview.hidden = false;
    input.hidden = true;
    try {
      const res = await fetch("/preview", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ body: input.value }),
      });
      if (!res.ok) throw new Error(res.statusText);
      preview.innerHTML = await res.text(); // HTML já sanitizado pelo servidor
    } catch {
      preview.innerHTML = '<p class="muted">Não foi possível gerar a prévia.</p>';
    }
  };

  document.addEventListener("click", (event) => {
    const tool = event.target.closest("[data-editor-action]");
    if (tool) return runAction(editorOf(tool), tool.dataset.editorAction);

    const tab = event.target.closest("[data-editor-tab]");
    if (tab) return showTab(editorOf(tab), tab.dataset.editorTab);

    const cancel = event.target.closest("[data-cancel-reply]");
    if (cancel) cancel.closest(".reply-slot").replaceChildren();
  });

  document.addEventListener("keydown", (event) => {
    if (!(event.ctrlKey || event.metaKey) || !event.target.matches(".editor-input")) return;
    const editor = editorOf(event.target);
    const key = event.key.toLowerCase();
    if (key === "b" || key === "i") {
      event.preventDefault();
      runAction(editor, key === "b" ? "bold" : "italic");
    } else if (key === "enter") {
      // Ctrl+Enter publica.
      event.preventDefault();
      event.target.form.requestSubmit();
    }
  });

  // Confirmação antes de apagar.
  document.addEventListener("submit", (event) => {
    const message = event.target.dataset.confirm;
    if (message && !window.confirm(message)) event.preventDefault();
  });
})();
