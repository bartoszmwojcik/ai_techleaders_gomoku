import { Button, type ButtonProps } from "@gomoku/ui/game/button";

type SubmitButtonProps = Omit<ButtonProps, "type" | "loading" | "asChild"> & {
  /** True while the request is in flight: shows a spinner and blocks a second submit. */
  pending?: boolean;
  /** Label shown while pending (passed in); falls back to the normal children. */
  pendingLabel?: string;
};

/** The form's submit button with a loading state. */
export function SubmitButton({ pending = false, pendingLabel, children, ...props }: SubmitButtonProps) {
  return (
    <Button {...props} type="submit" loading={pending}>
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
  );
}
