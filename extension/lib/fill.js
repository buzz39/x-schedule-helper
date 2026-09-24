import { EMPTY_PLACEHOLDERS, LIMITS } from "./constants.js";
import { classifyPage } from "./page.js";
import { composerLooksEmpty, normalizeText, sameText } from "./text.js";

/**
 * Best-effort composer fill for x.com / twitter.com.
 *
 * X’s editor is a React contenteditable (Draft.js / Lexical). Writing
 * innerHTML does not update that editor, so this uses execCommand("insertText"),
 * then a text/plain paste event, then a beforeinput event.
 *
 * This file never clicks Post, Schedule, Like, Reply, Follow, or DM.
 * Selectors are public DOM hooks and will break when X redesigns the composer.
 * Callers must fall back to the clipboard and https://x.com/compose/post.
 */

const DIALOG_TESTID = '[role="dialog"] [data-testid="tweetTextarea_0"]';
const TESTID = '[data-testid="tweetTextarea_0"]';
const COMPOSE_BOX = '[contenteditable="true"][role="textbox"]';

function query(root, selector) {
  try {
    return root.querySelector(selector);
  } catch {
    return null;
  }
}

function isFormField(el) {
  const tag = String(el?.tagName || "").toUpperCase();
  return tag === "TEXTAREA" || tag === "INPUT";
}

function isUsable(el) {
  if (!el || el.hidden) return false;
  try {
    const style = el.ownerDocument?.defaultView?.getComputedStyle?.(el);
    if (style && (style.display === "none" || style.visibility === "hidden")) return false;
  } catch {
    // Ignore style lookups and treat the node as usable.
  }
  return true;
}

function resolveEditable(el) {
  if (!el) return null;
  try {
    if (isFormField(el)) return isUsable(el) ? el : null;
    if (el.getAttribute?.("contenteditable") === "true" || el.isContentEditable) {
      return isUsable(el) ? el : null;
    }
    const inner = el.querySelector?.('[contenteditable="true"], textarea');
    return inner && isUsable(inner) ? inner : null;
  } catch {
    return null;
  }
}

/**
 * Find a new-post composer. A tweet page's reply box is intentionally ignored
 * unless it sits in the compose dialog (the modal X opens over a status page).
 */
export function locateComposer(doc, pageKind) {
  const dialog = resolveEditable(query(doc, DIALOG_TESTID));
  if (dialog) return { element: dialog, surface: "dialog" };

  if (pageKind === "status") return { element: null, surface: "status" };

  const allowed = pageKind === "compose" || pageKind === "intent" || pageKind === "home";
  if (!allowed) return { element: null, surface: "other" };

  const byTestId = resolveEditable(query(doc, TESTID));
  if (byTestId) return { element: byTestId, surface: pageKind };

  if (pageKind === "compose" || pageKind === "intent") {
    const box = resolveEditable(query(doc, COMPOSE_BOX));
    if (box) return { element: box, surface: pageKind };
    const area = query(doc, "form textarea, textarea");
    if (area && isUsable(area)) return { element: area, surface: pageKind };
  }

  return { element: null, surface: pageKind };
}

export function readElementText(el) {
  if (!el) return "";
  if (isFormField(el)) return String(el.value ?? "");
  return String(el.innerText ?? el.textContent ?? "");
}

function focusAndSelect(el, doc) {
  try {
    el.focus();
  } catch {
    // Focus can fail on a detached node.
  }
  if (isFormField(el)) {
    try {
      el.select?.();
    } catch {
      // Ignore selection failures on form fields.
    }
    return;
  }
  try {
    const selection = doc.defaultView?.getSelection?.();
    if (!selection || typeof doc.createRange !== "function") return;
    const range = doc.createRange();
    range.selectNodeContents(el);
    selection.removeAllRanges();
    selection.addRange(range);
  } catch {
    // Selection APIs differ across editor builds; insertion still gets a chance.
  }
}

function strategyInsertText(el, text, doc) {
  focusAndSelect(el, doc);
  if (typeof doc.execCommand !== "function") return false;
  return doc.execCommand("insertText", false, text) === true;
}
strategyInsertText.label = "insertText";

