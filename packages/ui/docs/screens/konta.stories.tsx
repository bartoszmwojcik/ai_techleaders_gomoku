import { Alert } from "@gomoku/ui/game/alert";
import { Button } from "@gomoku/ui/game/button";
import { Checkbox } from "@gomoku/ui/game/checkbox";
import { Field } from "@gomoku/ui/game/field";
import { Panel } from "@gomoku/ui/game/panel";
import { PasswordField } from "@gomoku/ui/game/password-field";
import { StatusBadge } from "@gomoku/ui/game/status-badge";
import { TextInput } from "@gomoku/ui/game/text-input";
import { TextLink } from "@gomoku/ui/game/text-link";
import { VerifyEmailBanner } from "@gomoku/ui/game/verify-email-banner";
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { expect, within } from "storybook/test";

import { Screen, screenParameters, type Viewer } from "./screen";

const meta = {
  title: "Ekrany/Konta",
  parameters: screenParameters,
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

function Narrow({ viewer = "none", children }: { viewer?: Viewer; children: ReactNode }) {
  return (
    <Screen viewer={viewer}>
      <div className="flex max-w-sm flex-col gap-stack">{children}</div>
    </Screen>
  );
}

function RegisterForm({ nameError, limited }: { nameError?: string; limited?: boolean }) {
  return (
    <Narrow>
      <h1 className="m-0 text-section font-strong">Załóż konto</h1>
      {limited && <Alert status="danger" title="Zbyt wiele prób">Spróbuj za chwilę.</Alert>}
      <form noValidate className="flex flex-col gap-stack">
        <Field label="E-mail" required>{(control) => <TextInput {...control} type="email" autoComplete="email" />}</Field>
        <Field label="Nazwa gracza" hint="Widzą ją Twoi przeciwnicy." error={nameError} required>
          {(control) => <TextInput {...control} autoComplete="nickname" defaultValue={nameError ? "Ala_7" : ""} />}
        </Field>
        <PasswordField label="Hasło" showLabel="Pokaż hasło" hideLabel="Ukryj hasło" autoComplete="new-password" hint="Co najmniej 8 znaków" required />
        <Button type="submit">Załóż konto</Button>
      </form>
      <p className="m-0 text-body text-text-secondary">Masz już konto? <TextLink href="#zaloguj">Zaloguj się</TextLink></p>
    </Narrow>
  );
}

function LoginForm({ credentialsError, limited }: { credentialsError?: boolean; limited?: boolean }) {
  return (
    <Narrow>
      <h1 className="m-0 text-section font-strong">Zaloguj się</h1>
      {credentialsError && <Alert status="danger" title="Nieprawidłowy e-mail lub hasło">Sprawdź dane i spróbuj ponownie.</Alert>}
      {limited && <Alert status="danger" title="Zbyt wiele prób">Spróbuj za chwilę.</Alert>}
      <form noValidate className="flex flex-col gap-stack">
        <Field label="E-mail" required>{(control) => <TextInput {...control} type="email" autoComplete="email" />}</Field>
        <PasswordField label="Hasło" showLabel="Pokaż hasło" hideLabel="Ukryj hasło" autoComplete="current-password" required />
        <Button type="submit">Zaloguj się</Button>
      </form>
      <p className="m-0 text-body text-text-secondary"><TextLink href="#reset">Nie pamiętasz hasła?</TextLink></p>
      <p className="m-0 text-body text-text-secondary">Nie masz konta? <TextLink href="#rejestracja">Załóż konto</TextLink></p>
    </Narrow>
  );
}

function Account({ confirmed, passwordChanged, activeGame }: { confirmed: boolean; passwordChanged?: boolean; activeGame?: boolean }) {
  return (
    <Screen viewer="player">
      <h1 className="m-0 text-section font-strong">Konto</h1>
      {!confirmed && (
        <VerifyEmailBanner title="Potwierdź adres e-mail" resendLabel="Wyślij ponownie" dismissLabel="Zamknij" onDismiss={() => undefined} onResend={() => undefined}>
          Bez potwierdzonego adresu nie odzyskasz konta, jeśli zapomnisz hasła. Link wysyłamy na ala@example.com — sprawdź też folder spam.
        </VerifyEmailBanner>
      )}
      <Panel title="Dane konta" className="max-w-xl">
        <p className="m-0 text-body">Nazwa gracza: <strong>Ala_7</strong></p>
        <p className="m-0 flex flex-wrap items-center gap-group text-body">
          E-mail: <strong>ala@example.com</strong>
          <StatusBadge status={confirmed ? "success" : "warning"}>{confirmed ? "Potwierdzony" : "Niepotwierdzony"}</StatusBadge>
        </p>
      </Panel>
      <Panel title="Zmień hasło" className="max-w-xl">
        {passwordChanged && <Alert status="success" title="Hasło zmienione">Inne urządzenia zostały wylogowane.</Alert>}
        <PasswordField label="Aktualne hasło" showLabel="Pokaż hasło" hideLabel="Ukryj hasło" autoComplete="current-password" required />
        <PasswordField label="Nowe hasło" showLabel="Pokaż hasło" hideLabel="Ukryj hasło" autoComplete="new-password" hint="Co najmniej 8 znaków" required />
        <div><Button>Zmień hasło</Button></div>
      </Panel>
      <Panel title="Usuń konto" className="max-w-xl">
        {activeGame && <Alert status="danger" title="Najpierw dokończ albo poddaj partię">Konta nie można usunąć w trakcie aktywnej partii.</Alert>}
        <Alert status="warning" title="Tego nie da się cofnąć">
          Twoje konto, e-mail i hasło zostaną usunięte od razu. Zakończone partie zostaną u przeciwników jako „Usunięty gracz”.
        </Alert>
        <Checkbox label="Rozumiem, że konta nie da się odzyskać" />
        <div className="flex flex-col items-start gap-group">
          <Button variant="danger" disabled aria-describedby="delete-reason">Usuń konto na zawsze</Button>
          <p id="delete-reason" className="m-0 text-meta text-text-muted">Zaznacz potwierdzenie, aby usunąć konto.</p>
        </div>
      </Panel>
    </Screen>
  );
}

function VerifyEmail({ state }: { state: "before" | "done" | "token-error-player" | "token-error-guest" }) {
  return (
    <Narrow>
      <h1 className="m-0 text-section font-strong">Potwierdź adres e-mail</h1>
      {state === "before" && <Button>Potwierdź e-mail</Button>}
      {state === "done" && <Alert status="success" title="Adres potwierdzony — możesz grać">Przechodzimy dalej.</Alert>}
      {state === "token-error-player" && (
        <>
          <Alert status="danger" title="Ten link jest nieważny">Mógł wygasnąć albo został już użyty.</Alert>
          <Button variant="secondary">Wyślij nowy link</Button>
        </>
      )}
      {state === "token-error-guest" && (
        <>
          <Alert status="danger" title="Ten link jest nieważny">Mógł wygasnąć albo został już użyty.</Alert>
          <TextLink href="#zaloguj" placement="standalone">Zaloguj się, aby wysłać nowy link</TextLink>
        </>
      )}
    </Narrow>
  );
}

function ForgotPassword({ sent }: { sent?: boolean }) {
  return (
    <Narrow>
      <h1 className="m-0 text-section font-strong">Nie pamiętasz hasła?</h1>
      {sent ? (
        <Alert status="info" title="Sprawdź skrzynkę">Jeśli konto z tym adresem istnieje, wysłaliśmy link (ważny 1 godzinę). Sprawdź też folder spam.</Alert>
      ) : (
        <form noValidate className="flex flex-col gap-stack">
          <Field label="E-mail" required>{(control) => <TextInput {...control} type="email" autoComplete="email" />}</Field>
          <Button type="submit">Wyślij link</Button>
        </form>
      )}
    </Narrow>
  );
}

function ResetPassword({ tokenError }: { tokenError?: boolean }) {
  return (
    <Narrow>
      <h1 className="m-0 text-section font-strong">Ustaw nowe hasło</h1>
      {tokenError ? (
        <>
          <Alert status="danger" title="Ten link jest nieważny">Mógł wygasnąć albo został już użyty.</Alert>
          <TextLink href="#reset" placement="standalone">Wyślij nowy link</TextLink>
        </>
      ) : (
        <form noValidate className="flex flex-col gap-stack">
          <PasswordField label="Nowe hasło" showLabel="Pokaż hasło" hideLabel="Ukryj hasło" autoComplete="new-password" hint="Co najmniej 8 znaków" required />
          <Button type="submit">Ustaw nowe hasło</Button>
        </form>
      )}
    </Narrow>
  );
}

export const RejestracjaPusta: Story = { render: () => <RegisterForm /> };
export const RejestracjaNazwaZajeta: Story = { render: () => <RegisterForm nameError="Ta nazwa jest zajęta. Wybierz inną." /> };
export const RejestracjaLimitProb: Story = { render: () => <RegisterForm limited /> };

export const LogowaniePuste: Story = { render: () => <LoginForm /> };
export const LogowanieBledneDane: Story = { render: () => <LoginForm credentialsError /> };
export const LogowanieLimitProb: Story = { render: () => <LoginForm limited /> };

export const KontoEmailPotwierdzony: Story = {
  render: () => <Account confirmed />,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText("Potwierdzony")).toBeVisible();
  },
};
export const KontoEmailNiepotwierdzony: Story = { render: () => <Account confirmed={false} /> };
export const KontoHasloZmienione: Story = { render: () => <Account confirmed passwordChanged /> };
export const KontoUsuwanieZAktywnaPartia: Story = { render: () => <Account confirmed activeGame /> };

export const PotwierdzenieEmailaPrzedKliknieciem: Story = { render: () => <VerifyEmail state="before" /> };
export const PotwierdzenieEmailaSukces: Story = { render: () => <VerifyEmail state="done" /> };
export const PotwierdzenieEmailaBladTokenaZalogowany: Story = { render: () => <VerifyEmail state="token-error-player" /> };
export const PotwierdzenieEmailaBladTokenaNiezalogowany: Story = { render: () => <VerifyEmail state="token-error-guest" /> };

export const ZapomnialemHaslaFormularz: Story = { render: () => <ForgotPassword /> };
export const ZapomnialemHaslaWyslano: Story = { render: () => <ForgotPassword sent /> };

export const ResetHaslaFormularz: Story = { render: () => <ResetPassword /> };
export const ResetHaslaBladTokenu: Story = { render: () => <ResetPassword tokenError /> };
