import { mediaUrl } from "../lib/media";

/** Foto de perfil, ou a inicial do nome para quem ainda não enviou uma. */
export const Avatar = ({ name, avatarKey, small }: { name: string; avatarKey: string | null; small?: boolean }) => {
  const cls = small ? "avatar avatar-small" : "avatar";
  return avatarKey ? (
    <img class={cls} src={mediaUrl(avatarKey)} alt="" loading="lazy" />
  ) : (
    <span class={cls} aria-hidden="true">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
};
