import assert from "node:assert/strict";
import test from "node:test";
import { fillComposer } from "../extension/lib/fill.js";
import { createDocument, createElement } from "./mini-dom.js";

const FAST = { settleMs: 0, timeoutMs: 0, intervalMs: 1 };

function box(doc, attrs = { "data-testid": "tweetTextarea_0", contenteditable: "true", role: "textbox" }, text = "") {
  return createElement(doc, "div", attrs, text);
}

test("fills the home composer and does not click anything", async () => {
  const doc = createDocument();
  const composer = box(doc);
  doc.append(composer);
  const result = await fillComposer(doc, "Hello queue", { ...FAST, pageKind: "home" });
  assert.equal(result.ok, true);
  assert.equal(result.strategy, "insertText");
  assert.equal(composer.innerText, "Hello queue");
  assert.equal(doc.clicks, 0);
  assert.equal(composer.clicks, 0);
  assert.ok(doc.selectors.every((selector) => !/tweetButton|like|reply|retweet|follow|schedule/i.test(selector)));
});

test("does not fill a reply box on a status page", async () => {
  const doc = createDocument();
  doc.append(box(doc));
  const result = await fillComposer(doc, "Nope", { ...FAST, pageKind: "status" });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "not-found");
  assert.deepEqual(doc.execLog, []);
});

test("fills the compose dialog when it is open over a status page", async () => {
  const doc = createDocument();
  const dialog = createElement(doc, "div", { role: "dialog" });
  const composer = box(doc);
  dialog.append(composer);
  doc.append(dialog);
  doc.append(box(doc, { "data-testid": "tweetTextarea_0", contenteditable: "true" }, "reply draft"));
  const result = await fillComposer(doc, "Modal post", { ...FAST, pageKind: "status" });
  assert.equal(result.ok, true);
  assert.equal(composer.innerText, "Modal post");
});

test("leaves an in-progress composer untouched", async () => {
  const doc = createDocument();
  const composer = box(doc, undefined, "already typing");
  doc.append(composer);
  const result = await fillComposer(doc, "Replacement", { ...FAST, pageKind: "compose" });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "not-empty");
  assert.equal(composer.innerText, "already typing");
  assert.deepEqual(doc.execLog, []);
});

test("treats an unchanged composer as already filled", async () => {
  const doc = createDocument();
  doc.append(box(doc, undefined, "Same text"));
  const result = await fillComposer(doc, "Same text\n", { ...FAST, pageKind: "intent" });
  assert.equal(result.ok, true);
  assert.equal(result.reason, "already");
  assert.deepEqual(doc.execLog, []);
});

test("replaces a placeholder and stops when the editor text diverges", async () => {
  const doc = createDocument();
  const composer = box(doc, undefined, "What's happening?");
  doc.append(composer);
  const replaced = await fillComposer(doc, "Real post", { ...FAST, pageKind: "home" });
  assert.equal(replaced.ok, true);
  assert.equal(composer.innerText, "Real post");

  const other = createDocument();
  other.insertTextResult = true;
  const messy = box(other);
  other.append(messy);
  other.execCommand = () => {
    other.execLog.push("insertText");
    messy.innerText = "partial";
    return true;
  };
  const failed = await fillComposer(other, "Full post", { ...FAST, pageKind: "compose" });
  assert.equal(failed.ok, false);
  assert.equal(failed.reason, "insert-failed");
  assert.equal(failed.modified, true);
  assert.equal(messy.events.length, 0);
});

test("falls through to paste when insertText does not change the box", async () => {
  const doc = createDocument();
  doc.insertTextResult = false;
  doc.pasteWrites = true;
  doc.execCommand = () => {
    doc.execLog.push("insertText");
    return false;
  };
  const composer = box(doc);
  doc.append(composer);
  const result = await fillComposer(doc, "Pasted", { ...FAST, pageKind: "compose" });
  assert.equal(result.ok, true);
  assert.equal(result.strategy, "paste");
  assert.equal(composer.innerText, "Pasted");
  assert.equal(composer.events[0].type, "paste");
  assert.equal(composer.events[0].clipboardData.getData("text/plain"), "Pasted");
});

test("uses a textarea on the dedicated compose page", async () => {
  const doc = createDocument();
  const area = createElement(doc, "textarea");
  doc.append(area);
  const result = await fillComposer(doc, "From a field", { ...FAST, pageKind: "compose" });
  assert.equal(result.ok, true);
  assert.equal(result.strategy, "value");
  assert.equal(area.value, "From a field");
});

test("ignores a composer test id on pages that are not compose, intent, or home", async () => {
  const doc = createDocument();
  doc.append(box(doc));
  const result = await fillComposer(doc, "No", { ...FAST, pageKind: "other" });
  assert.equal(result.reason, "not-found");
});
