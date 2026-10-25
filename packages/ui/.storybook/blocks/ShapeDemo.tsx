import { readValue } from "./measure";

export function ShapeDemo() {
  return (
    <div className="flex flex-col gap-stack text-meta">
      <ul className="m-0 flex list-none flex-wrap gap-panel p-0">
        <li className="flex flex-col gap-group">
          <span aria-hidden="true" className="block size-[var(--space-12)] rounded-base border border-border-control bg-surface-raised" />
          <code>radius-base</code>
          <span className="text-text-muted">{readValue("radius-base")}: przyciski, pola, panele, plansza</span>
        </li>
        <li className="flex flex-col gap-group">
          <span aria-hidden="true" className="block size-[var(--space-12)] rounded-piece border border-piece-outline bg-piece-white shadow-piece" />
          <code>radius-piece</code>
          <span className="text-text-muted">tylko kamienie</span>
        </li>
        <li className="flex flex-col gap-group">
          <span aria-hidden="true" className="block size-[var(--space-12)] rounded-base border border-border-default bg-surface-raised" />
          <code>border-default</code>
          <span className="text-text-muted">1 px, dekoracyjny podział (bez wymogu kontrastu)</span>
        </li>
        <li className="flex flex-col gap-group">
          <span aria-hidden="true" className="block size-[var(--space-12)] rounded-base border border-border-control bg-surface-page" />
          <code>border-control</code>
          <span className="text-text-muted">1 px, brzeg kontrolki (≥ 3:1)</span>
        </li>
      </ul>
      <ul className="m-0 flex list-none flex-wrap gap-panel p-0">
        <li className="flex flex-col gap-group">
          <span aria-hidden="true" className="block size-[var(--space-12)] rounded-base bg-board-surface shadow-board" />
          <code>shadow-board</code>
          <span className="text-text-muted">tylko plansza</span>
        </li>
        <li className="flex flex-col gap-group">
          <span aria-hidden="true" className="block size-[var(--space-12)] rounded-piece bg-piece-black shadow-piece" />
          <code>shadow-piece</code>
          <span className="text-text-muted">tylko kamienie</span>
        </li>
      </ul>
    </div>
  );
}
