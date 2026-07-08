// Canonical namespace list — source of truth is booklooptag.md.
export const VALID_NAMESPACES = [
  "type",
  "mode",
  // narrative
  "theme",
  "emotion",
  "character",
  "relationship",
  "plot",
  "trope",
  "tone",
  // academic
  "claim",
  "evidence",
  "method",
  "concept",
  "discipline",
  "relation",
  "strength",
  "question",
] as const;

export type Namespace = (typeof VALID_NAMESPACES)[number];

/** Open namespaces — any value after the colon is valid (Bedrock coins values). */
export const OPEN_NAMESPACES: Namespace[] = ["character", "concept"];

export type ParsedQuery = {
  /** Tags the user typed explicitly, e.g. theme:betrayal */
  includeTags: string[];
  /** Tags prefixed with -, e.g. -type:summary */
  excludeTags: string[];
  /** Everything that is not a tag — natural language remainder */
  naturalLanguage: string;
};

const NAMESPACE_SET = new Set<string>(VALID_NAMESPACES);

/**
 * Splits a raw query string into explicit booru tags and natural language.
 *
 * Rules:
 * - token matching `namespace:value` where namespace is valid -> include tag
 * - token matching `-namespace:value` -> exclude tag
 * - quoted phrases stay together as natural language: "found family"
 * - tag values are lowercased; multi-word tag values are not supported in
 *   direct syntax (taxonomy uses hyphens: theme:found-family)
 * - anything else -> natural language, joined with spaces
 */
export function parseQuery(raw: string): ParsedQuery {
  const includeTags: string[] = [];
  const excludeTags: string[] = [];
  const nlParts: string[] = [];

  // Tokenize respecting double quotes
  const tokens = raw.match(/"[^"]+"|\S+/g) ?? [];

  for (const token of tokens) {
    // Quoted phrase -> natural language, strip quotes
    if (token.startsWith('"') && token.endsWith('"')) {
      nlParts.push(token.slice(1, -1));
      continue;
    }

    const isExclude = token.startsWith("-");
    const body = isExclude ? token.slice(1) : token;
    const colonIdx = body.indexOf(":");

    if (colonIdx > 0) {
      const namespace = body.slice(0, colonIdx).toLowerCase();
      const value = body.slice(colonIdx + 1).toLowerCase();
      if (NAMESPACE_SET.has(namespace) && value.length > 0) {
        const tag = `${namespace}:${value}`;
        (isExclude ? excludeTags : includeTags).push(tag);
        continue;
      }
    }

    // Not a valid tag -> natural language (keep the - if it was there,
    // since "-something" in prose is rare but stripping changes meaning)
    nlParts.push(token);
  }

  return {
    includeTags: [...new Set(includeTags)],
    excludeTags: [...new Set(excludeTags)],
    naturalLanguage: nlParts.join(" ").trim(),
  };
}
