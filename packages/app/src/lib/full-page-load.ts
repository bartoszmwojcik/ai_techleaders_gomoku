/**
 * Goes to a page of this app with a full load. Client navigation keeps the shared layout, so after the session has
 * changed (login, logout, an expired session) the top bar would keep showing the previous state.
 */
export function fullPageLoad(path: string): void {
  window.location.assign(new URL(path, window.location.origin).href);
}
