import type { ReactNode } from "react";

export type PreviewState = "default" | "hover" | "focus" | "pressed" | "disabled" | "loading" | "selected" | "error";

type Row = { state: PreviewState; label: string; render: (previewState: string | undefined) => ReactNode };

/**
 * Shows one component in every state. Hover, focus and pressed are frozen previews: the element gets
 * data-preview-state and Storybook's CSS applies the same hover:/focus-visible:/active: declarations
 * the component uses (see preview.css). The attribute is documentation-only.
 */
export function StateMatrix({ rows }: { rows: readonly Row[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-meta">
        <caption className="pb-group text-left text-text-muted">
          Najechanie, fokus i wciśnięcie to zamrożony podgląd tych samych deklaracji, których używa komponent.
        </caption>
        <thead>
          <tr className="border-b border-border-default text-left">
            <th scope="col" className="p-2">Stan</th>
            <th scope="col" className="p-2">Podgląd</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ state, label, render }) => (
            <tr className="border-b border-border-default align-middle" key={state}>
              <th scope="row" className="p-2 text-left font-regular">{label}</th>
              <td className="p-4">
                {render(state === "hover" || state === "focus" || state === "pressed" ? state : undefined)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
