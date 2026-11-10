import type { PartialTranslation } from "../types";

/** Skeleton: German is selectable with `?lang=de`, but hidden from the switch until reviewed; gaps fall back to English. */
const header: PartialTranslation<"header"> = {
  theme: {
    light: "Helles Design",
    dark: "Dunkles Design",
  },
  session: {
    account: "Konto",
    logout: "Abmelden",
  },
};

export default header;
