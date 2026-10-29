// The simulated server answers at once when the address has `?fast` (src/sim.ts reads it at import).
window.history.replaceState(null, "", "/?fast");

// jsdom has no layout: the review engine scrolls and observes elements.
Element.prototype.scrollIntoView = () => undefined;
window.scrollTo = () => undefined;
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
