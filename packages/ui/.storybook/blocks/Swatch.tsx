export function Swatch({ token }: { token: string }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block size-[var(--icon-size-lg)] shrink-0 rounded-base border border-border-control align-middle"
      style={{ background: `var(--${token})` }}
    />
  );
}
