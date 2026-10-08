import MarkdownIt from "markdown-it";

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

export const renderMarkdown = (source: string) => md.render(source);
