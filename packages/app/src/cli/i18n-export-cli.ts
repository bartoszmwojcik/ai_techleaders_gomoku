// Entry point of `npm run i18n:export -w @gomoku/app` (see ./i18n-export.ts). Options: `--ns show,header` (default:
// every namespace), `--out FILE` (default: standard output). The catalogs are imported statically: their loader in
// `i18n/catalogs/index.ts` is `server-only`.
import { writeFileSync } from "node:fs";

import deCommon from "../i18n/catalogs/de/common";
import deHeader from "../i18n/catalogs/de/header";
import deShow from "../i18n/catalogs/de/show";
import enCommon from "../i18n/catalogs/en/common";
import enHeader from "../i18n/catalogs/en/header";
import enShow from "../i18n/catalogs/en/show";
import frCommon from "../i18n/catalogs/fr/common";
import frHeader from "../i18n/catalogs/fr/header";
import frShow from "../i18n/catalogs/fr/show";
import plCommon from "../i18n/catalogs/pl/common";
import plHeader from "../i18n/catalogs/pl/header";
import plShow from "../i18n/catalogs/pl/show";
import deAuth from "../i18n/catalogs/de/auth";
import deHome from "../i18n/catalogs/de/home";
import enAuth from "../i18n/catalogs/en/auth";
import enHome from "../i18n/catalogs/en/home";
import frAuth from "../i18n/catalogs/fr/auth";
import frHome from "../i18n/catalogs/fr/home";
import plAuth from "../i18n/catalogs/pl/auth";
import plHome from "../i18n/catalogs/pl/home";
import deChat from "../i18n/catalogs/de/chat";
import deGame from "../i18n/catalogs/de/game";
import enChat from "../i18n/catalogs/en/chat";
import enGame from "../i18n/catalogs/en/game";
import frChat from "../i18n/catalogs/fr/chat";
import frGame from "../i18n/catalogs/fr/game";
import plChat from "../i18n/catalogs/pl/chat";
import plGame from "../i18n/catalogs/pl/game";
import deHistory from "../i18n/catalogs/de/history";
import deLobby from "../i18n/catalogs/de/lobby";
import deReview from "../i18n/catalogs/de/review";
import enHistory from "../i18n/catalogs/en/history";
import enLobby from "../i18n/catalogs/en/lobby";
import enReview from "../i18n/catalogs/en/review";
import frHistory from "../i18n/catalogs/fr/history";
import frLobby from "../i18n/catalogs/fr/lobby";
import frReview from "../i18n/catalogs/fr/review";
import plHistory from "../i18n/catalogs/pl/history";
import plLobby from "../i18n/catalogs/pl/lobby";
import plReview from "../i18n/catalogs/pl/review";
import deAccount from "../i18n/catalogs/de/account";
import enAccount from "../i18n/catalogs/en/account";
import frAccount from "../i18n/catalogs/fr/account";
import plAccount from "../i18n/catalogs/pl/account";
import deErrors from "../i18n/catalogs/de/errors";
import enErrors from "../i18n/catalogs/en/errors";
import frErrors from "../i18n/catalogs/fr/errors";
import plErrors from "../i18n/catalogs/pl/errors";
import { CATALOG_STATUS } from "../i18n/catalogs/status";
import { NAMESPACES } from "../i18n/catalogs/types";
import { exportRows, namespacesOf, toCsv, type ExportCatalogs } from "./i18n-export";

const CATALOGS: ExportCatalogs = {
  common: { pl: plCommon, en: enCommon, fr: frCommon, de: deCommon },
  header: { pl: plHeader, en: enHeader, fr: frHeader, de: deHeader },
  show: { pl: plShow, en: enShow, fr: frShow, de: deShow },
  home: { pl: plHome, en: enHome, fr: frHome, de: deHome },
  auth: { pl: plAuth, en: enAuth, fr: frAuth, de: deAuth },
  game: { pl: plGame, en: enGame, fr: frGame, de: deGame },
  chat: { pl: plChat, en: enChat, fr: frChat, de: deChat },
  lobby: { pl: plLobby, en: enLobby, fr: frLobby, de: deLobby },
  history: { pl: plHistory, en: enHistory, fr: frHistory, de: deHistory },
  review: { pl: plReview, en: enReview, fr: frReview, de: deReview },
  account: { pl: plAccount, en: enAccount, fr: frAccount, de: deAccount },
  errors: { pl: plErrors, en: enErrors, fr: frErrors, de: deErrors },
};

function option(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const rows = exportRows(CATALOGS, CATALOG_STATUS, namespacesOf(option("ns"), NAMESPACES));
const csv = toCsv(rows);
const out = option("out");
if (out === undefined) process.stdout.write(csv);
else {
  writeFileSync(out, csv);
  console.error(`${rows.length} texts written to ${out}`);
}
