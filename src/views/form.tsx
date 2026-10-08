export const FieldError = ({ msg }: { msg?: string }) =>
  msg ? <div class="field-error">{msg}</div> : null;
