import { ChevronDown } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import type { ComponentProps, ReactNode, Ref } from "react";

import { cn } from "./cn";
import { TruncatedName } from "./truncated-name";

type UserMenuProps = {
  /** The player's name on the button; cut with an ellipsis when it does not fit. */
  name: string;
  /** The whole sentence for assistive technology: "Zalogowano jako Ala_7, menu konta" (required). */
  label: string;
  /** `UserMenuLink` and `UserMenuAction` items. */
  children: ReactNode;
  /** The button, so a dialog opened from the menu can return focus to it. */
  triggerRef?: Ref<HTMLButtonElement>;
  className?: string;
  "data-testid"?: string;
};

const itemClass =
  "motion-fast flex min-h-target cursor-pointer items-center rounded-base px-stack text-body text-text-primary no-underline transition-colors outline-none select-none data-[highlighted]:bg-border-default";

// Not modal: nothing on the page is locked, so a running game keeps its scroll position and a click outside just closes.
// Radix gives the keyboard (Enter, Space, arrows, Esc returning focus to the button) and aria-haspopup/aria-expanded.
function UserMenu({ name, label, children, triggerRef, className, "data-testid": testId }: UserMenuProps) {
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger
        ref={triggerRef}
        aria-label={label}
        data-testid={testId}
        className={cn(
          "motion-fast inline-flex min-h-target max-w-full min-w-target cursor-pointer items-center gap-group rounded-base border border-border-control bg-transparent px-group text-body text-text-primary transition-colors hover:bg-surface-raised active:bg-border-default focus-visible:focus-ring",
          className,
        )}
      >
        <TruncatedName title={name}>{name}</TruncatedName>
        <ChevronDown aria-hidden="true" className="size-(--icon-size-sm) shrink-0" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          collisionPadding={8}
          className="z-20 flex min-w-(--radix-dropdown-menu-trigger-width) flex-col rounded-base border border-border-control bg-surface-raised p-1"
        >
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** A menu item that goes to another page. */
function UserMenuLink({ className, ...props }: ComponentProps<"a">) {
  return (
    <DropdownMenu.Item asChild>
      <a className={cn(itemClass, className)} {...props} />
    </DropdownMenu.Item>
  );
}

type UserMenuActionProps = {
  /** Runs when the item is chosen with the mouse, by touch or with the keyboard; the menu then closes. */
  onSelect: () => void;
  children: ReactNode;
  className?: string;
};

/** A menu item that does something on this page (log out). */
function UserMenuAction({ onSelect, children, className }: UserMenuActionProps) {
  return (
    <DropdownMenu.Item onSelect={onSelect} className={cn(itemClass, className)}>
      {children}
    </DropdownMenu.Item>
  );
}

export { UserMenu, UserMenuAction, UserMenuLink };
export type { UserMenuActionProps, UserMenuProps };
