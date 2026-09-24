import assert from "node:assert/strict";
import test from "node:test";
import {
  createDraft,
  deleteDraft,
  mergeDrafts,
  moveDraft,
  parseQueueImport,
  sanitizeDraft,
  serializeQueue,
  updateDraft,
  visibleDrafts,
} from "../extension/lib/drafts.js";
import { formatReminder, listMeta } from "../extension/lib/format.js";

test("create, edit, reorder, and delete drafts", () => {
  const first = createDraft(1_700_000_000_000);
  const second = createDraft(1_700_000_000_100);
  let drafts = [first, second];
  drafts = updateDraft(drafts, first.id, { title: "Launch", body: "Hello", status: "ready" }, 50);
  assert.equal(drafts[0].title, "Launch");
  assert.equal(drafts[0].status, "ready");
  assert.equal(drafts[0].updatedAt, 50);
  assert.equal(drafts[1].id, second.id);

  drafts = moveDraft(drafts, drafts.map((draft) => draft.id), first.id, "down");
  assert.deepEqual(drafts.map((draft) => draft.id), [second.id, first.id]);
  drafts = deleteDraft(drafts, second.id);
  assert.deepEqual(drafts.map((draft) => draft.id), [first.id]);
});

test("filter and search the queue", () => {
  const alpha = { ...createDraft(1), title: "Alpha", body: "moons", status: "idea", parts: [], notes: "" };
  const beta = { ...createDraft(2), title: "Beta", body: "tide", status: "ready", parts: ["shore"], notes: "quiet" };
  const visible = visibleDrafts([alpha, beta], { filter: "ready", search: "shore" });
  assert.deepEqual(visible.map((draft) => draft.id), [beta.id]);
  assert.equal(visibleDrafts([alpha, beta], { search: "quiet" }).length, 1);
});

test("export and import round-trip", () => {
  const created = createDraft(10);
  const original = updateDraft([created], created.id, {
    title: "Hook",
    body: "Body",
    parts: ["Second"],
    notes: "Note",
    suggestedAt: "2026-09-24T09:30",
    status: "prepared",
  });
  assert.equal(original.length, 1);
  const file = serializeQueue(original, Date.parse("2026-09-24T12:00:00Z"));
  assert.equal(file.type, "x-draft-queue");
  assert.equal(file.version, 1);
  const parsed = parseQueueImport(file);
  assert.equal(parsed.drafts[0].body, "Body");
  assert.deepEqual(parsed.drafts[0].parts, ["Second"]);
  assert.equal(parsed.drafts[0].suggestedAt, "2026-09-24T09:30");
  assert.equal(parsed.skipped, 0);
});

test("import rejects foreign files and repairs bad rows", () => {
  assert.throws(() => parseQueueImport({ type: "other", drafts: [] }), /not a draft queue/);
  assert.throws(() => parseQueueImport("{"), /not a draft queue/);
  const parsed = parseQueueImport({
    type: "x-draft-queue",
    version: 1,
    drafts: [
      { id: "draft_0001", title: "Ok", body: "Yes", status: "nope", suggestedAt: "tomorrow" },
      { id: "draft_0001", title: "Dupe", body: "No" },
      null,
    ],
  });
  assert.equal(parsed.drafts.length, 1);
  assert.equal(parsed.drafts[0].status, "idea");
  assert.equal(parsed.drafts[0].suggestedAt, "");
  assert.ok(parsed.skipped >= 2);
});

test("import accepts a raw array and caps stored text", () => {
  const parsed = parseQueueImport([{ id: "draft_0002", body: "x", title: "y" }]);
  assert.equal(parsed.drafts[0].id, "draft_0002");
  const long = sanitizeDraft({ id: "draft_0003", notes: "n".repeat(4500), body: "ok" });
  assert.equal(long.notes.length, 4000);
});

test("merge keeps existing ids and appends new drafts", () => {
  const keep = createDraft(1);
  const incoming = sanitizeDraft({ id: keep.id, body: "new" });
  const extra = sanitizeDraft({ id: "draft_0099", body: "added" });
  const merged = mergeDrafts([keep], [incoming, extra]);
  assert.equal(merged.added, 1);
  assert.equal(merged.drafts[0].body, keep.body);
  assert.equal(merged.drafts[1].body, "added");
});

test("reminder formatting stays local to the given value", () => {
  assert.equal(formatReminder(""), "");
  assert.equal(formatReminder("nope"), "");
  assert.match(formatReminder("2026-09-24T09:30", "en-US"), /Sep/);
  assert.match(formatReminder("2026-09-24T09:30", "en-US"), /24/);
  const draft = {
    ...createDraft(1),
    title: "",
    body: "Hi",
    status: "ready",
    parts: ["next"],
    suggestedAt: "2026-09-24T09:30",
  };
  assert.match(listMeta(draft, "en-US"), /Ready/);
  assert.match(listMeta(draft, "en-US"), /1 more post/);
  assert.match(listMeta(draft, "en-US"), /Reminder/);
});
