// Regras da casa. Primeira versão: ajuste à vontade.

export const RULES: { title: string; text: string }[] = [
  {
    title: "Aqui é casa de amigo",
    text: "Trate todo mundo como você trataria numa mesa de bar entre amigos: com bom humor, paciência e respeito.",
  },
  {
    title: "O que se fala aqui, fica aqui",
    text: "Não tire print nem repasse conversas para fora do Clube sem a permissão de quem escreveu.",
  },
  {
    title: "Discordar pode, atacar não",
    text: "Critique ideias, não pessoas. Uma boa briga de argumentos é bem-vinda; deboche e ofensa pessoal, não.",
  },
  {
    title: "Voto não é curtida",
    text: "Use ▲ e ▼ para dizer se algo acrescenta à conversa, não para dizer se você concorda. Para elogiar, aplauda.",
  },
  {
    title: "Convite é responsabilidade",
    text: "Só convide quem você receberia na sua casa. Quem convida apresenta a pessoa e ajuda ela a se enturmar.",
  },
  {
    title: "Nada de propaganda",
    text: "Sem spam, correntes ou venda de produtos. Indicar algo de que você gostou é outra coisa e está liberado.",
  },
  {
    title: "Assunto delicado? Avise",
    text: "Se o tópico fala de algo pesado ou tem spoiler, avise no título para cada um escolher se quer abrir.",
  },
  {
    title: "Na dúvida, conversa",
    text: "Se algo te incomodou, fale com a pessoa ou com um admin. Os admins podem remover conteúdo e desativar contas que quebrem estas regras, mas sempre conversam antes.",
  },
];

export const RulesList = () => (
  <ol class="rules">
    {RULES.map((r) => (
      <li>
        <strong>{r.title}.</strong> {r.text}
      </li>
    ))}
  </ol>
);
