/**
 * Goes to a page of this app with a full load. Client navigation keeps the shared layout, so after the session has
 * changed (login, logout, an expired session) the top bar would keep showing the previous state. It replaces the
 * history entry, so "Back" does not return to the page the session just left (a login form, which only redirects).
 */
export function fullPageLoad(path: string): void {
  window.location.replace(new URL(path, window.location.origin).href);
}
