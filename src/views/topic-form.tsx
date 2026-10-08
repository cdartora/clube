import type { User } from "../db/schema";
import { type PostErrors, TITLE_MAX } from "../lib/posts";
import { Editor } from "./editor";
import { FieldError } from "./form";
import { Layout } from "./layout";

type Props = {
  user: User;
  mode: "new" | "edit";
  action: string;
  values?: { title: string; body: string };
  errors?: PostErrors;
};

export const TopicFormPage = ({ user, mode, action, values, errors = {} }: Props) => {
  const heading = mode === "new" ? "Novo tópico" : "Editar tópico";
  return (
    <Layout title={heading} user={user}>
      <div class="box">
        <h2>{heading}</h2>
        <form method="post" action={action} class="form form-wide">
          <label for="title">Título</label>
          <input id="title" name="title" value={values?.title} required maxlength={TITLE_MAX} autofocus />
          <FieldError msg={errors.title} />

          <label>Texto</label>
          <Editor value={values?.body} placeholder="Sobre o que você quer conversar?" rows={14} />
          <FieldError msg={errors.body} />

          <div class="form-actions">
            <button type="submit" class="button">
              {mode === "new" ? "Publicar" : "Salvar"}
            </button>
            <a href={mode === "new" ? "/" : action.replace(/\/editar$/, "")}>Cancelar</a>
          </div>
        </form>
      </div>
    </Layout>
  );
};
