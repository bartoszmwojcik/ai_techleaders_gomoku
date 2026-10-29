import { TextLink } from "@gomoku/ui/game/text-link";

import { JoinForm } from "./join-form";

export default function JoinPage() {
  return (
    <main className="mx-auto flex w-full flex-1 max-w-md flex-col justify-center gap-stack px-panel py-section">
      <h1 className="m-0 text-section font-strong">Masz kod zaproszenia?</h1>
      <JoinForm />
      <p className="m-0 text-body text-text-secondary">
        <TextLink href="/" placement="standalone">
          Wróć na stronę główną
        </TextLink>
      </p>
    </main>
  );
}
