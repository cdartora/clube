import type { Member } from "../auth/middleware";
import { formatDateTime } from "../lib/format";
import { BIO_MAX, type Profile, type ProfileActivity } from "../lib/users";
import { FieldError } from "./form";
import { Layout } from "./layout";

const dateOnly = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeZone: "America/Sao_Paulo" });

/** Trecho curto de uma resposta, sem a sintaxe de Markdown mais comum. */
const excerpt = (md: string, max = 140) => {
  const plain = md.replace(/[*_`>#[\]]|\(https?:[^)]*\)/g, "").replace(/\s+/g, " ").trim();
  return plain.length > max ? `${plain.slice(0, max - 1)}…` : plain;
};

export const UserLink = ({ username, name }: { username: string; name: string }) => (
  <a href={`/u/${username}`} class="user-link">
    {name}
  </a>
);

export const ProfilePage = ({
  user,
  profile,
  activity,
}: {
  user: Member;
  profile: Profile;
  activity: ProfileActivity;
}) => (
  <Layout title={profile.displayName} user={user}>
    <div class="box profile">
      <div class="profile-head">
        <div class="avatar" aria-hidden="true">
          {profile.displayName.slice(0, 1).toUpperCase()}
        </div>
        <div>
          <h2 class="profile-name">
            {profile.displayName}
            {profile.role === "admin" && <span class="role-badge">admin</span>}
          </h2>
          <div class="meta">
            @{profile.username} · no Clube desde {dateOnly.format(profile.createdAt)}
            {profile.inviterName && profile.inviterUsername && (
              <>
                {" "}
                · convidado por <UserLink username={profile.inviterUsername} name={profile.inviterName} />
              </>
            )}
          </div>
        </div>
        {user.id === profile.id && (
          <a href="/perfil" class="button profile-edit">
            Editar perfil
          </a>
        )}
      </div>

      {profile.status === "disabled" && <p class="field-error">Esta conta está desativada.</p>}
      {profile.bio ? <p class="bio">{profile.bio}</p> : user.id === profile.id && <p class="muted">Você ainda não escreveu nada sobre você.</p>}

      <ul class="stats">
        <li>
          <strong>{activity.topicCount}</strong> tópicos
        </li>
        <li>
          <strong>{activity.replyCount}</strong> respostas
        </li>
        <li>
          <strong>{activity.clapsReceived}</strong> aplausos recebidos
        </li>
      </ul>
    </div>

    <div class="profile-columns">
      <table class="forum-table">
        <thead>
          <tr>
            <th>Tópicos</th>
            <th class="col-num">Respostas</th>
          </tr>
        </thead>
        <tbody>
          {activity.recentTopics.length === 0 ? (
            <tr>
              <td colspan={2} class="empty">
                Nenhum tópico ainda.
              </td>
            </tr>
          ) : (
            activity.recentTopics.map((t) => (
              <tr>
                <td>
                  <a href={`/t/${t.id}`} class="topic-title">
                    {t.title}
                  </a>
                  <div class="meta">{formatDateTime(t.createdAt)}</div>
                </td>
                <td class="col-num">{t.replyCount}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <table class="forum-table">
        <thead>
          <tr>
            <th>Respostas recentes</th>
          </tr>
        </thead>
        <tbody>
          {activity.recentReplies.length === 0 ? (
            <tr>
              <td class="empty">Nenhuma resposta ainda.</td>
            </tr>
          ) : (
            activity.recentReplies.map((r) => (
              <tr>
                <td>
                  <a href={`/t/${r.topicId}#r-${r.id}`}>{excerpt(r.bodyMd)}</a>
                  <div class="meta">
                    em {r.topicTitle} · {formatDateTime(r.createdAt)}
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>

    {activity.invitees.length > 0 && (
      <div class="box">
        <h3>Trouxe para o Clube</h3>
        <p>
          {activity.invitees.map((u, i) => (
            <>
              {i > 0 && ", "}
              <UserLink username={u.username} name={u.displayName} />
            </>
          ))}
        </p>
      </div>
    )}
  </Layout>
);

export const ProfileEditPage = ({
  user,
  values,
  errors = {},
}: {
  user: Member;
  values: { displayName: string; bio: string };
  errors?: { displayName?: string; bio?: string };
}) => (
  <Layout title="Editar perfil" user={user}>
    <div class="box">
      <h2>Editar perfil</h2>
      <form method="post" action="/perfil" class="form">
        <label>Apelido</label>
        <div class="hint">@{user.username} (não dá para trocar)</div>

        <label for="displayName">Nome de exibição</label>
        <input id="displayName" name="displayName" value={values.displayName} required maxlength={40} />
        <FieldError msg={errors.displayName} />

        <label for="bio">Sobre você</label>
        <div class="hint">Uma frase ou duas. Aparece no seu perfil.</div>
        <textarea id="bio" name="bio" rows={4} maxlength={BIO_MAX} class="plain-textarea">
          {values.bio}
        </textarea>
        <FieldError msg={errors.bio} />

        <div class="form-actions">
          <button type="submit" class="button">
            Salvar
          </button>
          <a href={`/u/${user.username}`}>Cancelar</a>
        </div>
      </form>
    </div>
  </Layout>
);
