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
    drive: {
      running: "Antrieb läuft",
      stalledBecause: "Antrieb angehalten: {reason}",
      check: "Jetzt prüfen",
    },
    projector: "Projektoransicht",
    agent: {
      title: "Code in deinen Agenten einfügen",
      show: "Anzeigen",
      copy: "Kopieren",
      waiting: "Wartet auf den Agenten (noch {time})",
    },
    logout: "Abmelden",
  },
};

export default show;
