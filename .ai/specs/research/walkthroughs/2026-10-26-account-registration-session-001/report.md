# Walkthrough: account registration, `.ai/prototypes/discovery/account-registration/revision-001/index.html`, 2026-10-26

> **Nota 2026-10-26 (po zmianie polityki kont):** raport dotyczy poprzedniego modelu: hasło 16 znaków, potwierdzenie e-maila wymagane przed grą (D-17, BR-23). Od decyzji D-24…D-26 konto jest aktywne od razu, a potwierdzenie jest nieblokujące (wnioski 2, 4 i 5 tracą na wadze, finding 1 pozostaje hipotezą). Zob. `research/decisions/2026-10-26-onboarding-simplification.md`. Raport zostaje jako historia.


**[ASSUMPTION] The basis is assumption-only: no real interview, no usage data, all four personas have more assumed than sourced lines.** The most consequential repeated hypothesis: the registration entry never announces the e-mail confirmation step, and when an option without an account is next to it, every persona in both runs would take that option instead; real check needed next: watch 3 to 5 people invited by a friend (S2) and 3 to 5 outside visitors (S3) use the real invitation link and the real sign-up, with a guest alternative on screen. Every finding below is synthetic and does not satisfy the Definition of Ready.

Stance: validate (brief mode is `own`, whose default would be `adversary`; `validate` was chosen explicitly by the user)
Panel: 2 runs × 2 personas; run 1: P01, P02; run 2: P03, P04
Basis: `product-brief.md` (Decision summary, Zakres MVP, Reguły BR-14, BR-16, BR-20, BR-22, BR-23, Kluczowy przepływ), `research/2026-10-20-stakeholders.md`, `research/2026-10-20-journey-current-state.md`, `research/decisions/2026-10-24-accounts-and-data.md`, `research/2026-10-20-benchmark-{playok,papergames,donkeycat-gomoku}.md`; tiers: `[DOCUMENT]` and `[BENCHMARK]` for 12 of 48 persona lines, `[ASSUMPTION]` for 36
Panel snapshot: `personas.md` in this session
Session: `.ai/specs/research/walkthroughs/2026-10-26-account-registration-session-001/`; subject exactly `.ai/prototypes/discovery/account-registration/revision-001/index.html`; flow "account registration" mapped to the brief's Key flow step 1 ("rejestruje się i potwierdza e-mail linkiem", BR-14, BR-23)
Composition: assumed. The material names two segments (S2 friends of the owner, S3 planned outside players) and gives no proportions; one seat each per run, the S3 seat being the one for whom the topic barely matters (its salience line is an `[ASSUMPTION]`)
Saturation: not reached: about 5 of the last 21 topics (in the last three interviews) were new (examples: whether the nickname can change; which tab to return to after confirming; "wyślij ponownie" and spam; whether play is possible right after confirming)
Parity: skipped: no real interviews exist to hold out
Elapsed: not timed; each interview took 10 to 35 s of subagent time, each walk 6 to 8 message rounds per persona
Not askable of this panel: brief assumption A-02 (5-minute lobby expiry) concerns lobby behaviour outside this flow; the A-01 and A-03 assumptions are askable of S3 and S2 respectively and were used only to shape questions

## 🎯 Scope and limits

