/** Compare composer text without treating a trailing newline or nbsp as a mismatch. */
export function normalizeText(value) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/[\u200b\u200c\u200d\ufeff]/g, "")
    .replace(/\r\n/g, "\n")
    .trim();
}

export function sameText(actual, expected) {
  const wanted = normalizeText(expected);
  if (!wanted) return false;
  return normalizeText(actual) === wanted;
}

export function codePointLength(value) {
  return Array.from(String(value ?? "")).length;
}

export function clipText(value, max) {
  return Array.from(String(value ?? "")).slice(0, max).join("");
}

export function excerpt(value, max) {
  const chars = Array.from(String(value ?? "").replace(/\s+/g, " ").trim());
  if (chars.length <= max) return chars.join("");
  return `${chars.slice(0, Math.max(0, max - 1)).join("")}…`;
}

export function composerLooksEmpty(value, placeholders) {
  const text = normalizeText(value).toLowerCase();
  if (!text) return true;
  return placeholders.includes(text);
}
