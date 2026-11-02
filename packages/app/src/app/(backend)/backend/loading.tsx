/** Shown while the panel reads its data (the gate itself is in `page.tsx`, which this file does not replace). */
export default function BackendLoading() {
  return (
    <main className="mx-auto max-w-5xl p-8">
      <p role="status">Ładowanie…</p>
    </main>
  );
}
