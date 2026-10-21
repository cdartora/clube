import MarkdownIt, { type Token } from "markdown-it";
import { isVideoUrl } from "./media";

// HTML bruto desligado: tudo o que o usuário digita vira texto, nunca tag.
// markdown-it também recusa links javascript:, vbscript: e data: (exceto imagens).
const md = new MarkdownIt({ html: false, linkify: true, breaks: true, typographer: true });

// Links de fora abrem em outra aba e não vazam o endereço do fórum. Links do próprio Clube
// (como as menções) abrem na mesma aba.
const defaultLinkOpen =
  md.renderer.rules.link_open ?? ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const href = String(tokens[idx].attrGet("href") ?? "");
  if (!href.startsWith("/") || href.startsWith("//")) {
    tokens[idx].attrSet("target", "_blank");
    tokens[idx].attrSet("rel", "noopener noreferrer nofollow");
  }
  return defaultLinkOpen(tokens, idx, options, env, self);
};

// Menções: @apelido vira link para o perfil. Só em texto comum: código e links ficam como estão,
// e "ana@gmail.com" não conta (antes do @ não pode haver letra, número, ponto ou barra).
const MENTION_RE = /(^|[^\p{L}\p{N}_.@/])@([a-zA-Z0-9_]{3,20})(?![a-zA-Z0-9_])/gu;

type MentionEnv = { mentions?: Set<string> };

const splitMentions = (state: { Token: typeof Token }, text: string, env: MentionEnv) => {
  const out: Token[] = [];
  let last = 0;
  for (const match of text.matchAll(MENTION_RE)) {
    const at = match.index + match[1].length;
    const username = match[2].toLowerCase();
    env.mentions?.add(username);
    if (at > last) out.push(Object.assign(new state.Token("text", "", 0), { content: text.slice(last, at) }));
    const open = new state.Token("link_open", "a", 1);
    open.attrs = [["href", `/u/${username}`], ["class", "mention"]];
    out.push(open, Object.assign(new state.Token("text", "", 0), { content: `@${match[2]}` }));
    out.push(new state.Token("link_close", "a", -1));
    last = at + match[2].length + 1;
  }
  if (out.length === 0) return null;
  if (last < text.length) out.push(Object.assign(new state.Token("text", "", 0), { content: text.slice(last) }));
  return out;
};

// Depois do text_join, que junta os trechos escapados ("@caio\_1", como o editor salva).
md.core.ruler.after("text_join", "mentions", (state) => {
  for (const block of state.tokens) {
    if (block.type !== "inline" || !block.children) continue;
    const children: Token[] = [];
    let insideLink = 0;
    for (const token of block.children) {
      if (token.type === "link_open") insideLink++;
      if (token.type === "link_close") insideLink--;
      const replaced = token.type === "text" && !insideLink ? splitMentions(state, token.content, state.env as MentionEnv) : null;
      children.push(...(replaced ?? [token]));
    }
    block.children = children;
  }
});

/** Apelidos mencionados no texto (em minúsculas, sem repetir). */
export const findMentions = (source: string) => {
  const env: MentionEnv = { mentions: new Set() };
  md.parse(source, env);
  return [...env.mentions!];
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
