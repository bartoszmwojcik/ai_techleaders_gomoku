import { Fragment, type ReactNode } from "react";

const MARKER = /\{(\w+)\}/;

/**
 * A translated sentence with components in place of its `{name}` markers, so a link keeps its place in every language
 * ("{link}, żeby…" / "{link} pour…"). Ask the translator for the sentence with the marker kept:
 * `withNodes(t("create.signedOut", { link: "{link}" }), { link: <TextLink…/> })`. An unknown marker stays as text.
 */
export function withNodes(text: string, nodes: Readonly<Record<string, ReactNode>>): ReactNode {
  const parts = text.split(MARKER);
  return parts.map((part, index) =>
    index % 2 === 1 && part in nodes ? <Fragment key={index}>{nodes[part]}</Fragment> : index % 2 === 1 ? `{${part}}` : part,
  );
}
