import { readValue } from "./measure";

const DURATIONS = [
  { utility: "motion-fast", token: "duration-fast", use: "najechanie, fokus, wciśnięcie" },
  { utility: "motion-base", token: "duration-base", use: "otwarcie i zamknięcie dialogu, pojawienie się alertu" },
] as const;

export function MotionDemo() {
  return (
    <ul className="m-0 flex list-none flex-wrap gap-panel p-0 text-meta">
      {DURATIONS.map(({ utility, token, use }) => (
        <li className="flex flex-col gap-group" key={utility}>
          <span
            tabIndex={0}
            className={`${utility} block w-[var(--space-12)] rounded-base border border-border-control bg-surface-raised p-group text-center transition-colors hover:bg-action-primary-bg hover:text-action-primary-text focus-visible:bg-action-primary-bg focus-visible:text-action-primary-text`}
          >
            Test
          </span>
          <code>{utility}</code>
          <span className="text-text-muted">{token}: {readValue(token)} (najedź lub użyj Tab)</span>
          <span className="text-text-muted">{use}</span>
        </li>
      ))}
    </ul>
  );
}
