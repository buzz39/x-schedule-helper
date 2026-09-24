/**
 * Classify an X/Twitter path so a reply box is never treated as a new-post composer.
 * Host is ignored: x.com and twitter.com share these paths.
 */
export function classifyPage(pathname) {
  const path = String(pathname || "/").split("?")[0];
  if (/\/status(?:es)?\//.test(path)) return "status";
  if (/^\/compose\/(post|tweet)(\/|$)/.test(path)) return "compose";
  if (/^\/intent\/(post|tweet)(\/|$)/.test(path)) return "intent";
  if (path === "/" || path === "/home" || path.startsWith("/home/")) return "home";
  return "other";
}
