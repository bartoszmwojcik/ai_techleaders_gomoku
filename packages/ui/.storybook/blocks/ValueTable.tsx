import { readValue } from "./measure";
import { SPACE_SCALE, SPACE_TOKENS } from "./token-data";

export function SpaceTable() {
  return (
    <div className="flex flex-col gap-stack">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-meta">
          <caption className="pb-group text-left text-text-muted">Skala odstępów (siatka 4 px) i jej przypisanie do relacji.</caption>
          <thead>
            <tr className="border-b border-border-default text-left">
              <th scope="col" className="p-2">Token</th>
              <th scope="col" className="p-2">Wartość</th>
              <th scope="col" className="p-2">Rola</th>
              <th scope="col" className="p-2">Pochodzenie</th>
              <th scope="col" className="p-2">Gdzie używać</th>
              <th scope="col" className="p-2">Gdzie nie używać</th>
            </tr>
          </thead>
          <tbody>
            {SPACE_TOKENS.map((row) => (
              <tr className="border-b border-border-default align-top" key={row.token}>
                <th scope="row" className="p-2 text-left font-strong"><code>{row.token}</code></th>
                <td className="p-2">{readValue(row.token)}</td>
                <td className="p-2">{row.role}</td>
                <td className="p-2">{row.source}</td>
                <td className="p-2">{row.use}</td>
                <td className="p-2">{row.avoid}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="m-0 flex list-none flex-wrap gap-stack p-0 text-meta">
        {SPACE_SCALE.map((token) => (
          <li className="flex flex-col gap-group" key={token}>
            <span aria-hidden="true" className="block h-[var(--space-2)] rounded-base bg-action-primary-bg" style={{ width: `var(--${token})` }} />
            <code>{token}</code>
            <span className="text-text-muted">{readValue(token)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
