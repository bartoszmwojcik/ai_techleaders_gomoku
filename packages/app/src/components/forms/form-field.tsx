import { Field } from "@gomoku/ui/game/field";
import { TextInput } from "@gomoku/ui/game/text-input";
import type { ComponentProps, ReactNode } from "react";

type FormFieldProps = Omit<ComponentProps<"input">, "id" | "required" | "children"> & {
  /** Visible name of the field (passed in by the page; no built-in copy). */
  label: ReactNode;
  hint?: ReactNode;
  /** Error text for this field; marks the input invalid and links it via aria-describedby. */
  error?: ReactNode;
  /** Text marking the field as optional or required, e.g. "(opcjonalne)". */
  requirement?: ReactNode;
  required?: boolean;
  /** Id of the input, so a form can move focus to it after a validation error. */
  id?: string;
};

/** A labelled text input with optional hint and error: the design-system Field wired to TextInput. */
export function FormField({ label, hint, error, requirement, required, id, ...inputProps }: FormFieldProps) {
  return (
    <Field label={label} hint={hint} error={error} requirement={requirement} required={required} id={id}>
      {(control) => <TextInput {...inputProps} {...control} />}
    </Field>
  );
}
