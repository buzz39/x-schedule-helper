import { FILL_MESSAGE, PROBE_MESSAGE } from "../lib/constants.js";
import { fillComposer, locateComposer } from "../lib/fill.js";
import { classifyPage } from "../lib/page.js";

/**
 * Runs on x.com and twitter.com. It does nothing until the side panel sends
 * a message from an explicit "Prepare in X" click.
 *
 * It only looks for the compose box and inserts plain text. It does not click
 * Post, Schedule, Like, Reply, Follow, or DM, and it does not read cookies.
 *
 * Selector notes (easy to break when X ships a new UI):
 * - [data-testid="tweetTextarea_0"] inside [role="dialog"] — compose modal
 * - the same test id on /compose/post, /intent/post, and Home
 * - on those dedicated compose URLs only, a contenteditable textbox or textarea
 * Tweet pages are left alone so a reply box is not filled.
 */

const GUARD = "__draftQueueForX__";

function probe() {
  const pageKind = classifyPage(location.pathname);
  const located = locateComposer(document, pageKind);
  return {
    ok: true,
    canFill: Boolean(located.element),
    surface: located.surface,
    pageKind,
  };
}

function install() {
  if (globalThis[GUARD]) return;
  globalThis[GUARD] = true;
  if (!chrome.runtime?.onMessage) return;

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    try {
      if (!message || typeof message.type !== "string") return;
      if (sender?.id && sender.id !== chrome.runtime.id) return;

      if (message.type === PROBE_MESSAGE) {
        sendResponse(probe());
        return;
      }

      if (message.type === FILL_MESSAGE) {
        const text = typeof message.text === "string" ? message.text : "";
        fillComposer(document, text, {
          pathname: location.pathname,
          pageKind: classifyPage(location.pathname),
        })
          .then((result) => {
            try {
              sendResponse(result);
            } catch {
              // The panel closed before the fill finished.
            }
          })
          .catch(() => {
            try {
              sendResponse({ ok: false, reason: "error" });
            } catch {
              // Ignore a disconnected sender.
            }
          });
        return true;
      }
    } catch {
      try {
        sendResponse({ ok: false, reason: "error", canFill: false });
      } catch {
        // Never let a messaging failure escape into the page.
      }
    }
  });
}

try {
  install();
} catch {
  // A failure here must not break x.com.
}
