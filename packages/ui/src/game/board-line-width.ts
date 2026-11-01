/**
 * Width of a board line in CSS px that covers a whole number of device pixels.
 * A fixed `1px` is 2.625 device pixels on a 2.625 DPR tablet, so the browser snaps
 * some lines to 2 and some to 3 device pixels and the grid looks uneven.
 * Rounding down to whole device pixels (at least one) makes every line identical.
 */
export function crispLineWidth(devicePixelRatio: number): string {
  const ratio = Number.isFinite(devicePixelRatio) && devicePixelRatio > 1 ? devicePixelRatio : 1;
  const devicePixels = Math.floor(ratio);
  return `${devicePixels / ratio}px`;
}

/** Calls `onChange` whenever the device pixel ratio changes (zoom, moving between screens). Returns an unsubscribe. */
export function watchDevicePixelRatio(onChange: (devicePixelRatio: number) => void): () => void {
  let query: MediaQueryList | undefined;
  const listener = () => {
    onChange(window.devicePixelRatio);
    subscribe();
  };
  function subscribe() {
    query?.removeEventListener("change", listener);
    query = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    query.addEventListener("change", listener);
  }
  onChange(window.devicePixelRatio);
  // Without matchMedia (very old browsers, test environments) the ratio is read once.
  if (typeof window.matchMedia !== "function") return () => {};
  subscribe();
  return () => query?.removeEventListener("change", listener);
}
