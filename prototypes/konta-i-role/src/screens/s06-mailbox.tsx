import { Alert } from "@gomoku/ui/game/alert";
import { Button } from "@gomoku/ui/game/button";
import { Panel } from "@gomoku/ui/game/panel";

import { go, Main, SiteHeader } from "../chrome";
import { mailboxFor, openToken, useSim } from "../sim";

// LUKA D01: the design system has no e-mail template, so a message is a Panel with plain text.
export function S06Mailbox() {
  const sim = useSim();
  const mails = mailboxFor(sim);
  return (
    <>
      <SiteHeader />
      <Main>
        <h1 className="m-0 text-section font-strong">Skrzynka demo</h1>
        <p className="m-0 text-meta text-text-muted">
          Symulacja: żadna wiadomość nie jest naprawdę wysyłana. Skrzynka pokazuje, co dostałby właściciel adresu.
        </p>
        {mails.length === 0 ? (
          <Alert status="info" title="Brak wiadomości">
            Wiadomość nie dotarła albo nie została wysłana. Załóż konto albo użyj „Wyślij ponownie” na stronie głównej.
          </Alert>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-stack p-0">
            {mails.map((mail) => {
              const token = sim.tokens.find((t) => t.id === mail.tokenId);
              return (
                <li key={mail.id}>
                  <Panel title="Potwierdź adres e-mail w Gomoku" headingLevel={2} data-testid={`mail-${mail.id}`}>
                    <p className="m-0 text-meta text-text-muted">Od: Gomoku · Do: {mail.to}</p>
                    <p className="m-0 text-body">Cześć {mail.name}, potwierdź swój adres e-mail, aby móc grać.</p>
                    <div>
                      <Button
                        onClick={() => {
                          openToken(mail.tokenId);
                          go("s03");
                        }}
                      >
                        Potwierdź adres e-mail
                      </Button>
                    </div>
                    <p className="m-0 text-meta text-text-muted">Jeśli to nie Ty zakładałeś konto w Gomoku, zignoruj tę wiadomość.</p>
                    {token?.invalidated && <p className="m-0 text-meta text-text-muted">Nowsza wiadomość zastąpiła ten link.</p>}
                  </Panel>
                </li>
              );
            })}
          </ul>
        )}
      </Main>
    </>
  );
}
