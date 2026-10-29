// Pomiar kontrastu ::placeholder i stanu disabled (zadanie 11.5). Wklej do konsoli strony
// albo: agent-browser --session S eval "$(cat .ai/analysis/2026-10-29-theme-review-measure.js)"
// (strona /register lub /login, motyw ustawiony ciasteczkiem gomoku_theme). Zwraca JSON.
(() => {
  const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  // Kolor CSS (dowolna przestrzeń) -> [r, g, b, a] przez canvas 1x1.
  const rgba = (css) => {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "#000";
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    return [r, g, b, a / 255];
  };
  const over = (fg, bg) => fg.slice(0, 3).map((c, i) => c * fg[3] + bg[i] * (1 - fg[3]));
  const lum = ([r, g, b]) => {
    const f = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  // Złożone tło elementu: warstwy tła przodków aż do pierwszej nieprzezroczystej.
  const backdrop = (el) => {
    const layers = [];
    for (let n = el; n; n = n.parentElement) {
      const c = rgba(getComputedStyle(n).backgroundColor);
      if (c[3] > 0) layers.push(c);
      if (c[3] === 1) break;
    }
    return layers.reverse().reduce((acc, l) => over(l, acc), [255, 255, 255]);
  };
  const out = { theme: document.documentElement.dataset.theme ?? "dark", placeholders: [], disabled: [] };
  // Formularze E01 nie mają dziś atrybutów placeholder, więc tymczasowo ustawiamy go, żeby zmierzyć styl
  // `placeholder:text-muted` komponentu TextInput (przyszłe użycie).
  for (const el of document.querySelectorAll("input:not([type=hidden])")) {
    const hadPlaceholder = el.getAttribute("placeholder");
    if (hadPlaceholder === null) el.setAttribute("placeholder", "x");
    const ph = getComputedStyle(el, "::placeholder");
    const bg = backdrop(el);
    const fg = rgba(ph.color);
    // Przezroczystość: alfa koloru i opacity pseudoelementu.
    const eff = [fg[0], fg[1], fg[2], fg[3] * Number(ph.opacity)];
    out.placeholders.push({ name: el.name || el.type, color: ph.color, opacity: ph.opacity, ratio: +ratio(over(eff, bg), bg).toFixed(2) });
    if (hadPlaceholder === null) el.removeAttribute("placeholder");
  }
  for (const el of document.querySelectorAll("main button[type=submit]")) {
    const was = el.disabled;
    const transition = el.style.transition;
    el.style.transition = "none"; // bez `transition-colors`, inaczej odczyt jest w połowie przejścia
    el.disabled = true; // wymuszenie stanu :disabled (bez wysyłania formularza)
    const cs = getComputedStyle(el);
    const bg = backdrop(el);
    const fg = over(rgba(cs.color).map((v, i) => (i === 3 ? v * Number(cs.opacity) : v)), bg);
    const border = rgba(cs.borderTopColor);
    out.disabled.push({
      text: el.textContent.trim(),
      color: cs.color,
      bg: cs.backgroundColor,
      opacity: cs.opacity,
      ratioText: +ratio(fg, bg).toFixed(2),
      ratioBorder: +ratio(over(border, bg), bg).toFixed(2),
    });
    el.disabled = was;
    el.style.transition = transition;
  }
  return JSON.stringify(out);
})()
