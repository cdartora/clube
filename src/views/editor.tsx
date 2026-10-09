import { BODY_MAX } from "../lib/posts";

type EditorProps = {
  value?: string;
  placeholder?: string;
  rows?: number;
  autofocus?: boolean;
};

const MEDIA_ACCEPT = "image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,video/quicktime";

const TOOLS: { action: string; label: string; title: string }[] = [
  { action: "bold", label: "N", title: "Negrito (Ctrl+B)" },
  { action: "italic", label: "I", title: "Itálico (Ctrl+I)" },
  { action: "link", label: "Link", title: "Inserir link (Ctrl+K)" },
  { action: "quote", label: "Citação", title: "Citar" },
  { action: "bulletList", label: "Lista", title: "Lista com marcadores" },
  { action: "orderedList", label: "1. Lista", title: "Lista numerada" },
];

/**
 * Editor de texto. O servidor manda uma <textarea> comum com Markdown (funciona sem
 * JavaScript); public/editor.js (gerado de client/editor.js) troca a caixa por um
 * editor visual, que mostra o texto já formatado enquanto se digita e devolve
 * Markdown para a mesma <textarea> antes do envio. Fotos e vídeos vão para /midia.
 */
export const Editor = ({ value, placeholder, rows = 10, autofocus }: EditorProps) => (
  <div class="editor" style={`--editor-rows: ${rows}`}>
    <div class="editor-bar" role="toolbar" aria-label="Formatação">
      {TOOLS.map((t) => (
        <button
          type="button"
          class={`editor-tool tool-${t.action}`}
          data-editor-action={t.action}
          title={t.title}
          aria-label={t.title}
        >
          {t.label}
        </button>
      ))}
      <label class="editor-tool tool-media" title="Enviar foto ou vídeo (também dá para colar ou arrastar)">
        Foto/vídeo
        <input type="file" accept={MEDIA_ACCEPT} multiple hidden data-editor-upload />
      </label>
    </div>
    <textarea
      name="body"
      class="editor-input"
      rows={rows}
      maxlength={BODY_MAX}
      placeholder={placeholder}
      required
      autofocus={autofocus}
    >
      {value}
    </textarea>
  </div>
);
