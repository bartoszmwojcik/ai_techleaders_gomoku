import { CircleX } from "lucide-react";
import { useId, type ReactNode } from "react";

/** Attributes the control inside a Field must receive to be labelled and described correctly. */
type FieldControlProps = {
  id: string;
  "aria-describedby": string | undefined;
  "aria-invalid": true | undefined;
  "aria-required": true | undefined;
};

type FieldProps = {
  /** Visible name of the field. Always shown; a placeholder is never a label. */
  label: ReactNode;
  /** Short help shown under the control. */
  hint?: ReactNode;
  /** Error text: what is wrong and what to do. Shown with an icon, not by colour alone. */
  error?: ReactNode;
  /** Text marking the field as optional or required (passed in, e.g. "(opcjonalne)"). */
  requirement?: ReactNode;
  /** Sets aria-required on the control. */
  required?: boolean;
  id?: string;
  children: (control: FieldControlProps) => ReactNode;
};

function Field({ label, hint, error, requirement, required = false, id, children }: FieldProps) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ");

  return (
    <div className="flex min-w-0 flex-col gap-group wrap-anywhere">
      <label htmlFor={controlId} className="text-meta font-strong text-text-secondary">
        {label}
        {requirement && <span className="font-regular text-text-muted"> {requirement}</span>}
      </label>
      {children({
        id: controlId,
        "aria-describedby": describedBy || undefined,
        "aria-invalid": error ? true : undefined,
        "aria-required": required ? true : undefined,
      })}
      {hint && (
        <p id={hintId} className="m-0 text-meta text-text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="m-0 flex items-start gap-group text-meta text-status-danger">
          <CircleX aria-hidden="true" className="size-(--icon-size-sm) shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}

export { Field };
export type { FieldControlProps, FieldProps };
