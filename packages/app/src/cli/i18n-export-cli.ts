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
import { CATALOG_STATUS } from "../i18n/catalogs/status";
import { NAMESPACES } from "../i18n/catalogs/types";
import { exportRows, namespacesOf, toCsv, type ExportCatalogs } from "./i18n-export";

const CATALOGS: ExportCatalogs = {
  common: { pl: plCommon, en: enCommon, fr: frCommon, de: deCommon },
  header: { pl: plHeader, en: enHeader, fr: frHeader, de: deHeader },
  show: { pl: plShow, en: enShow, fr: frShow, de: deShow },
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
