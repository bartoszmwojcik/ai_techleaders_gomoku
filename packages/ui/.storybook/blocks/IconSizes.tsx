import { Check, Clock, Copy, Eye, EyeOff, Info, Share2, TriangleAlert, X } from "lucide-react";

const ICONS = [
  { name: "Eye", Icon: Eye, label: "Pokaż hasło" },
  { name: "EyeOff", Icon: EyeOff, label: "Ukryj hasło" },
  { name: "Copy", Icon: Copy, label: "Kopiuj" },
  { name: "Share2", Icon: Share2, label: "Udostępnij" },
  { name: "Clock", Icon: Clock, label: "Czas do końca" },
  { name: "Check", Icon: Check, label: "Sukces" },
  { name: "TriangleAlert", Icon: TriangleAlert, label: "Uwaga" },
  { name: "Info", Icon: Info, label: "Informacja" },
  { name: "X", Icon: X, label: "Błąd" },
] as const;

const SIZES = [
  { token: "icon-size-sm", px: 16 },
  { token: "icon-size-md", px: 20 },
  { token: "icon-size-lg", px: 24 },
] as const;

export function IconSizes() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-meta">
        <caption className="pb-group text-left text-text-muted">
          Ikony z lucide-react. Ikona obok słowa jest dekoracyjna (aria-hidden); ikona bez słowa dostaje podpis.
        </caption>
        <thead>
          <tr className="border-b border-border-default text-left">
            <th scope="col" className="p-2">Ikona</th>
            <th scope="col" className="p-2">Podpis w produkcie</th>
            {SIZES.map(({ token, px }) => (
              <th scope="col" className="p-2" key={token}><code>{token}</code> ({px} px)</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ICONS.map(({ name, Icon, label }) => (
            <tr className="border-b border-border-default" key={name}>
              <th scope="row" className="p-2 text-left font-regular"><code>{name}</code></th>
              <td className="p-2">{label}</td>
              {SIZES.map(({ token, px }) => (
                <td className="p-2" key={token}>
                  <Icon aria-hidden="true" width={px} height={px} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
