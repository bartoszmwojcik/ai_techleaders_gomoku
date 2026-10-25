import { THEMES, type Theme } from "../theme";
import { contrastRatio, resolveColor } from "./measure";
import { CONTRAST_PAIRS, type PairKind } from "./token-data";

const THRESHOLD: Record<PairKind, number | null> = { text: 4.5, ui: 3, decor: null };
const KIND_LABEL: Record<PairKind, string> = {
  text: "tekst (4,5:1)",
  ui: "element (3:1)",
  decor: "dekoracja (bez wymogu)",
};

function format(ratio: number): string {
  return ratio.toFixed(2).replace(".", ",");
}

function verdict(ratio: number, kind: PairKind): string {
  const threshold = THRESHOLD[kind];
  if (threshold === null) return "bez wymogu";
  return ratio >= threshold ? "ok" : "poniżej progu";
}

function measure(fg: string, bg: string, theme: Theme): number {
  return contrastRatio(resolveColor(fg, theme), resolveColor(bg, theme));
}

export function ContrastTable() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-meta">
        <caption className="pb-group text-left text-text-muted">
          Kontrast liczony wzorem WCAG z kolorów, które przeglądarka faktycznie maluje w każdym motywie.
          Kolor nie jest jedynym nośnikiem wyniku: każdy wiersz ma werdykt słowem.
        </caption>
        <thead>
          <tr className="border-b border-border-default text-left">
            <th scope="col" className="p-2">Para (przód / tło)</th>
            <th scope="col" className="p-2">Typ</th>
            <th scope="col" className="p-2">Ciemny</th>
            <th scope="col" className="p-2">Jasny</th>
            <th scope="col" className="p-2">Uwaga</th>
          </tr>
        </thead>
        <tbody>
          {CONTRAST_PAIRS.map(({ fg, bg, kind, note }) => {
            const results = THEMES.map((theme) => measure(fg, bg, theme));
            const failing = results.some((ratio) => verdict(ratio, kind) === "poniżej progu");
            return (
              <tr className="border-b border-border-default align-top" key={`${fg}/${bg}/${kind}`}>
                <th scope="row" className="p-2 text-left font-regular">
                  <code>{fg}</code> / <code>{bg}</code>
                </th>
                <td className="p-2">{KIND_LABEL[kind]}</td>
                {results.map((ratio, index) => (
                  <td className="p-2 whitespace-nowrap" key={THEMES[index]}>
                    {format(ratio)}:1, {verdict(ratio, kind)}
                  </td>
                ))}
                <td className="p-2">{note ?? (failing ? "Poniżej progu: do decyzji." : "")}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
