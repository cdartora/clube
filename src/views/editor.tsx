import { BODY_MAX } from "../lib/posts";

const MEDIA_ACCEPT = "image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,video/quicktime";

type EditorProps = {
  value?: string;
  placeholder?: string;
  rows?: number;
  autofocus?: boolean;
};

const TOOLS: { action: string; label: string; title: string }[] = [
  { action: "bold", label: "N", title: "Negrito (Ctrl+B)" },
  { action: "italic", label: "I", title: "Itálico (Ctrl+I)" },
  { action: "link", label: "Link", title: "Inserir link" },
  { action: "quote", label: "Citação", title: "Citar" },
  { action: "list", label: "Lista", title: "Lista com marcadores" },
];

/**
 * Caixa de texto com barra de botões e prévia. O comportamento fica em
 * public/app.js, por delegação de eventos, então funciona também em
 * formulários que o htmx injeta depois. Fotos e vídeos vão para /midia e
 * entram no texto como Markdown de imagem.
 */
export const Editor = ({ value, placeholder, rows = 10, autofocus }: EditorProps) => (
  <div class="editor">
    <div class="editor-bar">
      <div class="editor-tabs" role="tablist">
        <button type="button" class="editor-tab active" data-editor-tab="write">
          Escrever
        </button>
        <button type="button" class="editor-tab" data-editor-tab="preview">
          Visualizar
        </button>
      </div>
      <div class="editor-tools">
        {TOOLS.map((t) => (
          <button type="button" class={`editor-tool tool-${t.action}`} data-editor-action={t.action} title={t.title}>
            {t.label}
          </button>
        ))}
        <label class="editor-tool tool-media" title="Enviar foto ou vídeo (também dá para colar ou arrastar)">
          Foto/vídeo
          <input type="file" accept={MEDIA_ACCEPT} multiple hidden data-editor-upload />
        </label>
      </div>
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
    <div class="editor-preview post-body" hidden></div>
  </div>
);