- Medium: static prototype `revision-001`, opened through agent-browser (file://), one browser session per persona; run 2's P04 at 390 × 844 px, the others at the default size. Personas had no browser or network access; they saw the visible text of each state (their screenshots were saved in `screenshots/`, not shown to them).
- Persona actions were executed by the main agent. Typing was simulated with fictitious data (`kuba@`, `ola@`, `marta@`, `kasia@example.com`, the prototype's demo password). Persona-proposed actions were limited to the visible controls.
- The prototype's reviewer-only "Skrzynka demo" screen played the persona's mail app; the message arrived at once with no spam or delay, which is a limit of the simulation.
- Not walked: logging in, account page, anything after "Utwórz zaproszenie" (invitation and lobby are outside the prototype), failure states (mail provider down, expired link, rate limit), the 320 px width.
- Pressure applied once: P02 (run 1) and P04 (run 2) left at the first screen; to see the later screens each was shown the same added condition ("a friend wrote: enter, create an account, I am waiting") and continued. Their walks after that are under that pressure, not under their entry state.
- Persona answers to the five past-tense questions were generic ("z ogólnego doświadczenia"); 14 of 16 yes/no answers were "no basis". The findings therefore rest on the observed screens, not on the interviews.

## 🔍 Barriers that repeated (worst first, ties marked)

### 1. With an option that needs no account next to it, the account is not created.

[SYNTHETIC]

Weight: 4; spread: ±0; personas: P01, P02 (run 1); P03, P04 (run 2). Tied with nothing above it.
Decision simulation S-C (same text as S-A plus a guest-play page open beside): all four would leave for the other page and play there; in S-A/S-B alone, P02 would not create an account in any variant, P01 and P04 would only without hurry, P03 only if it learns the nickname is changeable. Walk: the entry screen has no "play as a guest" or "see the game" route (step 1 of P01, P02, P04). Persona fast reactions: "no, a form" (P02, P04), "a form, again" (P01), "standard registration, not scary" (P03, mild relief).
Consequence and brief claim: touches D-17 and BR-23 (confirmed e-mail before the first game), D-23 (guests only through an invitation, BR-22) and A-03 (the confirmation barrier is untested). Caveat: the persona text for the alternative page and the T2 passage both came from the script itself (the benchmarks list guest play at all three competitors), so part of this result is induced by the script.
Real check: with 3 to 5 outside visitors (S3) and 3 to 5 friends of the owner (S2), watch the first minute on the real page with a guest-play alternative open in another tab; ask what they did the last time a site asked for an account before play (A-03).

### 2. The registration screen does not announce the e-mail confirmation, and the persona learns it after filling the form.

[SYNTHETIC]

Weight: 4; spread: ±0; personas: P01, P02 (run 1); P03, P04 (run 2).
Where: step 1 (s01) and step 3 (s04 with the banner "Potwierdź e-mail, aby grać"). P01: "I thought the mail was a formality"; P02: "this is the end for me" if it appeared; P04: "had I seen it before filling the form I would have left earlier"; P03: expected a note about the mail. Strong irritation after sign-up (P02, P04), medium (P01), mild (P03).
Consequence and brief claim: BR-23, D-17, A-03; the prototype's s01 has no hint (the "Link wysyłamy na…" banner appears only after sign-up).
Real check: show the registration screen with and without a one-line note about the confirmation to 3 to 5 people each and record how many start typing, where they stop, and what they expected next (settles A-03).

### 3. After confirming, the home screen has no way for an invited friend to join the friend's game.

[SYNTHETIC]

Weight: 4; spread: ±0; personas: P01, P02 (run 1, step 3 and 7 for P01); P03, P04 (run 2, step 7).
"Utwórz zaproszenie" and "Szukam przeciwnika" read as actions for a host or for strangers; "Lobby" is a foreign word to a newcomer; there is no "Zagraj", no place for a link or code. P01: "he could have just sent a link"; P03: "no place where I would paste the friend's link". The prototype marks game actions as outside its scope (L17), so this is about what the real product must say once the invitation flow exists.
Brief claim: BR-09 and BR-11 (invitation link or code), BR-22 (an invited friend may play as a guest).
Real check: with 3 friends of the owner, hand them an invitation link in a message and watch whether they go to the registration page or to the invitation page; ask what they expected to find after the account was made.

### 4. The confirmation page is a second click and a bare page.

[SYNTHETIC]

Weight: 3; spread: ±1 (run 1: P01; run 2: P03, P04; P02 did not reach it).
Fast reactions: "I already clicked" (P01, P03, P04): surprise and irritation, medium; the page without the logo or the game's name looks different or a little suspicious (P01, P03, P04); two similar buttons ("Potwierdź adres e-mail" in the mail, "Potwierdź e-mail" on the page) confuse (P03). Brief claim: none violated; the two-step flow follows `email-verification` Q3 (GET does nothing).
Real check: 3 to 5 people open the link on a phone and on a laptop and say aloud what they think the page is for, and whether they trust it.

### 5. It is unclear which tab or device to return to, and whether the player stays signed in after the link.

[SYNTHETIC]

Weight: 4; spread: ±0; personas: P01, P02 (run 1); P03, P04 (run 2).
"I leave for the mail app and may not return to the same place" (P01); "the link may open in another browser and I will not be logged in" (P04, P02); "which tab do I go back to" (P03). In the prototype the player stayed signed in (one browser context), which the page never says; Y2 (mail on another device) was answered "yes" by one persona (P03, for another tab), "no basis" by the rest.
Brief claim: BR-20 (works on a phone); `email-verification` Q5 (confirming does not log in).
Real check: 3 to 5 people on phones: sign up in the browser, open the mail in the mail app, tap the link, and note which browser opens and whether they are still signed in.

## 📋 Missing cases that repeated

### A. No way to correct a mistyped e-mail address.
[SYNTHETIC]
Weight: 3; spread: ±1 (run 1: P02; run 2: P03, P04). Persona line: "no 'change address', only 'Wyślij ponownie'". Real check: ask 3 to 5 people what they do when the mail does not arrive; record how many look for a change-address control. Brief claim: BR-14, `email-verification` Q6.

### B. Greyed buttons look broken before the explanation is read.
[SYNTHETIC]
Weight: 3; spread: ±1 (run 1: P01, P02 (mild: "look broken"); run 2: P03, P04). The reason sits in the frame above and a caption below, and is noticed after the buttons. Brief claim: BR-23 (shown with the message "Potwierdź e-mail, aby grać"); design-system permissions rule 1 (blocked with the reason beside it). Real check: 3 to 5 people on the real page: ask what the two grey buttons are and what they would try next.

### C. A 16-character password for a game one may never play again.
[SYNTHETIC]
Weight: 3; spread: ±1 (run 1: P01, P02; run 2: P04; P03 uses a password manager and is not bothered). Tiring on a phone; P04's profile line refuses 16 characters for such a game, yet it typed one under the friend-waiting pressure. Brief claim: G3 (owner rule: at least 16 characters, no other requirements). Real check: 3 to 5 phone users who do not use a manager: time the password step and ask why they stop.

### D. Why the e-mail is asked, and whether the nickname can be changed.
[SYNTHETIC]
Weight: 2; spread: ±0 (run 1: P02 "e-mail without a reason", P01 "what is the player name and can I write anything"; run 2: P03 "why do you need my e-mail", "nickname cannot be undone"). Two separate questions merged because both are missing captions on s01. Brief claim: BR-14 (the e-mail is not visible to other players; the nickname is). Real check: ask 3 people to read s01 aloud and say what they think happens with each field.

## ⚠️ Contradictions with the brief

No contradiction repeated in both runs. Finding 2 is a tension with D-17: the confirmation is required before the first game, the entry screen does not say so. Weighted as a barrier above, not as a contradiction.

## 🔍 Outliers

- **The seat for whom the topic barely matters (P02 in run 1, P04 in run 2) left at the first screen both times**, before any form field, and continued only after one added condition (a friend waiting). P02 stayed unmoved in all three variants (S-A, S-B, S-C); P04 moved in S-B. This is the segment the brief hopes to reach later (S3), and the panel's only reading of it is that registration alone loses it before the product is seen (finding 1). Real check: show the registration to 3 to 5 outsiders who came without a friend asking.
- **P04's stated refusal did not hold.** Its profile says it will not use a 16-character password for a game it may play only once; under the friend-waiting pressure it typed one and confirmed the e-mail. The pressure, not the product, changed the outcome. P02, with the same pressure, left at the confirmation step ("I will not do that"), so two personas with a similar profile ended differently.
- **P03 accepted the confirmation mail as normal** ("a mail confirmation is a normal thing for me") and was the only persona not irritated by it; its barrier was the nickname.

## 🔁 Seen once, not reported as a finding

- "Wyślij ponownie" is unclear before one checks whether the mail arrived (P01, run 1; also P03, run 2 as "not clear why"). Appears in both runs but with different complaints; kept here.
- Link lifetime and no pasteable link in the mail (P03, run 2).
- Desktop vs phone keyboard covering half the screen with three fields (P04, run 2, phone only).
- No "zagram teraz, potwierdzę później" (P02, run 1).

## 🧪 To confirm with real users

| # | Hypothesis | Persona ids / runs | Settles | Who to recruit | How |
|---|---|---|---|---|---|
| 1 | With a guest alternative next to it, registration loses people | P01, P02 (run 1); P03, P04 (run 2) | A-03, A-01 | 3 to 5 outside visitors (S3), 3 to 5 friends of the owner (S2) | observe the first minute on the real page with a guest page open in another tab; ask about the last time a site asked for an account before play |
| 2 | The unannounced confirmation step makes people drop after they have filled the form | same | A-03 | same | A/B on paper or prototype: with and without a one-line note on s01; record where they stop |
| 3 | An invited friend cannot tell how to join the friend's game after sign-up | same | D-17, BR-22 | 3 friends of the owner | give them an invitation message and watch the path they take |
| 4 | The two-click confirmation on a bare page worries people | P01 (run 1); P03, P04 (run 2) | none (UX of Q3) | 3 to 5 people, phone and laptop | open the link, say what they think the page is, whether they trust it |
| 5 | People do not know which tab or browser to return to | all four | none (BR-20) | 3 to 5 people on phones | sign up, open mail in the mail app, tap the link, record which browser opens and whether they remain signed in |
| 6 | No way to correct the address | P02 (run 1); P03, P04 (run 2) | none | 3 to 5 people | ask what they do when the mail does not arrive |
| 7 | Greyed buttons look broken | P01, P02 (run 1); P03, P04 (run 2) | none | 3 to 5 people | show the page and ask what the buttons are |
| 8 | A 16-character password drives people off | P01, P02 (run 1); P04 (run 2) | none (G3 is the owner's rule) | 3 to 5 phone users without a manager | time the step and ask why they stop |
| 9 | Missing captions for e-mail and nickname | P01, P02 (run 1); P03 (run 2) | BR-14 | 3 people | read s01 aloud and say what happens with each field |

## 📝 Interviews

Transcripts: `transcripts/run-1-P01.md`, `run-1-P02.md`, `run-2-P03.md`, `run-2-P04.md`. Acquiescence on the four yes/no past-behaviour questions: 2 of the 16 answers were not "no basis" (1 yes, 1 no); the other 14 were "no basis" and are reported as the material's gaps. The yes share of the answered questions is 1 of 2, which supports no claim about acquiescence in either direction.

Biases checked: the panel was negative rather than positive (not over-positive); the same alternative (a guest page elsewhere) was named by all four, but the script itself introduced it (passage T2 and pressure S-C), so it is not independent; all four personas share one arc (dislike of extra steps) and differ mostly in what they object to (P03 accepts the mail, P01 and P04 mind the password, P02 the whole requirement), which is a mild homogeneity to resample from other corners (older people, someone with a shared e-mail address, someone on a slow connection); all four came from the same two segments; engagement was varied (two barely engaged, two invited). Several objections come from the persona profiles ("he could have just sent a link" for P01; "why do you need my e-mail" for P03); those lines are assumed and are flagged as profile-derived.

## 🔍 Parity with real interviews

Skipped: no real interview notes exist; `calibration.md` records the skip.

## 📸 Evidence

`screenshots/` in this session (run1-p01-…, run1-p02-…, run2-p03-…, run2-p04-…): entry, filled form, after sign-up, mail, confirm page, confirmed, home. Prototype only; behaviour of a simulation.
