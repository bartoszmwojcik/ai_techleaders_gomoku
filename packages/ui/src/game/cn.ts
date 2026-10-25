import { createCn } from "cn/config";

// The default merge rules take a custom size such as text-body for a text colour and drop it. Declaring
// the token names tells the merger which utility group each belongs to (see tokens in game-tokens.css).
export const cn = createCn({
  extend: {
    classGroups: {
      "font-size": [{ text: ["meta", "body", "lead", "subsection", "section", "title"] }],
      "font-weight": [{ font: ["regular", "strong"] }],
      rounded: [{ rounded: ["base", "piece"] }],
      shadow: [{ shadow: ["board", "piece"] }],
    },
  },
});
