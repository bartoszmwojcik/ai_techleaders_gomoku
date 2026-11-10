import type { PartialTranslation } from "../types";

/** Skeleton: German is selectable with `?lang=de`, but hidden from the switch until reviewed; gaps fall back to English. */
const show: PartialTranslation<"show"> = {
  bot: {
    name: "Bot · Stufe {level}",
    nameWithTable: "Bot · Stufe {level} · {table}",
  },
  console: {
    title: "Vorführung",
    start: "Vorführung starten",
  },
  room: {
    refresh: "Aktualisieren",
    projector: "Projektoransicht",
    logout: "Abmelden",
  },
};

export default show;
