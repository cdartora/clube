// Editor visual do Clube (TipTap). Empacotado em public/editor.js por `npm run build:editor`,
// que o wrangler roda sozinho antes de `dev`, `deploy` e `preview` (veja wrangler.jsonc).
//
// O servidor manda uma <textarea name="body"> com Markdown. Aqui ela é escondida e trocada por
// um editor que já mostra negrito, listas, citações, fotos e vídeos enquanto se digita. A cada
// mudança o Markdown volta para a textarea, então o formulário é enviado como sempre.
import { Editor } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import { Placeholder } from "@tiptap/extensions";
import { Markdown } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";

const VIDEO_RE = /\.(mp4|webm)$/i;

// Foto ou vídeo. No Markdown os dois são ![alt](src), como o servidor espera; no editor o vídeo
// aparece como <video>. Enquanto sobe, o arquivo é mostrado da memória (blob:) e fica meio apagado.
const Media = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      uploadId: { default: null, rendered: false },
      video: { default: false, rendered: false },
    };
  },

  addNodeView() {
    return ({ node }) => {
      const isVideo = node.attrs.video || VIDEO_RE.test(node.attrs.src ?? "");
      const dom = document.createElement(isVideo ? "video" : "img");
      dom.src = node.attrs.src;
      if (isVideo) {
        dom.controls = true;
        dom.preload = "metadata";
        dom.playsInline = true;
      } else {
        dom.alt = node.attrs.alt ?? "";
      }
      dom.classList.toggle("uploading", Boolean(node.attrs.uploadId));
      return {
        dom,
        update: (updated) => {
          if (updated.type !== node.type) return false;
          if (dom.getAttribute("src") !== updated.attrs.src) dom.src = updated.attrs.src;
          dom.classList.toggle("uploading", Boolean(updated.attrs.uploadId));
          node = updated;
          return true;
        },
      };
    };
  },
});

// --- Upload ---

let uploadSeq = 0;

const findUpload = (editor, uploadId) => {
  let found = null;
  editor.state.doc.descendants((node, pos) => {
    if (found) return false;
    if (node.type.name === "image" && node.attrs.uploadId === uploadId) found = { node, pos };
  });
  return found;
};

const setPending = (shell, delta) => {
  shell.dataset.uploading = String(Number(shell.dataset.uploading || 0) + delta);
};

const uploadFile = async (editor, shell, file, pos) => {
  const uploadId = `u${++uploadSeq}`;
  const preview = URL.createObjectURL(file);
  const video = file.type.startsWith("video/");
  const content = { type: "image", attrs: { src: preview, alt: file.name, uploadId, video } };
  setPending(shell, 1);
  if (pos === undefined) editor.chain().focus().insertContent(content).run();
  else editor.chain().insertContentAt(pos, content).run();

  try {
    const body = new FormData();
    body.append("file", file);
    const res = await fetch("/midia", { method: "POST", body });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Não foi possível enviar o arquivo.");
    const at = findUpload(editor, uploadId);
    if (at) {
      const alt = data.markdown.match(/^!\[([^\]]*)\]/)?.[1] ?? "";
      editor.view.dispatch(
        editor.state.tr.setNodeMarkup(at.pos, undefined, { ...at.node.attrs, src: data.url, alt, uploadId: null }),
      );
    }
  } catch (err) {
    const at = findUpload(editor, uploadId);
    if (at) editor.view.dispatch(editor.state.tr.delete(at.pos, at.pos + at.node.nodeSize));
    window.alert(`${file.name}: ${err.message}`);
  } finally {
    URL.revokeObjectURL(preview);
    setPending(shell, -1);
  }
};

const isMedia = (file) => file.type.startsWith("image/") || file.type.startsWith("video/");

// --- Barra de ferramentas ---

