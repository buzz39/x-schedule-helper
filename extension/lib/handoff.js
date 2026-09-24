import { COMPOSE_URL, LIMITS } from "./constants.js";
import { chooseFillTab, intentTextFits, planHandoff } from "./plan.js";
import { normalizeText } from "./text.js";

/**
 * Hand one post to X after an explicit user action.
 * Fills an open composer when one is already on screen. Otherwise opens X's
 * public compose link, or the compose page plus the clipboard for long text.
 * Never clicks Schedule or Post.
 */
export async function handoffToX(text, api) {
  const source = typeof text === "string" ? text : "";
  if (normalizeText(source) === "") {
    return { ok: false, method: "rejected", reason: "empty" };
  }
  if (source.length > LIMITS.body) {
    return { ok: false, method: "rejected", reason: "too-long" };
  }
  let fillTarget = null;

  try {
    const tabs = (await api.listXTabs()).slice(0, 20);
    const activeTabId = await api.activeTabId();
    const probes = [];
    for (const tab of tabs) {
      try {
        const probe = await api.probe(tab.id);
        if (probe?.ok && probe.canFill) {
          probes.push({
            tabId: tab.id,
            windowId: tab.windowId,
            canFill: true,
            surface: probe.surface || "other",
          });
        }
      } catch {
        // The tab was open before install, so it has no content script yet.
      }
    }
    fillTarget = chooseFillTab(probes, activeTabId);
  } catch {
    fillTarget = null;
  }

  const plan = planHandoff({ text: source, fillTarget });
  if (plan.action === "reject") {
    return { ok: false, method: "rejected", reason: plan.reason };
  }

  if (plan.action === "fill") {
    let filled = null;
    try {
      filled = await api.fill(plan.tabId, source);
    } catch {
      filled = null;
    }
    if (filled?.ok) {
      try {
        await api.focus(plan.tabId, fillTarget.windowId);
      } catch {
        // The text is in the composer even if the window could not be focused.
      }
      return { ok: true, method: "filled", surface: fillTarget.surface };
    }
    if (filled?.reason === "not-empty" || (filled?.reason === "insert-failed" && filled.modified)) {
      return {
        ok: false,
        method: "blocked",
        reason: filled.reason,
        modified: Boolean(filled.modified),
      };
    }
  }

  if (intentTextFits(source) && plan.action !== "clipboard") {
    const url = plan.action === "intent" ? plan.url : planHandoff({ text: source, fillTarget: null }).url;
    try {
      await api.open(url);
      return { ok: true, method: "intent", url };
    } catch {
      return { ok: false, method: "rejected", reason: "open-failed" };
    }
  }

  let copied = false;
  try {
    copied = Boolean(await api.copy(source));
  } catch {
    copied = false;
  }

  try {
    const opened = await api.open(COMPOSE_URL);
    let late = null;
    if (opened?.id != null && typeof api.fillWhenReady === "function") {
      try {
        late = await api.fillWhenReady(opened.id, source);
      } catch {
        late = null;
      }
    }
    if (late?.ok) {
      try {
        await api.focus(opened.id, opened.windowId);
      } catch {
        // The new tab is already active in the common case.
      }
      return { ok: true, method: "filled", copied, surface: "compose" };
    }
    return {
      ok: true,
      method: "clipboard",
      copied,
      fillReason: late?.reason || "not-found",
    };
  } catch {
    return { ok: false, method: "clipboard", copied, reason: "open-failed" };
  }
}
