import { MAX_CLAPS, type TargetType } from "../db/schema";
import type { ReactionState } from "../lib/reactions";

type Props = {
  type: TargetType;
  id: number;
  score: number;
  clapCount: number;
  state: ReactionState;
  isOwn: boolean;
};

const Hidden = ({ type, id }: { type: TargetType; id: number }) => (
  <>
    <input type="hidden" name="targetType" value={type} />
    <input type="hidden" name="targetId" value={String(id)} />
  </>
);

const clapperSummary = (state: ReactionState) =>
  state.clappers.map((c) => (c.count > 1 ? `${c.name} ${c.count}×` : c.name)).join(", ");

/**
 * Votos (anônimos, só a soma aparece) e aplausos (públicos) de um post.
 * Os votos usam htmx; os aplausos são agrupados pelo public/app.js antes de enviar.
 */
export const Reactions = ({ type, id, score, clapCount, state, isOwn }: Props) => {
  const ownTitle = "Não dá para votar no próprio post";
  const clapsLeft = MAX_CLAPS - state.myClaps;
  return (
    <div class="reactions">
      <form
        method="post"
        action="/votar"
        class="vote"
        hx-post="/votar"
        hx-target="closest .reactions"
        hx-swap="outerHTML"
      >
        <Hidden type={type} id={id} />
        <button
          type="submit"
          name="value"
          value="1"
          class={state.myVote === 1 ? "vote-up voted" : "vote-up"}
          aria-pressed={state.myVote === 1 ? "true" : "false"}
          aria-label="Votar para cima"
          title={isOwn ? ownTitle : "Acrescenta à conversa"}
          disabled={isOwn}
        >
          ▲
        </button>
        <span class={score > 0 ? "score positive" : score < 0 ? "score negative" : "score"}>{score}</span>
        <button
          type="submit"
          name="value"
          value="-1"
          class={state.myVote === -1 ? "vote-down voted" : "vote-down"}
          aria-pressed={state.myVote === -1 ? "true" : "false"}
          aria-label="Votar para baixo"
          title={isOwn ? ownTitle : "Não acrescenta à conversa"}
          disabled={isOwn}
        >
          ▼
        </button>
      </form>

      <form method="post" action="/aplaudir" class="clap" data-clap-form data-claps-left={String(clapsLeft)}>
        <Hidden type={type} id={id} />
        <input type="hidden" name="count" value="1" />
        <button
          type="submit"
          class={state.myClaps > 0 ? "clap-button clapped" : "clap-button"}
          aria-label="Aplaudir"
          title={
            isOwn
              ? "Não dá para aplaudir o próprio post"
              : clapsLeft > 0
                ? `Aplaudir (você ainda pode dar ${clapsLeft})`
                : `Você já deu os ${MAX_CLAPS} aplausos`
          }
          disabled={isOwn || clapsLeft <= 0}
        >
          👏
        </button>
        {clapCount > 0 ? (
          <details class="clappers">
            <summary class="clap-count">{clapCount}</summary>
            <div class="clappers-list">{clapperSummary(state)}</div>
          </details>
        ) : (
          <span class="clap-count">0</span>
        )}
      </form>
    </div>
  );
};
