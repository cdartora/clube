import MarkdownIt from "markdown-it";
import { isVideoUrl } from "./media";

// HTML bruto desligado: tudo o que o usuário digita vira texto, nunca tag.
// markdown-it também recusa links javascript:, vbscript: e data: (exceto imagens).
const md = new MarkdownIt({ html: false, linkify: true, breaks: true, typographer: true });

// Links abrem em outra aba e não vazam o endereço do fórum.
const defaultLinkOpen =
  md.renderer.rules.link_open ?? ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  tokens[idx].attrSet("target", "_blank");
  tokens[idx].attrSet("rel", "noopener noreferrer nofollow");
  return defaultLinkOpen(tokens, idx, options, env, self);
};

// Imagens carregam sob demanda. Vídeos enviados ao Clube usam a mesma sintaxe (![](...)) e
// viram <video>; um .mp4 de fora continua sendo só uma imagem quebrada, como antes.
const defaultImage = md.renderer.rules.image!;
md.renderer.rules.image = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const src = String(token.attrGet("src") ?? "");
  if (isVideoUrl(src)) {
    return `<video src="${md.utils.escapeHtml(src)}" controls preload="metadata" playsinline></video>`;
  }
  token.attrSet("loading", "lazy");
  return defaultImage(tokens, idx, options, env, self);
};

export const renderMarkdown = (source: string) => md.render(source);
