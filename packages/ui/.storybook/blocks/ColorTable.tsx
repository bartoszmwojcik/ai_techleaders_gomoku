import { THEMES } from "../theme";
import { resolveColor, toHex } from "./measure";
import { Swatch } from "./Swatch";
import { COLOR_TOKENS } from "./token-data";

const THEME_LABEL = { dark: "Ciemny", light: "Jasny" } as const;

export function ColorTable({ tokens = COLOR_TOKENS }: { tokens?: typeof COLOR_TOKENS }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-meta">
        <caption className="pb-group text-left text-text-muted">
          Wartości odczytane z przeglądarki, nie przepisane ręcznie.
        </caption>
        <thead>
          <tr className="border-b border-border-default text-left">
            <th scope="col" className="p-2">Token</th>
            {THEMES.map((theme) => (
              <th scope="col" className="p-2" key={theme}>{THEME_LABEL[theme]}</th>
            ))}
            <th scope="col" className="p-2">Rola</th>
            <th scope="col" className="p-2">Pochodzenie</th>
            <th scope="col" className="p-2">Gdzie używać</th>
            <th scope="col" className="p-2">Gdzie nie używać</th>
          </tr>
        </thead>
        <tbody>
          {tokens.map((row) => (
            <tr className="border-b border-border-default align-top" key={row.token}>
              <th scope="row" className="p-2 text-left font-strong"><code>{row.token}</code></th>
              {THEMES.map((theme) => (
                <td className="p-2 whitespace-nowrap" key={theme}>
                  <span data-theme={theme} className="inline-flex items-center gap-group">
                    <Swatch token={row.token} />
                    <code>{toHex(resolveColor(row.token, theme))}</code>
                  </span>
                </td>
              ))}
              <td className="p-2">{row.role}</td>
              <td className="p-2">{row.source}</td>
              <td className="p-2">{row.use}</td>
              <td className="p-2">{row.avoid}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
