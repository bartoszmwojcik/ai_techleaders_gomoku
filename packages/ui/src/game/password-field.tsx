"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState, type ReactNode } from "react";

import { cn } from "./cn";
import { Field } from "./field";
import { TextInput } from "./text-input";

type PasswordFieldProps = {
  /** Visible name of the field (required). */
  label: ReactNode;
  /** Names of the show/hide button in each of its two states (required, passed in). */
  showLabel: string;
  hideLabel: string;
  hint?: ReactNode;
  error?: ReactNode;
  requirement?: ReactNode;
  required?: boolean;
  /** Id of the input, so a form can move focus to it after an error. */
  id?: string;
  /** Where a password manager and the browser should look: "current-password" or "new-password". */
  autoComplete: "current-password" | "new-password";
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  className?: string;
};

// Hidden by default; the player can reveal it (login-logout H2). Remount it (change its key) after a
// submit to hide the password again.
function PasswordField({
  label,
  showLabel,
  hideLabel,
  hint,
  error,
  requirement,
  required,
  id,
  autoComplete,
  name,
  value,
  defaultValue,
  onChange,
  className,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <Field label={label} hint={hint} error={error} requirement={requirement} required={required} id={id}>
      {(control) => (
        <div className={cn("relative", className)}>
          <TextInput
            {...control}
            type={visible ? "text" : "password"}
            autoComplete={autoComplete}
            name={name}
            value={value}
            defaultValue={defaultValue}
            onChange={onChange ? (event) => onChange(event.target.value) : undefined}
            className="pr-12"
          />
          <button
            type="button"
            aria-pressed={visible}
            aria-label={visible ? hideLabel : showLabel}
            onClick={() => setVisible((current) => !current)}
            className="motion-fast absolute inset-y-0 right-0 inline-flex min-w-target items-center justify-center rounded-base text-text-secondary transition-colors hover:text-text-primary focus-visible:focus-ring"
          >
            {visible ? <EyeOff aria-hidden="true" className="size-(--icon-size-md)" /> : <Eye aria-hidden="true" className="size-(--icon-size-md)" />}
          </button>
        </div>
      )}
    </Field>
  );
}

export { PasswordField };
export type { PasswordFieldProps };
