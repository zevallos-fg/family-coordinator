const LOWERCASE_WORDS = new Set(["de", "la", "le", "van", "von", "der", "den"]);

export function toTitleCase(s: string): string {
  if (!s) return s;
  return s
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((word, i) => {
      if (i > 0 && LOWERCASE_WORDS.has(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}
