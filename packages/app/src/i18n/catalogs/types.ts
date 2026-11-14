import type { Catalog, PartialCatalog } from "@gomoku/core/i18n/translator";

import type account from "./pl/account";
import type auth from "./pl/auth";
import type chat from "./pl/chat";
import type common from "./pl/common";
import type errors from "./pl/errors";
import type game from "./pl/game";
import type header from "./pl/header";
import type history from "./pl/history";
import type home from "./pl/home";
import type lobby from "./pl/lobby";
import type review from "./pl/review";
import type show from "./pl/show";

/** Every namespace, typed by its Polish source. A new namespace is added here, in `NAMESPACES` and in `index.ts`. */
export type Namespaces = {
  common: typeof common;
  header: typeof header;
  home: typeof home;
  auth: typeof auth;
  game: typeof game;
  chat: typeof chat;
  lobby: typeof lobby;
  history: typeof history;
  review: typeof review;
  account: typeof account;
  errors: typeof errors;
  show: typeof show;
};

export type Namespace = keyof Namespaces;

export const NAMESPACES = ["common", "header", "show", "home", "auth", "game", "chat", "lobby", "history", "review", "account", "errors"] as const satisfies readonly Namespace[];

/** A complete translation (English, French): exactly the Polish keys. */
export type Translation<N extends Namespace> = Catalog<Namespaces[N]>;

/** A translation that may lack texts (German until it is reviewed). */
export type PartialTranslation<N extends Namespace> = PartialCatalog<Namespaces[N]>;

/** What a component receives: the merged namespace (every key present) in the request's language. */
export type NamespaceDict<N extends Namespace> = Translation<N>;
