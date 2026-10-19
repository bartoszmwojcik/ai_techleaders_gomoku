import { expect, it } from "vitest";

import { STEPS } from "./index.mjs";

it("runs the steps in the documented order", () => {
  expect(STEPS.map((step) => step.label)).toEqual(["Wymagania", "Zależności", "Konfiguracja", "Cel bazy", "Baza danych", "Migracje", "Przeglądarka"]);
});
