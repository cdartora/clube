import { RulesList } from "../content/rules";
import { DISPLAY_NAME_MAX } from "../lib/username";
import { FieldError } from "./form";
import { Layout } from "./layout";

export type WelcomeValues = { username: string; displayName: string; acceptRules: boolean };
export type WelcomeErrors = Partial<Record<keyof WelcomeValues, string>>;

type Props = {
  inviterName: string;
  values?: WelcomeValues;
  errors?: WelcomeErrors;
};

export const WelcomePage = ({ inviterName, values, errors = {} }: Props) => (
  <Layout title="Boas-vindas">
    <div class="box welcome">
      <h2>Boas-vindas ao Clube!</h2>
      <p>
        <strong>{inviterName}</strong> te convidou. Falta pouco: escolha como você vai aparecer por
        aqui e dê uma lida nas regras da casa.
      </p>

      <form method="post" action="/boas-vindas" class="form">
        <label for="username">Apelido</label>
        <div class="hint">É o seu @ no fórum. Letras minúsculas, números ou _. Não dá para trocar depois.</div>
        <input
          id="username"
          name="username"
          value={values?.username}
          required
          minlength={3}
          maxlength={20}
          pattern="@?[a-zA-Z0-9_]{3,20}"
          autocomplete="username"
          autocapitalize="none"
        />
        <FieldError msg={errors.username} />

        <label for="displayName">Nome de exibição</label>
        <div class="hint">Como seus amigos te chamam. Dá para mudar quando quiser.</div>
        <input
          id="displayName"
          name="displayName"
          value={values?.displayName}
          required
          maxlength={DISPLAY_NAME_MAX}
          autocomplete="nickname"
        />
        <FieldError msg={errors.displayName} />

        <fieldset class="rules-box">
          <legend>Regras da casa</legend>
          <RulesList />
        </fieldset>

        <label class="checkbox">
          <input type="checkbox" name="acceptRules" value="1" checked={values?.acceptRules} required />{" "}
          Li e combinado
        </label>
        <FieldError msg={errors.acceptRules} />

        <button type="submit" class="button">
          Entrar no Clube
        </button>
      </form>
    </div>
  </Layout>
);