function strategyPaste(el, text, doc) {
  const view = doc.defaultView;
  if (!view || typeof view.DataTransfer !== "function" || typeof view.ClipboardEvent !== "function") {
    return false;
  }
  focusAndSelect(el, doc);
  const data = new view.DataTransfer();
  data.setData("text/plain", text);
  const event = new view.ClipboardEvent("paste", {
    clipboardData: data,
    bubbles: true,
    cancelable: true,
  });
  el.dispatchEvent(event);
  return true;
}
strategyPaste.label = "paste";

function strategyBeforeInput(el, text, doc) {
  const view = doc.defaultView;
  if (!view || typeof view.InputEvent !== "function") return false;
  focusAndSelect(el, doc);
  el.dispatchEvent(
    new view.InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      inputType: "insertText",
      data: text,
    }),
  );
  return true;
}
strategyBeforeInput.label = "beforeinput";

function strategyFormValue(el, text, doc) {
  focusAndSelect(el, doc);
  el.value = text;
  const view = doc.defaultView;
  const InputEventCtor = view?.InputEvent;
  const event = InputEventCtor
    ? new InputEventCtor("input", { bubbles: true, data: text, inputType: "insertText" })
    : new Event("input", { bubbles: true });
  el.dispatchEvent(event);
  return true;
}
strategyFormValue.label = "value";

function strategiesFor(el) {
  return isFormField(el)
    ? [strategyFormValue]
    : [strategyInsertText, strategyPaste, strategyBeforeInput];
}

function defaultSleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function applyStrategies(el, text, doc, options) {
  const read = options.readText || readElementText;
  const sleep = options.sleep || defaultSleep;
  const strategies = options.strategies || strategiesFor(el);
  for (const strategy of strategies) {
    let claimed = false;
    try {
      claimed = strategy(el, text, doc) !== false;
    } catch {
      claimed = false;
    }
    if (claimed && (options.settleMs ?? 80) > 0) {
      await sleep(options.settleMs ?? 80);
    }
    let after = "";
    try {
      after = read(el);
    } catch {
      after = "";
    }
    if (sameText(after, text)) {
      return { ok: true, strategy: strategy.label || "unknown" };
    }
    if (!composerLooksEmpty(after, EMPTY_PLACEHOLDERS)) {
      return { ok: false, reason: "insert-failed", modified: true };
    }
  }
  return { ok: false, reason: "insert-failed", modified: false };
}

export async function fillComposer(doc, text, options = {}) {
  const clock = options.now || Date.now;
  const sleep = options.sleep || defaultSleep;
  const timeoutMs = options.timeoutMs ?? 1600;
  const intervalMs = options.intervalMs ?? 120;
  const pageKind = options.pageKind || classifyPage(options.pathname || "/");

  if (typeof text !== "string" || normalizeText(text) === "") {
    return { ok: false, reason: "empty", pageKind };
  }
  if (text.length > LIMITS.body) {
    return { ok: false, reason: "too-long", pageKind };
  }

  const started = clock();
  let located = locateComposer(doc, pageKind);
  let spins = 0;
  while (!located.element) {
    if (clock() - started >= timeoutMs || spins >= 40) {
      return { ok: false, reason: "not-found", pageKind, surface: located.surface };
    }
    spins += 1;
    await sleep(intervalMs);
    located = locateComposer(doc, pageKind);
  }

  let current = "";
  try {
    current = (options.readText || readElementText)(located.element);
  } catch {
    current = "";
  }
  if (sameText(current, text)) {
    return { ok: true, reason: "already", surface: located.surface, pageKind };
  }
  if (!composerLooksEmpty(current, EMPTY_PLACEHOLDERS)) {
    return { ok: false, reason: "not-empty", surface: located.surface, pageKind };
  }

  const outcome = await applyStrategies(located.element, text, doc, options);
  if (outcome.ok) {
    return { ok: true, reason: "filled", strategy: outcome.strategy, surface: located.surface, pageKind };
  }
  return {
    ok: false,
    reason: "insert-failed",
    modified: Boolean(outcome.modified),
    surface: located.surface,
    pageKind,
  };
}
