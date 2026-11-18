// Browser init script (runs before the page's own scripts): records every CSP violation of the page load as
// `window.__loadCspViolations`, which a listener added after `open` would miss.
(() => {
  /** @type {string[]} */
  const violations = [];
  Object.assign(window, { __loadCspViolations: violations });
  document.addEventListener("securitypolicyviolation", (event) => {
    violations.push(`${event.violatedDirective} ${event.blockedURI}`);
  });
})();
