import assert from "node:assert/strict";
import test from "node:test";
import { describeHandoff } from "../extension/lib/handoff-copy.js";
import { handoffToX } from "../extension/lib/handoff.js";

function fakeApi(overrides = {}) {
  const calls = [];
  const api = {
    calls,
    async listXTabs() {
      calls.push(["list"]);
      return overrides.tabs || [];
    },
    async activeTabId() {
      return overrides.active ?? null;
    },
    async probe(id) {
      calls.push(["probe", id]);
      if (overrides.probeError) throw new Error("missing");
      return overrides.probe?.[id] ?? { ok: true, canFill: false };
    },
    async fill(id, text) {
      calls.push(["fill", id, text]);
      return overrides.fill ?? { ok: true };
    },
    async focus(id) {
      calls.push(["focus", id]);
    },
    async open(url) {
      calls.push(["open", url]);
      if (overrides.openError) throw new Error("blocked");
      return { id: 99, windowId: 1 };
    },
    async copy(text) {
      calls.push(["copy", text]);
      return overrides.copied ?? true;
    },
    async fillWhenReady(id, text) {
      calls.push(["later", id, text]);
      return overrides.later ?? { ok: false, reason: "not-found" };
    },
  };
  return api;
}

test("fills an existing composer and does not open another page", async () => {
  const api = fakeApi({
    tabs: [{ id: 4, windowId: 2 }],
    active: 4,
    probe: { 4: { ok: true, canFill: true, surface: "compose" } },
  });
  const result = await handoffToX("Hello", api);
  assert.equal(result.method, "filled");
  assert.deepEqual(api.calls.map((call) => call[0]), ["list", "probe", "fill", "focus"]);
});

test("does not replace text the user already typed", async () => {
  const api = fakeApi({
    tabs: [{ id: 4, windowId: 2 }],
    probe: { 4: { ok: true, canFill: true, surface: "home" } },
    fill: { ok: false, reason: "not-empty" },
  });
  const result = await handoffToX("Hello", api);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "not-empty");
  assert.equal(api.calls.some((call) => call[0] === "open"), false);
});

test("stops when a fill changes the composer without matching", async () => {
  const api = fakeApi({
    tabs: [{ id: 4, windowId: 2 }],
    probe: { 4: { ok: true, canFill: true, surface: "dialog" } },
    fill: { ok: false, reason: "insert-failed", modified: true },
  });
  const result = await handoffToX("Hello", api);
  assert.equal(result.reason, "insert-failed");
  assert.equal(api.calls.some((call) => call[0] === "open"), false);
});

test("opens the public compose link when no composer is available", async () => {
  const api = fakeApi({ tabs: [{ id: 8, windowId: 1 }], probeError: true });
  const result = await handoffToX("Hello queue", api);
  assert.equal(result.method, "intent");
  const url = new URL(result.url);
  assert.equal(url.pathname, "/intent/post");
  assert.equal(url.searchParams.get("text"), "Hello queue");
  assert.equal(api.calls.some((call) => call[0] === "copy"), false);
});

test("uses the clipboard and compose page for long posts", async () => {
  const text = "a".repeat(7000);
  const api = fakeApi();
  const result = await handoffToX(text, api);
  assert.equal(result.method, "clipboard");
  assert.equal(result.copied, true);
  assert.equal(api.calls.find((call) => call[0] === "open")[1], "https://x.com/compose/post");
  assert.equal(api.calls.some((call) => call[0] === "later"), true);
  assert.equal(api.calls.some((call) => call[0] === "fill"), false);
});

test("reports a late fill on the compose page as filled", async () => {
  const api = fakeApi({ later: { ok: true } });
  const result = await handoffToX("b".repeat(7000), api);
  assert.equal(result.ok, true);
  assert.equal(result.method, "filled");
});

test("does not touch X when the draft is empty", async () => {
  const api = fakeApi();
  const result = await handoffToX("   ", api);
  assert.equal(result.reason, "empty");
  assert.deepEqual(api.calls, []);
});

test("handoff copy asks the user to confirm and never claims it posted", () => {
  const filled = describeHandoff(
    { ok: true, method: "filled" },
    { status: "ready", hasThread: true, reminder: "Thu, Sep 24, 9:30 AM" },
  );
  assert.equal(filled.offerPrepared, true);
  assert.match(filled.text, /will not press them/);
  assert.match(filled.text, /Only the first post/);
  assert.match(filled.text, /Reminder only/);
  assert.doesNotMatch(filled.text, /posted for you|scheduled for you/i);

  const prepared = describeHandoff({ ok: true, method: "intent" }, { status: "prepared" });
  assert.equal(prepared.offerPrepared, false);
  assert.match(prepared.text, /already marked prepared/);

  const blocked = describeHandoff({ ok: false, reason: "not-empty" }, { status: "idea" });
  assert.equal(blocked.offerPrepared, false);
  assert.match(blocked.text, /left alone/);
});
