import { raw } from "hono/html";
import type { User } from "../db/schema";
import { formatDateTime } from "../lib/format";
import { renderMarkdown } from "../lib/markdown";
import { EMPTY_REACTIONS, type ReactionState, reactionKey } from "../lib/reactions";
import { canDelete, canEdit } from "../lib/posts";
import type { TreeNode } from "../lib/tree";
import { Editor } from "./editor";
import { FieldError } from "./form";
import { Layout } from "./layout";
import { Reactions } from "./reactions";

// A partir daqui as respostas param de recuar, para não espremer o texto no celular.
export const MAX_INDENT_DEPTH = 6;

export type TopicView = {
  id: number;
  title: string;
  bodyMd: string;
  authorId: number;
  authorName: string;
  authorUsername: string;
  replyCount: number;
  score: number;
  clapCount: number;
  createdAt: Date;
  updatedAt: Date | null;
};

export type ReactionMap = Map<string, ReactionState>;

export type ReplyView = {
  id: number;
  parentId: number | null;
  bodyMd: string;
  authorId: number;
  authorName: string;
  authorUsername: string;
  score: number;
  clapCount: number;
  createdAt: Date;
  updatedAt: Date | null;
  deletedAt: Date | null;
};

const PostMeta = ({ name, username, createdAt, updatedAt }: {
  name: string;
  username: string;
  createdAt: Date;
  updatedAt: Date | null;
}) => (
  <div class="post-meta">
    <strong class="post-author">{name}</strong> <span class="username">@{username}</span> ·{" "}
    <time datetime={createdAt.toISOString()}>{formatDateTime(createdAt)}</time>
    {updatedAt && <span class="edited"> · editado</span>}
  </div>
);

const DeleteButton = ({ action, what }: { action: string; what: string }) => (
  <form method="post" action={action} class="inline-form" data-confirm={`Apagar ${what}? Não dá para desfazer.`}>
    <button type="submit" class="link-button danger">
      apagar
    </button>
  </form>
);

export const ReplyForm = ({
  topicId,
  parentId,
  value,
  error,
  inline,
}: {
  topicId: number;
  parentId?: number | null;
  value?: string;
  error?: string;
  inline?: boolean;
}) => (
  <form method="post" action={`/t/${topicId}/respostas`} class="form form-wide reply-form">
    {parentId ? <input type="hidden" name="parentId" value={String(parentId)} /> : null}
    <Editor value={value} rows={inline ? 6 : 8} placeholder="Escreva sua resposta…" autofocus={inline} />
    <FieldError msg={error} />
    <div class="form-actions">
      <button type="submit" class="button">
        Responder
      </button>
      {inline && (
        <button type="button" class="link-button" data-cancel-reply>
          cancelar
        </button>
      )}
    </div>
  </form>
);

type TreeProps = { topicId: number; user: User; depth: number; reactions: ReactionMap };

const ReplyItem = ({ node, topicId, user, depth, reactions }: TreeProps & { node: TreeNode<ReplyView> }) => (
  <li class="reply" id={`r-${node.id}`}>
    {node.deletedAt ? (
      <div class="post reply-post removed">mensagem removida</div>
    ) : (
      <div class="post reply-post">
        <PostMeta
          name={node.authorName}
          username={node.authorUsername}
          createdAt={node.createdAt}
          updatedAt={node.updatedAt}
        />
        <div class="post-body">{raw(renderMarkdown(node.bodyMd))}</div>
        <div class="post-actions">
          <Reactions
            type="reply"
            id={node.id}
            score={node.score}
            clapCount={node.clapCount}
            state={reactions.get(reactionKey("reply", node.id)) ?? EMPTY_REACTIONS}
            isOwn={node.authorId === user.id}
          />
          <a
            href={`/t/${topicId}/responder?para=${node.id}`}
            hx-get={`/t/${topicId}/responder?para=${node.id}`}
            hx-target={`#slot-${node.id}`}
            class="action"
          >
            responder
          </a>
          {canEdit(user, node.authorId) && (
            <a href={`/r/${node.id}/editar`} class="action">
              editar
            </a>
          )}
          {canDelete(user, node.authorId) && <DeleteButton action={`/r/${node.id}/apagar`} what="esta resposta" />}
        </div>
        <div class="reply-slot" id={`slot-${node.id}`}></div>
      </div>
    )}
    {node.children.length > 0 && (
      <ReplyList nodes={node.children} topicId={topicId} user={user} depth={depth + 1} reactions={reactions} />
    )}
  </li>
);