const promptLink = (editor) => {
  if (editor.isActive("link")) return editor.chain().focus().unsetLink().run();
  const url = window.prompt("Endereço do link (https://…):", "https://");
  if (!url || url === "https://") return;
  const href = /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`;
  const { empty } = editor.state.selection;
  if (empty) {
    editor
      .chain()
      .focus()
      .insertContent({ type: "text", text: url, marks: [{ type: "link", attrs: { href } }] })
      .run();
  } else {
    editor.chain().focus().setLink({ href }).run();
  }
};

const ACTIONS = {
  bold: (e) => e.chain().focus().toggleBold().run(),
  italic: (e) => e.chain().focus().toggleItalic().run(),
  link: promptLink,
  quote: (e) => e.chain().focus().toggleBlockquote().run(),
  bulletList: (e) => e.chain().focus().toggleBulletList().run(),
  orderedList: (e) => e.chain().focus().toggleOrderedList().run(),
};

const ACTIVE = {
  bold: "bold",
  italic: "italic",
  link: "link",
  quote: "blockquote",
  bulletList: "bulletList",
  orderedList: "orderedList",
};

const syncToolbar = (editor, shell) => {
  for (const button of shell.querySelectorAll("[data-editor-action]")) {
    const name = ACTIVE[button.dataset.editorAction];
    button.setAttribute("aria-pressed", String(Boolean(name && editor.isActive(name))));
  }
};

// --- Montagem ---

const editors = new WeakMap();

const mount = (textarea) => {
  const shell = textarea.closest(".editor");
  if (!shell || editors.has(shell)) return;

  const surface = document.createElement("div");
  surface.className = "editor-surface";
  textarea.after(surface);

  const editor = new Editor({
    element: surface,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        underline: false, // o Markdown do servidor não tem sublinhado
        link: {
          openOnClick: false,
          autolink: true,
          linkOnPaste: true,
          defaultProtocol: "https",
          HTMLAttributes: { target: null, rel: null },
        },
      }),
      Media.configure({ allowBase64: false }),
      Placeholder.configure({ placeholder: textarea.placeholder || "" }),
      // Igual ao markdown-it do servidor: uma quebra de linha simples vira <br>.
      Markdown.configure({ markedOptions: { gfm: true, breaks: true } }),
    ],
    content: textarea.value,
    contentType: "markdown",
    autofocus: textarea.autofocus ? "end" : false,
    editorProps: {
      attributes: {
        class: "editor-content post-body",
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": textarea.placeholder || "Texto",
        spellcheck: "true",
      },
      handlePaste: (view, event) => {
        const files = [...(event.clipboardData?.files ?? [])].filter(isMedia);
        if (files.length === 0) return false;
        for (const file of files) uploadFile(editor, shell, file);
        return true;
      },
      handleDrop: (view, event, _slice, moved) => {
        if (moved) return false;
        const files = [...(event.dataTransfer?.files ?? [])].filter(isMedia);
        if (files.length === 0) return false;
        event.preventDefault();
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
        for (const file of files) uploadFile(editor, shell, file, pos);
        return true;
      },
      handleKeyDown: (view, event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
          textarea.form?.requestSubmit();
          return true;
        }
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
          promptLink(editor);
          return true;
        }
        return false;
      },
    },
    onUpdate: () => {
      textarea.value = editor.isEmpty ? "" : editor.getMarkdown();
    },
    onTransaction: () => syncToolbar(editor, shell),
    onFocus: () => shell.classList.add("focused"),
    onBlur: () => shell.classList.remove("focused"),
  });

  // A textarea escondida não pode ser `required`: o navegador travaria o envio sem avisar.
  textarea.required = false;
  textarea.hidden = true;
  shell.classList.add("rich");
  editors.set(shell, { editor, textarea });
  syncToolbar(editor, shell);
};

const mountAll = (root = document) => {
  for (const textarea of root.querySelectorAll(".editor .editor-input")) mount(textarea);
};

document.addEventListener("click", (event) => {
  const tool = event.target.closest("[data-editor-action]");
  if (!tool) return;
  const entry = editors.get(tool.closest(".editor"));
  if (entry) ACTIONS[tool.dataset.editorAction]?.(entry.editor);
});

document.addEventListener("change", (event) => {
  if (!event.target.matches("[data-editor-upload]")) return;
  const shell = event.target.closest(".editor");
  const entry = editors.get(shell);
  if (entry) for (const file of event.target.files) uploadFile(entry.editor, shell, file);
  event.target.value = "";
});

// Antes de enviar: espera os uploads e não deixa mandar texto vazio. Registrado na fase de
// captura para rodar antes da trava de envio duplo do app.js.
document.addEventListener(
  "submit",
  (event) => {
    for (const shell of event.target.querySelectorAll(".editor.rich")) {
      const { editor, textarea } = editors.get(shell) ?? {};
      if (!editor) continue;
      if (Number(shell.dataset.uploading) > 0) {
        event.preventDefault();
        event.stopImmediatePropagation();
        window.alert("Espere o envio dos arquivos terminar.");
        return;
      }
      textarea.value = editor.isEmpty ? "" : editor.getMarkdown();
      if (!textarea.value.trim()) {
        event.preventDefault();
        event.stopImmediatePropagation();
        editor.commands.focus();
        shell.classList.add("invalid");
        setTimeout(() => shell.classList.remove("invalid"), 1500);
        return;
      }
    }
  },
  true,
);

// Formulários de resposta chegam depois, pelo htmx.
document.addEventListener("htmx:load", (event) => mountAll(event.target));
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => mountAll());
else mountAll();
