import assert from "node:assert/strict";
import test from "node:test";
import { classifyPage } from "../extension/lib/page.js";
import { buildIntentUrl, chooseFillTab, intentTextFits, planHandoff } from "../extension/lib/plan.js";

test("page classification keeps replies away from the new-post composer", () => {
  assert.equal(classifyPage("/home"), "home");
  assert.equal(classifyPage("/"), "home");
  assert.equal(classifyPage("/compose/post"), "compose");
  assert.equal(classifyPage("/intent/post"), "intent");
  assert.equal(classifyPage("/intent/tweet"), "intent");
  assert.equal(classifyPage("/someone/status/123"), "status");
  assert.equal(classifyPage("/i/status/123"), "status");
  assert.equal(classifyPage("/someone/status/123/photo/1"), "status");
  assert.equal(classifyPage("/explore"), "other");
});

test("intent links carry only the post text", () => {
  const url = new URL(buildIntentUrl("Hello & welcome\nnext"));
  assert.equal(url.origin + url.pathname, "https://x.com/intent/post");
  assert.deepEqual([...url.searchParams.keys()], ["text"]);
  assert.equal(url.searchParams.get("text"), "Hello & welcome\nnext");
  assert.equal(intentTextFits("漢".repeat(280)), true);
  assert.equal(intentTextFits("a".repeat(7000)), false);
});

test("handoff plan prefers an open composer, then the public compose link", () => {
  assert.deepEqual(planHandoff({ text: "  " }), { action: "reject", reason: "empty" });
  assert.equal(planHandoff({ text: "Hi" }).action, "intent");
  assert.equal(planHandoff({ text: "a".repeat(7000) }).action, "clipboard");
  assert.equal(planHandoff({ text: "a".repeat(7000) }).url, "https://x.com/compose/post");
  const target = { tabId: 7, canFill: true, surface: "home" };
  assert.deepEqual(planHandoff({ text: "Hi", fillTarget: target }), { action: "fill", tabId: 7 });
});

test("fill target prefers the active tab, then a dedicated compose page", () => {
  const probes = [
    { tabId: 1, canFill: true, surface: "home" },
    { tabId: 2, canFill: true, surface: "compose" },
    { tabId: 3, canFill: false, surface: "status" },
  ];
  assert.equal(chooseFillTab(probes, 1).tabId, 1);
  assert.equal(chooseFillTab(probes, 9).tabId, 2);
  assert.equal(chooseFillTab([{ tabId: 3, canFill: false, surface: "status" }], 3), null);
});