const ReplyList = ({ nodes, topicId, user, depth, reactions }: TreeProps & { nodes: TreeNode<ReplyView>[] }) => (
  <ul class={depth === 0 || depth >= MAX_INDENT_DEPTH ? "replies" : "replies nested"}>
    {nodes.map((n) => (
      <ReplyItem node={n} topicId={topicId} user={user} depth={depth} reactions={reactions} />
    ))}
  </ul>
);

export const TopicPage = ({
  topic,
  replies,
  user,
  reactions,
}: {
  topic: TopicView;
  replies: TreeNode<ReplyView>[];
  user: User;
  reactions: ReactionMap;
}) => (
  <Layout title={topic.title} user={user}>
    <div class="breadcrumb">
      <a href="/">Índice</a> » {topic.title}
    </div>

    <article class="post topic-post">
      <h1 class="topic-heading">{topic.title}</h1>
      <PostMeta
        name={topic.authorName}
        username={topic.authorUsername}
        createdAt={topic.createdAt}
        updatedAt={topic.updatedAt}
      />
      <div class="post-body">{raw(renderMarkdown(topic.bodyMd))}</div>
      <div class="post-actions">
        <Reactions
          type="topic"
          id={topic.id}
          score={topic.score}
          clapCount={topic.clapCount}
          state={reactions.get(reactionKey("topic", topic.id)) ?? EMPTY_REACTIONS}
          isOwn={topic.authorId === user.id}
        />
        {canEdit(user, topic.authorId) && (
          <a href={`/t/${topic.id}/editar`} class="action">
            editar
          </a>
        )}
        {canDelete(user, topic.authorId) && <DeleteButton action={`/t/${topic.id}/apagar`} what="este tópico" />}
      </div>
    </article>

    <h2 class="section-heading">
      {topic.replyCount === 0 ? "Nenhuma resposta ainda" : topic.replyCount === 1 ? "1 resposta" : `${topic.replyCount} respostas`}
    </h2>
    {replies.length > 0 && (
      <ReplyList nodes={replies} topicId={topic.id} user={user} depth={0} reactions={reactions} />
    )}

    <div class="box">
      <h3>Responder ao tópico</h3>
      <ReplyForm topicId={topic.id} />
    </div>
  </Layout>
);

/** Página cheia para responder (sem JavaScript, ou quando a resposta volta com erro). */
export const ReplyPage = ({
  topic,
  parent,
  user,
  value,
  error,
}: {
  topic: { id: number; title: string };
  parent: ReplyView | null;
  user: User;
  value?: string;
  error?: string;
}) => (
  <Layout title={`Responder: ${topic.title}`} user={user}>
    <div class="breadcrumb">
      <a href="/">Índice</a> » <a href={`/t/${topic.id}`}>{topic.title}</a> » Responder
    </div>
    {parent && (
      <div class="post reply-post">
        <PostMeta
          name={parent.authorName}
          username={parent.authorUsername}
          createdAt={parent.createdAt}
          updatedAt={parent.updatedAt}
        />
        <div class="post-body">{raw(renderMarkdown(parent.bodyMd))}</div>
      </div>
    )}
    <div class="box">
      <h3>{parent ? `Respondendo a ${parent.authorName}` : "Responder ao tópico"}</h3>
      <ReplyForm topicId={topic.id} parentId={parent?.id} value={value} error={error} />
    </div>
  </Layout>
);

export const EditReplyPage = ({
  topic,
  replyId,
  user,
  value,
  error,
}: {
  topic: { id: number; title: string };
  replyId: number;
  user: User;
  value: string;
  error?: string;
}) => (
  <Layout title="Editar resposta" user={user}>
    <div class="breadcrumb">
      <a href="/">Índice</a> » <a href={`/t/${topic.id}`}>{topic.title}</a> » Editar resposta
    </div>
    <div class="box">
      <h2>Editar resposta</h2>
      <form method="post" action={`/r/${replyId}/editar`} class="form form-wide">
        <Editor value={value} rows={10} autofocus />
        <FieldError msg={error} />
        <div class="form-actions">
          <button type="submit" class="button">
            Salvar
          </button>
          <a href={`/t/${topic.id}#r-${replyId}`}>Cancelar</a>
        </div>
      </form>
    </div>
  </Layout>
);
