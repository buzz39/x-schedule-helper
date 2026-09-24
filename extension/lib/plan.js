import { COMPOSE_URL, INTENT_BASE, LIMITS, MAX_INTENT_ENCODED } from "./constants.js";
import { normalizeText } from "./text.js";

export function buildIntentUrl(text) {
  return `${INTENT_BASE}?text=${encodeURIComponent(text)}`;
}

export function intentTextFits(text) {
  return encodeURIComponent(text).length <= MAX_INTENT_ENCODED;
}

const SURFACE_RANK = {
  compose: 0,
  intent: 1,
  dialog: 2,
  home: 3,
};

/**
 * Prefer the tab the user is looking at. Otherwise prefer a dedicated compose
 * page over the home inline box.
 */
export function chooseFillTab(probes, activeTabId) {
  const fillable = (probes || []).filter((probe) => probe && probe.canFill && probe.tabId != null);
  if (fillable.length === 0) return null;
  const active = fillable.find((probe) => probe.tabId === activeTabId);
  if (active) return active;
  return fillable
    .slice()
    .sort((a, b) => (SURFACE_RANK[a.surface] ?? 9) - (SURFACE_RANK[b.surface] ?? 9))[0];
}

export function planHandoff({ text, fillTarget }) {
  if (typeof text !== "string" || normalizeText(text) === "") {
    return { action: "reject", reason: "empty" };
  }
  if (text.length > LIMITS.body) {
    return { action: "reject", reason: "too-long" };
  }
  if (fillTarget) {
    return { action: "fill", tabId: fillTarget.tabId };
  }
  if (intentTextFits(text)) {
    return { action: "intent", url: buildIntentUrl(text) };
  }
  return { action: "clipboard", url: COMPOSE_URL };
}
