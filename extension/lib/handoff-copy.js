/**
 * User-facing result of a handoff. Status never changes here; the panel asks
 * the user to confirm "prepared" separately.
 */
export function describeHandoff(result, context = {}) {
  const lines = [];
  let tone = "info";
  let offerPrepared = false;

  if (!result?.ok && result?.reason === "empty") {
    return {
      tone: "warn",
      text: "Write the first post before preparing it in X.",
      offerPrepared: false,
      detail: "",
    };
  }
  if (!result?.ok && result?.reason === "too-long") {
    return {
      tone: "warn",
      text: "That post is over the 10,000 character limit this queue stores.",
      offerPrepared: false,
      detail: "",
    };
  }

  if (!result?.ok && result?.reason === "not-empty") {
    tone = "warn";
    lines.push(
      "X’s composer already has text, so it was left alone. Copy this draft and paste it yourself, or clear the composer and try Prepare again.",
    );
  } else if (!result?.ok && result?.reason === "insert-failed") {
    tone = "warn";
    lines.push(
      "X’s composer changed, but the text may not match this draft. Check it before you schedule anything. Nothing was posted.",
    );
  } else if (!result?.ok && result?.copied) {
    tone = "warn";
    lines.push(
      "The first post is on your clipboard, but the compose page did not open. Paste it at x.com/compose/post, then schedule or post it in X.",
    );
  } else if (!result?.ok) {
    tone = "error";
    lines.push("Couldn’t open X from this browser. Copy the text and open x.com/compose/post yourself.");
  } else if (result.method === "filled") {
    tone = "success";
    offerPrepared = true;
    lines.push(
      "Placed the first post in X’s composer. Schedule or post it with X’s own buttons. This extension will not press them.",
    );
  } else if (result.method === "intent") {
    tone = "success";
    offerPrepared = true;
    lines.push(
      "Opened X’s composer with a public compose link that carries the first post. If the box is empty, X ignored the link — use Copy text and paste. Then use X’s Schedule or Post button. This extension will not press them.",
    );
  } else if (result.method === "clipboard") {
    tone = "warn";
    offerPrepared = true;
    const copied = result.copied
      ? "The first post is on your clipboard."
      : "Automatic copy failed. Select the text below, or use Copy text.";
    lines.push(
      `Couldn’t fill X’s composer. That happens with long posts, or when X changes its page layout. The compose page is open. ${copied} Paste with Ctrl+V or ⌘V, then schedule or post in X. This extension will not press those buttons.`,
    );
  } else {
    tone = "error";
    lines.push("Prepare didn’t finish. Use Copy text and open x.com/compose/post yourself.");
  }

  if (context.hasThread && (result?.ok || result?.reason === "not-empty" || result?.reason === "insert-failed")) {
    lines.push("Only the first post is handed to X. Add the next posts in X yourself, then copy each one from the thread list.");
  }
  if (context.reminder && result?.ok) {
    lines.push(`Reminder only: ${context.reminder}. Set that time in X’s scheduler yourself.`);
  }
  if (offerPrepared && context.status !== "idea" && context.status !== "ready") {
    offerPrepared = false;
    if (context.status === "prepared") {
      lines.push("This draft is already marked prepared. Set it to Posted after you schedule or publish it in X.");
    }
  }

  const detail = result?.method === "clipboard" && result?.ok && !result.copied ? context.body || "" : "";
  return { tone, text: lines.join(" "), offerPrepared, detail };
}
