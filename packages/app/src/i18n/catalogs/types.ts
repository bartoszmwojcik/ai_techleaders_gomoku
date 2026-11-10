import type { Catalog, PartialCatalog } from "@gomoku/core/i18n/translator";

import type common from "./pl/common";
import type header from "./pl/header";

/** Every namespace, typed by its Polish source. A new namespace is added here, in `NAMESPACES` and in `index.ts`. */
export type Namespaces = {
  common: typeof common;
  header: typeof header;
};

export type Namespace = keyof Namespaces;

export const NAMESPACES = ["common", "header"] as const satisfies readonly Namespace[];

/** A complete translation (English, French): exactly the Polish keys. */
export type Translation<N extends Namespace> = Catalog<Namespaces[N]>;

/** A translation that may lack texts (German until it is reviewed). */
export type PartialTranslation<N extends Namespace> = PartialCatalog<Namespaces[N]>;

/** What a component receives: the merged namespace (every key present) in the request's language. */
export type NamespaceDict<N extends Namespace> = Translation<N>;
